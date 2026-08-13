/**
 * MCP Client for weixin-mcp HTTP API
 */

import type { PollResult } from './types.js'

export class WeixinMcpClient {
  private sessionId: string | null = null
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:3001/mcp') {
    this.baseUrl = baseUrl
  }

  /**
   * Initialize MCP session
   */
  async initialize(): Promise<void> {
    const response = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'wechat-bridge', version: '1.0.0' },
    })

    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`)
    }

    // Extract session ID from headers
    // The session ID is set in the Set-Cookie or mcp-session-id header
  }

  /**
   * Send a raw MCP request
   */
  private async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // For SSE responses, we need to handle the event stream
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      // Handle SSE response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      let buffer = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            // Handle event type
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            try {
              const parsed = JSON.parse(data)
              return parsed
            } catch {
              // Continue parsing
            }
          }
        }
      }
    }

    return response.json()
  }

  /**
   * Call a tool on weixin-mcp
   */
  async callTool(name: string, arguments_: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('tools/call', { name, arguments: arguments_ })
  }

  /**
   * Poll for new messages
   */
  async pollMessages(resetCursor = false): Promise<PollResult> {
    try {
      const result = (await this.callTool('weixin_poll', { reset_cursor: resetCursor })) as {
        result?: { content?: Array<{ type: string; text?: string }> }
      }

      if (!result?.result?.content) {
        return { messages: [] }
      }

      // Parse messages from tool result
      const messages: PollResult = { messages: [] }
      for (const item of result.result.content) {
        if (item.type === 'text' && item.text) {
          try {
            // The message format is: ← sender_id: content
            const match = item.text.match(/← (\S+): (.+)/)
            if (match) {
              messages.messages.push({
                from_user_id: match[1],
                message_type: 1,
                message_state: 2,
                item_list: [{ type: 1, text_item: { text: match[2] } }],
              })
            }
          } catch {
            // Skip unparseable messages
          }
        }
      }

      return messages
    } catch (err) {
      console.error('[WeixinMcpClient] Poll error:', err)
      return { messages: [] }
    }
  }

  /**
   * Send a text message
   */
  async sendText(to: string, text: string, contextToken?: string): Promise<boolean> {
    try {
      await this.callTool('weixin_send', {
        to,
        text,
        ...(contextToken && { context_token: contextToken }),
      })
      return true
    } catch (err) {
      console.error('[WeixinMcpClient] Send error:', err)
      return false
    }
  }

  /**
   * Get list of contacts
   */
  async getContacts(): Promise<string[]> {
    try {
      const result = (await this.callTool('weixin_contacts', {})) as {
        result?: { content?: Array<{ type: string; text?: string }> }
      }
      if (!result?.result?.content) return []

      const contacts: string[] = []
      for (const item of result.result.content) {
        if (item.type === 'text' && item.text) {
          // Parse contact list
          const lines = item.text.split('\n')
          for (const line of lines) {
            const match = line.match(/^([^:]+):/)
            if (match) {
              contacts.push(match[1])
            }
          }
        }
      }
      return contacts
    } catch (err) {
      console.error('[WeixinMcpClient] Get contacts error:', err)
      return []
    }
  }

  /**
   * Set session ID (for when session is established via other means)
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }
}
