/**
 * Paper Wiki - Simple paper notes with knowledge graph
 *
 * Thin wrapper around kb-connector with local paths:
 * - papers/wiki/index.json  → paper summaries & keyword search
 * - papers/wiki/graph.json  → entity/concept relations (from kb-connector)
 *
 * Usage:
 *   const wiki = new PaperWiki()
 *   await wiki.addNote({ title, summary, tags, entities, concepts })
 *   const results = await wiki.queryNotes(['Nrf2', 'ferroptosis'])
 *   const related = await wiki.getRelated(paperId)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addEntitiesAndRelations,
  getPaperId,
  type KBEdge,
  loadGraph,
  type PaperMetadata,
  queryEntities,
  queryNeighbors,
  saveGraph,
  upsertPaperNode,
} from './kb-connector'

// ============================================================================
// Types
// ============================================================================

export interface PaperNote {
  id: string
  title: string
  authors?: string[]
  year?: string
  doi?: string
  arxiv_id?: string
  summary: string
  tags: string[]
  entities: string[]
  concepts: string[]
  created_at: string
  updated_at: string
}

export interface WikiIndex {
  version: string
  updated_at: string
  papers: PaperNote[]
}

// ============================================================================
// PaperWiki
// ============================================================================

export class PaperWiki {
  private wikiPath: string

  constructor(wikiPath?: string) {
    this.wikiPath = wikiPath || join(process.cwd(), 'papers', 'wiki')
  }

  // --------------------------------------------------------------------------
  // Paths
  // --------------------------------------------------------------------------

  private get indexPath(): string {
    return join(this.wikiPath, 'index.json')
  }

  private get graphPath(): string {
    return join(this.wikiPath, 'graph.json')
  }

  // --------------------------------------------------------------------------
  // Index Operations (keyword search)
  // --------------------------------------------------------------------------

  private loadIndex(): WikiIndex {
    if (existsSync(this.indexPath)) {
      return JSON.parse(readFileSync(this.indexPath, 'utf-8'))
    }
    return { version: '1.0', updated_at: '', papers: [] }
  }

  private saveIndex(index: WikiIndex): void {
    index.updated_at = new Date().toISOString()
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2))
  }

  /**
   * Add or update a paper note
   */
  async addNote(note: Omit<PaperNote, 'id' | 'created_at' | 'updated_at'>): Promise<PaperNote> {
    const index = this.loadIndex()
    const now = new Date().toISOString()

    // Build paper metadata for kb-connector
    const paperMeta: PaperMetadata = {
      title: note.title,
      authors: note.authors || [],
      year: note.year,
      doi: note.doi,
      arxiv_id: note.arxiv_id,
      abstract: note.summary,
      entities: note.entities,
      concepts: note.concepts,
    }

    // Upsert into knowledge graph
    let graph = loadGraph(this.graphPath)
    graph = upsertPaperNode(graph, paperMeta)
    const paperId = getPaperId(paperMeta)
    graph = addEntitiesAndRelations(graph, paperId, note.entities, note.concepts)
    saveGraph(graph, this.graphPath)

    // Upsert into index
    const existingIndex = index.papers.findIndex((p) => p.id === paperId)
    const fullNote: PaperNote = {
      ...note,
      id: paperId,
      created_at: existingIndex >= 0 ? index.papers[existingIndex].created_at : now,
      updated_at: now,
    }

    if (existingIndex >= 0) {
      index.papers[existingIndex] = fullNote
    } else {
      index.papers.push(fullNote)
    }

    this.saveIndex(index)
    return fullNote
  }

  /**
   * Query papers by keywords (searches title, summary, tags, entities, concepts)
   */
  async queryNotes(keywords: string[]): Promise<PaperNote[]> {
    const index = this.loadIndex()
    const kw = keywords.map((k) => k.toLowerCase())

    return index.papers.filter((paper) => {
      const searchText = [
        paper.title,
        paper.summary,
        ...paper.tags,
        ...paper.entities,
        ...paper.concepts,
      ]
        .join(' ')
        .toLowerCase()

      return kw.some((k) => searchText.includes(k))
    })
  }

  /**
   * Get paper note by ID
   */
  async getNote(paperId: string): Promise<PaperNote | null> {
    const index = this.loadIndex()
    return index.papers.find((p) => p.id === paperId) || null
  }

  /**
   * Get all paper notes
   */
  async getAllNotes(): Promise<PaperNote[]> {
    return this.loadIndex().papers
  }

  /**
   * Get related papers via knowledge graph
   */
  async getRelated(paperId: string): Promise<{ nodes: string[]; edges: KBEdge[] }> {
    const graph = loadGraph(this.graphPath)
    const { nodes, edges } = queryNeighbors(paperId, graph)

    // Return only labels for readability
    return {
      nodes: nodes.map((n) => n.label),
      edges,
    }
  }

  /**
   * Get full knowledge graph context for keywords
   */
  async queryContext(keywords: string[]): Promise<{
    papers: PaperNote[]
    graphContext: {
      entities: string[]
      concepts: string[]
      relationships: KBEdge[]
    }
  }> {
    // Query index for matching papers
    const papers = await this.queryNotes(keywords)

    // Query knowledge graph for entities/concepts
    const graphContext = queryEntities(keywords, 'include_drafts', loadGraph(this.graphPath))

    return { papers, graphContext }
  }

  /**
   * List all unique tags
   */
  async getAllTags(): Promise<string[]> {
    const index = this.loadIndex()
    const tagSet = new Set<string>()
    for (const paper of index.papers) {
      for (const tag of paper.tags) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  }

  /**
   * Get statistics
   */
  async stats(): Promise<{
    totalPapers: number
    totalEntities: number
    totalConcepts: number
    totalRelations: number
    tags: string[]
  }> {
    const index = this.loadIndex()
    const graph = loadGraph(this.graphPath)

    const entitySet = new Set<string>()
    const conceptSet = new Set<string>()
    const tagSet = new Set<string>()

    for (const paper of index.papers) {
      for (const tag of paper.tags) tagSet.add(tag)
    }

    for (const node of graph.nodes) {
      if (node.type === 'entity') entitySet.add(node.label)
      if (node.type === 'concept') conceptSet.add(node.label)
    }

    return {
      totalPapers: index.papers.length,
      totalEntities: entitySet.size,
      totalConcepts: conceptSet.size,
      totalRelations: graph.edges.length,
      tags: Array.from(tagSet).sort(),
    }
  }

  /**
   * Delete a paper note (keeps graph node but removes from index)
   */
  async deleteNote(paperId: string): Promise<boolean> {
    const index = this.loadIndex()
    const initialLength = index.papers.length
    index.papers = index.papers.filter((p) => p.id !== paperId)

    if (index.papers.length < initialLength) {
      this.saveIndex(index)
      return true
    }
    return false
  }
}

// ============================================================================
// Default instance helper
// ============================================================================

let _defaultWiki: PaperWiki | null = null

export function getPaperWiki(): PaperWiki {
  if (!_defaultWiki) {
    _defaultWiki = new PaperWiki()
  }
  return _defaultWiki
}
