/**
 * SessionManager + /agent Command — Stress Test Suite
 *
 * Tests the full SessionManager lifecycle under load: create/destroy,
 * concurrent chatStream, runtime agent switching, metadata integrity,
 * maxSessions enforcement, interruption, mixed agent kinds.
 *
 * Usage:
 *   bun run scripts/stress-test-session-manager.ts                 # default
 *   bun run scripts/stress-test-session-manager.ts --aggressive    # 高难度
 *   bun run scripts/stress-test-session-manager.ts --extreme       # 极限难度
 *   bun run scripts/stress-test-session-manager.ts --nightmare     # 地狱难度
 *   bun run scripts/stress-test-session-manager.ts --quick         # 快速验证
 *
 * Exit code 1 if any scenario fails.
 */

import type { QueryExecutor } from '../src/services/agents/claude-haha.js'
import { createAgentAdapter, listAgentKinds } from '../src/services/agents/factory.js'
import {
  getSessionManager,
  resetSessionManager,
  type SessionHandle,
} from '../src/services/agents/session-manager.js'
import type { AgentConfig, AgentKind } from '../src/services/agents/types.js'

// ── CLI ──────────────────────────────────────────────────────────────────

const MODE = Bun.argv.includes('--nightmare')
  ? 'nightmare'
  : Bun.argv.includes('--extreme')
    ? 'extreme'
    : Bun.argv.includes('--aggressive')
      ? 'aggressive'
      : Bun.argv.includes('--quick')
        ? 'quick'
        : 'default'

const CONFIG = {
  quick: { rounds: 1, concurrent: 5, events: 30, switchRounds: 10, floodEvents: 200 },
  default: { rounds: 5, concurrent: 15, events: 200, switchRounds: 50, floodEvents: 2000 },
  aggressive: {
    rounds: 15,
    concurrent: 50,
    events: 500,
    switchRounds: 200,
    floodEvents: 8000,
  },
  extreme: {
    rounds: 30,
    concurrent: 120,
    events: 1000,
    switchRounds: 500,
    floodEvents: 20000,
  },
  nightmare: {
    rounds: 60,
    concurrent: 250,
    events: 3000,
    switchRounds: 1500,
    floodEvents: 80000,
  },
}[MODE]

// ── State ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  ❌ FAIL: ${label}`)
  }
}

function header(text: string): void {
  console.log(`\n${'═'.repeat(64)}`)
  console.log(`  ${text}`)
  console.log(`${'═'.repeat(64)}`)
}

function done(): { p: number; f: number } {
  const r = { p: passed, f: failed }
  console.log(`  → ${r.f === 0 ? '✅' : '❌'} ${r.p} pass, ${r.f} fail, ${r.p + r.f} total`)
  passed = 0
  failed = 0
  return r
}

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  try {
    for await (const item of gen) items.push(item)
  } catch {
    /* exhausted */
  }
  return items
}

// ── Mock Executors ───────────────────────────────────────────────────────

function createStreamExecutor(eventCount: number, delayMs = 0): QueryExecutor {
  return async function* (_msg, abortController) {
    for (let i = 0; i < eventCount; i++) {
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
      yield { type: 'stream', text: `chunk-${i}` }
    }
  }
}

function createFaultyExecutor(failAt: number, errorMsg: string): QueryExecutor {
  return async function* (_msg, _abortController) {
    for (let i = 0; i < failAt; i++) yield { type: 'stream', text: `chunk-${i}` }
    throw new Error(errorMsg)
  }
}

function createMixedExecutor(): QueryExecutor {
  return async function* (_msg, abortController) {
    yield { type: 'stream', text: 'start' }
    if (abortController.signal.aborted) return
    yield {
      type: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'bash', input: { cmd: 'ls' } }],
    }
    if (abortController.signal.aborted) return
    yield {
      type: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file.txt' }],
    }
    if (abortController.signal.aborted) return
    yield { type: 'stream', text: 'done' }
  }
}

// Minimal config for claude-haha adapter
function hahaConfig(executor: QueryExecutor): AgentConfig {
  return { queryExecutor: executor } as AgentConfig
}

function resetSM(maxSessions = 200): void {
  resetSessionManager()
  getSessionManager({ maxSessions })
}

// ── /agent command simulation ────────────────────────────────────────────

function simulateAgentCommand(args: string): { type: string; value: string } {
  const sm = getSessionManager()
  const kind = args?.trim().toLowerCase()
  const validKinds = listAgentKinds() as readonly string[]
  if (!kind || !validKinds.includes(kind)) {
    return {
      type: 'text',
      value: `Invalid agent kind: "${kind || '(none)'}". Valid options: ${validKinds.join(', ')}`,
    }
  }
  const prev = sm.getActiveKind()
  if (prev === kind) {
    return { type: 'text', value: `Agent is already set to "${kind}". No change.` }
  }
  sm.setActiveKind(kind as AgentKind)
  return {
    type: 'text',
    value: `Switched agent from "${prev}" to "${kind}". New sessions will use this backend.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Session Create/Destroy Storm
// ═══════════════════════════════════════════════════════════════════════════

async function s1_CreateDestroy(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 100
  header(`1. Create/Destroy Storm (${N} cycles)`)

  resetSM(N + 10)
  const sm = getSessionManager()
  const start = performance.now()

  for (let i = 0; i < N; i++) {
    const s = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(3)))
    assert(s.id.startsWith('session-'), `cd${i}: valid id`)
    assert(s.agentKind === 'claude-haha', `cd${i}: kind`)
    assert(s.status === 'idle', `cd${i}: idle`)
    sm.destroySession(s.id)
    assert(sm.getSession(s.id) === undefined, `cd${i}: destroyed`)
  }

  const elapsed = (performance.now() - start).toFixed(0)
  assert(sm.listSessions().length === 0, 'empty after destroy all')
  console.log(`  ⏱  ${elapsed}ms (${((N / (Number(elapsed) || 1)) * 1000).toFixed(0)} cyc/s)`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Concurrent Sessions with chatStream
// ═══════════════════════════════════════════════════════════════════════════

async function s2_ConcurrentChat(): Promise<{ p: number; f: number }> {
  const C = CONFIG.concurrent
  const E = CONFIG.events
  header(`2. Concurrent ChatStream (${C} sessions × ${E} events)`)

  resetSM(C + 10)
  const sm = getSessionManager()
  const handles: SessionHandle[] = []

  for (let i = 0; i < C; i++) {
    const h = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(E)))
    handles.push(h)
  }

  const start = performance.now()
  const results = await Promise.all(
    handles.map(async (h, i) => {
      const events = await drain(h.chatStream(`msg-${i}`, new AbortController()))
      return { id: h.id, count: events.length, status: h.status }
    }),
  )

  const elapsed = (performance.now() - start).toFixed(0)
  for (const r of results) {
    assert(r.status === 'idle', `cc${r.id.slice(-4)}: idle`)
    assert(r.count > 0, `cc${r.id.slice(-4)}: got events`)
  }
  console.log(`  ⏱  ${elapsed}ms`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Rapid Agent Kind Switching
// ═══════════════════════════════════════════════════════════════════════════

async function s3_AgentSwitch(): Promise<{ p: number; f: number }> {
  const N = CONFIG.switchRounds
  header(`3. Agent Switch (${N} switches across 3 kinds)`)

  resetSM()
  const sm = getSessionManager()
  const kinds: AgentKind[] = ['claude-haha', 'claude-code', 'codex']

  for (let i = 0; i < N; i++) {
    const target = kinds[i % 3]
    const prev = sm.getActiveKind()

    // Simulate /agent command
    const r = simulateAgentCommand(target)
    assert(r.type === 'text', `sw${i}: text response`)
    assert(r.value.includes(target), `sw${i}: response mentions ${target}`)
    assert(sm.getActiveKind() === target, `sw${i}: activeKind === ${target}`)

    // Same-kind no-op
    const r2 = simulateAgentCommand(target)
    assert(r2.value.includes('already set'), `sw${i}: no-op detected`)
    assert(sm.getActiveKind() === target, `sw${i}: still ${target} after no-op`)
  }

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Session Metadata Integrity
// ═══════════════════════════════════════════════════════════════════════════

async function s4_Metadata(): Promise<{ p: number; f: number }> {
  header('4. Metadata Integrity')

  resetSM()
  const sm = getSessionManager()

  // messageCount increments
  const s1 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(5)))
  assert(s1.metadata.messageCount === 0, 'md: initial msgCount=0')
  await drain(s1.chatStream('msg1', new AbortController()))
  assert(s1.metadata.messageCount === 1, 'md: msgCount=1 after first')
  await drain(s1.chatStream('msg2', new AbortController()))
  assert(s1.metadata.messageCount === 2, 'md: msgCount=2 after second')
  await drain(s1.chatStream('msg3', new AbortController()))
  assert(s1.metadata.messageCount === 3, 'md: msgCount=3 after third')

  // totalToolCalls
  const s2 = sm.createSession('claude-haha', hahaConfig(createMixedExecutor()))
  await drain(s2.chatStream('tool', new AbortController()))
  assert(s2.metadata.totalToolCalls >= 1, 'md: toolCalls tracked')

  // totalTokens approximate
  const s3 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(100)))
  await drain(s3.chatStream('token-test', new AbortController()))
  assert(s3.metadata.totalTokens > 0, 'md: tokens > 0')

  // lastActiveAt updated
  const before = s3.metadata.lastActiveAt.getTime()
  await new Promise((r) => setTimeout(r, 5))
  await drain(s3.chatStream('another', new AbortController()))
  assert(s3.metadata.lastActiveAt.getTime() >= before, 'md: lastActiveAt updated')

  // createdAt immutable
  const created = s1.createdAt.getTime()
  await drain(s1.chatStream('test', new AbortController()))
  assert(s1.createdAt.getTime() === created, 'md: createdAt unchanged')

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. maxSessions Enforcement
// ═══════════════════════════════════════════════════════════════════════════

async function s5_MaxSessions(): Promise<{ p: number; f: number }> {
  header('5. maxSessions Enforcement')

  const limit = 5
  resetSM(limit)
  const sm = getSessionManager()

  // Fill to limit
  const handles: SessionHandle[] = []
  for (let i = 0; i < limit; i++) {
    handles.push(sm.createSession('claude-haha', hahaConfig(createStreamExecutor(1))))
  }
  assert(sm.listSessions().length === limit, `mx: ${limit} sessions`)

  // Exceed
  let threw = false
  try {
    sm.createSession('claude-haha')
  } catch (e: any) {
    threw = true
    assert(e.message.includes('Session limit'), `mx: error msg has 'Session limit'`)
    assert(e.message.includes(`${limit}`), `mx: error msg mentions ${limit}`)
  }
  assert(threw, 'mx: exceeded limit throws')

  // Destroy one, create one — should succeed
  sm.destroySession(handles[0].id)
  assert(sm.listSessions().length === limit - 1, `mx: ${limit - 1} after destroy`)
  const s = sm.createSession('claude-haha')
  assert(s.id !== undefined, 'mx: new session after destroy')
  assert(sm.listSessions().length === limit, `mx: back to ${limit}`)

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  6. Interrupt During Stream
// ═══════════════════════════════════════════════════════════════════════════

async function s6_InterruptStream(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 10
  header(`6. Interrupt Stream (${N} cycles)`)

  resetSM(N + 10)
  const sm = getSessionManager()

  for (let i = 0; i < N; i++) {
    const h = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(100, 1)))
    const gen = h.chatStream(`int-${i}`, new AbortController())

    let consumed = 0
    for await (const _ev of gen) {
      consumed++
      if (consumed >= (i % 5) + 2) {
        h.interrupt()
        break
      }
    }
    await drain(gen)

    // After interrupt, a new chatStream should work (fresh adapter)
    const events = await drain(h.chatStream(`rec-${i}`, new AbortController()))
    assert(events.length > 0, `is${i}: recovery has events`)
    assert(
      events.some((e) => e.type === 'done'),
      `is${i}: recovery done`,
    )
  }

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  7. Mixed Agent Kinds Concurrent
// ═══════════════════════════════════════════════════════════════════════════

async function s7_MixedKinds(): Promise<{ p: number; f: number }> {
  const C = CONFIG.concurrent
  header(`7. Mixed Agent Kinds (${C} sessions across 3 kinds)`)

  resetSM(C + 10)
  const sm = getSessionManager()
  const kinds: AgentKind[] = ['claude-haha', 'claude-code', 'codex']
  const handles: SessionHandle[] = []

  for (let i = 0; i < C; i++) {
    const kind = kinds[i % 3]
    // Only claude-haha gets a mock executor; other kinds use empty config
    const config = kind === 'claude-haha' ? hahaConfig(createStreamExecutor(CONFIG.events)) : {}
    const h = sm.createSession(kind, config)
    handles.push(h)
    assert(h.agentKind === kind, `mk${i}: kind=${kind}`)
  }

  // Verify all sessions have correct kinds
  const all = sm.listSessions()
  assert(all.length === C, `mk: ${C} sessions listed`)
  for (let i = 0; i < all.length; i++) {
    assert(all[i].agentKind === kinds[i % 3], `mk${i}: list kind matches`)
  }

  // Only chatStream on claude-haha sessions (codex/claude-code need real CLI backends)
  const hahaHandles = handles.filter((h) => h.agentKind === 'claude-haha')
  const results = await Promise.all(
    hahaHandles.map(async (h, i) => {
      const events = await drain(h.chatStream(`mixed-${i}`, new AbortController()))
      return { id: h.id, count: events.length, kind: h.agentKind }
    }),
  )

  for (const r of results) {
    assert(r.count > 0, `mk-${r.id.slice(-4)}: got events for ${r.kind}`)
  }

  // Non-haha sessions: verify they exist with correct metadata
  for (const h of handles) {
    if (h.agentKind !== 'claude-haha') {
      assert(h.status === 'idle', `mk-${h.id.slice(-4)}: ${h.agentKind} idle`)
      assert(h.metadata.agentKind === h.agentKind, `mk-${h.id.slice(-4)}: metadata kind`)
    }
  }

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  8. Session Handle Isolation
// ═══════════════════════════════════════════════════════════════════════════

async function s8_Isolation(): Promise<{ p: number; f: number }> {
  header('8. Session Handle Isolation')

  resetSM()
  const sm = getSessionManager()

  const h1 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(10)))
  const h2 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(10)))

  // Each has independent metadata and ids
  assert(h1.id !== h2.id, 'iso: different ids')
  assert(h1.agentKind === 'claude-haha', 'iso: h1 kind')
  assert(h2.agentKind === 'claude-haha', 'iso: h2 kind')

  // Stream on h1 only — h2 metadata unchanged
  const msg2Before = h2.metadata.messageCount
  await drain(h1.chatStream('only-h1', new AbortController()))
  assert(h1.metadata.messageCount === 1, 'iso: h1 msgCount=1')
  assert(h2.metadata.messageCount === msg2Before, 'iso: h2 msgCount unchanged')

  // Destroy h1 — h2 unaffected
  sm.destroySession(h1.id)
  assert(sm.getSession(h1.id) === undefined, 'iso: h1 gone')
  assert(sm.getSession(h2.id) !== undefined, 'iso: h2 still exists')

  // h2 still works independently
  const events = await drain(h2.chatStream('h2-alive', new AbortController()))
  assert(events.length > 0, 'iso: h2 still functional')

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  9. Adapter Error Propagation
// ═══════════════════════════════════════════════════════════════════════════

async function s9_ErrorPropagation(): Promise<{ p: number; f: number }> {
  header('9. Error Propagation through SessionHandle')

  resetSM()
  const sm = getSessionManager()

  // Faulty executor → error propagates as event
  const h = sm.createSession('claude-haha', hahaConfig(createFaultyExecutor(3, 'injected-fault')))
  const events = await drain(h.chatStream('fail', new AbortController()))

  // Error should be in the event stream
  assert(
    events.some((e) => e.type === 'error'),
    'ep: error event present',
  )
  const errEvent = events.find((e) => e.type === 'error')
  assert(errEvent!.message.includes('injected-fault'), 'ep: error message')

  // No done event after error
  assert(events.filter((e) => e.type === 'done').length === 0, 'ep: no done after error')

  // Same session with same faulty config will fail again (config-bound fault)
  const events2 = await drain(h.chatStream('retry', new AbortController()))
  assert(
    events2.some((e) => e.type === 'error'),
    'ep: retry also errors (config-bound fault)',
  )

  // New session with valid config recovers
  const h2 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(5)))
  const events3 = await drain(h2.chatStream('fresh', new AbortController()))
  assert(
    events3.some((e) => e.type === 'done'),
    'ep: new session succeeds',
  )

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Dispose All and Recreate
// ═══════════════════════════════════════════════════════════════════════════

async function s10_DisposeRecreate(): Promise<{ p: number; f: number }> {
  header('10. Dispose All + Recreate')

  resetSM()
  let sm = getSessionManager()

  // Create sessions with active streams
  const h1 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(100, 5)))
  const h2 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(100, 5)))

  // Start streams (don't await)
  const gen1 = h1.chatStream('long1', new AbortController())
  const gen2 = h2.chatStream('long2', new AbortController())
  await Promise.all([gen1.next(), gen2.next()])

  // Full dispose
  sm.dispose()
  assert(sm.listSessions().length === 0, 'dr: empty after dispose')

  // Recreate — should work cleanly
  resetSM()
  sm = getSessionManager()
  const h3 = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(20)))
  const events = await drain(h3.chatStream('fresh', new AbortController()))
  assert(
    events.some((e) => e.type === 'done'),
    'dr: fresh session works',
  )

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. /agent Validation Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

async function s11_AgentValidation(): Promise<{ p: number; f: number }> {
  header('11. /agent Command Validation')

  resetSM()
  const sm = getSessionManager()

  // Empty args
  const r1 = simulateAgentCommand('')
  assert(r1.value.includes('Invalid'), 'av: empty → error')
  assert(r1.value.includes('(none)'), 'av: shows (none)')

  // Whitespace only
  const r2 = simulateAgentCommand('   ')
  assert(r2.value.includes('Invalid'), 'av: whitespace → error')

  // Invalid kind
  const r3 = simulateAgentCommand('gpt-5')
  assert(r3.value.includes('Invalid'), 'av: gpt-5 → error')
  assert(r3.value.includes('gpt-5'), 'av: echoes bad kind')

  // Lists valid options
  const r4 = simulateAgentCommand('')
  for (const k of listAgentKinds()) {
    assert(r4.value.includes(k), `av: lists ${k}`)
  }

  // Case insensitive
  const r5 = simulateAgentCommand('CODEX')
  assert(r5.value.includes('codex'), 'av: case insensitive')
  assert(sm.getActiveKind() === 'codex', 'av: switched to codex')

  // Leading/trailing whitespace
  const r6 = simulateAgentCommand('  claude-code  ')
  assert(r6.value.includes('claude-code'), 'av: trims whitespace')

  // Full cycle through all three
  simulateAgentCommand('claude-haha')
  assert(sm.getActiveKind() === 'claude-haha', 'av: back to claude-haha')

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. Flood: Rapid chatStream on Single Session
// ═══════════════════════════════════════════════════════════════════════════

async function s12_Flood(): Promise<{ p: number; f: number }> {
  const N = CONFIG.floodEvents
  header(`12. Flood (${N.toLocaleString()} events on single session)`)

  resetSM()
  const sm = getSessionManager()
  const h = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(N)))

  const start = performance.now()
  const events = await drain(h.chatStream('flood', new AbortController()))
  const elapsed = (performance.now() - start).toFixed(0)

  assert(
    events.some((e) => e.type === 'done'),
    'fl: done',
  )
  const chunks = events.filter((e) => e.type === 'text_chunk')
  assert(chunks.length === N, `fl: all ${N} chunks (got ${chunks.length})`)
  console.log(`  ⏱  ${elapsed}ms (${((N / (Number(elapsed) || 1)) * 1000).toFixed(0)} ev/s)`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. Create While Streaming (same session)
// ═══════════════════════════════════════════════════════════════════════════

async function s13_CreateWhileStreaming(): Promise<{ p: number; f: number }> {
  const C = CONFIG.concurrent
  header(`13. Create While Streaming (${C} claude-haha sessions, interleaved create/stream)`)

  resetSM(C + 50)
  const sm = getSessionManager()
  const handles: SessionHandle[] = []
  const streamPromises: Promise<any>[] = []

  // Interleave creation and streaming — all claude-haha (only kind with mock executor)
  for (let i = 0; i < C; i++) {
    const h = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(CONFIG.events)))
    handles.push(h)

    // Start streaming every other session immediately
    if (i % 2 === 0) {
      streamPromises.push(
        drain(h.chatStream(`interleave-${i}`, new AbortController())).then((events) => ({
          id: h.id,
          count: events.length,
        })),
      )
    }
  }

  // Now stream on the remaining sessions
  for (let i = 0; i < handles.length; i++) {
    if (i % 2 === 1) {
      streamPromises.push(
        drain(handles[i].chatStream(`delayed-${i}`, new AbortController())).then((events) => ({
          id: handles[i].id,
          count: events.length,
        })),
      )
    }
  }

  const results = await Promise.all(streamPromises)
  for (const r of results) {
    assert(r.count > 0, `cws-${r.id.slice(-4)}: got events`)
  }
  assert(results.length === C, `cws: all ${C} completed`)

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. SessionHandle destroy() Method
// ═══════════════════════════════════════════════════════════════════════════

async function s14_HandleDestroy(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 20
  header(`14. Handle.destroy() (${N} self-destroy cycles)`)

  resetSM(N + 10)
  const sm = getSessionManager()

  for (let i = 0; i < N; i++) {
    const h = sm.createSession('claude-haha', hahaConfig(createStreamExecutor(5)))
    await drain(h.chatStream(`self-${i}`, new AbortController()))
    h.destroy()
    assert(sm.getSession(h.id) === undefined, `hd${i}: self-destroyed`)
  }

  assert(sm.listSessions().length === 0, 'hd: all self-destroyed')
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. listSessions Accuracy Under Load
// ═══════════════════════════════════════════════════════════════════════════

async function s15_ListAccuracy(): Promise<{ p: number; f: number }> {
  const C = CONFIG.concurrent
  header(`15. listSessions Accuracy (${C} sessions, verify after mutations)`)

  resetSM(C * 2)
  const sm = getSessionManager()

  // Create sessions
  for (let i = 0; i < C; i++) {
    sm.createSession(i % 3 === 0 ? 'claude-haha' : i % 3 === 1 ? 'claude-code' : 'codex')
  }

  let all = sm.listSessions()
  assert(all.length === C, `ls: ${C} listed`)

  // Destroy half
  const toDestroy = all.filter((_, i) => i % 2 === 0)
  for (const s of toDestroy) sm.destroySession(s.id)

  all = sm.listSessions()
  assert(all.length === C - toDestroy.length, `ls: ${C - toDestroy.length} remaining`)

  // Verify remaining are the right ones
  const destroyedIds = new Set(toDestroy.map((s) => s.id))
  for (const s of all) {
    assert(!destroyedIds.has(s.id), `ls: ${s.id.slice(-4)} not in destroyed set`)
  }

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`🧪 SessionManager + /agent Stress Test — ${MODE.toUpperCase()}`)
  console.log(
    `   r=${CONFIG.rounds} c=${CONFIG.concurrent} ev=${CONFIG.events} sw=${CONFIG.switchRounds} flood=${CONFIG.floodEvents.toLocaleString()}`,
  )

  const totalStart = performance.now()
  let grandPassed = 0
  let grandFailed = 0

  const scenarios: Array<[string, () => Promise<{ p: number; f: number }>]> = [
    ['Create/Destroy Storm', s1_CreateDestroy],
    ['Concurrent ChatStream', s2_ConcurrentChat],
    ['Agent Kind Switching', s3_AgentSwitch],
    ['Metadata Integrity', s4_Metadata],
    ['maxSessions Enforcement', s5_MaxSessions],
    ['Interrupt Stream', s6_InterruptStream],
    ['Mixed Agent Kinds', s7_MixedKinds],
    ['Session Isolation', s8_Isolation],
    ['Error Propagation', s9_ErrorPropagation],
    ['Dispose + Recreate', s10_DisposeRecreate],
    ['/agent Validation', s11_AgentValidation],
    ['Flood Events', s12_Flood],
    ['Create While Streaming', s13_CreateWhileStreaming],
    ['Handle.destroy()', s14_HandleDestroy],
    ['listSessions Accuracy', s15_ListAccuracy],
  ]

  for (const [name, fn] of scenarios) {
    process.stdout.write(`\n${name}...`)
    const r = await fn()
    grandPassed += r.p
    grandFailed += r.f
  }

  const totalElapsed = (performance.now() - totalStart).toFixed(0)

  console.log(`\n${'═'.repeat(64)}`)
  console.log(`  🏁 COMPLETE — ${MODE.toUpperCase()}`)
  console.log(`${'═'.repeat(64)}`)
  console.log(`  ⏱   ${totalElapsed}ms`)
  console.log(`  Mode ${MODE}  Rounds ${CONFIG.rounds}  Concurrent ${CONFIG.concurrent}`)
  console.log(`  Scenarios: ${scenarios.length}`)

  if (grandFailed > 0) {
    console.log(`\n  ❌ ${grandFailed} FAILED / ${grandPassed + grandFailed} total`)
    process.exit(1)
  }
  console.log(`\n  ✅ ALL ${grandPassed} assertions passed`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
