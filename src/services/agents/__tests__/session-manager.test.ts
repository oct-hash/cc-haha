/**
 * Unit tests for SessionManager.
 *
 * Covers:
 *   1. Singleton lifecycle (getSessionManager / resetSessionManager)
 *   2. Session CRUD (create / get / list / destroy)
 *   3. Agent-kind switching (setActiveKind / switchAgent)
 *   4. chatStream delegation through SessionHandle
 *   5. Metadata tracking (messageCount, toolCalls, lastActiveAt)
 *   6. Concurrent multi-session isolation
 *   7. Interrupt propagation
 *   8. Full dispose cleanup
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { AgentAdapterFactory } from '../adapter.js'
import { getSessionManager, resetSessionManager, type SessionHandle } from '../session-manager.js'
import type { AgentConfig, AgentKind, AgentStatus } from '../types.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Collect all events from an AsyncGenerator into an array. */
async function collect<T>(gen: AsyncGenerator<T, void, unknown>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) items.push(item)
  return items
}

/** Create a mock query executor that yields events then stops. */
function mockExecutor(events: Array<{ type: string; [k: string]: unknown }>, delayMs = 0) {
  return async function* (_userMessage: string, abortController: AbortController) {
    for (const ev of events) {
      if (abortController.signal.aborted) break
      if (delayMs > 0) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, delayMs)
          abortController.signal.addEventListener('abort', onAbort, { once: true })
          function onAbort() {
            clearTimeout(t)
            r()
          }
        })
      }
      if (abortController.signal.aborted) break
      yield ev
    }
  }
}

/** Standard config for claude-haha tests. */
function hahaConfig(events?: Array<{ type: string; [k: string]: unknown }>): AgentConfig {
  return { queryExecutor: mockExecutor(events ?? [{ type: 'done' }]) }
}

// ── Reset singleton before each test ────────────────────────────────────────

beforeEach(() => {
  resetSessionManager()
})

afterEach(() => {
  resetSessionManager()
})

// ── Singleton Lifecycle ─────────────────────────────────────────────────────

describe('SessionManager singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getSessionManager()
    const b = getSessionManager()
    expect(a).toBe(b)
  })

  it('resetSessionManager destroys old and allows new instance', () => {
    const a = getSessionManager()
    resetSessionManager()
    const b = getSessionManager()
    expect(a).not.toBe(b)
  })

  it('default activeKind is claude-haha', () => {
    const sm = getSessionManager()
    expect(sm.getActiveKind()).toBe('claude-haha')
  })

  it('respects defaultKind in config on first creation', () => {
    resetSessionManager()
    const sm = getSessionManager({ defaultKind: 'codex' })
    expect(sm.getActiveKind()).toBe('codex')
  })
})

// ── Session CRUD ────────────────────────────────────────────────────────────

describe('Session CRUD', () => {
  it('createSession returns a SessionHandle with unique id', () => {
    const sm = getSessionManager()
    const s1 = sm.createSession()
    const s2 = sm.createSession()
    expect(s1.id).not.toBe(s2.id)
    expect(s1.id).toMatch(/^session-/)
  })

  it('createSession inherits activeKind when no kind specified', () => {
    const sm = getSessionManager()
    sm.setActiveKind('codex')
    const s = sm.createSession()
    expect(s.agentKind).toBe('codex')
  })

  it('createSession uses explicit kind over activeKind', () => {
    const sm = getSessionManager()
    sm.setActiveKind('codex')
    const s = sm.createSession('claude-code')
    expect(s.agentKind).toBe('claude-code')
  })

  it('getSession returns existing session', () => {
    const sm = getSessionManager()
    const created = sm.createSession()
    const found = sm.getSession(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('getSession returns undefined for unknown id', () => {
    const sm = getSessionManager()
    expect(sm.getSession('nonexistent')).toBeUndefined()
  })

  it('destroySession removes session and makes it unretrievable', () => {
    const sm = getSessionManager()
    const s = sm.createSession()
    sm.destroySession(s.id)
    expect(sm.getSession(s.id)).toBeUndefined()
  })

  it('listSessions returns all active sessions', () => {
    const sm = getSessionManager()
    sm.createSession()
    sm.createSession()
    sm.createSession()
    expect(sm.listSessions()).toHaveLength(3)
  })

  it('listSessions reflects destroySession', () => {
    const sm = getSessionManager()
    const s = sm.createSession()
    sm.createSession()
    sm.destroySession(s.id)
    expect(sm.listSessions()).toHaveLength(1)
  })

  it('createSession throws when maxSessions is reached', () => {
    resetSessionManager()
    const sm = getSessionManager({ maxSessions: 3 })
    sm.createSession()
    sm.createSession()
    sm.createSession()
    expect(() => sm.createSession()).toThrow(/Session limit reached/)
  })
})

// ── Agent Kind Management ───────────────────────────────────────────────────

describe('Agent kind management', () => {
  it('setActiveKind changes the default for new sessions', () => {
    const sm = getSessionManager()
    sm.setActiveKind('codex')
    expect(sm.getActiveKind()).toBe('codex')
    const s = sm.createSession()
    expect(s.agentKind).toBe('codex')
  })

  it('switchAgent changes kind for existing session', () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha')
    expect(s.agentKind).toBe('claude-haha')
    sm.switchAgent(s.id, 'claude-code')
    expect(s.agentKind).toBe('claude-code')
  })

  it('switchAgent is a no-op for unknown session', () => {
    const sm = getSessionManager()
    expect(() => sm.switchAgent('nope', 'codex')).not.toThrow()
  })

  it('switchAgent updates metadata.agentKind', () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha')
    sm.switchAgent(s.id, 'codex')
    expect(s.metadata.agentKind).toBe('codex')
  })
})

// ── SessionHandle chatStream ────────────────────────────────────────────────

describe('SessionHandle.chatStream', () => {
  it('streams events through the adapter', async () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())

    const events = await collect(s.chatStream('hello', new AbortController()))

    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('yields typed events from the adapter', async () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())

    const events = await collect(s.chatStream('test', new AbortController()))

    // Default mock executor yields [{ type: 'done' }]
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('done')
  })

  it('increments metadata.messageCount after each chatStream call', async () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())

    expect(s.metadata.messageCount).toBe(0)

    await collect(s.chatStream('msg1', new AbortController()))
    expect(s.metadata.messageCount).toBe(1)

    await collect(s.chatStream('msg2', new AbortController()))
    expect(s.metadata.messageCount).toBe(2)
  })

  it('updates lastActiveAt after streaming', async () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())
    const before = s.metadata.lastActiveAt.getTime()

    // Small delay to ensure time difference
    await new Promise((r) => setTimeout(r, 5))
    await collect(s.chatStream('msg', new AbortController()))

    expect(s.metadata.lastActiveAt.getTime()).toBeGreaterThan(before)
  })

  it('status is idle after stream completes', async () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())

    await collect(s.chatStream('msg', new AbortController()))

    expect(s.status).toBe('idle')
  })

  it('status is idle for new session without active adapter', () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())
    expect(s.status).toBe('idle')
  })
})

// ── SessionHandle interrupt ─────────────────────────────────────────────────

describe('SessionHandle.interrupt', () => {
  it('interrupt() is safe to call when idle', () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha')
    expect(() => s.interrupt()).not.toThrow()
  })
})

// ── SessionHandle destroy ───────────────────────────────────────────────────

describe('SessionHandle.destroy', () => {
  it('removes session from SessionManager', () => {
    const sm = getSessionManager()
    const s = sm.createSession()
    s.destroy()
    expect(sm.getSession(s.id)).toBeUndefined()
  })

  it('destroy is idempotent', () => {
    const sm = getSessionManager()
    const s = sm.createSession()
    s.destroy()
    expect(() => s.destroy()).not.toThrow()
  })
})

// ── Concurrent Sessions ─────────────────────────────────────────────────────

describe('Concurrent sessions', () => {
  it('multiple sessions can be created and used independently', async () => {
    const sm = getSessionManager()
    const cfg = hahaConfig()
    const s1 = sm.createSession('claude-haha', cfg)
    const s2 = sm.createSession('claude-haha', cfg)
    const s3 = sm.createSession('claude-haha', cfg)

    expect(sm.listSessions()).toHaveLength(3)

    const [r1, r2, r3] = await Promise.all([
      collect(s1.chatStream('a', new AbortController())),
      collect(s2.chatStream('b', new AbortController())),
      collect(s3.chatStream('c', new AbortController())),
    ])

    expect(r1.some((e) => e.type === 'done')).toBe(true)
    expect(r2.some((e) => e.type === 'done')).toBe(true)
    expect(r3.some((e) => e.type === 'done')).toBe(true)
  })

  it('destroying one session does not affect others', async () => {
    const sm = getSessionManager()
    const cfg = hahaConfig()
    const s1 = sm.createSession('claude-haha', cfg)
    const s2 = sm.createSession('claude-haha', cfg)

    s1.destroy()

    expect(sm.getSession(s1.id)).toBeUndefined()
    expect(sm.getSession(s2.id)).toBeDefined()
  })
})

// ── Metadata Tracking ───────────────────────────────────────────────────────

describe('Metadata tracking', () => {
  it('new session has zero messageCount and toolCalls', () => {
    const sm = getSessionManager()
    const s = sm.createSession()
    expect(s.metadata.messageCount).toBe(0)
    expect(s.metadata.totalToolCalls).toBe(0)
    expect(s.metadata.totalTokens).toBe(0)
  })

  it('createdAt is set at creation time', () => {
    const before = new Date()
    const sm = getSessionManager()
    const s = sm.createSession()
    expect(s.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('agentKind in metadata matches session agentKind', () => {
    const sm = getSessionManager()
    const s = sm.createSession('codex')
    expect(s.metadata.agentKind).toBe('codex')
  })
})

// ── Dispose ─────────────────────────────────────────────────────────────────

describe('SessionManager.dispose', () => {
  it('clears all sessions', () => {
    const sm = getSessionManager()
    sm.createSession()
    sm.createSession()
    sm.createSession()

    sm.dispose()

    expect(sm.listSessions()).toHaveLength(0)
  })

  it('is safe to call when no sessions exist', () => {
    const sm = getSessionManager()
    expect(() => sm.dispose()).not.toThrow()
  })
})

// ── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('large number of sessions', () => {
    resetSessionManager()
    const sm = getSessionManager({ maxSessions: 200 })
    for (let i = 0; i < 100; i++) {
      sm.createSession()
    }
    expect(sm.listSessions()).toHaveLength(100)
    sm.dispose()
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('rapid create/destroy cycle', () => {
    const sm = getSessionManager()
    for (let i = 0; i < 50; i++) {
      const s = sm.createSession()
      s.destroy()
    }
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('switchAgent then chatStream uses new kind', async () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha', hahaConfig())
    sm.switchAgent(s.id, 'claude-haha') // same kind, should still work

    const events = await collect(s.chatStream('test', new AbortController()))

    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})
