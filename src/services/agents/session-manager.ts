/**
 * SessionManager — unified session lifecycle for the multi-agent system.
 *
 * Responsibilities:
 *   - Create / retrieve / destroy sessions (each session tracks one AgentAdapter)
 *   - Runtime agent-kind switching (interrupt → recreate adapter, preserve metadata)
 *   - Adapter factory delegation through the existing factory registry
 *
 * Design notes:
 *   - Singleton via getSessionManager(); lifecycle matches the REPL process.
 *   - Adapters are single-use — each chatStream() call creates a fresh adapter.
 *   - SessionHandle is the public face exposed to REPL handlers.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AgentAdapter } from './adapter.js'
import { createAgentAdapter } from './factory.js'
import type {
  AgentConfig,
  AgentKind,
  AgentStatus,
  NormalizedEvent,
  SessionId,
  SessionManagerConfig,
  SessionMetadata,
} from './types.js'

// -- Persistence paths -------------------------------------------------------

const SESSIONS_DIR = '.claude/sessions'
const SESSIONS_FILE = 'agent-sessions.json'

function getSessionsPath(): string {
  return path.join(process.cwd(), SESSIONS_DIR, SESSIONS_FILE)
}

// -- Internal state -----------------------------------------------------------

interface SessionState {
  id: SessionId
  agentKind: AgentKind
  metadata: SessionMetadata
  config: AgentConfig
}

// -- Public handle ------------------------------------------------------------

export interface SessionHandle {
  readonly id: SessionId
  readonly agentKind: AgentKind
  readonly status: AgentStatus
  readonly metadata: Readonly<SessionMetadata>
  readonly createdAt: Date

  /**
   * Start a streaming chat turn. Creates a fresh adapter, streams events,
   * and disposes the adapter when the stream ends (cleanly or via error/abort).
   */
  chatStream(
    userMessage: string,
    abortController: AbortController,
  ): AsyncGenerator<NormalizedEvent, void, unknown>

  /** Interrupt the current turn (no-op if idle). */
  interrupt(): void

  /** Permanently release this session. */
  destroy(): void
}

// -- SessionManager -----------------------------------------------------------

let _instance: SessionManager | null = null

export class SessionManager {
  private sessions = new Map<SessionId, SessionState>()
  private activeAdapters = new Map<SessionId, AgentAdapter>()
  private activeKind: AgentKind
  private config: SessionManagerConfig
  private counter = 0

  constructor(config: SessionManagerConfig = {}) {
    this.config = config
    this.activeKind = config.defaultKind ?? 'claude-haha'
  }

  // --- Session CRUD ----------------------------------------------------------

  createSession(kind?: AgentKind, config?: AgentConfig): SessionHandle {
    const maxSessions = this.config.maxSessions ?? 10
    if (this.sessions.size >= maxSessions) {
      throw new Error(
        `Session limit reached: ${this.sessions.size}/${maxSessions} sessions active. ` +
          `Destroy unused sessions before creating new ones.`,
      )
    }

    const agentKind = kind ?? this.activeKind
    const id: SessionId = `session-${Date.now()}-${++this.counter}`
    const now = new Date()

    const state: SessionState = {
      id,
      agentKind,
      config: config ?? {},
      metadata: {
        agentKind,
        createdAt: now,
        messageCount: 0,
        lastActiveAt: now,
        totalTokens: 0,
        totalToolCalls: 0,
        errorsEncountered: 0,
        retryCount: 0,
      },
    }

    this.sessions.set(id, state)
    return this.makeHandle(state)
  }

  getSession(id: SessionId): SessionHandle | undefined {
    const state = this.sessions.get(id)
    return state ? this.makeHandle(state) : undefined
  }

  destroySession(id: SessionId): void {
    const adapter = this.activeAdapters.get(id)
    if (adapter) {
      adapter.interrupt()
      adapter.dispose()
      this.activeAdapters.delete(id)
    }
    this.sessions.delete(id)
  }

  listSessions(): SessionHandle[] {
    return [...this.sessions.values()].map((s) => this.makeHandle(s))
  }

  // --- Agent kind management -------------------------------------------------

  getActiveKind(): AgentKind {
    return this.activeKind
  }

  setActiveKind(kind: AgentKind): void {
    this.activeKind = kind
  }

  /**
   * Switch an existing session to a different agent kind.
   * Interrupts the current adapter (if running) so the next chatStream()
   * call spawns a fresh adapter of the new kind.
   */
  switchAgent(id: SessionId, kind: AgentKind): void {
    const state = this.sessions.get(id)
    if (!state) return

    // Interrupt current adapter
    const adapter = this.activeAdapters.get(id)
    if (adapter) {
      adapter.interrupt()
      adapter.dispose()
      this.activeAdapters.delete(id)
    }

    state.agentKind = kind
    state.metadata.agentKind = kind
    state.metadata.lastActiveAt = new Date()
  }

  // --- Lifecycle -------------------------------------------------------------

  dispose(): void {
    for (const [id, adapter] of this.activeAdapters) {
      adapter.interrupt()
      adapter.dispose()
    }
    this.activeAdapters.clear()
    this.sessions.clear()
  }

  // --- Config hot-reload -----------------------------------------------------

  /** Update global SessionManager configuration at runtime. */
  updateConfig(partial: Partial<SessionManagerConfig>): void {
    if (partial.maxSessions !== undefined) this.config.maxSessions = partial.maxSessions
    if (partial.retryAttempts !== undefined) this.config.retryAttempts = partial.retryAttempts
    if (partial.timeoutMs !== undefined) this.config.timeoutMs = partial.timeoutMs
    if (partial.defaultKind !== undefined) this.config.defaultKind = partial.defaultKind
  }

  /** Update a specific session's AgentConfig at runtime. Returns false if session not found. */
  updateSessionConfig(id: SessionId, config: Partial<AgentConfig>): boolean {
    const state = this.sessions.get(id)
    if (!state) return false
    state.config = { ...state.config, ...config }
    return true
  }

  /** Get the current SessionManagerConfig (read-only snapshot with defaults applied). */
  getConfig(): Readonly<SessionManagerConfig> {
    return {
      maxSessions: this.config.maxSessions ?? 10,
      retryAttempts: this.config.retryAttempts ?? 0,
      timeoutMs: this.config.timeoutMs ?? 0,
      defaultKind: this.config.defaultKind ?? 'claude-haha',
    }
  }

  // --- Persistence -----------------------------------------------------------

  private _saveChain: Promise<void> = Promise.resolve()

  async save(): Promise<void> {
    // Serialize writes: concurrent save() calls chain sequentially so the last
    // snapshot always wins instead of racing on the filesystem.
    this._saveChain = this._saveChain
      .then(async () => {
        const state = {
          activeKind: this.activeKind,
          config: this.config,
          sessions: Array.from(this.sessions.values()).map((s) => ({
            id: s.id,
            agentKind: s.agentKind,
            metadata: s.metadata,
            config: s.config,
          })),
        }
        const filePath = getSessionsPath()
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2))
      })
      .catch(() => {
        // Swallow to keep the chain alive for subsequent saves
      })
    return this._saveChain
  }

  static async load(config?: SessionManagerConfig): Promise<SessionManager> {
    try {
      const filePath = getSessionsPath()
      const raw = await fs.promises.readFile(filePath, 'utf-8')
      const data = JSON.parse(raw)
      const sm = new SessionManager({ ...data.config, ...config })
      sm.activeKind = data.activeKind ?? sm.activeKind
      for (const s of data.sessions ?? []) {
        sm.sessions.set(s.id, {
          id: s.id,
          agentKind: s.agentKind,
          config: s.config ?? {},
          metadata: {
            ...s.metadata,
            createdAt: new Date(s.metadata.createdAt),
            lastActiveAt: new Date(s.metadata.lastActiveAt),
          },
        })
      }
      return sm
    } catch {
      return new SessionManager(config)
    }
  }

  // --- Internal helpers ------------------------------------------------------

  private makeHandle(state: SessionState): SessionHandle {
    const self = this

    return {
      get id() {
        return state.id
      },
      get agentKind() {
        return state.agentKind
      },
      get status(): AgentStatus {
        const adapter = self.activeAdapters.get(state.id)
        return adapter?.status ?? 'idle'
      },
      get metadata() {
        return state.metadata
      },
      get createdAt() {
        return state.metadata.createdAt
      },

      async *chatStream(
        userMessage: string,
        abortController: AbortController,
      ): AsyncGenerator<NormalizedEvent, void, unknown> {
        // Interrupt any existing adapter for this session
        const prev = self.activeAdapters.get(state.id)
        if (prev) {
          prev.interrupt()
          prev.dispose()
        }

        const maxRetries = self.config.retryAttempts ?? 0
        const timeoutMs = self.config.timeoutMs ?? 0
        let lastError: Error | undefined

        // Increment message count once per chatStream call (not per retry)
        state.metadata.messageCount++

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          // Set up timeout via AbortController (preserves the contract:
          // adapters expect AbortController, not bare AbortSignal)
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          if (timeoutMs > 0) {
            timeoutId = setTimeout(
              () =>
                abortController.abort(
                  new Error(`Session chatStream timed out after ${timeoutMs}ms`),
                ),
              timeoutMs,
            )
          }

          const adapter = createAgentAdapter(state.agentKind, state.config)
          self.activeAdapters.set(state.id, adapter)

          try {
            for await (const event of adapter.chatStream(userMessage, abortController)) {
              if (event.type === 'tool_call_end') {
                state.metadata.totalToolCalls++
              }
              if (event.type === 'text_chunk') {
                state.metadata.totalTokens += Math.ceil(event.content.length / 4)
              }
              yield event
            }
            // Success — exit retry loop
            if (timeoutId !== undefined) clearTimeout(timeoutId)
            state.metadata.lastActiveAt = new Date()
            return
          } catch (err) {
            if (timeoutId !== undefined) clearTimeout(timeoutId)
            lastError = err as Error
            adapter.dispose()
            if (self.activeAdapters.get(state.id) === adapter) {
              self.activeAdapters.delete(state.id)
            }

            if (attempt < maxRetries) {
              // Exponential backoff: 100ms * 2^attempt, capped at 5000ms
              const delay = Math.min(100 * 2 ** attempt, 5000)
              await new Promise((r) => setTimeout(r, delay))
            }
          }
        }

        // All retries exhausted
        state.metadata.errorsEncountered++
        state.metadata.retryCount += maxRetries + 1
        state.metadata.lastActiveAt = new Date()
        yield {
          type: 'error',
          message: `All ${maxRetries + 1} attempts failed: ${lastError?.message ?? 'unknown error'}`,
        }
        yield { type: 'done' }
      },

      interrupt(): void {
        const adapter = self.activeAdapters.get(state.id)
        adapter?.interrupt()
      },

      destroy(): void {
        self.destroySession(state.id)
      },
    }
  }
}

// -- Singleton accessor -------------------------------------------------------

export function getSessionManager(config?: SessionManagerConfig): SessionManager {
  if (!_instance) {
    _instance = new SessionManager(config)
  }
  return _instance
}

/** Load persisted state from disk (call once at startup before getSessionManager). */
export async function initSessionManager(config?: SessionManagerConfig): Promise<SessionManager> {
  if (!_instance) {
    _instance = await SessionManager.load(config)
  }
  return _instance
}

/** For testing: reset the singleton. */
export function resetSessionManager(): void {
  if (_instance) {
    _instance.dispose()
    _instance = null
  }
}
