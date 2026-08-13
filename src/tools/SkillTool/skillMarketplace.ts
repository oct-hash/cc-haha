import { logForDebugging } from 'src/utils/debug.js'
import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'

/**
 * Marketplace entry for a skill.
 */
export interface MarketplaceEntry {
  name: string
  description: string
  version: string
  tags: string[]
  author: string
  origin: string
  repository?: string
  url?: string
  installed?: boolean
  localVersion?: string
}

/**
 * Marketplace configuration.
 */
interface MarketplaceConfig {
  name: string
  url: string
  skills: MarketplaceEntry[]
}

/**
 * SkillMarketplace - browse, search, and install skills from marketplace.
 *
 * Provides:
 * - Browse available skills in marketplace
 * - Search skills by name/tag/author
 * - Install skills to local skills directory
 * - Check for skill updates
 */
export class SkillMarketplace {
  private marketplaceConfig: MarketplaceConfig | null = null

  constructor() {
    this.loadMarketplaceConfig()
  }

  /**
   * Load marketplace configuration from marketplace.json.
   */
  private async loadMarketplaceConfig(): Promise<void> {
    const fs = getFsImplementation()
    const configPath = join(getClaudeConfigHomeDir(), '.claude', 'marketplace.json')

    try {
      const content = await fs.readFile(configPath, { encoding: 'utf-8' })
      const config = JSON.parse(content)

      // Support both old format (plugins array) and new format (skills array)
      if (config.skills && Array.isArray(config.skills)) {
        this.marketplaceConfig = {
          name: config.name || 'ECC Marketplace',
          url: config.url || '',
          skills: config.skills.map((s: MarketplaceEntry) => ({
            ...s,
            installed: false,
          })),
        }
      } else if (config.plugins && Array.isArray(config.plugins)) {
        // Convert old plugin format to new skill format
        this.marketplaceConfig = {
          name: config.name || 'ECC Marketplace',
          url: config.url || '',
          skills: config.plugins.map((p: Record<string, unknown>) => ({
            name: p.name as string,
            description: (p.description as string) || '',
            version: (p.version as string) || '1.0.0',
            tags: (p.tags as string[]) || [],
            author: (p.author as string) || 'unknown',
            origin: 'marketplace',
            repository: p.repository as string | undefined,
            url: p.url as string | undefined,
            installed: false,
          })),
        }
      } else {
        // Default empty marketplace
        this.marketplaceConfig = {
          name: 'ECC Marketplace',
          url: '',
          skills: [],
        }
      }

      logForDebugging(
        `[SkillMarketplace] Loaded ${this.marketplaceConfig.skills.length} marketplace entries`,
      )
    } catch {
      // Use default empty marketplace
      this.marketplaceConfig = {
        name: 'ECC Marketplace',
        url: '',
        skills: [],
      }
      logForDebugging('[SkillMarketplace] No marketplace.json found, using empty marketplace')
    }
  }

  /**
   * Reload marketplace config from disk.
   */
  async reload(): Promise<void> {
    await this.loadMarketplaceConfig()
  }

  /**
   * Get all marketplace skills.
   */
  async browse(): Promise<MarketplaceEntry[]> {
    if (!this.marketplaceConfig) {
      await this.loadMarketplaceConfig()
    }
    return this.marketplaceConfig?.skills ?? []
  }

  /**
   * Search marketplace skills by name, tag, or description.
   */
  async search(query: string): Promise<MarketplaceEntry[]> {
    const all = await this.browse()
    const lower = query.toLowerCase()

    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.tags.some((t) => t.toLowerCase().includes(lower)) ||
        s.author.toLowerCase().includes(lower),
    )
  }

  /**
   * Filter marketplace skills by tag.
   */
  async filterByTag(tag: string): Promise<MarketplaceEntry[]> {
    const all = await this.browse()
    return all.filter((s) => s.tags.includes(tag))
  }

  /**
   * Get all unique tags in marketplace.
   */
  async getAllTags(): Promise<string[]> {
    const all = await this.browse()
    const tags = new Set<string>()
    for (const skill of all) {
      for (const tag of skill.tags) {
        tags.add(tag)
      }
    }
    return [...tags].sort()
  }

  /**
   * Get skill by name from marketplace.
   */
  async getByName(name: string): Promise<MarketplaceEntry | undefined> {
    const all = await this.browse()
    return all.find((s) => s.name === name)
  }

  /**
   * Check if a skill is installed locally.
   */
  async isInstalled(name: string): Promise<boolean> {
    const fs = getFsImplementation()
    const skillsDir = join(getClaudeConfigHomeDir(), 'skills', name)

    try {
      await fs.stat(skillsDir)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get local version of an installed skill.
   */
  async getLocalVersion(name: string): Promise<string | undefined> {
    const fs = getFsImplementation()
    const skillFile = join(getClaudeConfigHomeDir(), 'skills', name, 'SKILL.md')

    try {
      const content = await fs.readFile(skillFile, { encoding: 'utf-8' })
      // Parse frontmatter version
      const match = content.match(/^---\n[\s\S]*?version:\s*"?([^"\n]+)"?\n/m)
      return match?.[1]
    } catch {
      return undefined
    }
  }

  /**
   * Check for updates for installed skills.
   */
  async checkForUpdates(): Promise<
    Array<{
      name: string
      currentVersion: string
      latestVersion: string
      updateAvailable: boolean
    }>
  > {
    const all = await this.browse()
    const updates: Array<{
      name: string
      currentVersion: string
      latestVersion: string
      updateAvailable: boolean
    }> = []

    for (const skill of all) {
      const localVersion = await this.getLocalVersion(skill.name)
      if (localVersion) {
        const hasUpdate = this.compareVersions(localVersion, skill.version) < 0
        updates.push({
          name: skill.name,
          currentVersion: localVersion,
          latestVersion: skill.version,
          updateAvailable: hasUpdate,
        })
      }
    }

    return updates
  }

  /**
   * Compare two semantic versions.
   */
  private compareVersions(a: string, b: string): number {
    const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0)
    const [aMaj, aMin, aPat] = parse(a)
    const [bMaj, bMin, bPat] = parse(b)

    if (aMaj !== bMaj) return aMaj - bMaj
    if (aMin !== bMin) return aMin - bMin
    return aPat - bPat
  }
}

// Global marketplace instance
let globalMarketplace: SkillMarketplace | null = null

/**
 * Get the global marketplace instance.
 */
export function getMarketplace(): SkillMarketplace {
  if (!globalMarketplace) {
    globalMarketplace = new SkillMarketplace()
  }
  return globalMarketplace
}

import { join } from 'node:path'
