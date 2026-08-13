/**
 * Comprehensive tests for Phase 2 remaining gaps.
 *
 * Covers:
 *   Gap 4  — Error recovery (retryAttempts + timeoutMs)
 *   Gap 6  — Cross-session persistence (save/load)
 *   Gap 7  — Config hot-reload (updateConfig / updateSessionConfig)
 *   Gap 5  — Background sessions (bridge stream is tested via integration in REPL)
 *
 * NOTE: Gap 5 integration is covered by the function in REPL.handlers.ts.
 * The startBackgroundBridgeStream function uses enqueuePendingNotification
 * which requires the full React/Ink runtime. Pure unit tests for that function
 * live in the REPL handlers test suite.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getSessionManager,
  initSessionManager,
  resetSessionManager,
} from '../session-manager.js'
import type { AgentConfig, } from '../types.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Collect all events from an AsyncGenerator into an array. */
async function collect<T>(gen: AsyncGenerator<T, void, unknown>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) items.push(item)
  return items
}

// ── Raw-event helpers ────────────────────────────────────────────────────────
// translateEvent() only processes 'stream', 'assistant', 'user' event types.
// NormalizedEvents (text_chunk, tool_call_start, etc.) are silently dropped.
// Mock executors MUST yield raw query() events.

function rawStream(text: string) {
  return { type: 'stream' as const, text }
}

function rawAssistantText(text: string) {
  return { type: 'assistant' as const, content: [{ type: 'text' as const, text }] }
}

function rawToolUse(id: string, name: string, input: unknown) {
  return { type: 'assistant' as const, content: [{ type: 'tool_use' as const, id, name, input }] }
}

function rawToolResult(toolUseId: string, content: unknown, isError = false) {
  return {
    type: 'user' as const,
    is_error: isError,
    content: [{ type: 'tool_result' as const, tool_use_id: toolUseId, content }],
  }
}

/** Create a failing mock executor that throws after yielding optional prefix raw events. */
function failingExecutor(
  errorMessage: string,
  prefixEvents: Array<{ type: string; [k: string]: unknown }> = [],
) {
  return async function* (_userMessage: string, _abortController: AbortController) {
    for (const ev of prefixEvents) yield ev
    throw new Error(errorMessage)
  }
}

/** Create a mock that yields text via stream events. */
function successExecutor() {
  return async function* (_userMessage: string, _abortController: AbortController) {
    yield rawStream('Hello')
  }
}

/** Standard config for claude-haha tests — yields a text event by default. */
function hahaConfig(): AgentConfig {
  return { queryExecutor: successExecutor() }
}

/** Create a config with specific raw events. */
function hahaConfigWith(events: Array<{ type: string; [k: string]: unknown }>): AgentConfig {
  return {
    queryExecutor: mockExecutor(events),
  }
}

function mockExecutor(events: Array<{ type: string; [k: string]: unknown }>, delayMs = 0) {
  return async function* (_userMessage: string, abortController: AbortController) {
    for (const ev of events) {
      if (abortController.signal.aborted) break
      if (delayMs > 0) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, delayMs)
          abortController.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t)
              r()
            },
            { once: true },
          )
        })
      }
      if (abortController.signal.aborted) break
      yield ev
    }
  }
}

// ── Reset singleton before each test ────────────────────────────────────────

beforeEach(() => {
  resetSessionManager()
})

afterEach(() => {
  resetSessionManager()
})

// ═══════════════════════════════════════════════════════════════════════════
// Gap 4: Error Recovery — retryAttempts + timeoutMs
// ═══════════════════════════════════════════════════════════════════════════

describe('Gap 4 — Error Recovery (retry)', () => {
  it('succeeds on first attempt without retry', async () => {
    const sm = getSessionManager({ retryAttempts: 2 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: successExecutor(),
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    const text = events.filter((e) => e.type === 'text_chunk')
    expect(text[0]?.type).toBe('text_chunk')
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(s.metadata.messageCount).toBe(1)
  })

  it('retries on failure and succeeds on second attempt', async () => {
    let calls = 0
    const sm = getSessionManager({ retryAttempts: 2 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: async function* (_msg: string, _sig: AbortController) {
        calls++
        if (calls === 1) throw new Error('temporary failure')
        yield rawStream('recovered')
      },
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    expect(calls).toBe(2)
    expect(events.some((e) => e.type === 'text_chunk' && e.content === 'recovered')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('exhausts all retries and yields error event', async () => {
    const sm = getSessionManager({ retryAttempts: 1 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: failingExecutor('persistent failure'),
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)

    // Check error message mentions attempts — use the LAST error (exhaustion wrapper),
    // since each failed attempt also yields an adapter-level error before re-throwing.
    const errEvents = events.filter((e) => e.type === 'error')
    const lastErr = errEvents[errEvents.length - 1]
    expect(lastErr?.message).toContain('All 2 attempts failed')
    expect(lastErr?.message).toContain('persistent failure')

    // Metadata tracks error
    expect(s.metadata.errorsEncountered).toBe(1)
  })

  it('does not retry when retryAttempts is 0 (default)', async () => {
    const sm = getSessionManager() // retryAttempts defaults to 0
    let calls = 0
    const s = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls++
        throw new Error('fail once')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    expect(calls).toBe(1) // no retry
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('preserves partial events from failed attempt before retry', async () => {
    let calls = 0
    const sm = getSessionManager({ retryAttempts: 1 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls++
        if (calls === 1) {
          yield rawStream('partial')
          throw new Error('mid-stream failure')
        }
        yield rawStream('final')
      },
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    // First attempt's partial events are yielded before the error
    // Second attempt only yields final text
    expect(events.some((e) => e.type === 'text_chunk' && e.content === 'partial')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('increments retryCount metadata on full exhaustion', async () => {
    const sm = getSessionManager({ retryAttempts: 2 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: failingExecutor('fail'),
    })

    await collect(s.chatStream('hi', new AbortController()))
    expect(s.metadata.retryCount).toBe(3) // 2 retries + 1 initial = 3 total attempts
  })
})

describe('Gap 4 — Error Recovery (timeout)', () => {
  it('times out using timeoutMs', async () => {
    const sm = getSessionManager({ timeoutMs: 50 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: async function* (_msg: string, ctrl: AbortController) {
        // Simulate a very slow operation that should be timed out
        await new Promise<void>((r) => {
          const t = setTimeout(r, 1000)
          const onAbort = () => {
            clearTimeout(t)
            r()
          }
          ctrl.signal.addEventListener('abort', onAbort, { once: true })
        })
        // If we got here via abort (not timeout), throw so the adapter sees the error
        if (ctrl.signal.aborted) throw new Error('aborted')
        yield rawStream('too late')
      },
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('succeeds within timeoutMs', async () => {
    const sm = getSessionManager({ timeoutMs: 5000 })
    const s = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        yield rawStream('fast')
      },
    })

    const events = await collect(s.chatStream('hi', new AbortController()))
    expect(events.some((e) => e.type === 'text_chunk')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Gap 6: Cross-Session Persistence — save / load
// ═══════════════════════════════════════════════════════════════════════════

describe('Gap 6 — Cross-Session Persistence', () => {
  const TEST_DIR = path.join(process.cwd(), '.claude', 'sessions')
  const TEST_FILE = path.join(TEST_DIR, 'agent-sessions.json')

  function cleanupTestFile() {
    try {
      fs.unlinkSync(TEST_FILE)
    } catch {}
    try {
      fs.rmdirSync(TEST_DIR)
    } catch {}
  }

  beforeEach(() => {
    cleanupTestFile()
  })

  afterEach(() => {
    cleanupTestFile()
  })

  it('save() creates the sessions file', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha')
    await sm.save()

    expect(fs.existsSync(TEST_FILE)).toBe(true)
    const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'))
    expect(data.activeKind).toBe('claude-haha')
    expect(data.sessions).toHaveLength(1)
  })

  it('save() stores session metadata correctly', async () => {
    const sm = getSessionManager()
    sm.setActiveKind('codex')
    const s = sm.createSession('claude-haha', hahaConfig())

    // Chat once to update metadata
    await collect(s.chatStream('test', new AbortController()))

    await sm.save()

    const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'))
    expect(data.activeKind).toBe('codex')
    expect(data.sessions).toHaveLength(1)
    expect(data.sessions[0].agentKind).toBe('claude-haha')
    expect(data.sessions[0].metadata.messageCount).toBe(1)
  })

  it('load() restores sessions after simulated restart', async () => {
    // Phase 1: create, configure, save
    let sm = getSessionManager()
    sm.setActiveKind('claude-haha')
    sm.createSession('claude-haha')
    sm.createSession('codex')
    sm.createSession('claude-code')
    await sm.save()

    // Phase 2: reset singleton and load from disk
    sm.dispose()
    resetSessionManager()
    sm = await initSessionManager()

    expect(sm.getActiveKind()).toBe('claude-haha')
    expect(sm.listSessions()).toHaveLength(3)

    const kinds = sm
      .listSessions()
      .map((s) => s.agentKind)
      .sort()
    expect(kinds).toEqual(['claude-code', 'claude-haha', 'codex'])
  })

  it('load() falls back to empty state when file does not exist', async () => {
    resetSessionManager()
    const sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(0)
    expect(sm.getActiveKind()).toBe('claude-haha')
  })

  it('load() falls back to empty state when file is corrupted', async () => {
    // Write invalid JSON
    await fs.promises.mkdir(TEST_DIR, { recursive: true })
    await fs.promises.writeFile(TEST_FILE, '{ corrupted json!!!')

    resetSessionManager()
    const sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('load() preserves config across restart', async () => {
    let sm = getSessionManager({ retryAttempts: 5, maxSessions: 50, defaultKind: 'codex' })
    sm.updateConfig({ timeoutMs: 30000 })
    await sm.save()

    sm.dispose()
    resetSessionManager()
    sm = await initSessionManager()

    const cfg = sm.getConfig()
    expect(cfg.maxSessions).toBe(50)
    expect(cfg.retryAttempts).toBe(5)
    expect(cfg.timeoutMs).toBe(30000)
  })

  it('load() merges provided config over persisted config', async () => {
    let sm = getSessionManager({ maxSessions: 20 })
    await sm.save()

    sm.dispose()
    resetSessionManager()
    sm = await initSessionManager({ maxSessions: 30 })

    // Provided config takes precedence
    expect(sm.getConfig().maxSessions).toBe(30)
  })

  it('multiple save/load round-trips are consistent', async () => {
    let sm = getSessionManager()
    sm.createSession('claude-haha')
    sm.createSession('codex')
    await sm.save()

    // Load
    sm.dispose()
    resetSessionManager()
    sm = await initSessionManager()

    // Add more sessions
    sm.createSession('claude-code')
    await sm.save()

    // Load again
    sm.dispose()
    resetSessionManager()
    sm = await initSessionManager()

    expect(sm.listSessions()).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Gap 7: Config Hot-Reload — updateConfig / updateSessionConfig
// ═══════════════════════════════════════════════════════════════════════════

describe('Gap 7 — Config Hot-Reload', () => {
  it('updateConfig changes global config at runtime', () => {
    const sm = getSessionManager()
    sm.updateConfig({ retryAttempts: 3, timeoutMs: 15000 })

    const cfg = sm.getConfig()
    expect(cfg.retryAttempts).toBe(3)
    expect(cfg.timeoutMs).toBe(15000)
  })

  it('updateConfig only modifies specified keys', () => {
    const sm = getSessionManager({ maxSessions: 42 })
    sm.updateConfig({ retryAttempts: 5 })

    const cfg = sm.getConfig()
    expect(cfg.maxSessions).toBe(42) // unchanged
    expect(cfg.retryAttempts).toBe(5) // updated
  })

  it('getConfig returns a read-only snapshot (not live reference)', () => {
    const sm = getSessionManager()
    const snapshot = sm.getConfig()
    sm.updateConfig({ maxSessions: 99 })

    // Snapshot should reflect original, not updated
    expect(snapshot.maxSessions).toBe(10)
  })

  it('updateSessionConfig modifies an existing session config', () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', { cwd: '/old' })

    const result = sm.updateSessionConfig(s.id, { cwd: '/new' })
    expect(result).toBe(true)
  })

  it('updateSessionConfig returns false for unknown session', () => {
    const sm = getSessionManager()
    const result = sm.updateSessionConfig('nonexistent', { cwd: '/nope' })
    expect(result).toBe(false)
  })

  it('hot-updated retryAttempts takes effect on next chatStream', async () => {
    let calls = 0
    const sm = getSessionManager({ retryAttempts: 0 })

    // First session with no retries
    let s = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls++
        throw new Error('fail')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    await collect(s.chatStream('test', new AbortController()))
    expect(calls).toBe(1) // no retry

    // Update config
    sm.updateConfig({ retryAttempts: 2 })
    calls = 0

    s = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls++
        throw new Error('fail')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    await collect(s.chatStream('test', new AbortController()))
    expect(calls).toBe(3) // 1 initial + 2 retries
  })

  it('setActiveKind persists after updateConfig does not overwrite it', () => {
    const sm = getSessionManager()
    sm.setActiveKind('codex')
    sm.updateConfig({ timeoutMs: 5000 })

    expect(sm.getActiveKind()).toBe('codex')
  })

  it('updateConfig handles all valid keys', () => {
    const sm = getSessionManager()
    sm.updateConfig({
      maxSessions: 25,
      retryAttempts: 4,
      timeoutMs: 10000,
      defaultKind: 'codex',
    })

    const cfg = sm.getConfig()
    expect(cfg.maxSessions).toBe(25)
    expect(cfg.retryAttempts).toBe(4)
    expect(cfg.timeoutMs).toBe(10000)
    expect(cfg.defaultKind).toBe('codex')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Gap 5: Background Sessions — bridge stream (unit-level verification)
// ═══════════════════════════════════════════════════════════════════════════

describe('Gap 5 — Background Bridge (SessionHandle lifecycle)', () => {
  it('SessionHandle can be created for claude-code agent kind', () => {
    const sm = getSessionManager()
    const handle = sm.createSession('claude-code', {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    expect(handle.agentKind).toBe('claude-code')
    expect(handle.status).toBe('idle')
  })

  it('SessionHandle can be created for codex agent kind', () => {
    const sm = getSessionManager()
    const handle = sm.createSession('codex', {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    expect(handle.agentKind).toBe('codex')
    expect(handle.status).toBe('idle')
  })

  it('bridge stream accumulates text_chunk events correctly', async () => {
    const sm = getSessionManager()
    const handle = sm.createSession(
      'claude-haha',
      hahaConfigWith([rawStream('Hello '), rawStream('World!')]),
    )

    let output = ''
    for await (const ev of handle.chatStream('hi', new AbortController())) {
      if (ev.type === 'text_chunk') {
        output += ev.content
      }
    }

    expect(output).toBe('Hello World!')
  })

  it('bridge session is properly cleaned up after destroy', () => {
    const sm = getSessionManager()
    const handle = sm.createSession('claude-haha')

    handle.destroy()
    expect(sm.getSession(handle.id)).toBeUndefined()
  })

  it('bridge session handles error events gracefully', async () => {
    const sm = getSessionManager()
    const handle = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('Connection refused')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    let errorCount = 0
    for await (const ev of handle.chatStream('hi', new AbortController())) {
      if (ev.type === 'error') errorCount++
    }

    expect(errorCount).toBeGreaterThanOrEqual(1)
  })

  it('bridge session handles tool_call events without crash', async () => {
    const sm = getSessionManager()
    const handle = sm.createSession(
      'claude-haha',
      hahaConfigWith([
        rawToolUse('t1', 'read', { path: 'file.txt' }),
        rawToolResult('t1', 'file content'),
      ]),
    )

    const events = await collect(handle.chatStream('read file', new AbortController()))
    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true)
    expect(events.some((e) => e.type === 'tool_call_end')).toBe(true)
  })
})
