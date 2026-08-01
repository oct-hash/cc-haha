import { ImapFlow } from 'imapflow'
import { type ParsedMail, simpleParser } from 'mailparser'
import type { MailAttachment, QQMail, QQMailConfig } from './types.js'

export class QQMailIMAP {
  private config: QQMailConfig
  private client: ImapFlow

  constructor(config: QQMailConfig) {
    this.config = {
      host: 'imap.qq.com',
      port: 993,
      tls: true,
      ...config,
    }
    this.client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls ?? true,
      auth: {
        user: this.config.user,
        pass: this.config.authCode,
      },
      logger: false,
    })
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.logout()
  }

  async listEmails(
    options: { box?: string; limit?: number; since?: Date; before?: Date } = {},
  ): Promise<QQMail[]> {
    const { box = 'INBOX', limit = 20, since, before } = options
    const mails: QQMail[] = []

    const lock = await this.client.getMailboxLock(box)
    try {
      const searchQuery: { since?: Date; before?: Date } = {}
      if (since) searchQuery.since = since
      if (before) searchQuery.before = before

      const uids = await this.client.search(searchQuery, { uid: true })

      if (!uids || uids.length === 0) return []

      // Get latest emails (reverse to get most recent first)
      const targetUids = uids.slice(-limit).reverse()

      for await (const msg of this.client.fetch(targetUids, { source: true }, { uid: true })) {
        try {
          const parsed = await simpleParser(msg.source)
          const attachments = this.extractAttachments(parsed)

          mails.push({
            uid: msg.uid,
            id: String(msg.uid),
            subject: parsed.subject || '(no subject)',
            from: parsed.from?.text || '',
            to: parsed.to?.text || '',
            date: parsed.date || new Date(),
            hasAttachments: attachments.length > 0,
            attachments,
            body: parsed.text || parsed.textAsHtml || '',
          })
        } catch (err) {
          console.error(`Failed to parse message ${msg.uid}:`, err)
        }
      }
    } finally {
      lock.release()
    }

    // Sort by date descending
    mails.sort((a, b) => b.date.getTime() - a.date.getTime())
    return mails
  }

  async getEmailBody(uid: number, box = 'INBOX'): Promise<string> {
    const lock = await this.client.getMailboxLock(box)
    try {
      for await (const msg of this.client.fetch(uid, { source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source)
        return parsed.text || parsed.textAsHtml || ''
      }
      return ''
    } finally {
      lock.release()
    }
  }

  async getAttachment(
    uid: number,
    attachmentIndex: number,
    box = 'INBOX',
  ): Promise<MailAttachment | null> {
    const lock = await this.client.getMailboxLock(box)
    try {
      for await (const msg of this.client.fetch(uid, { source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source)
        const attachments = this.extractAttachments(parsed)
        return attachments[attachmentIndex] || null
      }
      return null
    } finally {
      lock.release()
    }
  }

  private extractAttachments(mail: ParsedMail): MailAttachment[] {
    const attachments: MailAttachment[] = []

    if (!mail.attachments || mail.attachments.length === 0) {
      return attachments
    }

    for (const att of mail.attachments) {
      if (att.contentType === 'application/pdf' || att.filename?.endsWith('.pdf')) {
        attachments.push({
          filename: att.filename || 'unknown.pdf',
          contentType: att.contentType,
          content: att.content as Buffer,
          size: att.size,
        })
      }
    }

    return attachments
  }
}

export function createQQMailIMAP(config: QQMailConfig): QQMailIMAP {
  return new QQMailIMAP(config)
}
