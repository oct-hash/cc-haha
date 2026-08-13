/**
 * KB Connector - Bidirectional bridge between PaperTree and Knowledge Base
 *
 * Provides typed interfaces for:
 * - Push: PaperTree → Knowledge Base (staged: index → wiki)
 * - Pull: Knowledge Base → PaperTree (scoped queries)
 * - Sync: Offline batch import/export
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, } from 'path'

// ============================================================================
// Types
// ============================================================================

export interface PaperMetadata {
  doi?: string
  arxiv_id?: string
  title: string
  authors: string[]
  year?: string
  venue?: string
  abstract?: string
  research_question?: string
  methodology?: string
  findings?: string[]
  entities?: string[]
  concepts?: string[]
}

export interface KBNode {
  id: string
  type: 'paper' | 'entity' | 'concept'
  label: string
  metadata: Record<string, unknown>
}

export interface KBEdge {
  source: string
  target: string
  predicate: string
  confidence: number
}

export interface KBGraph {
  nodes: KBNode[]
  edges: KBEdge[]
  communities?: string[][]
  hubs?: { node: string; score: number }[]
  updated_at: string
}

export interface KBContext {
  entities: string[]
  concepts: string[]
  papers: string[]
  relationships: KBEdge[]
}

export type QueryScope = 'archived_only' | 'include_drafts' | 'global'

export interface KBConfig {
  wikiPath: string
  graphPath: string
  pushOnCollect: boolean
  pullOnFramework: boolean
  exportPath: string
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: KBConfig = {
  wikiPath: 'papers/wiki',
  graphPath: 'papers/wiki/graph.json',
  pushOnCollect: true,
  pullOnFramework: true,
  exportPath: 'papers/wiki/export.json',
}

// ============================================================================
// Graph Operations (MERGE semantics for idempotency)
// ============================================================================

/**
 * Load existing graph or create empty one
 */
export function loadGraph(graphPath: string = DEFAULT_CONFIG.graphPath): KBGraph {
  if (existsSync(graphPath)) {
    const content = readFileSync(graphPath, 'utf-8')
    return JSON.parse(content)
  }
  return {
    nodes: [],
    edges: [],
    updated_at: new Date().toISOString(),
  }
}

/**
 * Save graph to file
 */
export function saveGraph(graph: KBGraph, graphPath: string = DEFAULT_CONFIG.graphPath): void {
  const dir = dirname(graphPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  graph.updated_at = new Date().toISOString()
  writeFileSync(graphPath, JSON.stringify(graph, null, 2))
}

/**
 * Generate paper ID from DOI or ArXiv ID
 */
export function getPaperId(paper: PaperMetadata): string {
  if (paper.doi) return `doi:${paper.doi}`
  if (paper.arxiv_id) return `arxiv:${paper.arxiv_id}`
  // Fallback: hash title
  return `paper:${paper.title.substring(0, 50).replace(/\s+/g, '_')}`
}

/**
 * Check if paper node exists
 */
export function paperExists(graph: KBGraph, paperId: string): boolean {
  return graph.nodes.some((n) => n.id === paperId)
}

/**
 * MERGE semantics: Insert or update paper node
 * Idempotent - running multiple times won't create duplicates
 */
export function upsertPaperNode(graph: KBGraph, paper: PaperMetadata): KBGraph {
  const paperId = getPaperId(paper)

  // Find existing node index
  const existingIndex = graph.nodes.findIndex((n) => n.id === paperId)

  const node: KBNode = {
    id: paperId,
    type: 'paper',
    label: paper.title,
    metadata: {
      doi: paper.doi,
      arxiv_id: paper.arxiv_id,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      venue: paper.venue,
      abstract: paper.abstract,
      // Only update these fields if they exist
      ...(paper.research_question && { research_question: paper.research_question }),
      ...(paper.methodology && { methodology: paper.methodology }),
      ...(paper.findings && { findings: paper.findings }),
      indexed_at: new Date().toISOString(),
    },
  }

  if (existingIndex >= 0) {
    // Update existing node (preserve original indexing date)
    const originalIndexedAt = graph.nodes[existingIndex].metadata.indexed_at
    graph.nodes[existingIndex] = {
      ...node,
      metadata: {
        ...node.metadata,
        indexed_at: originalIndexedAt,
        updated_at: new Date().toISOString(),
      },
    }
  } else {
    // Insert new node
    graph.nodes.push(node)
  }

  return graph
}

/**
 * Add entity nodes and relationships to graph
 */
export function addEntitiesAndRelations(
  graph: KBGraph,
  paperId: string,
  entities: string[] = [],
  concepts: string[] = [],
  customRelations: {
    subject: string
    predicate: string
    object: string
    confidence?: number
  }[] = [],
): KBGraph {
  // Add entity nodes
  for (const entity of entities) {
    const entityId = `entity:${entity}`
    if (!graph.nodes.some((n) => n.id === entityId)) {
      graph.nodes.push({
        id: entityId,
        type: 'entity',
        label: entity,
        metadata: { created_from: paperId },
      })
    }
  }

  // Add concept nodes
  for (const concept of concepts) {
    const conceptId = `concept:${concept}`
    if (!graph.nodes.some((n) => n.id === conceptId)) {
      graph.nodes.push({
        id: conceptId,
        type: 'concept',
        label: concept,
        metadata: { created_from: paperId },
      })
    }
  }

  // Add paper → entity edges
  for (const entity of entities) {
    const edge: KBEdge = {
      source: paperId,
      target: `entity:${entity}`,
      predicate: 'mentions',
      confidence: 0.9,
    }
    if (!graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
      graph.edges.push(edge)
    }
  }

  // Add paper → concept edges
  for (const concept of concepts) {
    const edge: KBEdge = {
      source: paperId,
      target: `concept:${concept}`,
      predicate: 'addresses',
      confidence: 0.85,
    }
    if (!graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
      graph.edges.push(edge)
    }
  }

  // Add custom relations
  for (const rel of customRelations) {
    const edge: KBEdge = {
      source: `entity:${rel.subject}` || rel.subject,
      target: `entity:${rel.object}` || rel.object,
      predicate: rel.predicate,
      confidence: rel.confidence || 0.5,
    }
    if (
      !graph.edges.some(
        (e) =>
          e.source === edge.source && e.target === edge.target && e.predicate === edge.predicate,
      )
    ) {
      graph.edges.push(edge)
    }
  }

  return graph
}

// ============================================================================
// Query Operations (with scope filtering)
// ============================================================================

/**
 * Query entities from knowledge base with scope filtering
 */
export function queryEntities(
  keywords: string[],
  scope: QueryScope = 'archived_only',
  graph?: KBGraph,
): KBContext {
  const g = graph || loadGraph()

  // Filter nodes based on scope
  const filteredNodes = g.nodes.filter((node) => {
    if (scope === 'archived_only') {
      // Only papers with indexed_at (formally archived)
      return node.type === 'paper' && node.metadata.indexed_at
    }
    if (scope === 'include_drafts') {
      // All papers including drafts
      return node.type === 'paper'
    }
    // global - all nodes
    return true
  })

  // Find matching papers
  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()))
  const matchingPapers = filteredNodes.filter((node) => {
    const title = ((node.metadata.title as string) || '').toLowerCase()
    const abstract = ((node.metadata.abstract as string) || '').toLowerCase()
    const authors = ((node.metadata.authors as string[]) || []).map((a) => a.toLowerCase())
    const searchText = `${title} ${abstract} ${authors.join(' ')}`
    return keywords.some((k) => searchText.includes(k.toLowerCase()))
  })

  // Extract entities and concepts from matching papers
  const entitySet = new Set<string>()
  const conceptSet = new Set<string>()
  const paperSet = new Set<string>()
  const edgeSet: KBEdge[] = []

  for (const paper of matchingPapers) {
    paperSet.add(paper.label)

    // Find connected entities and concepts
    for (const edge of g.edges) {
      if (edge.source === paper.id || edge.target === paper.id) {
        const otherNode = g.nodes.find(
          (n) => n.id === (edge.source === paper.id ? edge.target : edge.source),
        )
        if (otherNode) {
          if (otherNode.type === 'entity') {
            entitySet.add(otherNode.label)
          } else if (otherNode.type === 'concept') {
            conceptSet.add(otherNode.label)
          }
          edgeSet.push(edge)
        }
      }
    }
  }

  return {
    entities: Array.from(entitySet),
    concepts: Array.from(conceptSet),
    papers: Array.from(paperSet),
    relationships: edgeSet,
  }
}

/**
 * Query neighbors (directly connected nodes)
 */
export function queryNeighbors(
  nodeId: string,
  graph?: KBGraph,
): { nodes: KBNode[]; edges: KBEdge[] } {
  const g = graph || loadGraph()

  const connectedIds = new Set<string>()
  const edges: KBEdge[] = []

  for (const edge of g.edges) {
    if (edge.source === nodeId) {
      connectedIds.add(edge.target)
      edges.push(edge)
    } else if (edge.target === nodeId) {
      connectedIds.add(edge.source)
      edges.push(edge)
    }
  }

  const nodes = g.nodes.filter((n) => connectedIds.has(n.id))

  return { nodes, edges }
}

// ============================================================================
// Export Operations (for offline mode)
// ============================================================================

/**
 * Export graph for offline sync
 */
export function exportGraph(exportPath: string = DEFAULT_CONFIG.exportPath): void {
  const graph = loadGraph()
  writeFileSync(exportPath, JSON.stringify(graph, null, 2))
  console.log(`Exported graph to ${exportPath}`)
}

/**
 * Import graph from offline export
 */
export function importGraph(exportPath: string): KBGraph {
  if (!existsSync(exportPath)) {
    throw new Error(`Export file not found: ${exportPath}`)
  }
  const imported = JSON.parse(readFileSync(exportPath, 'utf-8'))
  const existing = loadGraph()

  // Merge: prefer imported (newer) data for duplicates
  const mergedGraph: KBGraph = {
    nodes: [...existing.nodes],
    edges: [...existing.edges],
    communities: imported.communities,
    hubs: imported.hubs,
    updated_at: new Date().toISOString(),
  }

  for (const node of imported.nodes) {
    const existingIndex = mergedGraph.nodes.findIndex((n) => n.id === node.id)
    if (existingIndex >= 0) {
      mergedGraph.nodes[existingIndex] = node
    } else {
      mergedGraph.nodes.push(node)
    }
  }

  for (const edge of imported.edges) {
    if (
      !mergedGraph.edges.some(
        (e) =>
          e.source === edge.source && e.target === edge.target && e.predicate === edge.predicate,
      )
    ) {
      mergedGraph.edges.push(edge)
    }
  }

  saveGraph(mergedGraph)
  return mergedGraph
}

// ============================================================================
// High-level Operations
// ============================================================================

/**
 * Stage 1: Index paper (after collector)
 */
export function indexPaper(paper: PaperMetadata, graphPath?: string): void {
  const graph = loadGraph(graphPath)
  upsertPaperNode(graph, paper)
  saveGraph(graph, graphPath)
  console.log(`Indexed: ${paper.title}`)
}

/**
 * Stage 2: Add full context (after organizer)
 */
export function enrichPaper(
  paper: PaperMetadata,
  entities: string[] = [],
  concepts: string[] = [],
  customRelations: {
    subject: string
    predicate: string
    object: string
    confidence?: number
  }[] = [],
  graphPath?: string,
): void {
  const graph = loadGraph(graphPath)
  const paperId = getPaperId(paper)
  addEntitiesAndRelations(graph, paperId, entities, concepts, customRelations)
  saveGraph(graph, graphPath)
  console.log(`Enriched: ${paper.title} (${entities.length} entities, ${concepts.length} concepts)`)
}

/**
 * Full push operation
 */
export function pushToKB(papers: PaperMetadata[], graphPath?: string): void {
  const graph = loadGraph(graphPath)

  for (const paper of papers) {
    upsertPaperNode(graph, paper)
    const paperId = getPaperId(paper)
    addEntitiesAndRelations(graph, paperId, paper.entities || [], paper.concepts || [])
  }

  saveGraph(graph, graphPath)
  exportGraph() // Always export for offline safety
  console.log(`Pushed ${papers.length} papers to KB`)
}

/**
 * Pull from KB
 */
export function pullFromKB(keywords: string[], scope: QueryScope = 'archived_only'): KBContext {
  const context = queryEntities(keywords, scope)
  console.log(
    `Pulled: ${context.papers.length} papers, ${context.entities.length} entities, ${context.concepts.length} concepts`,
  )
  return context
}
