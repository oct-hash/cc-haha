/**
 * Barrel export for the multi-agent services module.
 *
 * Modules:
 *   - types:      Shared type definitions (AgentKind, SessionId, NormalizedEvent, etc.)
 *   - session-manager: SessionManager singleton, SessionHandle, initSessionManager
 *   - adapter:    AgentAdapter interface
 *   - factory:    AgentAdapter factory (createAgentAdapter)
 *   - claude-haha: Native haha query executor
 *   - claude-code: Claude Code CLI adapter
 *   - codex:      Codex CLI adapter
 */

export type { AgentAdapter } from './adapter.js'
export { createAgentAdapter } from './factory.js'
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
