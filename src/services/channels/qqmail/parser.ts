import type { MailAttachment } from './types.js'

export interface ParsedPaperInfo {
  title: string
  authors?: string[]
  year?: string
  doi?: string
  journal?: string
  rawFilename: string
}

const DOI_REGEX = /10\.\d{4,}\/[^\s]+/gi
const YEAR_REGEX = /\b(19|20)\d{2}\b/g

export function parseFilename(filename: string): ParsedPaperInfo {
  // Remove file extension
  const name = filename.replace(/\.pdf$/i, '')

  // Try to extract DOI from filename
  const doiMatch = name.match(DOI_REGEX)
  const doi = doiMatch ? doiMatch[0] : undefined

  // Try to extract year
  const yearMatch = name.match(YEAR_REGEX)
  const year = yearMatch ? yearMatch[0] : undefined

  // Try to extract author names (common patterns)
  // Often in format: "AuthorName_Title" or "Title_AuthorName"
  const parts = name.split(/[_\-\s]+/)

  // Common cleanup: remove file sizes, version numbers
  const cleanedParts = parts.filter(
    (p) => !/^\d+(\.\d+)?(MB|KB)?$/i.test(p) && !/^v\d+$/i.test(p)
  )

  // Title is typically the longest part or the part without common author surname patterns
  // This is heuristic - we keep it simple and just use the cleaned filename as title
  const title = cleanedParts.join(' ').replace(/[_\-]/g, ' ').trim()

  return {
    title,
    doi,
    year,
    rawFilename: filename,
  }
}

export function parseEmailSubject(subject: string): ParsedPaperInfo {
  // Remove common prefixes like "Fwd:", "Re:", etc.
  const cleanSubject = subject
    .replace(/^(Fwd|Re):\s*/gi, '')
    .replace(/[\[\(].*?[\]\)]/g, '') // Remove bracketed content
    .trim()

  return {
    title: cleanSubject,
    rawFilename: cleanSubject,
  }
}

export function extractPaperInfo(
  attachment: MailAttachment,
  subject?: string
): ParsedPaperInfo {
  // First try filename
  const fromFilename = parseFilename(attachment.filename)

  // If filename looks like a real title (not too short, not too generic)
  if (fromFilename.title.length > 10 && !isGenericFilename(fromFilename.title)) {
    return fromFilename
  }

  // Fallback to subject if provided
  if (subject) {
    return parseEmailSubject(subject)
  }

  return fromFilename
}

function isGenericFilename(title: string): boolean {
  const generic = [
    'attachment',
    'pdf',
    'document',
    'file',
    'paper',
    'article',
    'manuscript',
    'paper.pdf',
    'article.pdf',
  ]

  const lower = title.toLowerCase()
  return generic.some((g) => lower.includes(g)) && title.length < 30
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function calculateSimilarity(title1: string, title2: string): number {
  const a = normalizeTitle(title1)
  const b = normalizeTitle(title2)

  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.8

  // Simple word overlap
  const words1 = new Set(a.split(' ').filter((w) => w.length > 3))
  const words2 = new Set(b.split(' ').filter((w) => w.length > 3))

  if (words1.size === 0 || words2.size === 0) return 0

  let overlap = 0
  for (const word of words1) {
    if (words2.has(word)) overlap++
  }

  return overlap / Math.max(words1.size, words2.size)
}
