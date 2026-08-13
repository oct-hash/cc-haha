// ============================================================================
// Cached microcompact types and functions (ant-only, gated by feature flags)
// ============================================================================

import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

// ============================================================================
// Types
// ============================================================================

export interface CacheEditsBlock {
  type: 'cache_edits'
  deleted_tool_use_ids: string[]
}

export interface PinnedCacheEdits {
  userMessageIndex: number
  block: CacheEditsBlock
}

export interface CachedMCConfig {
  triggerThreshold: number
  keepRecent: number
}

export interface CachedMCState {
  pinnedEdits: PinnedCacheEdits[]
  registeredTools: Set<string>
  toolOrder: string[]
  deletedRefs: Set<string>
  deletionCounts: Map<string, number>
}

// ============================================================================
// Functions
// ============================================================================

export function createCachedMCState(): CachedMCState {
  return {
    pinnedEdits: [],
    registeredTools: new Set(),
    toolOrder: [],
    deletedRefs: new Set(),
    deletionCounts: new Map(),
  }
}

export function markToolsSentToAPI(_state: CachedMCState): void {}

export function resetCachedMCState(state: CachedMCState): void {
  state.pinnedEdits.length = 0
  state.registeredTools.clear()
  state.toolOrder.length = 0
  state.deletedRefs.clear()
  state.deletionCounts.clear()
}

export function isCachedMicrocompactEnabled(): boolean {
  return false
}

export function isModelSupportedForCacheEditing(_model: string): boolean {
  return false
}

export function getCachedMCConfig(): CachedMCConfig {
  return { triggerThreshold: 5, keepRecent: 3 }
}

export function registerToolResult(state: CachedMCState, toolUseId: string): void {
  state.registeredTools.add(toolUseId)
}

export function registerToolMessage(state: CachedMCState, ids: string[]): void {
  state.toolOrder.push(...ids)
}

export function getToolResultsToDelete(state: CachedMCState): string[] {
  const config = getCachedMCConfig()
  const toDelete: string[] = []
  const keepRecent = Math.max(1, config.keepRecent)
  const recent = new Set(state.toolOrder.slice(-keepRecent))
  for (const id of state.toolOrder) {
    if (!recent.has(id) && !state.deletedRefs.has(id)) {
      toDelete.push(id)
      state.deletedRefs.add(id)
    }
  }
  return toDelete
}

export function createCacheEditsBlock(
  _state: CachedMCState,
  toolIds: string[],
): CacheEditsBlock | undefined {
  if (toolIds.length === 0) return undefined
  return { type: 'cache_edits', deleted_tool_use_ids: toolIds }
}
