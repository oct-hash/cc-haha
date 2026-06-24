export interface QQMailConfig {
  user: string
  authCode: string
  host?: string
  port?: number
  tls?: boolean
}

export interface MailAttachment {
  filename: string
  contentType: string
  content: Buffer
  size: number
}

export interface QQMail {
  uid: number
  id: string
  subject: string
  from: string
  to: string
  date: Date
  hasAttachments: boolean
  attachments: MailAttachment[]
  body: string
}

export interface PaperMatch {
  paper: {
    id: string
    title: string
    authors?: string[]
    year?: string
    doi?: string
  }
  attachment: MailAttachment
  matchType: 'doi' | 'title_exact' | 'title_fuzzy'
  score: number
}

export interface MatchResult {
  matched: PaperMatch[]
  unmatched: MailAttachment[]
  knowledgeBasePapers: number
  papersWithPdf: number
  papersMissingPdf: number
}

export interface DownloadResult {
  success: boolean
  path?: string
  error?: string
}

export interface SyncResult {
  downloaded: number
  pending: number
  errors: string[]
}
