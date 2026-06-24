import Imap from 'imap'
import { simpleParser, ParsedMail } from 'mailparser'
import type { QQMailConfig, QQMail, MailAttachment } from './types.js'

export class QQMailIMAP {
  private config: QQMailConfig
  private imap: Imap

  constructor(config: QQMailConfig) {
    this.config = {
      host: 'imap.qq.com',
      port: 993,
      tls: true,
      ...config,
    }
    this.imap = new Imap(this.buildConfig())
  }

  private buildConfig(): Imap.Config {
    return {
      user: this.config.user,
      password: this.config.authCode,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once('ready', () => resolve())
      this.imap.once('error', (err) => reject(err))
      this.imap.connect()
    })
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.imap.end()
      this.imap.once('end', () => resolve())
    })
  }

  async listEmails(
    options: {
      box?: string
      limit?: number
      since?: Date
      before?: Date
    } = {}
  ): Promise<QQMail[]> {
    const { box = 'INBOX', limit = 20, since, before } = options

    return new Promise((resolve, reject) => {
      const mails: QQMail[] = []

      const searchCriteria: string[] = ['ALL']
      if (since) searchCriteria.push('SINCE', this.formatDate(since))
      if (before) searchCriteria.push('BEFORE', this.formatDate(before))

      const fetchOpts: Imap.FetchOptions = {
        bodies: '',
        struct: true,
      }

      this.imap.openBox(box, false, (err) => {
        if (err) {
          reject(err)
          return
        }

        this.imap.search(searchCriteria, (err, results) => {
          if (err) {
            reject(err)
            return
          }

          if (results.length === 0) {
            resolve([])
            return
          }

          // Get latest emails (reverse to get most recent first)
          const uids = results.slice(-limit).reverse()

          const fetch = this.imap.fetch(uids, fetchOpts)
          let pendingMessages = uids.length
          let fetchError: Error | null = null

          const finish = () => {
            if (fetchError) return
            // Sort by date descending
            mails.sort((a, b) => b.date.getTime() - a.date.getTime())
            resolve(mails)
          }

          fetch.on('message', (msg) => {
            let uid = 0

            msg.once('attributes', (attrs) => {
              uid = attrs.uid
            })

            msg.on('body', async (stream) => {
              try {
                const parsed = await simpleParser(stream)
                const attachments = this.extractAttachments(parsed)

                const mail: QQMail = {
                  uid,
                  id: String(uid),
                  subject: parsed.subject || '(no subject)',
                  from: parsed.from?.text || '',
                  to: parsed.to?.text || '',
                  date: parsed.date || new Date(),
                  hasAttachments: attachments.length > 0,
                  attachments,
                  body: parsed.text || parsed.textAsHtml || '',
                }

                mails.push(mail)
              } catch (err) {
                // Continue even if one message fails
                console.error(`Failed to parse message ${uid}:`, err)
              } finally {
                pendingMessages--
                if (pendingMessages <= 0) {
                  finish()
                }
              }
            })

            msg.once('error', (err) => {
              fetchError = err as Error
              reject(err)
            })
          })

          fetch.once('end', () => {
            // If no messages were fetched, resolve immediately
            if (pendingMessages <= 0) {
              finish()
            }
          })

          fetch.once('error', (err) => {
            fetchError = err as Error
            reject(err)
          })

          fetch.once('error', reject)
        })
      })
    })
  }

  async getEmailBody(uid: number, box = 'INBOX'): Promise<string> {
    return new Promise((resolve, reject) => {
      this.imap.openBox(box, false, (err) => {
        if (err) {
          reject(err)
          return
        }

        const fetch = this.imap.fetch(uid, { bodies: '' })

        fetch.on('message', async (msg) => {
          msg.on('body', async (stream) => {
            const parsed = await simpleParser(stream)
            resolve(parsed.text || parsed.textAsHtml || '')
          })
          msg.once('error', reject)
        })

        fetch.once('error', reject)
      })
    })
  }

  async getAttachment(
    uid: number,
    attachmentIndex: number,
    box = 'INBOX'
  ): Promise<MailAttachment | null> {
    return new Promise((resolve, reject) => {
      this.imap.openBox(box, false, (err) => {
        if (err) {
          reject(err)
          return
        }

        const fetch = this.imap.fetch(uid, { bodies: '', struct: true })

        fetch.on('message', async (msg) => {
          msg.on('body', async (stream) => {
            const parsed = await simpleParser(stream)
            const attachments = this.extractAttachments(parsed)
            resolve(attachments[attachmentIndex] || null)
          })
          msg.once('error', reject)
        })

        fetch.once('error', reject)
      })
    })
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

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }
}

export function createQQMailIMAP(config: QQMailConfig): QQMailIMAP {
  return new QQMailIMAP(config)
}
