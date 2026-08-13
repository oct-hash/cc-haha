import type { Command } from 'src/types/command.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'

/**
 * Skill metadata for registry management.
 * Extends the base Command type with marketplace-relevant fields.
 */
export interface SkillMetadata {
  name: string
  version?: string
  tags?: string[]
  author?: string
  origin?: string
  description: string
  source: string
  loadedFrom: string
  skillRoot?: string
  lastUpdated?: string
}

/**
 * Skill registry entry with provenance tracking.
 */
interface RegistryEntry {
  metadata: SkillMetadata
  filePath: string
  installedAt: string
}

/**
 * SkillRegistry - manages skill metadata, versioning, and discovery.
 *
 * Provides:
 * - Skill registration with version/tags/author tracking
 * - Skill search by name, tag, or author
 * - Marketplace browsing and installation
 * - Skill update detection
 */
export class SkillRegistry {
  private skills: Map<string, RegistryEntry> = new Map()
  private tagsIndex: Map<string, Set<string>> = new Map()
  private authorsIndex: Map<string, Set<string>> = new Map()

  /**
   * Register a skill with extended metadata.
   */
  register(command: Command & { type: 'prompt' }, filePath: string): void {
    const metadata: SkillMetadata = {
      name: command.name,
      version: (command as Record<string, unknown>).version as string | undefined,
      tags: (command as Record<string, unknown>).tags as string[] | undefined,
      author: (command as Record<string, unknown>).author as string | undefined,
      origin: (command as Record<string, unknown>).origin as string | undefined,
      description: command.description,
      source: command.source,
      loadedFrom: command.loadedFrom,
      skillRoot: command.skillRoot,
      lastUpdated: new Date().toISOString(),
    }

    this.skills.set(command.name, {
      metadata,
      filePath,
      installedAt: new Date().toISOString(),
    })

    // Index by tags
    if (metadata.tags) {
      for (const tag of metadata.tags) {
        if (!this.tagsIndex.has(tag)) {
          this.tagsIndex.set(tag, new Set())
        }
        this.tagsIndex.get(tag)!.add(command.name)
      }
    }

    // Index by author
    if (metadata.author) {
      if (!this.authorsIndex.has(metadata.author)) {
        this.authorsIndex.set(metadata.author, new Set())
      }
      this.authorsIndex.get(metadata.author)!.add(command.name)
    }

    logForDebugging(
      `[SkillRegistry] Registered skill: ${command.name} (v${metadata.version ?? 'unknown'}, author: ${metadata.author ?? 'unknown'})`,
    )
  }

  /**
   * Get skill metadata by name.
   */
  get(name: string): SkillMetadata | undefined {
    return this.skills.get(name)?.metadata
  }

  /**
   * Get all registered skills.
   */
  getAll(): SkillMetadata[] {
    return Array.from(this.skills.values()).map((v) => v.metadata)
  }

  /**
   * Search skills by tag.
   */
  findByTag(tag: string): SkillMetadata[] {
    const names = this.tagsIndex.get(tag)
    if (!names) return []
    return [...names].map((n) => this.skills.get(n)!.metadata).filter(Boolean)
  }

  /**
   * Search skills by author.
   */
  findByAuthor(author: string): SkillMetadata[] {
    const names = this.authorsIndex.get(author)
    if (!names) return []
    return [...names].map((n) => this.skills.get(n)!.metadata).filter(Boolean)
  }

  /**
   * Search skills by name (partial match).
   */
  search(query: string): SkillMetadata[] {
    const lower = query.toLowerCase()
    return this.getAll().filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.tags?.some((t) => t.toLowerCase().includes(lower)),
    )
  }

  /**
   * Get all unique tags across registered skills.
   */
  getAllTags(): string[] {
    return [...this.tagsIndex.keys()].sort()
  }

  /**
   * Get all unique authors across registered skills.
   */
  getAllAuthors(): string[] {
    return [...this.authorsIndex.keys()].sort()
  }

  /**
   * Check if a skill has updates available (compared to marketplace).
   */
  hasUpdate(name: string, latestVersion: string): boolean {
    const current = this.skills.get(name)
    if (!current) return false
    const currentVersion = current.metadata.version
    if (!currentVersion) return false
    return this.compareVersions(currentVersion, latestVersion) < 0
  }

  /**
   * Compare two semantic versions.
   * Returns: -1 if a < b, 0 if a === b, 1 if a > b
   */
  compareVersions(a: string, b: string): number {
    const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0)
    const [aMaj, aMin, aPat] = parse(a)
    const [bMaj, bMin, bPat] = parse(b)

    if (aMaj !== bMaj) return aMaj - bMaj
    if (aMin !== bMin) return aMin - bMin
    return aPat - bPat
  }

  /**
   * Export registry to JSON for persistence.
   */
  toJSON(): string {
    const data = Array.from(this.skills.entries()).map(([name, entry]) => ({
      name,
      ...entry.metadata,
      filePath: entry.filePath,
      installedAt: entry.installedAt,
    }))
    return JSON.stringify(data, null, 2)
  }

  /**
   * Load registry from JSON.
   */
  fromJSON(json: string): void {
    try {
      const data = JSON.parse(json) as Array<{
        name: string
        filePath: string
        installedAt: string
        version?: string
        tags?: string[]
        author?: string
        origin?: string
        description: string
        source: string
        loadedFrom: string
        skillRoot?: string
        lastUpdated?: string
      }>

      for (const item of data) {
        const metadata: SkillMetadata = {
          name: item.name,
          version: item.version,
          tags: item.tags,
          author: item.author,
          origin: item.origin,
          description: item.description,
          source: item.source,
          loadedFrom: item.loadedFrom,
          skillRoot: item.skillRoot,
          lastUpdated: item.lastUpdated,
        }

        this.skills.set(item.name, {
          metadata,
          filePath: item.filePath,
          installedAt: item.installedAt,
        })

        // Re-index
        if (metadata.tags) {
          for (const tag of metadata.tags) {
            if (!this.tagsIndex.has(tag)) {
              this.tagsIndex.set(tag, new Set())
            }
            this.tagsIndex.get(tag)!.add(item.name)
          }
        }

        if (metadata.author) {
          if (!this.authorsIndex.has(metadata.author)) {
            this.authorsIndex.set(metadata.author, new Set())
          }
          this.authorsIndex.get(metadata.author)!.add(item.name)
        }
      }
    } catch (e) {
      logForDebugging(`[SkillRegistry] Failed to load from JSON: ${e}`)
    }
  }
}

// Global registry instance
let globalRegistry: SkillRegistry | null = null

/**
 * Get the global skill registry instance.
 */
export function getSkillRegistry(): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillRegistry()
    // Try to load persisted registry
    loadPersistedRegistry(globalRegistry)
  }
  return globalRegistry
}

/**
 * Load persisted registry from disk.
 */
async function loadPersistedRegistry(registry: SkillRegistry): Promise<void> {
  const fs = getFsImplementation()
  const registryPath = join(getClaudeConfigHomeDir(), 'skills', 'registry.json')

  try {
    const content = await fs.readFile(registryPath, { encoding: 'utf-8' })
    registry.fromJSON(content)
    logForDebugging(`[SkillRegistry] Loaded persisted registry from ${registryPath}`)
  } catch {
    // First run, no registry file yet
  }
}

/**
 * Save registry to disk.
 */
export async function saveRegistry(registry: SkillRegistry): Promise<void> {
  const fs = getFsImplementation()
  const registryPath = join(getClaudeConfigHomeDir(), 'skills', 'registry.json')

  try {
    const dir = dirname(registryPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(registryPath, registry.toJSON(), { encoding: 'utf-8' })
    logForDebugging(`[SkillRegistry] Saved registry to ${registryPath}`)
  } catch (e) {
    logForDebugging(`[SkillRegistry] Failed to save registry: ${e}`)
  }
}

import { dirname, join } from 'node:path'
