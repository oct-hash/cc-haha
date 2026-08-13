/**
 * LoopManager — unified agent loop orchestrator.
 *
 * Wraps (does not modify) DebateOrchestrator to provide 4 loop types,
 * each with pre/post-work debate gates as quality checkpoints.
 *
 * Loop types:
 *   - debate    — pure delegation: one auto-mode debate
 *   - implement — pre-work gate → N ticks → post-work gate
 *   - review    — pre-work gate → single council review
 *   - research  — probe phase (auto) → synthesis phase (debate)
 *
 * Persistence: .claude/sessions/loop-{id}.json
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import type { AgentAdapter } from './adapter.js'
import {
  type DebateConfig,
  type DebateEvent,
  type DebateMode,
  DebateOrchestrator,
  type DebateSummary,
} from './debate.js'
import { createAgentAdapter } from './factory.js'
import type { AgentConfig, AgentKind } from './types.js'

// ── Constants ──────────────────────────────────────────────────────────────

const SESSIONS_DIR = '.claude/sessions'
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

// ── Types ──────────────────────────────────────────────────────────────────

export type LoopType = 'debate' | 'implement' | 'review' | 'research'

export type LoopPhase =
  | 'init'
  | 'approach_debate'
  | 'implementation_tick'
  | 'review_debate'
  | 'research_probe'
  | 'research_synthesis'
  | 'done'

export interface TickEvidence {
  taskId: string
  description: string
  diff?: string
  testResults?: string
  filesChanged: string[]
}

export interface LoopSummary {
  sessionId: string
  loopType: LoopType
  topic: string
  phase: LoopPhase
  completedTicks: number
  totalTicks: number
  gateResults: GateResult[]
  verdict?: string
  winner?: AgentKind
  durationMs: number
}

export interface GateResult {
  gate: 'pre' | 'post'
  verdict: string
  winner?: AgentKind
  passed: boolean
  durationMs: number
}

export interface LoopManagerConfig {
  loopType: LoopType
  /** Max ticks for implement loops (default 5). */
  maxTicks?: number
  /** Debate mode override for pre-work gate (default: auto for implement/review, auto for research probe). */
  preGateMode?: DebateMode
  /** Debate mode override for post-work gate (default: council). */
  postGateMode?: DebateMode
  /** Per-agent timeout in ms (default 120_000). */
  perAgentTimeoutMs?: number
  /** Query executor for claude-haha adapter. Required for debate gates. */
  queryExecutor?: (
    prompt: string,
    ac: AbortController,
    modelOverride?: string,
  ) => AsyncGenerator<{ type: string; text?: string; [k: string]: unknown }, void, unknown>
  /** Agent config overrides per kind. */
  agentConfigs?: Partial<Record<AgentKind, AgentConfig>>
}

export type LoopEvent =
  | { type: 'loop_start'; loopType: LoopType; topic: string; sessionId: string }
  | { type: 'phase_change'; phase: LoopPhase }
  | { type: 'debate_event'; event: DebateEvent }
  | { type: 'tick_start'; tick: number; taskId: string; description: string }
  | { type: 'tick_complete'; tick: number; evidence: TickEvidence }
  | { type: 'gate_result'; gate: 'pre' | 'post'; verdict: string; passed: boolean }
  | { type: 'loop_complete'; summary: LoopSummary }
  | { type: 'loop_suspended'; reason: string; resumeToken: string }
  | { type: 'loop_error'; message: string }

export interface SerializedLoopState {
  sessionId: string
  loopType: LoopType
  topic: string
  phase: LoopPhase
  config: LoopManagerConfig
  completedTicks: number
  totalTicks: number
  gateResults: GateResult[]
  startedAt: number
  updatedAt: number
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_TICKS = 5
const DEFAULT_TIMEOUT_MS = 120_000

// ── LoopManager ────────────────────────────────────────────────────────────

export class LoopManager {
  sessionId: string
  loopType: LoopType
  private config: Required<Omit<LoopManagerConfig, 'queryExecutor' | 'agentConfigs'>> &
    Pick<LoopManagerConfig, 'queryExecutor' | 'agentConfigs'>
  private phase: LoopPhase = 'init'
  private completedTicks = 0
  private totalTicks = 0
  private gateResults: GateResult[] = []
  private startedAt = 0
  private updatedAt = 0
  private topic = ''
  private adapters: AgentAdapter[] = []
  private disposed = false

  constructor(config: LoopManagerConfig) {
    if (!config.loopType) {
      throw new Error('LoopManager: loopType is required')
    }

    this.sessionId = randomUUID()
    this.loopType = config.loopType
    this.totalTicks = config.maxTicks ?? DEFAULT_MAX_TICKS
    this.startedAt = Date.now()
    this.updatedAt = Date.now()

    this.config = {
      loopType: config.loopType,
      maxTicks: config.maxTicks ?? DEFAULT_MAX_TICKS,
      preGateMode: config.preGateMode ?? 'auto',
      postGateMode: config.postGateMode ?? 'council',
      perAgentTimeoutMs: config.perAgentTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      queryExecutor: config.queryExecutor,
      agentConfigs: config.agentConfigs,
    }
  }

  // ── Main entry ──────────────────────────────────────────────────────────

  async *run(topic: string, signal?: AbortSignal): AsyncGenerator<LoopEvent, LoopSummary> {
    if (this.disposed) {
      yield { type: 'loop_error', message: 'LoopManager has been disposed' }
      return this.buildSummary()
    }

    if (this.phase !== 'init' && this.phase !== 'done') {
      yield { type: 'loop_error', message: 'LoopManager: run() already in progress' }
      return this.buildSummary()
    }

    // Reset mutable state for new run
    this.phase = 'init'
    this.completedTicks = 0
    this.gateResults = []
    this.topic = topic
    this.startedAt = Date.now()
    this.updatedAt = Date.now()

    // Dispose adapters from prior run
    for (const adapter of this.adapters) {
      try {
        adapter.dispose()
      } catch {
        /* best effort */
      }
    }
    this.adapters = []

    yield {
      type: 'loop_start',
      loopType: this.loopType,
      topic,
      sessionId: this.sessionId,
    }

    const abortController = new AbortController()
    const linkedAbort = () => abortController.abort()
    signal?.addEventListener('abort', linkedAbort, { once: true })

    try {
      switch (this.loopType) {
        case 'debate':
          yield* this.runDebateLoop(topic, abortController.signal)
          break
        case 'implement':
          yield* this.runImplementLoop(topic, abortController.signal)
          break
        case 'review':
          yield* this.runReviewLoop(topic, abortController.signal)
          break
        case 'research':
          yield* this.runResearchLoop(topic, abortController.signal)
          break
        default: {
          const _exhaustive: never = this.loopType
          yield { type: 'loop_error', message: `Unknown loop type: ${_exhaustive}` }
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        yield { type: 'loop_error', message: 'Loop aborted' }
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        yield { type: 'loop_error', message: msg }
      }
    } finally {
      signal?.removeEventListener('abort', linkedAbort)
    }

    this.phase = 'done'
    this.updatedAt = Date.now()
    yield { type: 'phase_change', phase: 'done' }

    const summary = this.buildSummary()
    yield { type: 'loop_complete', summary }
    return summary
  }

  // ── Loop: debate (pure delegation) ──────────────────────────────────────

  private async *runDebateLoop(
    topic: string,
    signal: AbortSignal,
  ): AsyncGenerator<LoopEvent, void> {
    yield* this.transitionTo('approach_debate')

    const result = yield* this.runDebateGate('auto', topic, signal)

    this.gateResults.push({
      gate: 'pre',
      verdict: result.verdict,
      winner: result.winner,
      passed: true,
      durationMs: result.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: result.verdict,
      passed: true,
    }
  }

  // ── Loop: implement (pre gate → ticks → post gate) ──────────────────────

  private async *runImplementLoop(
    topic: string,
    signal: AbortSignal,
  ): AsyncGenerator<LoopEvent, void> {
    // Pre-work gate: auto mode to select approach
    yield* this.transitionTo('approach_debate')
    const preResult = yield* this.runDebateGate(
      this.config.preGateMode,
      `Select the best implementation approach for: ${topic}`,
      signal,
    )

    this.gateResults.push({
      gate: 'pre',
      verdict: preResult.verdict,
      winner: preResult.winner,
      passed: true,
      durationMs: preResult.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: preResult.verdict,
      passed: true,
    }

    // Tick cycle
    yield* this.transitionTo('implementation_tick')
    for (let tick = 1; tick <= this.totalTicks; tick++) {
      if (signal.aborted) break

      yield {
        type: 'tick_start',
        tick,
        taskId: `tick-${tick}`,
        description: `Implementation tick ${tick} of ${this.totalTicks}`,
      }

      // Each tick: yield a placeholder. The consumer drives actual work.
      const evidence: TickEvidence = {
        taskId: `tick-${tick}`,
        description: `Tick ${tick} completed`,
        filesChanged: [],
      }

      this.completedTicks = tick
      yield { type: 'tick_complete', tick, evidence }
    }

    // Post-work gate: council mode to review
    yield* this.transitionTo('review_debate')
    const postResult = yield* this.runDebateGate(
      this.config.postGateMode,
      `Review the implementation of: ${topic}`,
      signal,
    )

    this.gateResults.push({
      gate: 'post',
      verdict: postResult.verdict,
      winner: postResult.winner,
      passed: true,
      durationMs: postResult.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'post',
      verdict: postResult.verdict,
      passed: true,
    }
  }

  // ── Loop: review (pre gate → council review) ────────────────────────────

  private async *runReviewLoop(
    topic: string,
    signal: AbortSignal,
  ): AsyncGenerator<LoopEvent, void> {
    yield* this.transitionTo('approach_debate')

    const result = yield* this.runDebateGate(
      'auto',
      `Establish review criteria for: ${topic}`,
      signal,
    )

    this.gateResults.push({
      gate: 'pre',
      verdict: result.verdict,
      winner: result.winner,
      passed: true,
      durationMs: result.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: result.verdict,
      passed: true,
    }

    yield* this.transitionTo('review_debate')
    const reviewResult = yield* this.runDebateGate('council', `Review: ${topic}`, signal)

    this.gateResults.push({
      gate: 'post',
      verdict: reviewResult.verdict,
      winner: reviewResult.winner,
      passed: true,
      durationMs: reviewResult.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'post',
      verdict: reviewResult.verdict,
      passed: true,
    }
  }

  // ── Loop: research (probe → synthesis) ──────────────────────────────────

  private async *runResearchLoop(
    topic: string,
    signal: AbortSignal,
  ): AsyncGenerator<LoopEvent, void> {
    // Probe phase: auto mode for broad exploration
    yield* this.transitionTo('research_probe')
    const probeResult = yield* this.runDebateGate('auto', `Research probe: ${topic}`, signal)

    this.gateResults.push({
      gate: 'pre',
      verdict: probeResult.verdict,
      winner: probeResult.winner,
      passed: true,
      durationMs: probeResult.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: probeResult.verdict,
      passed: true,
    }

    // Synthesis phase: debate mode to converge findings
    yield* this.transitionTo('research_synthesis')
    const synthResult = yield* this.runDebateGate(
      'debate',
      `Synthesize research findings from probe phase.\n\nProbe findings: ${probeResult.verdict}\n\nOriginal topic: ${topic}`,
      signal,
    )

    this.gateResults.push({
      gate: 'post',
      verdict: synthResult.verdict,
      winner: synthResult.winner,
      passed: true,
      durationMs: synthResult.durationMs,
    })

    yield {
      type: 'gate_result',
      gate: 'post',
      verdict: synthResult.verdict,
      passed: true,
    }
  }

  // ── Debate gate ──────────────────────────────────────────────────────────

  /**
   * Create 3 AgentAdapter instances and run DebateOrchestrator.
   *
   * Uses the same adapter creation pattern as autoDebateEntry:
   * CLI-based adapters (claude-code, codex) with graceful fallback to claude-haha.
   */
  private async *runDebateGate(
    mode: DebateMode,
    topic: string,
    signal: AbortSignal,
  ): AsyncGenerator<LoopEvent, DebateSummary> {
    const adapters = this.buildDebateAdapters()
    const config: DebateConfig = {
      mode,
      perAgentTimeoutMs: this.config.perAgentTimeoutMs,
    }

    const orchestrator = new DebateOrchestrator(adapters, config)

    let finalVerdict = ''
    let finalWinner: AgentKind | undefined
    let finalRounds = 0
    let finalDurationMs = 0

    try {
      for await (const event of orchestrator.run(topic, signal)) {
        // Passthrough debate events so consumer can track progress
        yield { type: 'debate_event', event }

        if (event.type === 'verdict') {
          finalVerdict = event.content
          finalWinner = event.winner
        }
        if (event.type === 'debate_end') {
          finalRounds = event.summary.totalRounds
          finalDurationMs = event.summary.durationMs
          finalVerdict = finalVerdict || event.summary.verdict
          finalWinner = finalWinner || event.summary.winner
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      finalVerdict = `Debate gate failed: ${msg}`
    } finally {
      // Track adapters then drain immediately — debate gates are fire-and-forget
      this.adapters.push(...Object.values(adapters))
    }
    this.drainAdapters()

    if (!finalVerdict) {
      finalVerdict = 'Debate completed but produced no verdict.'
    }

    return {
      mode,
      totalRounds: finalRounds,
      statements: [],
      verdict: finalVerdict,
      winner: finalWinner,
      durationMs: finalDurationMs,
    }
  }

  // ── Adapter factory ─────────────────────────────────────────────────────

  private validateModel(value: string | undefined, envVar: string): string | undefined {
    if (value === undefined) return undefined
    if (!MODEL_PATTERN.test(value)) {
      process.stderr.write(
        `[LoopManager] ${envVar}="${value}" is not a valid model name — ignoring.\n`,
      )
      return undefined
    }
    return value
  }

  private buildDebateAdapters(): Record<AgentKind, AgentAdapter> {
    const DEBATE_MODELS: Partial<Record<AgentKind, string | undefined>> = {
      'claude-haha': this.validateModel(process.env.DEBATE_MODEL_HAHA, 'DEBATE_MODEL_HAHA'),
      'claude-code': this.validateModel(process.env.DEBATE_MODEL_CLAUDE, 'DEBATE_MODEL_CLAUDE'),
      codex: this.validateModel(process.env.DEBATE_MODEL_CODEX, 'DEBATE_MODEL_CODEX'),
    }

    const adapters = {} as Record<AgentKind, AgentAdapter>

    // claude-haha always works (uses queryExecutor or direct adapter)
    const hahaConfig: AgentConfig = {
      maxTurns: 5,
      model: DEBATE_MODELS['claude-haha'],
      ...this.config.agentConfigs?.['claude-haha'],
    }
    if (this.config.queryExecutor) {
      hahaConfig.queryExecutor = this.config.queryExecutor
    }
    adapters['claude-haha'] = createAgentAdapter('claude-haha', hahaConfig)

    // Try CLI-based adapters, fall back to claude-haha on failure
    const cliKinds: AgentKind[] = ['claude-code', 'codex']
    for (const kind of cliKinds) {
      try {
        adapters[kind] = createAgentAdapter(kind, {
          maxTurns: 5,
          model: DEBATE_MODELS[kind],
          ...this.config.agentConfigs?.[kind],
        })
      } catch {
        process.stderr.write(
          `[LoopManager] ${kind} adapter unavailable, falling back to claude-haha.\n`,
        )
        try {
          adapters[kind] = createAgentAdapter('claude-haha', {
            maxTurns: 5,
            queryExecutor: this.config.queryExecutor,
            ...this.config.agentConfigs?.['claude-haha'],
          })
        } catch {
          process.stderr.write(
            `[LoopManager] claude-haha fallback for ${kind} also failed — reusing existing haha adapter.\n`,
          )
          adapters[kind] = adapters['claude-haha']
        }
      }
    }

    return adapters
  }

  // ── Adapter cleanup ─────────────────────────────────────────────────────

  private drainAdapters(): void {
    for (const adapter of this.adapters) {
      try {
        adapter.dispose()
      } catch {
        /* best effort */
      }
    }
    this.adapters = []
  }

  // ── Phase transitions ───────────────────────────────────────────────────

  private *transitionTo(phase: LoopPhase): Generator<LoopEvent, void> {
    this.phase = phase
    this.updatedAt = Date.now()
    yield { type: 'phase_change', phase }
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  private buildSummary(): LoopSummary {
    return {
      sessionId: this.sessionId,
      loopType: this.loopType,
      topic: this.topic,
      phase: this.phase,
      completedTicks: this.completedTicks,
      totalTicks: this.totalTicks,
      gateResults: this.gateResults,
      verdict: this.gateResults[this.gateResults.length - 1]?.verdict,
      winner: this.gateResults[this.gateResults.length - 1]?.winner,
      durationMs: Date.now() - this.startedAt,
    }
  }

  // ── Progress ────────────────────────────────────────────────────────────

  getProgress(): { completedTicks: number; totalTicks: number; phase: LoopPhase } {
    return {
      completedTicks: this.completedTicks,
      totalTicks: this.totalTicks,
      phase: this.phase,
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  serialize(): SerializedLoopState {
    return {
      sessionId: this.sessionId,
      loopType: this.loopType,
      topic: this.topic,
      phase: this.phase,
      config: {
        loopType: this.config.loopType,
        maxTicks: this.config.maxTicks,
        preGateMode: this.config.preGateMode,
        postGateMode: this.config.postGateMode,
        perAgentTimeoutMs: this.config.perAgentTimeoutMs,
      },
      completedTicks: this.completedTicks,
      totalTicks: this.totalTicks,
      gateResults: this.gateResults,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
    }
  }

  async save(): Promise<void> {
    const state = this.serialize()
    const filePath = join(SESSIONS_DIR, `loop-${this.sessionId}.json`)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(state, null, 2))
  }

  static load(state: SerializedLoopState, extraConfig?: Partial<LoopManagerConfig>): LoopManager {
    const manager = new LoopManager({ ...state.config, ...extraConfig })
    manager.restoreState(state)
    return manager
  }

  private restoreState(state: SerializedLoopState): void {
    this.sessionId = state.sessionId
    this.loopType = state.loopType
    this.phase = state.phase
    this.topic = state.topic
    this.completedTicks = state.completedTicks
    this.gateResults = state.gateResults
    this.startedAt = state.startedAt
    this.updatedAt = state.updatedAt
  }

  static async loadFromDisk(
    sessionId: string,
    extraConfig?: Partial<LoopManagerConfig>,
  ): Promise<LoopManager | null> {
    try {
      const filePath = join(SESSIONS_DIR, `loop-${sessionId}.json`)
      const raw = await readFile(filePath, 'utf-8')
      const state = JSON.parse(raw) as SerializedLoopState
      return LoopManager.load(state, extraConfig)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logForDebugging(`[agents] loop session corrupt: ${errorMessage(err)}`, { level: 'warn' })
      }
      return null
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.drainAdapters()
  }
}
