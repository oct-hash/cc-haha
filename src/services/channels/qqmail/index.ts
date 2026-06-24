import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { createQQMailIMAP, QQMailIMAP } from './imap.js'
import { createMatcher, KnowledgeBaseMatcher } from './matcher.js'
import { createDownloader, PDFDownloader } from './downloader.js'
import type { QQMail, MatchResult } from './types.js'

const SERVER_NAME = 'qqmail'
const SERVER_VERSION = '1.0.0'

// Fallback: load .env from known absolute path (handles MCP spawn env issues)
try {
  const envText = require('fs').readFileSync('D:/claude-code-haha/.env', 'utf-8')
  for (const line of envText.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) {
      const k = t.slice(0, i).trim()
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim()
    }
  }
} catch (_) {}

// Get config from environment
const QQ_USER = process.env.QQ_USER || ''
const QQ_AUTH_CODE = process.env.QQ_AUTH_CODE || ''
const PAPERS_PDF_DIR = process.env.PAPERS_PDF_DIR || 'E:/待归档/papers'
const PENDING_DIR = process.env.PENDING_DIR || 'E:/待归档'
const KB_INDEX_PATH = process.env.KB_INDEX_PATH || 'D:/hermes-kb/wiki/papertree/index.json'
const KB_GRAPH_PATH = process.env.KB_GRAPH_PATH || 'D:/hermes-kb/wiki/papertree/graph.json'

// Debug: log env vars at startup
const fs = require('fs')
fs.writeFileSync('D:/qqmail-debug.log', `[qqmail] QQ_USER=${QQ_USER ? 'OK' : 'MISSING'} AUTH_CODE=${QQ_AUTH_CODE ? 'OK' : 'MISSING'} KB_INDEX=${KB_INDEX_PATH} CWD=${process.cwd()}\n`, { flag: 'a' })
console.error(`[qqmail] QQ_USER=${QQ_USER ? 'OK' : 'MISSING'} AUTH_CODE=${QQ_AUTH_CODE ? 'OK' : 'MISSING'} KB_INDEX=${KB_INDEX_PATH} KB_GRAPH=${KB_GRAPH_PATH}`)

class QQMailServer {
  private server: Server
  private imap: QQMailIMAP | null = null
  private matcher: KnowledgeBaseMatcher
  private downloader: PDFDownloader
  private connected = false

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.matcher = createMatcher(KB_INDEX_PATH, KB_GRAPH_PATH)
    this.downloader = createDownloader({
      papersPdfDir: PAPERS_PDF_DIR,
      pendingDir: PENDING_DIR,
    })

    this.setupHandlers()
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        this.buildListEmailsTool(),
        this.buildMatchKBTool(),
        this.buildDownloadTool(),
        this.buildSyncTool(),
      ] as Tool[],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'qqmail_connect':
            return await this.handleConnect()
          case 'qqmail_list_emails':
            return await this.handleListEmails(args)
          case 'qqmail_match_knowledge_base':
            return await this.handleMatchKB(args)
          case 'qqmail_download':
            return await this.handleDownload(args)
          case 'qqmail_sync':
            return await this.handleSync(args)

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unknown tool: ${name}`,
                },
              ],
              isError: true,
            }
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        }
      }
    })
  }

  private buildListEmailsTool() {
    return {
      name: 'qqmail_list_emails',
      description:
        'Connect to QQ mail and list recent emails with PDF attachments. Returns email list with subjects, dates, and attachment info.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of emails to return (default: 20)',
            default: 20,
          },
          since: {
            type: 'string',
            description:
              'Filter emails since this date (ISO format, e.g., 2024-01-01)',
          },
          box: {
            type: 'string',
            description: 'Mailbox to read from (default: INBOX)',
            default: 'INBOX',
          },
        },
      },
    }
  }

  private buildMatchKBTool() {
    return {
      name: 'qqmail_match_knowledge_base',
      description:
        'Match emails/PDFs against the paper-wiki knowledge base. Returns matched papers (existing in KB) and unmatched (new papers for pending folder).',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of emails to process (default: 20)',
            default: 20,
          },
        },
      },
    }
  }

  private buildDownloadTool() {
    return {
      name: 'qqmail_download',
      description:
        'Download a specific PDF attachment by email UID and attachment index.',
      inputSchema: {
        type: 'object',
        properties: {
          uid: {
            type: 'number',
            description: 'Email UID',
          },
          attachmentIndex: {
            type: 'number',
            description: 'Attachment index (0-based)',
            default: 0,
          },
          toPending: {
            type: 'boolean',
            description: 'Download to pending folder instead of papers folder',
            default: false,
          },
        },
      },
    }
  }

  private buildSyncTool() {
    return {
      name: 'qqmail_sync',
      description:
        'Full sync: connect to QQ mail, match all PDFs against knowledge base, download matched to papers folder, unmatched to pending folder.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of emails to process (default: 50)',
            default: 50,
          },
        },
      },
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      if (!QQ_USER || !QQ_AUTH_CODE) {
        throw new Error(
          'QQ_USER and QQ_AUTH_CODE environment variables are required'
        )
      }
      this.imap = createQQMailIMAP({
        user: QQ_USER,
        authCode: QQ_AUTH_CODE,
      })
      await this.imap.connect()
      await this.matcher.load()
      this.connected = true
    }
  }

  private async handleConnect() {
    await this.ensureConnected()
    return {
      content: [
        {
          type: 'text',
          text: 'Connected to QQ mail successfully',
        },
      ],
    }
  }

  private async handleListEmails(args: Record<string, unknown>) {
    await this.ensureConnected()

    const limit = (args.limit as number) || 20
    const since = args.since ? new Date(args.since as string) : undefined
    const box = (args.box as string) || 'INBOX'

    const emails = await this.imap!.listEmails({ limit, since, box })

    const result = emails.map((mail) => ({
      uid: mail.uid,
      subject: mail.subject,
      from: mail.from,
      date: mail.date.toISOString(),
      hasAttachments: mail.hasAttachments,
      attachments: mail.attachments.map((a) => ({
        filename: a.filename,
        size: a.size,
        contentType: a.contentType,
      })),
    }))

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: result.length,
              emails: result,
            },
            null,
            2
          ),
        },
      ],
    }
  }

  private async handleMatchKB(args: Record<string, unknown>) {
    await this.ensureConnected()

    const limit = (args.limit as number) || 20
    const emails = await this.imap!.listEmails({ limit })

    // Collect all PDF attachments with their subjects
    const pdfAttachments: { attachment: QQMail['attachments'][0]; subject: string; date: Date }[] = []

    for (const mail of emails) {
      for (const att of mail.attachments) {
        pdfAttachments.push({
          attachment: att,
          subject: mail.subject,
          date: mail.date,
        })
      }
    }

    const attachments = pdfAttachments.map((p) => p.attachment)
    const subjects = pdfAttachments.map((p) => p.subject)

    const matchResult = this.matcher.matchAttachments(attachments, subjects)

    const formatted: MatchResult & { dates: Record<string, string> } = {
      ...matchResult,
      dates: {},
    }

    // Add dates for unmatched
    for (const att of matchResult.unmatched) {
      const found = pdfAttachments.find((p) => p.attachment === att)
      if (found) {
        formatted.dates[att.filename] = found.date.toISOString()
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formatted, null, 2),
        },
      ],
    }
  }

  private async handleDownload(args: Record<string, unknown>) {
    await this.ensureConnected()

    const uid = args.uid as number
    const attachmentIndex = (args.attachmentIndex as number) || 0
    const toPending = (args.toPending as boolean) || false

    const attachment = await this.imap!.getAttachment(uid, attachmentIndex)
    if (!attachment) {
      return {
        content: [
          {
            type: 'text',
            text: `Attachment ${attachmentIndex} not found in email ${uid}`,
          },
        ],
        isError: true,
      }
    }

    let result
    if (toPending) {
      result = await this.downloader.downloadToPending(attachment, new Date())
    } else {
      // Try to match first
      const match = this.matcher.matchAttachment(attachment)
      if (match) {
        result = await this.downloader.downloadToPapersDir(attachment, match.paper.id)
      } else {
        result = await this.downloader.downloadToPending(attachment, new Date())
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  }

  private async handleSync(args: Record<string, unknown>) {
    await this.ensureConnected()

    const limit = (args.limit as number) || 50
    const emails = await this.imap!.listEmails({ limit })

    // Collect PDF attachments
    const pdfAttachments: { attachment: QQMail['attachments'][0]; subject: string; date: Date }[] = []

    for (const mail of emails) {
      for (const att of mail.attachments) {
        pdfAttachments.push({
          attachment: att,
          subject: mail.subject,
          date: mail.date,
        })
      }
    }

    const attachments = pdfAttachments.map((p) => p.attachment)
    const subjects = pdfAttachments.map((p) => p.subject)

    const matchResult = this.matcher.matchAttachments(attachments, subjects)

    // Download matched to papers dir
    const matchedResults = await this.downloader.downloadMatched(
      matchResult.matched,
      new Date()
    )

    // Download unmatched to pending
    const pendingResults = await this.downloader.downloadUnmatched(
      matchResult.unmatched,
      new Date()
    )

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              matched: {
                downloaded: matchedResults.downloaded,
                errors: matchedResults.errors,
              },
              unmatched: {
                pending: pendingResults.downloaded,
                errors: pendingResults.errors,
              },
              summary: `Processed ${attachments.length} PDFs: ${matchedResults.downloaded} saved to papers, ${pendingResults.downloaded} saved to pending`,
            },
            null,
            2
          ),
        },
      ],
    }
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error(`${SERVER_NAME} v${SERVER_VERSION} started`)
  }
}

const server = new QQMailServer()
server.start().catch(console.error)
