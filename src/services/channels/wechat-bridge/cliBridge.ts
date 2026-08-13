/**
 * WeChat Bridge Service (CLI Mode)
 *
 * Uses weixin-mcp CLI via child_process for reliable communication.
 *
 * Usage:
 *   bun --env-file=.env ./src/services/channels/wechat-bridge/cliBridge.ts
 */

import { spawn } from 'node:child_process'
import axios from 'axios'
import { getBridgeConfig } from './config.js'

const CONFIG = getBridgeConfig()

interface WechatMessage {
  from_user_id: string
  content: string
}

class WechatBridge {
  private running = false

  async start(): Promise<void> {
    console.error('[Bridge] Starting WeChat Bridge (CLI mode)...')
    console.error(`[Bridge] Account: ${CONFIG.weixinAccountId}`)

    if (!CONFIG.claudeApiKey) {
      throw new Error('Missing ANTHROPIC_AUTH_TOKEN environment variable')
    }

    this.running = true
    await this.pollLoop()
  }

  private async pollLoop(): Promise<void> {
    console.error('[Bridge] Starting poll loop...')

    let pollCount = 0

    while (this.running) {
      try {
        pollCount++
        const messages = await this.pollMessages()

        if (messages.length > 0) {
          console.error(`[Bridge] Poll #${pollCount}: ${messages.length} new message(s)`)
          for (const msg of messages) {
            await this.handleMessage(msg)
          }
        } else {
          if (pollCount % 20 === 0) {
            console.error(`[Bridge] Poll #${pollCount}: no new messages`)
          }
        }
      } catch (err) {
        console.error(`[Bridge] Poll error: ${err}`)
      }

      await this.sleep(CONFIG.pollIntervalMs)
    }
  }

  private async pollMessages(): Promise<WechatMessage[]> {
    return new Promise((resolve) => {
      const messages: WechatMessage[] = []

      const proc = spawn('npx', ['weixin-mcp', 'poll'], {
        env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId },
        timeout: 35000,
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', () => {
        // Parse output: "1 message(s):\n\n← sender: content"
        const lines = stdout.split('\n')
        let inMessage = false
        let currentSender = ''
        let currentContent = ''

        for (const line of lines) {
          if (line.match(/^\d+ message/)) {
            // Message count line
            inMessage = true
          } else if (inMessage && line.match(/^← /)) {
            // Message line: ← sender: content
            const match = line.match(/^← (\S+): (.+)/s)
            if (match) {
              currentSender = match[1]
              currentContent = match[2].trim()
              messages.push({
                from_user_id: currentSender,
                content: currentContent,
              })
            }
          }
        }

        // Suppress stderr spam
        if (stderr.includes('No new messages')) {
          stderr = ''
        }
        if (stderr.trim()) {
          console.error(`[Bridge] weixin-mcp stderr: ${stderr.substring(0, 200)}`)
        }

        resolve(messages)
      })

      proc.on('error', () => {
        resolve([])
      })
    })
  }

  private async handleMessage(msg: WechatMessage): Promise<void> {
    // Skip if we've already processed this message (based on content + time)
    const msgHash = `${msg.from_user_id}:${msg.content}`
    if (msgHash.includes('No new messages')) return

    console.error(`[Bridge] Message from ${msg.from_user_id}: ${msg.content.substring(0, 50)}...`)

    try {
      // Call Claude
      console.error(`[Bridge] Calling Claude API...`)
      const response = await this.callClaude(msg.from_user_id, msg.content)

      // Send response
      console.error(`[Bridge] Sending response to ${msg.from_user_id}...`)
      await this.sendWechatMessage(msg.from_user_id, response)

      console.error(`[Bridge] Done: ${response.substring(0, 50)}...`)
    } catch (err) {
      console.error(`[Bridge] Error: ${err}`)
      try {
        await this.sendWechatMessage(msg.from_user_id, '抱歉，处理消息时遇到错误。请稍后再试。')
      } catch {
        // Ignore
      }
    }
  }

  private async callClaude(userId: string, userMessage: string): Promise<string> {
    try {
      const response = await axios.post(
        CONFIG.claudeApiUrl,
        {
          model: CONFIG.claudeModel,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: `微信用户 (ID: ${userId}) 说: ${userMessage}`,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CONFIG.claudeApiKey}`,
            'anthropic-version': '2023-06-01',
          },
          timeout: CONFIG.maxResponseTimeMs,
        },
      )

      const content = response.data.content?.[0]?.text
      if (content) {
        return content
      }

      return '抱歉，我没有收到有效的回复。'
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error(
          `[Bridge] Claude API error: ${err.response?.data?.error?.message || err.message}`,
        )
      } else {
        console.error(`[Bridge] Claude API error: ${err}`)
      }
      throw err
    }
  }

  private async sendWechatMessage(to: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['weixin-mcp', 'send', to, text], {
        env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId },
        timeout: 10000,
      })

      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => {
        // Success output
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`send failed: ${stderr}`))
        }
      })

      proc.on('error', reject)
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async stop(): Promise<void> {
    console.error('[Bridge] Stopping...')
    this.running = false
  }
}

// Main
async function main(): Promise<void> {
  const bridge = new WechatBridge()

  process.on('SIGINT', async () => {
    console.error('\n[Bridge] Received SIGINT')
    await bridge.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.error('\n[Bridge] Received SIGTERM')
    await bridge.stop()
    process.exit(0)
  })

  try {
    await bridge.start()
  } catch (err) {
    console.error(`[Bridge] Fatal error: ${err}`)
    await bridge.stop()
    process.exit(1)
  }
}

main().catch(console.error)
