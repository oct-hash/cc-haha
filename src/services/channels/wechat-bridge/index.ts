/**
 * WeChat Bridge Service
 *
 * Bridges WeChat messages to Claude Code and back.
 *
 * Architecture:
 * - Polls weixin-mcp (stdio mode) for new messages
 * - When message received, calls Claude Code API
 * - Sends Claude Code response back to WeChat via weixin-mcp
 *
 * Usage:
 *   bun --env-file=.env ./src/services/channels/wechat-bridge/index.ts
 *
 * Environment:
 *   WEIXIN_ACCOUNT_ID - WeChat account ID (default: first available)
 *   CLAUDE_API_KEY    - Anthropic API key
 *   CLAUDE_API_URL    - Claude API URL (default: https://api.anthropic.com)
 *   CLAUDE_MODEL      - Model to use (default: claude-sonnet-4-20250514)
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { readline } from 'node:readline/promises'
import axios from 'axios'

// Configuration
const CONFIG = {
  weixinAccountId: process.env.WEIXIN_ACCOUNT_ID || '',
  claudeApiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
  claudeApiUrl: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  pollIntervalMs: 3000,
  typingDelayMs: 1500,
  maxResponseTimeMs: 60000,
}

interface WechatMessage {
  from_user_id: string
  content: string
  context_token?: string
}

interface McpResponse {
  jsonrpc: string
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

class WechatBridge {
  private weixinProcess: ChildProcess | null = null
  private running = false
  private currentRequestId = 1

  async start(): Promise<void> {
    console.error('[Bridge] Starting WeChat Bridge...')

    // Validate config
    if (!CONFIG.claudeApiKey) {
      throw new Error('Missing CLAUDE_API_KEY (or ANTHROPIC_API_KEY) environment variable')
    }

    // Start weixin-mcp process
    await this.startWeixinMcp()

    // Main loop
    this.running = true
    this.pollLoop()
  }

  private async startWeixinMcp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-y', 'weixin-mcp']
      if (CONFIG.weixinAccountId) {
        args.push(`--account=${CONFIG.weixinAccountId}`)
      }

      this.weixinProcess = spawn('npx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId || 'e87c180011fe-im-bot' },
      })

      if (!this.weixinProcess.stdout || !this.weixinProcess.stdin) {
        throw new Error('Failed to spawn weixin-mcp')
      }

      const rl = readline.createInterface({
        input: this.weixinProcess.stdout,
        crlfDelay: Infinity,
      })

      this.weixinProcess.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim()
        if (line) {
          console.error(`[weixin-mcp] ${line}`)
        }
      })

      this.weixinProcess.on('error', reject)
      this.weixinProcess.on('exit', (code) => {
        console.error(`[Bridge] weixin-mcp exited with code ${code}`)
        this.running = false
      })

      // Wait for initial startup, then resolve
      setTimeout(resolve, 2000)
    })
  }

  private async pollLoop(): Promise<void> {
    console.error('[Bridge] Starting poll loop...')

    while (this.running) {
      try {
        const messages = await this.pollMessages()
        for (const msg of messages) {
          await this.handleMessage(msg)
        }
      } catch (err) {
        console.error('[Bridge] Poll error:', err)
      }

      await this.sleep(CONFIG.pollIntervalMs)
    }
  }

  private async pollMessages(): Promise<WechatMessage[]> {
    const result = await this.sendRequest('tools/call', {
      name: 'weixin_poll',
      arguments: {},
    })

    if (!result || !(result as { content?: Array<{ type: string; text: string }> }).content) {
      return []
    }

    const messages: WechatMessage[] = []
    const content = (result as { content: Array<{ type: string; text: string }> }).content

    for (const item of content) {
      if (item.type === 'text' && item.text) {
        // Parse: ← sender_id: content
        const match = item.text.match(/← (\S+): (.+)/s)
        if (match) {
          messages.push({
            from_user_id: match[1],
            content: match[2].trim(),
          })
        }
      }
    }

    return messages
  }

  private async handleMessage(msg: WechatMessage): Promise<void> {
    console.error(`[Bridge] Received from ${msg.from_user_id}: ${msg.content.substring(0, 50)}...`)

    // Show typing indicator
    await this.sendTyping(msg.from_user_id, true)

    try {
      // Call Claude Code API
      const response = await this.callClaude(msg.from_user_id, msg.content)

      // Send response
      await this.sendTyping(msg.from_user_id, false)
      await this.sendWechatMessage(msg.from_user_id, response, msg.context_token)

      console.error(`[Bridge] Sent response to ${msg.from_user_id}`)
    } catch (err) {
      console.error('[Bridge] Error handling message:', err)
      await this.sendTyping(msg.from_user_id, false)
      await this.sendWechatMessage(
        msg.from_user_id,
        '抱歉，处理消息时遇到错误。请稍后再试。',
        msg.context_token,
      )
    }
  }

  private async callClaude(userId: string, userMessage: string): Promise<string> {
    const startTime = Date.now()

    try {
      const response = await axios.post(
        CONFIG.claudeApiUrl,
        {
          model: CONFIG.claudeModel,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: `微信用户 ${userId} 说: ${userMessage}`,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CONFIG.claudeApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
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
        console.error('[Bridge] Claude API error:', err.response?.data || err.message)
      } else {
        console.error('[Bridge] Claude API error:', err)
      }
      throw err
    }
  }

  private async sendWechatMessage(to: string, text: string, contextToken?: string): Promise<void> {
    await this.sendRequest('tools/call', {
      name: 'weixin_send',
      arguments: {
        to,
        text,
        ...(contextToken && { context_token: contextToken }),
      },
    })
  }

  private async sendTyping(to: string, typing: boolean): Promise<void> {
    try {
      await this.sendRequest('tools/call', {
        name: 'weixin_send',
        arguments: {
          to,
          text: typing ? '正在输入...' : '',
        },
      })
    } catch {
      // Ignore typing errors
    }
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.weixinProcess?.stdin || !this.weixinProcess?.stdout) {
        reject(new Error('weixin-mcp process not initialized'))
        return
      }

      const id = this.currentRequestId++
      const request = { jsonrpc: '2.0', id, method, params }

      const rl = readline.createInterface({
        input: this.weixinProcess.stdout,
        crlfDelay: Infinity,
      })

      const timeout = setTimeout(() => {
        rl.close()
        reject(new Error(`Request ${id} timed out`))
      }, 30000)

      const handleLine = (line: string) => {
        try {
          const response = JSON.parse(line) as McpResponse
          if (response.id === id) {
            clearTimeout(timeout)
            rl.close()
            // Remove the listener
            this.weixinProcess?.stdout?.removeListener('line', handleLine)

            if (response.error) {
              reject(new Error(`${response.error.message} (code: ${response.error.code})`))
            } else {
              resolve(response.result)
            }
          }
        } catch {
          // Not JSON or not our response
        }
      }

      this.weixinProcess.stdout.on('line', handleLine)
      this.weixinProcess.stdin.write(`${JSON.stringify(request)}\n`)
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async stop(): Promise<void> {
    console.error('[Bridge] Stopping...')
    this.running = false

    if (this.weixinProcess) {
      this.weixinProcess.kill()
      this.weixinProcess = null
    }
  }
}

// Main
async function main(): Promise<void> {
  const bridge = new WechatBridge()

  // Handle shutdown
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
    console.error('[Bridge] Fatal error:', err)
    await bridge.stop()
    process.exit(1)
  }
}

main().catch(console.error)
