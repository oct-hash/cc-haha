/**
 * WeChat Channel MCP Server
 *
 * Integrates WeChat ClawBot with Claude Code's channel system.
 * Enables receiving and sending WeChat messages through Claude Code.
 *
 * Usage:
 *   claude --channels plugin:wechat@local
 *
 * Or run standalone:
 *   bun run src/services/channels/wechat/index.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { loadOrLogin, login, waitForQRCodeConfirm } from './login.js'
import { formatWechatMessage, WechatMessageHandler } from './messaging.js'
import type { WechatMessage } from './types.js'

// Capability declarations
const SERVER_NAME = 'wechat-channel'
const SERVER_VERSION = '1.0.0'

// Global state
let messageHandler: WechatMessageHandler | null = null
let qrcodeData: { qrcode: string; qrcodeId: string } | null = null

/**
 * Create the WeChat MCP Server
 */
function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        // Expose tools for sending messages
        tools: {},
        // Enable channel notifications - this is the key capability
        // that allows inbound WeChat messages to reach Claude Code
        experimental: {
          'claude/channel': {},
        },
      },
    },
  )

  // Track pending messages for channel routing
  const pendingMessages: Map<string, WechatMessage> = new Map()

  // ============ Tool Handlers ============

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'wechat_send',
          description: 'Send a text message to a WeChat user',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient (user ID, nickname, or partial match)',
              },
              text: {
                type: 'string',
                description: 'Message text to send',
              },
            },
            required: ['to', 'text'],
          },
        },
        {
          name: 'wechat_send_image',
          description: 'Send an image to a WeChat user',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient (user ID, nickname, or partial match)',
              },
              media_id: {
                type: 'string',
                description: 'Media ID from prior upload',
              },
            },
            required: ['to', 'media_id'],
          },
        },
        {
          name: 'wechat_send_file',
          description: 'Send a file to a WeChat user',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient (user ID, nickname, or partial match)',
              },
              media_id: {
                type: 'string',
                description: 'Media ID from prior upload',
              },
              file_name: {
                type: 'string',
                description: 'File name to display',
              },
            },
            required: ['to', 'media_id', 'file_name'],
          },
        },
        {
          name: 'wechat_contacts',
          description: 'List all WeChat contacts',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'wechat_login',
          description: 'Get QR code for WeChat login (run first if not logged in)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'wechat_poll_login',
          description: 'Poll for QR code scan confirmation',
          inputSchema: {
            type: 'object',
            properties: {
              qrcode_id: {
                type: 'string',
                description: 'QR code ID from wechat_login',
              },
            },
            required: ['qrcode_id'],
          },
        },
        {
          name: 'wechat_get_messages',
          description: 'Get pending WeChat messages (for manual polling)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (!messageHandler) {
      // Try to load existing account
      const loginResult = await loadOrLogin()
      if (!loginResult.qrcode && loginResult.account.token) {
        initMessageHandler(loginResult.account)
      } else {
        throw new Error('Not logged in. Run wechat_login first to get a QR code for scanning.')
      }
    }

    switch (name) {
      case 'wechat_send': {
        const { to, text } = args as { to: string; text: string }
        const result = await messageHandler!.sendText(to, text)
        return {
          content: [
            {
              type: 'text',
              text: `Message sent successfully. Message ID: ${result.message_id}`,
            },
          ],
        }
      }

      case 'wechat_send_image': {
        const { to, media_id } = args as { to: string; media_id: string }
        const result = await messageHandler!.sendImage(to, media_id)
        return {
          content: [
            {
              type: 'text',
              text: `Image sent successfully. Message ID: ${result.message_id}`,
            },
          ],
        }
      }

      case 'wechat_send_file': {
        const { to, media_id, file_name } = args as {
          to: string
          media_id: string
          file_name: string
        }
        const result = await messageHandler!.sendFile(to, media_id, file_name)
        return {
          content: [
            {
              type: 'text',
              text: `File sent successfully. Message ID: ${result.message_id}`,
            },
          ],
        }
      }

      case 'wechat_contacts': {
        const contacts = messageHandler!.getContactsList()
        const list = contacts.map((c) => `${c.user_id}: ${c.nickname}`).join('\n')
        return {
          content: [
            {
              type: 'text',
              text: `Contacts (${contacts.length}):\n${list || 'No contacts found'}`,
            },
          ],
        }
      }

      case 'wechat_login': {
        const result = await login()
        qrcodeData = { qrcode: result.qrcode, qrcodeId: '' }
        return {
          content: [
            {
              type: 'text',
              text: `QR code generated. Please scan with WeChat app.\n\nNote: This is a basic implementation. For full QR code display, use the weixin-mcp CLI tool.`,
            },
            {
              type: 'text',
              text: result.qrcode, // Base64 QR code image
            },
          ],
        }
      }

      case 'wechat_poll_login': {
        const { qrcode_id } = args as { qrcode_id: string }
        if (!qrcode_id) {
          throw new Error('qrcode_id is required')
        }
        try {
          const account = await waitForQRCodeConfirm(qrcode_id)
          initMessageHandler(account)
          return {
            content: [
              {
                type: 'text',
                text: `Login successful! Logged in as ${account.userId}`,
              },
            ],
          }
        } catch (err) {
          throw new Error(`Login failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      case 'wechat_get_messages': {
        // Return any pending messages
        const messages = Array.from(pendingMessages.values()).map((msg) =>
          formatWechatMessage(msg, null),
        )
        pendingMessages.clear()
        return {
          content: [
            {
              type: 'text',
              text: messages.length > 0 ? messages.join('\n---\n') : 'No pending messages',
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  })

  return server
}

/**
 * Initialize message handler with account
 */
function initMessageHandler(account: import('./types.js').WechatAccount): void {
  if (messageHandler) {
    messageHandler.stop()
  }

  messageHandler = new WechatMessageHandler(account, {
    onMessage: (msg, sender) => {
      console.error(`[WeChat Channel] Received message: ${formatWechatMessage(msg, sender)}`)
    },
    onError: (err) => {
      console.error('[WeChat Channel] Error:', err.message)
    },
  })

  messageHandler.start()
}

// ============ Main ============

async function main(): Promise<void> {
  const server = createServer()

  // Try to load existing account
  try {
    const loginResult = await loadOrLogin()
    if (loginResult.account.token) {
      console.error(`[WeChat Channel] Logged in as ${loginResult.account.userId}`)
      initMessageHandler(loginResult.account)
    }
  } catch (err) {
    console.error('[WeChat Channel] Not logged in. Run wechat_login to get a QR code.')
  }

  // Connect transport
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('[WeChat Channel] Server started')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
