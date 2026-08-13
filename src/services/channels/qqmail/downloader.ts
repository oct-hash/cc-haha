import fs from 'node:fs/promises'
import path from 'node:path'
import type { DownloadResult, MailAttachment, PaperMatch, SyncResult } from './types.js'

export interface DownloadConfig {
  papersPdfDir: string // For papers already in knowledge base
  pendingDir: string // For new papers not in knowledge base
}

export class PDFDownloader {
  private config: DownloadConfig

  constructor(config: DownloadConfig) {
    this.config = config
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.config.papersPdfDir, { recursive: true })
    await fs.mkdir(this.config.pendingDir, { recursive: true })
  }

  async downloadToPapersDir(attachment: MailAttachment, paperId: string): Promise<DownloadResult> {
    try {
      await this.ensureDirs()

      const sanitizedPaperId = this.sanitizeFilename(paperId)
      const filename = this.sanitizeFilename(attachment.filename)
      const filePath = path.join(this.config.papersPdfDir, `${sanitizedPaperId}_${filename}`)

      await fs.writeFile(filePath, attachment.content)

      return {
        success: true,
        path: filePath,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async downloadToPending(attachment: MailAttachment, date: Date): Promise<DownloadResult> {
    try {
      await this.ensureDirs()

      const dateStr = date.toISOString().split('T')[0]
      const baseName = path.basename(attachment.filename, '.pdf')
      const safeBaseName = this.sanitizeFilename(baseName)
      const filename = `${dateStr}_${safeBaseName}.pdf`
      const filePath = path.join(this.config.pendingDir, filename)

      await fs.writeFile(filePath, attachment.content)

      return {
        success: true,
        path: filePath,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async downloadMatched(matches: PaperMatch[], date: Date): Promise<SyncResult> {
    const results: SyncResult = {
      downloaded: 0,
      pending: 0,
      errors: [],
    }

    for (const match of matches) {
      // Paper exists in knowledge base - download to papers dir
      const result = await this.downloadToPapersDir(match.attachment, match.paper.id)

      if (result.success) {
        results.downloaded++
      } else {
        results.errors.push(`${match.paper.id}: ${result.error}`)
      }
    }

    return results
  }

  async downloadUnmatched(attachments: MailAttachment[], date: Date): Promise<SyncResult> {
    const results: SyncResult = {
      downloaded: 0,
      pending: 0,
      errors: [],
    }

    for (const attachment of attachments) {
      const result = await this.downloadToPending(attachment, date)

      if (result.success) {
        results.pending++
      } else {
        results.errors.push(`${attachment.filename}: ${result.error}`)
      }
    }

    return results
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200) // Limit length
  }
}

export function createDownloader(config: DownloadConfig): PDFDownloader {
  return new PDFDownloader(config)
}
