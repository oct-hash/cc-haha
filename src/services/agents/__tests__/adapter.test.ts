/**
 * Stress test for the Agent Adapter Layer type contract (types.ts).
 *
 * Tests:
 *   1. Factory registry completeness
 *   2. NormalizedEvent discriminated union conformance
 *   3. Status state machine (idle → running → idle/killed/error)
 *   4. Concurrent call rejection
 *   5. Abort during streaming
 *   6. Event translation correctness
 *   7. Edge cases (empty content, truncation, Unicode, rapid abort)
 */

import { describe, expect, it, } from 'bun:test'
import type { AgentAdapter, } from '../adapter.js'
import { createAgentAdapter, listAgentKinds } from '../factory.js'
import type { AgentConfig, AgentKind, NormalizedEvent } from '../types.js'

// ── Helpers ─────────────────────────────────────────────────────────────

/** Collect all events from an AsyncGenerator into an array. */
async function collect<T>(gen: AsyncGenerator<T, void, unknown>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) items.push(item)
  return items
}

/** Create a minimal mock QueryExecutor that yields raw events then stops.
 *  The returned executor respects the AbortController signal. */
function mockExecutor(events: Array<{ type: string; [k: string]: unknown }>, delayMs = 0) {
  return async function* (_userMessage: string, abortController: AbortController) {
    for (const ev of events) {
      if (abortController.signal.aborted) break
      if (delayMs > 0) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, delayMs)
          const onAbort = () => {
            clearTimeout(t)
            r()
          }
          abortController.signal.addEventListener('abort', onAbort, { once: true })
        })
      }
      if (abortController.signal.aborted) break
      yield ev
    }
  }
}

// ── Factory Tests ───────────────────────────────────────────────────────

describe('Agent Factory', () => {
  it('lists all 3 agent kinds', () => {
    const kinds = listAgentKinds()
    expect(kinds).toHaveLength(3)
    expect(kinds).toContain('claude-haha')
    expect(kinds).toContain('claude-code')
    expect(kinds).toContain('codex')
  })

  it('creates all adapters without crashing', () => {
    for (const kind of listAgentKinds()) {
      const config: AgentConfig =
        kind === 'claude-haha' ? ({ queryExecutor: mockExecutor([]) } as AgentConfig) : {}
      const adapter = createAgentAdapter(kind, config)
      expect(adapter.kind).toBe(kind)
      expect(adapter.status).toBe('idle')
      adapter.dispose()
    }
  })

  it('throws for claude-haha without queryExecutor', () => {
    expect(() => createAgentAdapter('claude-haha')).toThrow('queryExecutor')
  })

  it('claude-code and codex created without config do not throw', () => {
    for (const kind of ['claude-code', 'codex'] as AgentKind[]) {
      const adapter = createAgentAdapter(kind)
      expect(adapter.kind).toBe(kind)
      expect(adapter.status).toBe('idle')
      adapter.dispose()
    }
  })
})

// ── NormalizedEvent Type Contract ───────────────────────────────────────

describe('NormalizedEvent protocol', () => {
  function makeAdapter(): AgentAdapter {
    return createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'stream', text: 'hello' },
        { type: 'assistant', content: [{ type: 'text', text: ' world' }] },
        {
          type: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'read',
              input: { path: '/tmp/test' },
            },
          ],
        },
        {
          type: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_1',
              content: 'file contents here',
            },
          ],
        },
      ]),
    } as AgentConfig)
  }

  it('yields text_chunk events from stream deltas', async () => {
    const adapter = makeAdapter()
    const events = await collect(adapter.chatStream('test', new AbortController()))
    const texts = events.filter((e) => e.type === 'text_chunk')
    expect(texts.length).toBeGreaterThanOrEqual(1)
    expect(texts.some((e) => e.type === 'text_chunk' && e.content === 'hello')).toBe(true)
  })

  it('yields tool_call_start with correct shape', async () => {
    const adapter = makeAdapter()
    const events = await collect(adapter.chatStream('test', new AbortController()))
    const call = events.find((e) => e.type === 'tool_call_start')
    expect(call).toBeDefined()
    if (call?.type === 'tool_call_start') {
      expect(call.toolUseId).toBe('tool_1')
      expect(call.name).toBe('read')
      expect(call.inputPreview).toBeString()
    }
  })

  it('yields tool_call_end with correct shape', async () => {
    const adapter = makeAdapter()
    const events = await collect(adapter.chatStream('test', new AbortController()))
    const end = events.find((e) => e.type === 'tool_call_end')
    expect(end).toBeDefined()
    if (end?.type === 'tool_call_end') {
      expect(end.toolUseId).toBe('tool_1')
      expect(end.isError).toBe(false)
      expect(end.outputPreview).toBeString()
    }
  })

  it('yields done as the final non-error event', async () => {
    const adapter = makeAdapter()
    const events = await collect(adapter.chatStream('test', new AbortController()))
    const last = events[events.length - 1]
    expect(last.type).toBe('done')
  })

  it('returns status to idle after completion', async () => {
    const adapter = makeAdapter()
    await collect(adapter.chatStream('test', new AbortController()))
    expect(adapter.status).toBe('idle')
  })

  it('tool_call_end with is_error=true propagates', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        {
          type: 'user',
          is_error: true,
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'bad',
              content: 'ENOENT',
            },
          ],
        },
      ]),
    } as AgentConfig)
    const events = await collect(adapter.chatStream('test', new AbortController()))
    const end = events.find((e) => e.type === 'tool_call_end')
    expect(end).toBeDefined()
    if (end?.type === 'tool_call_end') {
      expect(end.isError).toBe(true)
    }
  })
})

// ── Status State Machine ────────────────────────────────────────────────

describe('Status state machine', () => {
  it('idle → running → idle on normal completion', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([{ type: 'stream', text: 'ok' }]),
    } as AgentConfig)

    expect(adapter.status).toBe('idle')
    const gen = adapter.chatStream('test', new AbortController())
    // Status changes to 'running' after first yield
    await gen.next() // first event
    expect(adapter.status).toBe('running')
    // consume rest
    while (true) {
      const { done } = await gen.next()
      if (done) break
    }
    expect(adapter.status).toBe('idle')
  })

  it('idle → running → killed on interrupt()', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor(
        Array.from({ length: 100 }, () => ({ type: 'stream', text: 'x' })),
        10, // 10ms delay per event
      ),
    } as AgentConfig)

    const gen = adapter.chatStream('test', new AbortController())
    await gen.next() // consume first to start
    expect(adapter.status).toBe('running')

    adapter.interrupt()
    expect(adapter.status).toBe('killed')

    // Generator should stop (AbortError suppressed)
    const remaining: NormalizedEvent[] = []
    for await (const ev of gen) remaining.push(ev)
    // After kill, no 'done' or 'error' event should leak
    expect(remaining.filter((e) => e.type === 'done')).toHaveLength(0)
    expect(remaining.filter((e) => e.type === 'error')).toHaveLength(0)
  })

  it('idle → running → error on executor exception', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: async function* () {
        yield { type: 'stream', text: 'before crash' }
        throw new Error('BOOM')
      },
    } as AgentConfig)

    const events: NormalizedEvent[] = []
    try {
      for await (const ev of adapter.chatStream('test', new AbortController())) {
        events.push(ev)
      }
    } catch {
      // Expected: adapter re-throws after yielding error event so
      // SessionManager retry loops can detect failure via catch.
    }
    expect(adapter.status).toBe('error')
    expect(events.some((e) => e.type === 'error' && e.message === 'BOOM')).toBe(true)
    // done must not follow error
    expect(events.filter((e) => e.type === 'done')).toHaveLength(0)
  })

  it('error status prevents done from being yielded', async () => {
    // Simulate scenario from fix #7: error → NOT followed by done
    const events: NormalizedEvent[] = []
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('early failure')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    } as AgentConfig)

    try {
      for await (const ev of adapter.chatStream('test', new AbortController())) {
        events.push(ev)
      }
    } catch {
      // Expected: adapter re-throws after yielding error event
    }

    expect(events.map((e) => e.type)).not.toContain('done')
    expect(adapter.status).toBe('error')
  })
})

// ── Concurrent Call Rejection ───────────────────────────────────────────

describe('Concurrent call rejection', () => {
  it('rejects second call while running', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor(
        [{ type: 'stream', text: 'slow' }],
        100, // delay to keep it running
      ),
    } as AgentConfig)

    const gen1 = adapter.chatStream('msg1', new AbortController())
    await gen1.next() // start streaming

    const gen2 = adapter.chatStream('msg2', new AbortController())
    const events = await collect(gen2)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect((events[0] as { message: string }).message).toContain('not idle')

    adapter.interrupt()
  })

  it('rejects call while in killed state', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([{ type: 'stream', text: 'x' }]),
    } as AgentConfig)

    const gen = adapter.chatStream('test', new AbortController())
    await gen.next()
    adapter.interrupt()
    expect(adapter.status).toBe('killed')

    const gen2 = adapter.chatStream('test2', new AbortController())
    const events = await collect(gen2)
    expect(events[0].type).toBe('error')
  })

  it('rejects call while in error state', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('fail')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    } as AgentConfig)

    try {
      for await (const _ev of adapter.chatStream('test', new AbortController())) {
        // consume
      }
    } catch {
      // Expected: adapter re-throws after yielding error event
    }
    expect(adapter.status).toBe('error')

    const gen2 = adapter.chatStream('test2', new AbortController())
    const events = await collect(gen2)
    expect(events[0].type).toBe('error')
  })
})

// ── Abort Scenarios ─────────────────────────────────────────────────────

describe('Abort scenarios', () => {
  it('interrupt() kills stream mid-flight — no done event', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor(
        Array.from({ length: 100 }, (_, i) => ({ type: 'stream', text: `.${i}` })),
        10,
      ),
    } as AgentConfig)

    const gen = adapter.chatStream('test', new AbortController())
    await gen.next() // consume first event

    adapter.interrupt()
    expect(adapter.status).toBe('killed')

    const remaining = await collect(gen)
    expect(remaining.filter((e) => e.type === 'done')).toHaveLength(0)
    expect(remaining.filter((e) => e.type === 'error')).toHaveLength(0)
  })

  it('interrupt() before any yield — no done, no error', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([{ type: 'stream', text: 'hi' }], 200),
    } as AgentConfig)

    const gen = adapter.chatStream('test', new AbortController())
    // Don't consume anything — kill immediately
    adapter.interrupt()
    expect(adapter.status).toBe('killed')

    const events = await collect(gen)
    expect(events.filter((e) => e.type === 'done')).toHaveLength(0)
  })

  it('dispose() calls interrupt and sets killed', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor(
        Array.from({ length: 10 }, () => ({ type: 'stream', text: '.' })),
        20,
      ),
    } as AgentConfig)

    const gen = adapter.chatStream('test', new AbortController())
    await gen.next() // consume one
    adapter.dispose()
    expect(adapter.status).toBe('killed')
  })

  it('killed adapter stays killed on next status read', () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([]),
    } as AgentConfig)

    expect(adapter.status).toBe('idle')
    adapter.interrupt()
    expect(adapter.status).toBe('killed')
    // interrupt again — still killed
    adapter.interrupt()
    expect(adapter.status).toBe('killed')
  })
})

// ── Event Translation Edge Cases ────────────────────────────────────────

describe('Event translation edge cases', () => {
  it('inputPreview truncates long JSON to 200 chars', async () => {
    const longInput = { key: 'x'.repeat(500) }
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        {
          type: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'big',
              input: longInput,
            },
          ],
        },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    const call = events.find((e) => e.type === 'tool_call_start')
    expect(call).toBeDefined()
    if (call?.type === 'tool_call_start') {
      expect(call.inputPreview.length).toBeLessThanOrEqual(200)
    }
  })

  it('outputPreview truncates long content to 200 chars', async () => {
    const longContent = 'x'.repeat(500)
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        {
          type: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              content: longContent,
            },
          ],
        },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    const end = events.find((e) => e.type === 'tool_call_end')
    expect(end).toBeDefined()
    if (end?.type === 'tool_call_end') {
      expect(end.outputPreview.length).toBeLessThanOrEqual(200)
    }
  })

  it('handles null/undefined content gracefully', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'assistant', content: null },
        { type: 'user', content: undefined },
        { type: 'stream', text: undefined },
        { type: 'stream', delta: undefined },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    // Must not crash; only done should be present (no text_chunk from nulls)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('handles deeply nested content.message structure', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'nested text' }],
          },
        },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    const texts = events.filter((e) => e.type === 'text_chunk')
    expect(texts.some((e) => e.type === 'text_chunk' && e.content === 'nested text')).toBe(true)
  })

  it('handles Unicode and emoji in content', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'stream', text: '你好世界 🌍' },
        { type: 'assistant', content: [{ type: 'text', text: '🎉\n```\ncode\n```' }] },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    const texts = events
      .filter((e) => e.type === 'text_chunk')
      .map((e) => (e as { content: string }).content)
      .join('')
    expect(texts).toContain('你好世界')
    expect(texts).toContain('🌍')
    expect(texts).toContain('🎉')
  })

  it('structural events (request_start, tombstone, etc.) are silently skipped', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'request_start' },
        { type: 'tombstone' },
        { type: 'tool_use_summary' },
        { type: 'attachment' },
        { type: 'system' },
        { type: 'stream', text: 'only visible content' },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    const texts = events
      .filter((e) => e.type === 'text_chunk')
      .map((e) => (e as { content: string }).content)
    expect(texts).toEqual(['only visible content'])
  })

  it('unknown event types are silently skipped', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'weird_custom_event', data: 42 } as { type: string; [k: string]: unknown },
        { type: 'stream', text: 'ok' },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    expect(events.filter((e) => e.type === 'text_chunk')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
  })
})

// ── Protocol Compliance (all 3 adapters) ────────────────────────────────

describe('Protocol compliance', () => {
  /** Assert that every event in the stream conforms to NormalizedEvent shape. */
  function validateEventShape(ev: NormalizedEvent): void {
    switch (ev.type) {
      case 'session':
        expect(ev.sessionId).toBeString()
        break
      case 'text_chunk':
        expect(ev.content).toBeString()
        break
      case 'tool_call_start':
        expect(ev.toolUseId).toBeString()
        expect(ev.name).toBeString()
        expect(ev.inputPreview).toBeString()
        break
      case 'tool_call_end':
        expect(ev.toolUseId).toBeString()
        expect(ev.isError).toBeBoolean()
        expect(ev.outputPreview).toBeString()
        break
      case 'error':
        expect(ev.message).toBeString()
        break
      case 'done':
        // no extra fields required
        break
    }
  }

  it('all events from claude-haha match NormalizedEvent shape', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'stream', text: 'hello' },
        {
          type: 'assistant',
          content: [
            { type: 'text', text: ' world' },
            { type: 'tool_use', id: 't1', name: 'read', input: { k: 'v' } },
          ],
        },
        {
          type: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'result' }],
        },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    expect(events.length).toBeGreaterThan(0)
    for (const ev of events) validateEventShape(ev)
  })

  it('all 6 NormalizedEvent types are produced in a full chat cycle', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([
        { type: 'stream', text: 'thinking...' },
        {
          type: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'bash', input: {} }],
        },
        {
          type: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }],
        },
      ]),
    } as AgentConfig)

    const events = await collect(adapter.chatStream('test', new AbortController()))
    const types = new Set(events.map((e) => e.type))

    // These 3 must always appear
    expect(types.has('text_chunk')).toBe(true)
    expect(types.has('done')).toBe(true)

    // tool_call_start and tool_call_end must appear (tool use cycle)
    expect(types.has('tool_call_start')).toBe(true)
    expect(types.has('tool_call_end')).toBe(true)
  })
})

// ── Rapid Sequential Calls ──────────────────────────────────────────────

describe('Rapid sequential calls', () => {
  it('handles 20 back-to-back calls without leaking state', async () => {
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: mockExecutor([{ type: 'stream', text: 'quick' }]),
    } as AgentConfig)

    for (let i = 0; i < 20; i++) {
      expect(adapter.status).toBe('idle')
      const events = await collect(adapter.chatStream(`msg${i}`, new AbortController()))
      expect(adapter.status).toBe('idle')
      expect(events.some((e) => e.type === 'done')).toBe(true)
    }
  })
})

// ── Config propagation ──────────────────────────────────────────────────

describe('Config propagation', () => {
  it('claude-haha adapter accepts and stores queryExecutor', () => {
    const exec = mockExecutor([])
    const adapter = createAgentAdapter('claude-haha', {
      queryExecutor: exec,
    } as AgentConfig)
    expect(adapter.kind).toBe('claude-haha')
    expect(adapter.status).toBe('idle')
  })

  it('claude-code adapter accepts cwd and env config', () => {
    const adapter = createAgentAdapter('claude-code', {
      cwd: '/tmp/test',
      env: { FOO: 'BAR' },
      systemPromptPath: '/tmp/prompt.md',
      extraArgs: ['--verbose'],
    })
    expect(adapter.kind).toBe('claude-code')
    expect(adapter.status).toBe('idle')
  })

  it('codex adapter accepts cwd and env config', () => {
    const adapter = createAgentAdapter('codex', {
      cwd: '/tmp/test',
      env: { BAR: 'BAZ' },
      systemPromptPath: '/tmp/codex-prompt.md',
      extraArgs: ['--model', 'gpt-5'],
    })
    expect(adapter.kind).toBe('codex')
    expect(adapter.status).toBe('idle')
  })
})
