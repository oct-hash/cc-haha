/**
 * WeChat Bridge Service (HTTP Mode)
 *
 * Bridges WeChat messages to Claude Code and back.
 * Uses weixin-mcp HTTP API running on port 3001.
 *
 * Usage:
 *   bun --env-file=.env ./src/services/channels/wechat-bridge/httpBridge.ts
 */

import axios from 'axios'
import { getBridgeConfig } from './config.js'

const CONFIG = getBridgeConfig()

interface McpResponse {
  jsonrpc: string
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

interface WechatMessage {
  from_user_id: string
  content: string
}

class WechatBridge {
  private running = false

  async start(): Promise<void> {
    console.error('[Bridge] Starting WeChat Bridge (HTTP mode)...')
    console.error(`[Bridge] Target: ${CONFIG.weixinMcpUrl}`)
    console.error(`[Bridge] Account: ${CONFIG.weixinAccountId}`)

    // Validate config
    if (!CONFIG.claudeApiKey) {
      throw new Error('Missing CLAUDE_API_KEY (or ANTHROPIC_API_KEY) environment variable')
    }

    // Initialize MCP session
    await this.initSession()

    // Main loop
    this.running = true
    this.pollLoop()
  }

  private async initSession(): Promise<void> {
    console.error('[Bridge] Initializing MCP session...')

    const response = await axios.post(
      CONFIG.weixinMcpUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'wechat-bridge', version: '1.0.0' },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        timeout: 10000,
      },
    )

    // Extract session ID from response headers
    // MCP over HTTP uses mcp-session-id header
    // Note: The session ID is typically in Set-Cookie header
    console.error('[Bridge] Session initialized')
  }

  private async pollLoop(): Promise<void> {
    console.error('[Bridge] Starting poll loop...')

    let pollCount = 0
    while (this.running) {
      try {
        pollCount++
        const messages = await this.pollMessages()
        console.error(`[Bridge] Poll #${pollCount}: ${messages.length} message(s)`)

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
    try {
      const response = await axios.post(
        CONFIG.weixinMcpUrl,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'weixin_poll',
            arguments: {},
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          timeout: 35000, // Long poll timeout
        },
      )

      // Parse SSE response
      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      const messages = this.parseSseResponse(text)
      return messages
    } catch (err) {
      if (axios.isAxiosError(err) && err.code === 'ECONNREFUSED') {
        console.error('[Bridge] Cannot connect to weixin-mcp. Is it running?')
      }
      return []
    }
  }

  private parseSseResponse(text: string): WechatMessage[] {
    const messages: WechatMessage[] = []

    // Parse SSE format: event: message\ndata: {...}\n\n
    const lines = text.split('\n')
    let currentEvent = ''
    let currentData = ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        currentData = line.slice(5).trim()
      } else if (line === '') {
        // End of event
        if (currentEvent === 'message' && currentData) {
          try {
            const parsed = JSON.parse(currentData)
            if (parsed.result?.content) {
              for (const item of parsed.result.content) {
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
            }
          } catch {
            // Skip unparseable
          }
        }
        currentEvent = ''
        currentData = ''
      }
    }

    return messages
  }

  private async handleMessage(msg: WechatMessage): Promise<void> {
    console.error(`[Bridge] Message from ${msg.from_user_id}: ${msg.content.substring(0, 100)}`)

    try {
      // Call Claude
      const response = await this.callClaude(msg.from_user_id, msg.content)

      // Send response
      await this.sendWechatMessage(msg.from_user_id, response)

      console.error(`[Bridge] Response sent to ${msg.from_user_id}`)
    } catch (err) {
      console.error('[Bridge] Error handling message:', err)
      await this.sendWechatMessage(msg.from_user_id, '抱歉，处理消息时遇到错误。请稍后再试。')
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
        console.error('[Bridge] Claude API error:', err.response?.data || err.message)
      } else {
        console.error('[Bridge] Claude API error:', err)
      }
      throw err
    }
  }

  private async sendWechatMessage(to: string, text: string): Promise<void> {
    try {
      await axios.post(
        CONFIG.weixinMcpUrl,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'weixin_send',
            arguments: { to, text },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          timeout: 10000,
        },
      )
    } catch (err) {
      console.error('[Bridge] Send error:', err)
      throw err
    }
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
