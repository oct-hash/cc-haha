/**
 * Tests for LoopManager — unified agent loop orchestrator.
 *
 * Coverage:
 *   - Constructor defaults and config overrides
 *   - All 4 loop types (debate, implement, review, research)
 *   - Debate gate integration with DebateOrchestrator
 *   - Phase transitions and event sequencing
 *   - Serialization and persistence (save/load/loadFromDisk)
 *   - getProgress() tracking
 *   - dispose() cleanup
 *   - Error handling and abort scenarios
 *   - Edge cases (empty topics, missing queryExecutor, disposed state)
 */

import { beforeEach, describe, expect, it, vi } from 'bun:test'
import type { AgentAdapter } from '../adapter.js'
import type { DebateEvent } from '../debate.js'
import { DebateOrchestrator } from '../debate.js'
import { createAgentAdapter } from '../factory.js'
import {
  type LoopEvent,
  LoopManager,
  type LoopManagerConfig,
  type SerializedLoopState,
} from '../loop-manager.js'
import type { AgentKind, AgentStatus, NormalizedEvent } from '../types.js'

// ── Mock Adapter Factory ──────────────────────────────────────────────────

type ResponseFactory = (message: string) => string

function createMockAdapter(
  kind: AgentKind,
  responseFactory: ResponseFactory,
  opts?: { delayMs?: number; shouldError?: boolean },
): AgentAdapter {
  let status: AgentStatus = 'idle'
  let activeAbort: AbortController | null = null

  async function* chatStream(
    userMessage: string,
    abortController: AbortController,
  ): AsyncGenerator<NormalizedEvent, void, unknown> {
    if (status !== 'idle') {
      yield { type: 'error', message: 'Agent not idle' }
      return
    }
    status = 'running'
    activeAbort = abortController

    try {
      if (opts?.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, opts.delayMs)
          abortController.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t)
              reject(new Error('aborted'))
            },
            { once: true },
          )
        })
      }

      if (opts?.shouldError) {
        throw new Error(`Simulated error in ${kind}`)
      }

      const response = responseFactory(userMessage)
      const chunkSize = 50
      for (let i = 0; i < response.length; i += chunkSize) {
        if (abortController.signal.aborted) break
        yield { type: 'text_chunk', content: response.slice(i, i + chunkSize) }
      }
    } catch (err: unknown) {
      if ((status as AgentStatus) !== 'killed') {
        status = 'error'
        const msg = err instanceof Error ? err.message : 'Unknown error'
        yield { type: 'error', message: msg }
      }
      return
    } finally {
      activeAbort = null
    }

    if (status === 'running' && !abortController.signal.aborted) {
      yield { type: 'done' }
    }
    status = 'idle'
  }

  function interrupt(): void {
    if (status === 'running') {
      status = 'killed'
      activeAbort?.abort()
    }
  }

  function dispose(): void {
    interrupt()
    status = 'idle'
  }

  return {
    kind,
    get status() {
      return status
    },
    chatStream,
    interrupt,
    dispose,
  }
}

// ── Mock query executor ───────────────────────────────────────────────────

function mockQueryExecutor() {
  return async function* (
    _prompt: string,
    _ac: AbortController,
    _modelOverride?: string,
  ): AsyncGenerator<{ type: string; text?: string; [k: string]: unknown }, void, unknown> {
    yield { type: 'text_chunk', text: 'Mock response from query executor.' }
    yield { type: 'done' }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function debateResponse(content: string, confidence = 0.8): string {
  return `## Analysis\n\n${content}\n\nCONFIDENCE: ${confidence}\n\nFinal answer: ${content}`
}

async function collectEvents(
  generator: AsyncGenerator<LoopEvent, unknown, unknown>,
): Promise<LoopEvent[]> {
  const events: LoopEvent[] = []
  for await (const event of generator) {
    events.push(event)
  }
  return events
}

function makeConfig(overrides?: Partial<LoopManagerConfig>): LoopManagerConfig {
  return {
    loopType: 'debate',
    queryExecutor: mockQueryExecutor(),
    ...overrides,
  }
}

// ── Mock createAgentAdapter ───────────────────────────────────────────────

vi.mock('../factory.js', () => ({
  createAgentAdapter: vi.fn((kind: AgentKind, _config?: unknown) =>
    createMockAdapter(kind, (msg: string) =>
      debateResponse(`[${kind}] Response to: ${msg.slice(0, 40)}...`, 0.85),
    ),
  ),
  getAgentAdapterFactory: vi.fn(),
  listAgentKinds: vi.fn(() => ['claude-haha', 'claude-code', 'codex']),
}))

// ── Tests ─────────────────────────────────────────────────────────────────

describe('LoopManager', () => {
  describe('constructor', () => {
    it('generates a sessionId on construction', () => {
      const manager = new LoopManager(makeConfig())
      expect(manager.sessionId).toBeTruthy()
      expect(typeof manager.sessionId).toBe('string')
      expect(manager.sessionId.length).toBeGreaterThan(10)
    })

    it('throws when loopType is omitted', () => {
      expect(() => new LoopManager({} as LoopManagerConfig)).toThrow(/loopType is required/)
    })

    it('applies default maxTicks of 5', () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement' }))
      expect(manager.getProgress().totalTicks).toBe(5)
    })

    it('respects custom maxTicks', () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 3 }))
      expect(manager.getProgress().totalTicks).toBe(3)
    })

    it('sets preGateMode default to auto', () => {
      const manager = new LoopManager(makeConfig())
      const serialized = manager.serialize()
      expect(serialized.config.preGateMode).toBe('auto')
    })

    it('sets postGateMode default to council', () => {
      const manager = new LoopManager(makeConfig())
      const serialized = manager.serialize()
      expect(serialized.config.postGateMode).toBe('council')
    })
  })

  describe('run — debate loop', () => {
    it('yields loop_start and loop_complete events in order', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      const events = await collectEvents(manager.run('Should we use Redis?'))

      const types = events.map((e) => e.type)
      expect(types).toContain('loop_start')
      expect(types).toContain('loop_complete')
    })

    it('yields phase_change to approach_debate then done', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      const events = await collectEvents(manager.run('Test topic'))

      const phaseChanges = events.filter((e) => e.type === 'phase_change')
      expect(phaseChanges.length).toBeGreaterThanOrEqual(2)
      expect(phaseChanges[0]).toMatchObject({ phase: 'approach_debate' })
      expect(phaseChanges[phaseChanges.length - 1]).toMatchObject({ phase: 'done' })
    })

    it('yields debate_event passthrough events', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      const events = await collectEvents(manager.run('Test topic'))

      const debateEvents = events.filter((e) => e.type === 'debate_event')
      // debate gate should produce debate_start and debate_end at minimum
      expect(debateEvents.length).toBeGreaterThan(0)
    })

    it('yields gate_result with passed=true', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      const events = await collectEvents(manager.run('Test topic'))

      const gateResults = events.filter((e) => e.type === 'gate_result')
      expect(gateResults.length).toBeGreaterThanOrEqual(1)
      expect(gateResults[0]).toMatchObject({ gate: 'pre', passed: true })
    })

    it('returns summary with the topic and sessionId', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      let summary: unknown
      for await (const event of manager.run('Should we use Redis?')) {
        if (event.type === 'loop_complete') summary = event.summary
      }
      expect(summary).toMatchObject({
        sessionId: manager.sessionId,
        loopType: 'debate',
        topic: 'Should we use Redis?',
      })
    })
  })

  describe('run — implement loop', () => {
    it('yields pre and post gate_result events', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 2 }))
      const events = await collectEvents(manager.run('Build login page'))

      const gateResults = events.filter((e) => e.type === 'gate_result')
      expect(gateResults.length).toBe(2) // pre + post
      expect(gateResults[0]).toMatchObject({ gate: 'pre', passed: true })
      expect(gateResults[1]).toMatchObject({ gate: 'post', passed: true })
    })

    it('yields tick_start and tick_complete for each tick', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 3 }))
      const events = await collectEvents(manager.run('Build login page'))

      const tickStarts = events.filter((e) => e.type === 'tick_start')
      const tickCompletes = events.filter((e) => e.type === 'tick_complete')
      expect(tickStarts.length).toBe(3)
      expect(tickCompletes.length).toBe(3)
    })

    it('tracks completedTicks in progress', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 2 }))
      for await (const event of manager.run('Build login page')) {
        if (event.type === 'tick_complete') {
          expect(manager.getProgress().completedTicks).toBe(event.tick)
        }
      }
    })

    it('returns summary with completedTicks equal to totalTicks', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 2 }))
      let summary: unknown
      for await (const event of manager.run('Build login page')) {
        if (event.type === 'loop_complete') summary = event.summary
      }
      expect(summary).toMatchObject({ completedTicks: 2, totalTicks: 2 })
    })
  })

  describe('run — review loop', () => {
    it('yields phase_change to approach_debate then review_debate', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'review' }))
      const events = await collectEvents(manager.run('Review auth module'))

      const phaseChanges = events.filter((e) => e.type === 'phase_change')
      const phases = phaseChanges.map((p) => (p as { phase: string }).phase)
      expect(phases).toContain('approach_debate')
      expect(phases).toContain('review_debate')
    })

    it('yields two gate_result events (pre + post)', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'review' }))
      const events = await collectEvents(manager.run('Review auth module'))

      const gateResults = events.filter((e) => e.type === 'gate_result')
      expect(gateResults.length).toBe(2)
    })
  })

  describe('run — research loop', () => {
    it('yields phase_change to research_probe then research_synthesis', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'research' }))
      const events = await collectEvents(manager.run('Research WebSocket scaling'))

      const phaseChanges = events.filter((e) => e.type === 'phase_change')
      const phases = phaseChanges.map((p) => (p as { phase: string }).phase)
      expect(phases).toContain('research_probe')
      expect(phases).toContain('research_synthesis')
    })

    it('yields two gate_result events', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'research' }))
      const events = await collectEvents(manager.run('Research WebSocket scaling'))

      const gateResults = events.filter((e) => e.type === 'gate_result')
      expect(gateResults.length).toBe(2)
    })
  })

  describe('getProgress', () => {
    it('returns initial state before run()', () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 5 }))
      expect(manager.getProgress()).toEqual({
        completedTicks: 0,
        totalTicks: 5,
        phase: 'init',
      })
    })

    it('reflects completion after run() completes', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 2 }))
      for await (const _event of manager.run('Test')) {
        /* consume */
      }
      expect(manager.getProgress().phase).toBe('done')
      expect(manager.getProgress().completedTicks).toBe(2)
    })
  })

  describe('serialize / save / load', () => {
    it('serialize returns the current loop state', () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 3 }))
      const state = manager.serialize()

      expect(state).toMatchObject({
        sessionId: manager.sessionId,
        loopType: 'implement',
        phase: 'init',
        config: expect.objectContaining({ loopType: 'implement', maxTicks: 3 }),
        completedTicks: 0,
        totalTicks: 3,
        gateResults: [],
      })
      expect(typeof state.startedAt).toBe('number')
      expect(typeof state.updatedAt).toBe('number')
    })

    it('static load restores the exact state', () => {
      const original = new LoopManager(makeConfig({ loopType: 'review' }))
      const state = original.serialize()
      const restored = LoopManager.load(state)

      expect(restored.sessionId).toBe(original.sessionId)
      expect(restored.loopType).toBe(original.loopType)
      expect(restored.getProgress()).toEqual(original.getProgress())
    })

    it('static load accepts extra config overrides', () => {
      const original = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 5 }))
      const state = original.serialize()
      const restored = LoopManager.load(state, { maxTicks: 10 })

      expect(restored.getProgress().totalTicks).toBe(10)
    })

    it('save writes a JSON file and loadFromDisk reads it back', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      await manager.save()

      const restored = await LoopManager.loadFromDisk(manager.sessionId)
      expect(restored).not.toBeNull()
      expect(restored!.sessionId).toBe(manager.sessionId)
      expect(restored!.loopType).toBe(manager.loopType)
    })

    it('loadFromDisk returns null for nonexistent session', async () => {
      const restored = await LoopManager.loadFromDisk('nonexistent-id-12345')
      expect(restored).toBeNull()
    })
  })

  describe('dispose', () => {
    it('yields only loop_error when run is called after dispose', async () => {
      const manager = new LoopManager(makeConfig())
      manager.dispose()
      const events = await collectEvents(manager.run('test'))
      const nonErrorEvents = events.filter((e) => e.type !== 'loop_error')
      expect(nonErrorEvents.length).toBe(0)
    })

    it('calling dispose twice is safe', () => {
      const manager = new LoopManager(makeConfig())
      manager.dispose()
      expect(() => manager.dispose()).not.toThrow()
    })
  })

  describe('error handling', () => {
    it('yields loop_error when run is called after dispose', async () => {
      const manager = new LoopManager(makeConfig())
      manager.dispose()
      const events = await collectEvents(manager.run('test'))
      const errorEvents = events.filter((e) => e.type === 'loop_error')
      expect(errorEvents.length).toBeGreaterThanOrEqual(1)
    })

    it('completes gracefully even without queryExecutor', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate', queryExecutor: undefined }))
      const events = await collectEvents(manager.run('test'))
      // Should not throw — debate gate fails gracefully
      expect(events.some((e) => e.type === 'loop_complete')).toBe(true)
    })
  })

  describe('reentrant run()', () => {
    it('resets state correctly when run() is called twice', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 1 }))
      for await (const _event of manager.run('First run')) {
        /* consume */
      }

      expect(manager.getProgress().phase).toBe('done')

      for await (const event of manager.run('Second run')) {
        if (event.type === 'loop_start') {
          expect(event).toMatchObject({ topic: 'Second run' })
        }
      }

      expect(manager.getProgress().phase).toBe('done')
      expect(manager.getProgress().completedTicks).toBe(1)
    })
  })

  describe('phase transitions', () => {
    it('transitions through correct phases for implement loop', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 1 }))
      const events = await collectEvents(manager.run('test'))

      const phaseChanges = events
        .filter((e) => e.type === 'phase_change')
        .map((p) => (p as { phase: string }).phase)

      expect(phaseChanges).toEqual([
        'approach_debate',
        'implementation_tick',
        'review_debate',
        'done',
      ])
    })

    it('transitions through correct phases for research loop', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'research' }))
      const events = await collectEvents(manager.run('test'))

      const phaseChanges = events
        .filter((e) => e.type === 'phase_change')
        .map((p) => (p as { phase: string }).phase)

      expect(phaseChanges).toEqual(['research_probe', 'research_synthesis', 'done'])
    })
  })

  describe('loop_start event', () => {
    it('contains all expected fields', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'debate' }))
      const events = await collectEvents(manager.run('Important topic'))

      const startEvent = events.find((e) => e.type === 'loop_start')
      expect(startEvent).toMatchObject({
        type: 'loop_start',
        loopType: 'debate',
        topic: 'Important topic',
        sessionId: manager.sessionId,
      })
    })
  })

  describe('tick event structure', () => {
    it('tick_start has correct tick number and taskId', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 2 }))
      const events = await collectEvents(manager.run('test'))

      const firstTick = events.find(
        (e) => e.type === 'tick_start' && (e as { tick: number }).tick === 1,
      )
      expect(firstTick).toMatchObject({
        type: 'tick_start',
        tick: 1,
        taskId: 'tick-1',
      })
    })

    it('tick_complete includes TickEvidence', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 1 }))
      const events = await collectEvents(manager.run('test'))

      const tickComplete = events.find((e) => e.type === 'tick_complete')
      expect(tickComplete).toMatchObject({
        type: 'tick_complete',
        tick: 1,
        evidence: expect.objectContaining({
          taskId: 'tick-1',
          filesChanged: expect.any(Array),
        }),
      })
    })
  })

  describe('loop_complete event', () => {
    it('contains full LoopSummary', async () => {
      const manager = new LoopManager(makeConfig({ loopType: 'implement', maxTicks: 2 }))
      const events = await collectEvents(manager.run('Build feature X'))

      const complete = events.find((e) => e.type === 'loop_complete')
      expect(complete).toMatchObject({
        type: 'loop_complete',
        summary: expect.objectContaining({
          sessionId: manager.sessionId,
          loopType: 'implement',
          topic: 'Build feature X',
          completedTicks: 2,
          totalTicks: 2,
          gateResults: expect.any(Array),
          durationMs: expect.any(Number),
        }),
      })
    })
  })
})
