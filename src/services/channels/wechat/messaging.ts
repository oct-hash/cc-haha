/**
 * WeChat Message Handler
 * Manages message polling, sending, and contact resolution
 */

import type {
  WechatAccount,
  WechatMessage,
  WechatContact,
  WechatUpdate,
} from './types.js'
import {
  getUpdates,
  getContacts,
  sendTextMessage,
  sendImageMessage,
  sendFileMessage,
  sendVideoMessage,
} from './api.js'

export interface MessageHandlerCallbacks {
  onMessage: (message: WechatMessage, sender: WechatContact | null) => void
  onError: (error: Error) => void
}

export class WechatMessageHandler {
  private account: WechatAccount
  private cursor?: string
  private contacts: Map<string, WechatContact> = new Map()
  private polling = false
  private pollInterval?: ReturnType<typeof setInterval>
  private callbacks: MessageHandlerCallbacks

  constructor(account: WechatAccount, callbacks: MessageHandlerCallbacks) {
    this.account = account
    this.callbacks = callbacks
  }

  /**
   * Start polling for messages
   */
  async start(): Promise<void> {
    if (this.polling) return

    // Load contacts for sender resolution
    await this.loadContacts()

    this.polling = true
    this.poll()
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.polling = false
    if (this.pollInterval) {
      clearTimeout(this.pollInterval)
      this.pollInterval = undefined
    }
  }

  /**
   * Load contacts for sender resolution
   */
  private async loadContacts(): Promise<void> {
    try {
      const contacts = await getContacts(this.account)
      this.contacts.clear()
      for (const contact of contacts) {
        this.contacts.set(contact.user_id, contact)
        // Also index by partial ID
        const shortId = contact.user_id.split('@')[0]
        this.contacts.set(shortId, contact)
      }
    } catch (err) {
      console.error('Failed to load contacts:', err)
    }
  }

  /**
   * Poll for new messages
   */
  private async poll(): Promise<void> {
    if (!this.polling) return

    try {
      const update: WechatUpdate = await getUpdates(this.account, this.cursor)

      if (update.msg_list && update.msg_list.length > 0) {
        for (const msg of update.msg_list) {
          const sender = this.resolveSender(msg)
          this.callbacks.onMessage(msg, sender)
        }
      }

      // Update cursor for next poll
      if (update.cursor) {
        this.cursor = update.cursor
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)))
    }

    // Schedule next poll (long polling with fallback)
    if (this.polling) {
      this.pollInterval = setTimeout(() => this.poll(), 1000)
    }
  }

  /**
   * Resolve sender contact info
   */
  private resolveSender(msg: WechatMessage): WechatContact | null {
    // Try to find by nickname if available
    if (msg.from_nickname) {
      for (const contact of this.contacts.values()) {
        if (contact.nickname === msg.from_nickname) {
          return contact
        }
      }
    }
    return null
  }

  /**
   * Resolve user ID from short ID or nickname
   */
  resolveUserId(input: string): string | null {
    // Direct match
    if (this.contacts.has(input)) {
      return input
    }

    // Try partial match
    for (const [id, contact] of this.contacts) {
      if (id.includes(input) || contact.nickname?.includes(input)) {
        return contact.user_id
      }
    }

    return null
  }

  /**
   * Send text message
   */
  async sendText(to: string, text: string): Promise<{ message_id: string }> {
    const userId = this.resolveUserId(to) || to
    return sendTextMessage(userId, text, this.account)
  }

  /**
   * Send image message
   */
  async sendImage(to: string, mediaId: string): Promise<{ message_id: string }> {
    const userId = this.resolveUserId(to) || to
    return sendImageMessage(userId, mediaId, this.account)
  }

  /**
   * Send file message
   */
  async sendFile(
    to: string,
    mediaId: string,
    fileName: string,
  ): Promise<{ message_id: string }> {
    const userId = this.resolveUserId(to) || to
    return sendFileMessage(userId, mediaId, fileName, this.account)
  }

  /**
   * Send video message
   */
  async sendVideo(to: string, mediaId: string): Promise<{ message_id: string }> {
    const userId = this.resolveUserId(to) || to
    return sendVideoMessage(userId, mediaId, this.account)
  }

  /**
   * Get all contacts
   */
  getContactsList(): WechatContact[] {
    return Array.from(this.contacts.values())
  }

  /**
   * Refresh account token
   */
  updateAccount(account: WechatAccount): void {
    this.account = account
  }
}

/**
 * Format WeChat message for display
 */
export function formatWechatMessage(
  msg: WechatMessage,
  sender: WechatContact | null,
): string {
  const senderName = sender?.nickname || msg.from_nickname || 'Unknown'
  const time = msg.create_time
    ? new Date(msg.create_time * 1000).toLocaleString()
    : ''

  const items: string[] = []
  for (const item of msg.item_list || []) {
    switch (item.type) {
      case 1: // Text
        items.push(item.content || '')
        break
      case 2: // Image
        items.push('[Image]')
        break
      case 4: // File
        items.push(`[File: ${item.file_name || 'unknown'}]`)
        break
      case 5: // Video
        items.push('[Video]')
        break
      default:
        items.push(`[Message type ${item.type}]`)
    }
  }

  return `From: ${senderName}\nTime: ${time}\n${items.join('\n')}`
}
