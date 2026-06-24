import type { MailAttachment, PaperMatch, MatchResult } from './types.js'
import { extractPaperInfo, calculateSimilarity } from './parser.js'

interface PaperNote {
  id: string
  title: string
  authors?: string[]
  year?: string
  doi?: string
  arxiv_id?: string
  summary?: string
  tags?: string[]
  entities?: string[]
  concepts?: string[]
  created_at?: string
  updated_at?: string
}

interface KBIndex {
  papers: PaperNote[]
}

interface KBGraph {
  nodes: Array<{
    id: string
    type: string
    name?: string
    title?: string
  }>
}

const SIMILARITY_THRESHOLD = 0.6
const FUZZY_SIMILARITY_THRESHOLD = 0.7

export class KnowledgeBaseMatcher {
  private index: KBIndex | null = null
  private graph: KBGraph | null = null
  private indexPath: string
  private graphPath: string

  constructor(indexPath: string, graphPath: string) {
    this.indexPath = indexPath
    this.graphPath = graphPath
  }

  async load(): Promise<void> {
    try {
      const indexModule = await import(this.indexPath)
      this.index = indexModule.default || indexModule.index || indexModule

      const graphModule = await import(this.graphPath)
      this.graph = graphModule.default || graphModule.graph || graphModule
    } catch (err) {
      console.error('Failed to load knowledge base:', err)
      this.index = { papers: [] }
      this.graph = { nodes: [] }
    }
  }

  getAllPapers(): PaperNote[] {
    return this.index?.papers || []
  }

  getPaperById(id: string): PaperNote | undefined {
    return this.index?.papers.find((p) => p.id === id)
  }

  findPaperByDoi(doi: string): PaperNote | undefined {
    const normalizedDoi = doi.toLowerCase().replace(/\s/g, '')
    return this.index?.papers.find(
      (p) => p.doi?.toLowerCase().replace(/\s/g, '') === normalizedDoi
    )
  }

  findPaperByTitle(title: string): PaperNote | undefined {
    const normalized = title.toLowerCase().trim()
    return this.index?.papers.find((p) => {
      const pTitle = (p.title || '').toLowerCase().trim()
      return pTitle === normalized || this.normalizeForMatch(pTitle) === this.normalizeForMatch(normalized)
    })
  }

  searchPapersByTitle(title: string, limit = 5): PaperNote[] {
    const similarity = calculateSimilarity(title, '')
    const papers = this.index?.papers || []

    return papers
      .map((p) => ({
        paper: p,
        score: calculateSimilarity(title, p.title || ''),
      }))
      .filter((r) => r.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.paper)
  }

  matchAttachment(
    attachment: MailAttachment,
    subject?: string
  ): PaperMatch | null {
    const paperInfo = extractPaperInfo(attachment, subject)

    // Try DOI exact match first
    if (paperInfo.doi) {
      const byDoi = this.findPaperByDoi(paperInfo.doi)
      if (byDoi) {
        return {
          paper: byDoi,
          attachment,
          matchType: 'doi',
          score: 1,
        }
      }
    }

    // Try title exact match
    const byTitle = this.findPaperByTitle(paperInfo.title)
    if (byTitle) {
      return {
        paper: byTitle,
        attachment,
        matchType: 'title_exact',
        score: 1,
      }
    }

    // Try fuzzy title match
    const candidates = this.searchPapersByTitle(paperInfo.title, 1)
    if (candidates.length > 0) {
      const top = candidates[0]
      const score = calculateSimilarity(paperInfo.title, top.title || '')
      if (score >= FUZZY_SIMILARITY_THRESHOLD) {
        return {
          paper: top,
          attachment,
          matchType: 'title_fuzzy',
          score,
        }
      }
    }

    return null
  }

  matchAttachments(
    attachments: MailAttachment[],
    subjects?: string[]
  ): MatchResult {
    const matched: PaperMatch[] = []
    const unmatched: MailAttachment[] = []
    const papers = this.getAllPapers()

    // Count papers with DOI
    const papersWithDoi = papers.filter((p) => p.doi).length
    const papersWithPdf = papers.filter((p) => {
      // Check if paper has a PDF path associated
      // This is heuristic - in real implementation, might check file existence
      return p.id.startsWith('doi:') && papersWithDoi > 0
    }).length

    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i]
      const subject = subjects?.[i]

      const match = this.matchAttachment(attachment, subject)
      if (match) {
        matched.push(match)
      } else {
        unmatched.push(attachment)
      }
    }

    return {
      matched,
      unmatched,
      knowledgeBasePapers: papers.length,
      papersWithPdf,
      papersMissingPdf: papers.length - papersWithPdf,
    }
  }

  private normalizeForMatch(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

export function createMatcher(
  indexPath: string,
  graphPath: string
): KnowledgeBaseMatcher {
  return new KnowledgeBaseMatcher(indexPath, graphPath)
}
