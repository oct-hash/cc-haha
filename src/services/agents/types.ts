/**
 * Agent Adapter Layer — unified multi-agent protocol types.
 *
 * Three backends normalized to a single event stream:
 *   - claude-haha  — wraps the built-in query() AsyncGenerator
 *   - claude-code  — spawns the official `claude` CLI binary
 *   - codex        — spawns the `codex` CLI binary
 */

// -- Agent identity -----------------------------------------------------------

export type AgentKind = 'claude-haha' | 'claude-code' | 'codex'

// -- Normalized event stream --------------------------------------------------

export type NormalizedEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text_chunk'; content: string }
  | { type: 'tool_call_start'; toolUseId: string; name: string; inputPreview: string }
  | { type: 'tool_call_end'; toolUseId: string; isError: boolean; outputPreview: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

// -- Agent configuration ------------------------------------------------------

export interface AgentConfig {
  /** Maximum conversation turns before auto-stop. */
  maxTurns?: number
  /** Path to a custom system prompt file (claude-code / codex only). */
  systemPromptPath?: string
  /** Extra CLI flags appended to the spawn command (claude-code / codex only). */
  extraArgs?: string[]
  /** Working directory for the spawned process. */
  cwd?: string
  /** Environment variables for the spawned process. */
  env?: Record<string, string>
  /** Adapter-specific extra fields (e.g., queryExecutor for claude-haha). */
  [key: string]: unknown
}

// -- Agent status -------------------------------------------------------------

export type AgentStatus = 'idle' | 'running' | 'killed' | 'error'

// -- Session management -------------------------------------------------------

export type SessionId = string

export interface SessionMetadata {
  agentKind: AgentKind
  createdAt: Date
  messageCount: number
  lastActiveAt: Date
  totalTokens: number
  totalToolCalls: number
  errorsEncountered: number
  retryCount: number
}

export interface SessionStats {
  messagesSent: number
  tokensUsed: number
  toolCallsMade: number
  errorsEncountered: number
  avgResponseMs: number
}

export interface SessionManagerConfig {
  /** Maximum concurrent sessions (default: 10). */
  maxSessions?: number
  /** Retry attempts on adapter error (default: 0, no retry). */
  retryAttempts?: number
  /** Timeout per chatStream call in ms (default: 0, no timeout). */
  timeoutMs?: number
  /** Default agent kind for new sessions. */
  defaultKind?: AgentKind
}

// -- Session statistics -------------------------------------------------------
