/**
 * Agent Adapter Layer — Stress Test Suite (地狱难度版)
 *
 * Usage:
 *   bun run scripts/stress-test-agents.ts                 # default
 *   bun run scripts/stress-test-agents.ts --aggressive    # 高难度
 *   bun run scripts/stress-test-agents.ts --extreme       # 极限难度
 *   bun run scripts/stress-test-agents.ts --nightmare     # 地狱难度
 *   bun run scripts/stress-test-agents.ts --quick         # 快速验证
 *
 * Exit code 1 if any scenario fails.
 */

import type { QueryExecutor } from '../src/services/agents/claude-haha.js'
import { createAgentAdapter } from '../src/services/agents/factory.js'

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
  quick: { rounds: 1, concurrent: 3, events: 50, floodEvents: 500, chaosMs: 500, abGap: 20 },
  default: { rounds: 5, concurrent: 12, events: 500, floodEvents: 3000, chaosMs: 200, abGap: 5 },
  aggressive: {
    rounds: 15,
    concurrent: 40,
    events: 1000,
    floodEvents: 10000,
    chaosMs: 100,
    abGap: 1,
  },
  extreme: { rounds: 30, concurrent: 100, events: 2000, floodEvents: 30000, chaosMs: 50, abGap: 0 },
  nightmare: {
    rounds: 50,
    concurrent: 200,
    events: 5000,
    floodEvents: 100000,
    chaosMs: 30,
    abGap: 0,
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
  console.log(`\n  → ${r.f === 0 ? '✅' : '❌'} ${r.p} pass, ${r.f} fail, ${r.p + r.f} total`)
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

// Ignores abort — keeps yielding after abort signal (tests adapter resilience)
function createStubbornExecutor(count: number): QueryExecutor {
  return async function* (_msg, _abortController) {
    for (let i = 0; i < count; i++) yield { type: 'stream', text: `stubborn-${i}` }
  }
}

function mkAdapter(executor: QueryExecutor) {
  return createAgentAdapter('claude-haha', { queryExecutor: executor } as any)
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Concurrent Sessions
// ═══════════════════════════════════════════════════════════════════════════

async function s1_Concurrent(): Promise<{ p: number; f: number }> {
  header(`1. Concurrent (${CONFIG.concurrent} sessions × ${CONFIG.events} events)`)

  const start = performance.now()
  const sessions = Array.from({ length: CONFIG.concurrent }, (_, i) => ({
    adapter: mkAdapter(createStreamExecutor(CONFIG.events)),
    id: i,
  }))

  const results = await Promise.all(
    sessions.map(async ({ adapter, id }) => {
      const events = await drain(adapter.chatStream(`msg-${id}`, new AbortController()))
      return { id, count: events.length, status: adapter.status }
    }),
  )

  const elapsed = (performance.now() - start).toFixed(0)
  for (const r of results) {
    assert(r.status === 'idle', `s${r.id}: idle`)
    assert(r.count === CONFIG.events + 1, `s${r.id}: ${r.count} ev (want ${CONFIG.events + 1})`)
  }
  console.log(`  ⏱  ${elapsed}ms`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Rapid Abort & Recovery
// ═══════════════════════════════════════════════════════════════════════════

async function s2_AbortRecovery(): Promise<{ p: number; f: number }> {
  const cycles = CONFIG.rounds * 8
  header(`2. Abort & Recovery (${cycles} cycles, gap=${CONFIG.abGap}ms)`)

  for (let i = 0; i < cycles; i++) {
    // Create adapter, start stream, abort it mid-flight
    const adapter = mkAdapter(createStreamExecutor(200, Math.max(CONFIG.abGap, 1)))
    const gen = adapter.chatStream(`c-${i}`, new AbortController())
    let consumed = 0
    for await (const _ev of gen) {
      consumed++
      if (consumed >= (i % 7) + 1) {
        adapter.interrupt()
        break
      }
    }
    await drain(gen)
    assert(adapter.status === 'killed', `c${i}: killed after ${consumed} events`)

    // Adapters are single-use — create a new one for recovery
    const adapter2 = mkAdapter(createStreamExecutor(50))
    const gen2 = adapter2.chatStream(`r-${i}`, new AbortController())
    const events = await drain(gen2)
    assert(events.length > 0, `c${i}: recovery got ${events.length} events`)
    assert(
      events.some((e) => e.type === 'done'),
      `c${i}: recovery done`,
    )
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Error Recovery
// ═══════════════════════════════════════════════════════════════════════════

async function s3_ErrorRecovery(): Promise<{ p: number; f: number }> {
  header('3. Error Recovery')

  // 3a: Error → no done, error is terminal event
  {
    const a = mkAdapter(createFaultyExecutor(3, 'injected'))
    const events = await drain(a.chatStream('t', new AbortController()))
    assert(a.status === 'error', '3a: status=error')
    assert(events.filter((e) => e.type === 'done').length === 0, '3a: no done')
    assert(
      events.some((e) => e.type === 'error'),
      '3a: error event',
    )
    const idx = events.findIndex((e) => e.type === 'error')
    assert(
      idx === events.length - 1 || events.every((e) => e.type === 'error'),
      '3a: error is last',
    )
  }

  // 3b: Instant fail → reject subsequent
  {
    const a = mkAdapter(createFaultyExecutor(0, 'instant'))
    await drain(a.chatStream('t', new AbortController()))
    assert(a.status === 'error', '3b: error')
    const events = await drain(a.chatStream('retry', new AbortController()))
    assert(events[0]?.type === 'error', '3b: rejected')
  }

  // 3c: Mixed error/abort/normal across adapters
  {
    const e1 = await drain(
      mkAdapter(createFaultyExecutor(2, 'f1')).chatStream('t', new AbortController()),
    )
    assert(
      e1.some((e) => e.type === 'error'),
      '3c-i: error',
    )

    const a2 = mkAdapter(createStreamExecutor(100, 5))
    const g2 = a2.chatStream('t', new AbortController())
    await g2.next()
    a2.interrupt()
    await drain(g2)
    assert(a2.status === 'killed', '3c-ii: killed')

    const e3 = await drain(
      mkAdapter(createStreamExecutor(5)).chatStream('t', new AbortController()),
    )
    assert(
      e3.some((e) => e.type === 'done'),
      '3c-iii: normal',
    )
  }

  // 3d: Repeated error→new-adapter recovery
  for (let i = 0; i < CONFIG.rounds * 2; i++) {
    const a = mkAdapter(createFaultyExecutor(1, `f${i}`))
    await drain(a.chatStream('t', new AbortController()))
    assert(a.status === 'error', `3d-${i}: error`)
    const a2 = mkAdapter(createStreamExecutor(3))
    await drain(a2.chatStream('t', new AbortController()))
    assert(a2.status === 'idle', `3d-${i}: recovery idle`)
  }

  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Flood
// ═══════════════════════════════════════════════════════════════════════════

async function s4_Flood(): Promise<{ p: number; f: number }> {
  const N = CONFIG.floodEvents
  header(`4. Flood (${N.toLocaleString()} events)`)

  const adapter = mkAdapter(createStreamExecutor(N))
  const start = performance.now()
  const events = await drain(adapter.chatStream('flood', new AbortController()))
  const elapsed = (performance.now() - start).toFixed(0)

  assert(adapter.status === 'idle', 'idle')
  assert(
    events.some((e) => e.type === 'done'),
    'done',
  )
  assert(
    events.filter((e) => e.type === 'text_chunk').length === N,
    `all ${N} chunks (got ${events.filter((e) => e.type === 'text_chunk').length})`,
  )
  console.log(`  ⏱  ${elapsed}ms (${((N / (Number(elapsed) || 1)) * 1000).toFixed(0)} ev/s)`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. Mixed Workload
// ═══════════════════════════════════════════════════════════════════════════

async function s5_Mixed(): Promise<{ p: number; f: number }> {
  header(`5. Mixed (${CONFIG.concurrent} concurrent: normal+faulty+tool+abort)`)

  const types = ['normal', 'faulty', 'toolUse', 'aborted'] as const
  const sessions = Array.from({ length: CONFIG.concurrent }, (_, i) => {
    const flavor = types[i % types.length]
    let executor: QueryExecutor
    switch (flavor) {
      case 'faulty':
        executor = createFaultyExecutor((i % 10) + 1, `fail-${i}`)
        break
      case 'toolUse':
        executor = createMixedExecutor()
        break
      case 'aborted':
        executor = createStreamExecutor(300, Math.max(CONFIG.abGap, 1))
        break
      default:
        executor = createStreamExecutor(CONFIG.events, 0)
    }
    return { adapter: mkAdapter(executor), flavor, id: i }
  })

  const abortTimers: ReturnType<typeof setTimeout>[] = []
  for (const { adapter, flavor } of sessions) {
    if (flavor === 'aborted') {
      abortTimers.push(setTimeout(() => adapter.interrupt(), 1 + Math.random() * 5))
    }
  }

  const results = await Promise.all(
    sessions.map(async ({ adapter, id, flavor }) => {
      const events = await drain(adapter.chatStream(`m-${id}`, new AbortController()))
      return { id, flavor, events, status: adapter.status }
    }),
  )
  abortTimers.forEach(clearTimeout)

  for (const r of results) {
    switch (r.flavor) {
      case 'normal':
        assert(r.status === 'idle', `m${r.id} normal: idle`)
        assert(
          r.events.some((e) => e.type === 'done'),
          `m${r.id} normal: done`,
        )
        break
      case 'faulty':
        assert(r.status === 'error', `m${r.id} faulty: error`)
        assert(r.events.filter((e) => e.type === 'done').length === 0, `m${r.id} faulty: no done`)
        break
      case 'toolUse':
        assert(r.status === 'idle', `m${r.id} tool: idle`)
        assert(
          r.events.some((e) => e.type === 'tool_call_start'),
          `m${r.id} tool: start`,
        )
        assert(
          r.events.some((e) => e.type === 'tool_call_end'),
          `m${r.id} tool: end`,
        )
        break
      case 'aborted':
        assert(r.status === 'killed', `m${r.id} abort: killed`)
        assert(r.events.filter((e) => e.type === 'done').length === 0, `m${r.id} abort: no done`)
        break
    }
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  6. Memory Pressure
// ═══════════════════════════════════════════════════════════════════════════

async function s6_Memory(): Promise<{ p: number; f: number }> {
  const cycles = CONFIG.rounds * 30
  header(`6. Memory (${cycles} create/dispose)`)

  const start = performance.now()
  for (let i = 0; i < cycles; i++) {
    const a = mkAdapter(createStreamExecutor(20))
    await drain(a.chatStream(`m-${i}`, new AbortController()))
    a.dispose()
    if (i % 100 === 99 && typeof Bun.gc === 'function') Bun.gc(false)
  }
  const elapsed = (performance.now() - start).toFixed(0)
  assert(true, `survived ${cycles}`)
  console.log(`  ⏱  ${elapsed}ms (${((cycles / (Number(elapsed) || 1)) * 1000).toFixed(0)} cyc/s)`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  7. Protocol Integrity
// ═══════════════════════════════════════════════════════════════════════════

async function s7_Protocol(): Promise<{ p: number; f: number }> {
  header(`7. Protocol (${CONFIG.rounds * 15} streams)`)

  const VALID = new Set([
    'session',
    'text_chunk',
    'tool_call_start',
    'tool_call_end',
    'error',
    'done',
  ])

  for (let i = 0; i < CONFIG.rounds * 15; i++) {
    const executor =
      i % 3 === 0
        ? createFaultyExecutor(5, `f${i}`)
        : i % 3 === 1
          ? createMixedExecutor()
          : createStreamExecutor(30)

    const a = mkAdapter(executor)
    const events = await drain(a.chatStream(`p-${i}`, new AbortController()))

    for (const ev of events) {
      assert(VALID.has(ev.type as string), `p${i}: valid '${(ev as any).type}'`)
      switch (ev.type) {
        case 'text_chunk':
          assert(typeof ev.content === 'string', `p${i}: chunk.content`)
          break
        case 'tool_call_start':
          assert(typeof ev.toolUseId === 'string', `p${i}: start.id`)
          assert(typeof ev.name === 'string', `p${i}: start.name`)
          break
        case 'tool_call_end':
          assert(typeof ev.toolUseId === 'string', `p${i}: end.id`)
          break
        case 'error':
          assert(typeof ev.message === 'string', `p${i}: err.msg`)
          break
        case 'done':
          break
      }
    }

    const nonError = events.filter((e) => e.type !== 'error')
    if (nonError.length > 0) {
      assert(
        nonError[nonError.length - 1].type === 'done' || a.status === 'error',
        `p${i}: last-non-err is done (was ${nonError[nonError.length - 1].type})`,
      )
    }
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  8. Backpressure
// ═══════════════════════════════════════════════════════════════════════════

async function s8_Backpressure(): Promise<{ p: number; f: number }> {
  header(`8. Backpressure (${CONFIG.events} events, slow consumer)`)

  const a = mkAdapter(createStreamExecutor(CONFIG.events, 0))
  const gen = a.chatStream('slow', new AbortController())
  let count = 0
  for await (const ev of gen) {
    count++
    if (ev.type === 'text_chunk' && count % 20 === 0) {
      await new Promise((r) => setTimeout(r, 1))
    }
    if (count > CONFIG.events) break
  }
  assert(count > 0, 'consumed')
  assert(count <= CONFIG.events + 1, 'within range')
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
//  9. Chaos Monkey
// ═══════════════════════════════════════════════════════════════════════════

async function s9_Chaos(): Promise<{ p: number; f: number }> {
  header(`9. Chaos Monkey (${CONFIG.chaosMs}ms)`)

  const adapters: ReturnType<typeof mkAdapter>[] = []
  const dead = performance.now() + CONFIG.chaosMs
  let created = 0,
    aborted = 0,
    errored = 0,
    disposed = 0

  while (performance.now() < dead) {
    const action = Math.random()
    if (action < 0.4 && adapters.length < CONFIG.concurrent) {
      const a = mkAdapter(createStreamExecutor(100, CONFIG.abGap))
      adapters.push(a)
      created++
      a.chatStream(`chaos-${created}`, new AbortController())
        .next()
        .catch(() => {})
    } else if (action < 0.55 && adapters.length > 0) {
      adapters[Math.floor(Math.random() * adapters.length)].interrupt()
      aborted++
    } else if (action < 0.6 && adapters.length > 0) {
      const idx = Math.floor(Math.random() * adapters.length)
      adapters[idx].dispose()
      adapters.splice(idx, 1)
      disposed++
    } else if (action < 0.62) {
      mkAdapter(createFaultyExecutor(Math.floor(Math.random() * 5), 'chaos-err'))
        .chatStream('ce', new AbortController())
        .next()
        .catch(() => {})
      errored++
    }
  }

  for (const a of adapters) a.dispose()
  assert(created > 0, `created=${created}`)
  console.log(`  created=${created} aborted=${aborted} errored=${errored} disposed=${disposed}`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Abort Storm
// ═══════════════════════════════════════════════════════════════════════════

async function s10_AbortStorm(): Promise<{ p: number; f: number }> {
  const N = CONFIG.concurrent * 2
  header(`10. Abort Storm (${N} adapters, simultaneous abort)`)

  const adapters = Array.from({ length: N }, () =>
    mkAdapter(createStreamExecutor(500, Math.max(CONFIG.abGap, 1))),
  )
  const generators = adapters.map((a, i) => ({
    gen: a.chatStream(`as-${i}`, new AbortController()),
    adapter: a,
    id: i,
  }))

  await Promise.all(
    generators.map(async ({ gen }) => {
      await gen.next()
    }),
  )
  for (const { adapter } of generators) adapter.interrupt()

  const results = await Promise.all(
    generators.map(async ({ gen, adapter, id }) => {
      await drain(gen)
      return { id, status: adapter.status }
    }),
  )

  for (const r of results) assert(r.status === 'killed', `as${r.id}: killed (was ${r.status})`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. Oscillation Hell
// ═══════════════════════════════════════════════════════════════════════════

async function s11_Oscillation(): Promise<{ p: number; f: number }> {
  const cycles = CONFIG.rounds * 20
  header(`11. Oscillation (${cycles} idle→done cycles, 1 adapter)`)

  const adapter = mkAdapter(createStreamExecutor(5))
  for (let i = 0; i < cycles; i++) {
    const events = await drain(adapter.chatStream(`o-${i}`, new AbortController()))
    assert(adapter.status === 'idle', `o${i}: idle`)
    assert(
      events.some((e) => e.type === 'done'),
      `o${i}: done`,
    )
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. Create/Dispose Tsunami
// ═══════════════════════════════════════════════════════════════════════════

async function s12_Tsunami(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 50
  header(`12. Create/Dispose Tsunami (${N} create→start→dispose)`)

  const start = performance.now()
  for (let i = 0; i < N; i++) {
    const a = mkAdapter(createStreamExecutor(3))
    const gen = a.chatStream(`tsu-${i}`, new AbortController())
    await gen.next()
    a.dispose()
    await drain(gen)
  }
  const elapsed = (performance.now() - start).toFixed(0)
  assert(true, `survived ${N}`)
  console.log(`  ⏱  ${elapsed}ms (${((N / (Number(elapsed) || 1)) * 1000).toFixed(0)} cyc/s)`)
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 13. Nested Abort Hell (嵌套中止地狱)
// ═══════════════════════════════════════════════════════════════════════════

async function s13_NestedAbort(): Promise<{ p: number; f: number }> {
  const depth = CONFIG.rounds
  header(`13. Nested Abort (depth=${depth}, abort+recovery cycles)`)

  for (let d = 0; d < depth; d++) {
    // Adapter 1: start streaming, abort partway
    const a1 = mkAdapter(createStreamExecutor(200, Math.max(CONFIG.abGap, 1)))
    const g1 = a1.chatStream(`n1-${d}`, new AbortController())
    let c = 0
    for await (const _ev of g1) {
      c++
      if (c >= 3) {
        a1.interrupt()
        break
      }
    }
    await drain(g1)
    assert(a1.status === 'killed', `n${d}a: killed`)

    // Adapter 2 (new): start streaming, abort again — nested abort pattern
    const a2 = mkAdapter(createStreamExecutor(100, Math.max(CONFIG.abGap, 1)))
    const g2 = a2.chatStream(`n2-${d}`, new AbortController())
    c = 0
    for await (const _ev of g2) {
      c++
      if (c >= 2) {
        a2.interrupt()
        break
      }
    }
    await drain(g2)
    assert(a2.status === 'killed', `n${d}b: killed`)

    // Adapter 3 (new): let it finish normally — verifies no state leak
    const a3 = mkAdapter(createStreamExecutor(30))
    const g3 = a3.chatStream(`n3-${d}`, new AbortController())
    const events = await drain(g3)
    assert(
      events.some((e) => e.type === 'done'),
      `n${d}c: final recovery done`,
    )
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 14. Double Interrupt (双重中断)
// ═══════════════════════════════════════════════════════════════════════════

async function s14_DoubleInterrupt(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 5
  header(`14. Double Interrupt (${N} cycles: interrupt ×2)`)

  for (let i = 0; i < N; i++) {
    const adapter = mkAdapter(createStreamExecutor(100, Math.max(CONFIG.abGap, 1)))
    const gen = adapter.chatStream(`di-${i}`, new AbortController())
    await gen.next()
    adapter.interrupt()
    adapter.interrupt() // double tap — must be idempotent
    await drain(gen)
    assert(adapter.status === 'killed', `di${i}: killed after double interrupt`)
    // Verify adapter is still usable after double interrupt
    const gen2 = adapter.chatStream(`di2-${i}`, new AbortController())
    const events = await drain(gen2)
    assert(events.length > 0, `di${i}: usable after double interrupt`)
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 15. Dispose Race (销毁竞态)
// ═══════════════════════════════════════════════════════════════════════════

async function s15_DisposeRace(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 10
  header(`15. Dispose Race (${N} cycles: dispose during stream)`)

  for (let i = 0; i < N; i++) {
    const adapter = mkAdapter(createStreamExecutor(50, Math.max(CONFIG.abGap, 1)))
    const gen = adapter.chatStream(`dr-${i}`, new AbortController())

    // Consume some events
    let c = 0
    for await (const _ev of gen) {
      c++
      if (c >= (i % 5) + 1) break
    }
    assert(c > 0, `dr${i}: consumed ${c}`)

    // Dispose while stream may still be active
    adapter.dispose()

    // Drain remaining — should handle disposed state gracefully
    const remaining = await drain(gen)
    // After dispose, status should be killed
    assert(adapter.status === 'killed', `dr${i}: killed after dispose`)
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 16. Event Ordering Fuzzing (事件排序模糊测试)
// ═══════════════════════════════════════════════════════════════════════════

async function s16_Ordering(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 10
  header(`16. Event Ordering (${N} streams, validate event sequence)`)

  for (let i = 0; i < N; i++) {
    const adapter = mkAdapter(createMixedExecutor())
    const events = await drain(adapter.chatStream(`eo-${i}`, new AbortController()))

    // Extract event type sequence
    const types = events.map((e) => e.type)

    // Rules:
    // 1. 'done' can only appear at most once
    assert(types.filter((t) => t === 'done').length <= 1, `eo${i}: ≤1 done`)

    // 2. If 'done' appears, it must be the last non-error event
    const doneIdx = types.indexOf('done')
    if (doneIdx >= 0) {
      const after = types.slice(doneIdx + 1).filter((t) => t !== 'error')
      assert(after.length === 0, `eo${i}: nothing after done except errors`)
    }

    // 3. 'tool_call_start' before 'tool_call_end' for same id
    const starts = events.filter((e) => e.type === 'tool_call_start')
    const ends = events.filter((e) => e.type === 'tool_call_end')
    for (const s of starts) {
      const matchingEnd = ends.find((e) => e.toolUseId === s.toolUseId)
      if (matchingEnd) {
        const sIdx = events.indexOf(s)
        const eIdx = events.indexOf(matchingEnd)
        assert(sIdx < eIdx, `eo${i}: tool_call_start(${s.toolUseId}) before end`)
      }
    }

    // 4. First event should not be 'done' or 'tool_call_end'
    if (types.length > 0) {
      assert(types[0] !== 'done', `eo${i}: first not done`)
      assert(types[0] !== 'tool_call_end', `eo${i}: first not tool_call_end`)
    }
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 17. Stubborn Executor (顽固执行器——忽略中止继续产事件)
// ═══════════════════════════════════════════════════════════════════════════

async function s17_Stubborn(): Promise<{ p: number; f: number }> {
  header(`17. Stubborn Executor (abort ignored by executor, ${CONFIG.rounds * 5} cycles)`)

  for (let i = 0; i < CONFIG.rounds * 5; i++) {
    const adapter = mkAdapter(createStubbornExecutor(100))
    const gen = adapter.chatStream(`st-${i}`, new AbortController())

    // Consume a few events
    let c = 0
    for await (const _ev of gen) {
      c++
      if (c >= 3) break
    }

    // Abort — executor ignores it and keeps yielding, but adapter should stop
    adapter.interrupt()
    const remaining = await drain(gen)
    assert(adapter.status === 'killed', `st${i}: killed despite stubborn executor`)
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 18. Abort-Without-Consume (中止但不消费)
// ═══════════════════════════════════════════════════════════════════════════

async function s18_AbortNoConsume(): Promise<{ p: number; f: number }> {
  const N = CONFIG.rounds * 10
  header(`18. Abort-Without-Consume (${N} cycles: abort before first event)`)

  for (let i = 0; i < N; i++) {
    const adapter = mkAdapter(createStreamExecutor(100, Math.max(CONFIG.abGap, 1)))
    const gen = adapter.chatStream(`an-${i}`, new AbortController())

    // Abort immediately without consuming any events
    adapter.interrupt()
    const events = await drain(gen)
    assert(adapter.status === 'killed', `an${i}: killed before consume`)
    assert(events.filter((e) => e.type === 'done').length === 0, `an${i}: no done`)
  }
  return done()
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`🧪 Agent Adapter Stress Test — ${MODE.toUpperCase()}`)
  console.log(
    `   r=${CONFIG.rounds} c=${CONFIG.concurrent} ev=${CONFIG.events} flood=${CONFIG.floodEvents.toLocaleString()} chaos=${CONFIG.chaosMs}ms abGap=${CONFIG.abGap}`,
  )

  const totalStart = performance.now()
  let grandPassed = 0
  let grandFailed = 0

  const scenarios: Array<[string, () => Promise<{ p: number; f: number }>]> = [
    ['Concurrent Sessions', s1_Concurrent],
    ['Abort & Recovery', s2_AbortRecovery],
    ['Error Recovery', s3_ErrorRecovery],
    ['Flood', s4_Flood],
    ['Mixed Workload', s5_Mixed],
    ['Memory Pressure', s6_Memory],
    ['Protocol Integrity', s7_Protocol],
    ['Backpressure', s8_Backpressure],
    ['Chaos Monkey', s9_Chaos],
    ['Abort Storm', s10_AbortStorm],
    ['Oscillation Hell', s11_Oscillation],
    ['Create/Dispose Tsunami', s12_Tsunami],
    ['Nested Abort Hell', s13_NestedAbort],
    ['Double Interrupt', s14_DoubleInterrupt],
    ['Dispose Race', s15_DisposeRace],
    ['Event Ordering Fuzzing', s16_Ordering],
    ['Stubborn Executor', s17_Stubborn],
    ['Abort-Without-Consume', s18_AbortNoConsume],
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
  console.log(
    `  Mode ${MODE}  Rounds ${CONFIG.rounds}  Concurrent ${CONFIG.concurrent}  Events ${CONFIG.events}`,
  )
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
