/**
 * Barrel export for the multi-agent services module.
 *
 * Modules:
 *   - types:      Shared type definitions (AgentKind, SessionId, NormalizedEvent, etc.)
 *   - session-manager: SessionManager singleton, SessionHandle, initSessionManager
 *   - adapter:    AgentAdapter interface
 *   - factory:    AgentAdapter factory (createAgentAdapter)
 *   - debate:     Three-agent debate orchestrator (council / debate / relay / auto modes)
 *   - claude-haha: Native haha query executor
 *   - claude-code: Claude Code CLI adapter
 *   - codex:      Codex CLI adapter
 */

export type { AgentAdapter } from './adapter.js'
export {
  type AutoConfig,
  type DebateConfig,
  type DebateEvent,
  type DebateMode,
  DebateOrchestrator,
  type DebateSummary,
} from './debate.js'
export { createAgentAdapter } from './factory.js'
export {
  type GateResult,
  type LoopEvent,
  LoopManager,
  type LoopManagerConfig,
  type LoopPhase,
  type LoopSummary,
  type LoopType,
  type SerializedLoopState,
  type TickEvidence,
} from './loop-manager.js'
export type { LoopMdOptions } from './loop-template.js'
export { generateLoopMd, writeLoopMd } from './loop-template.js'
export {
  getSessionManager,
  initSessionManager,
  resetSessionManager,
  type SessionHandle,
} from './session-manager.js'
export type {
  AgentConfig,
  AgentKind,
  AgentStatus,
  NormalizedEvent,
  SessionId,
  SessionManagerConfig,
  SessionMetadata,
} from './types.js'
