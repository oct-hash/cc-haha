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
import { appendFileSync, mkdirSync } from 'node:fs'
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
import { createDirectApiAdapter } from './direct-api.js'
import { createAgentAdapter } from './factory.js'
import {
  assessGate,
  decideBlock,
  type BlockDecision,
  type GateAssessment,
  type GateKind,
  type Severity,
} from './gate-assessment.js'
import type { AgentConfig, AgentKind } from './types.js'

// ── Constants ──────────────────────────────────────────────────────────────

const SESSIONS_DIR = '.claude/sessions'
const GATE_LOG_PATH = '.claude/gate-log.jsonl'
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

/** Binaries for the CLI-based agent kinds. */
const CLI_BIN: Record<'claude-code' | 'codex', string> = {
  'claude-code': 'claude',
  codex: 'codex',
}

/**
 * True if `bin` can actually be spawned. `Bun.which` may resolve a shim
 * (e.g. a `codex.exe` launcher) that Bun's `uv_spawn` then fails to start on
 * Windows with EFTYPE — so a real spawn probe is required, not just PATH lookup.
 *
 * The probe is memoized per binary: spawning `claude` (a large Bun-compiled
 * binary) costs ~4.5s on Windows, so it must run at most once per process.
 */
const cliSpawnableCache = new Map<string, boolean>()

function isCliSpawnable(bin: string): boolean {
  const cached = cliSpawnableCache.get(bin)
  if (cached !== undefined) return cached

  let result = false
  try {
    const proc = Bun.spawn([bin, '--version'], { stdout: 'ignore', stderr: 'ignore' })
    try {
      proc.kill()
    } catch {
      // already exited
    }
    result = true
  } catch {
    result = false
  }
  cliSpawnableCache.set(bin, result)
  return result
}

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
  severity: Severity
  confidence: number
  gateKind: GateKind
  ignoreHash?: string
  durationMs: number
  /** True when the debate failed or produced no verdict (fail-open, no assessment). */
  unavailable?: boolean
}

/** Internal: a debate gate's raw summary plus the structured assessment/decision. */
interface GateRunResult extends DebateSummary {
  assessment: GateAssessment
  decision: BlockDecision
  unavailable?: boolean
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
  /** Which gate policy this loop enforces (default: pre-implementation, never blocks). */
  gateKind?: GateKind
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
  | { type: 'gate_result'; gate: 'pre' | 'post'; verdict: string; passed: boolean; severity: Severity; confidence: number; gateKind: GateKind; ignoreHash?: string; unavailable?: boolean }
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
      gateKind: config.gateKind ?? 'pre-implementation',
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

    const gateResult = this.recordGate('pre', result)

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: result.verdict,
      passed: gateResult.passed,
      severity: gateResult.severity,
      confidence: gateResult.confidence,
      gateKind: gateResult.gateKind,
      ignoreHash: gateResult.ignoreHash,
      unavailable: gateResult.unavailable,
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

    const preGateResult = this.recordGate('pre', preResult)

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: preResult.verdict,
      passed: preGateResult.passed,
      severity: preGateResult.severity,
      confidence: preGateResult.confidence,
      gateKind: preGateResult.gateKind,
      ignoreHash: preGateResult.ignoreHash,
      unavailable: preGateResult.unavailable,
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

    const postGateResult = this.recordGate('post', postResult)

    yield {
      type: 'gate_result',
      gate: 'post',
      verdict: postResult.verdict,
      passed: postGateResult.passed,
      severity: postGateResult.severity,
      confidence: postGateResult.confidence,
      gateKind: postGateResult.gateKind,
      ignoreHash: postGateResult.ignoreHash,
      unavailable: postGateResult.unavailable,
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

    const preGateResult = this.recordGate('pre', result)

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: result.verdict,
      passed: preGateResult.passed,
      severity: preGateResult.severity,
      confidence: preGateResult.confidence,
      gateKind: preGateResult.gateKind,
      ignoreHash: preGateResult.ignoreHash,
      unavailable: preGateResult.unavailable,
    }

    yield* this.transitionTo('review_debate')
    const reviewResult = yield* this.runDebateGate('council', `Review: ${topic}`, signal)

    const postGateResult = this.recordGate('post', reviewResult)

    yield {
      type: 'gate_result',
      gate: 'post',
      verdict: reviewResult.verdict,
      passed: postGateResult.passed,
      severity: postGateResult.severity,
      confidence: postGateResult.confidence,
      gateKind: postGateResult.gateKind,
      ignoreHash: postGateResult.ignoreHash,
      unavailable: postGateResult.unavailable,
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

    const preGateResult = this.recordGate('pre', probeResult)

    yield {
      type: 'gate_result',
      gate: 'pre',
      verdict: probeResult.verdict,
      passed: preGateResult.passed,
      severity: preGateResult.severity,
      confidence: preGateResult.confidence,
      gateKind: preGateResult.gateKind,
      ignoreHash: preGateResult.ignoreHash,
      unavailable: preGateResult.unavailable,
    }

    // Synthesis phase: debate mode to converge findings
    yield* this.transitionTo('research_synthesis')
    const synthResult = yield* this.runDebateGate(
      'debate',
      `Synthesize research findings from probe phase.\n\nProbe findings: ${probeResult.verdict}\n\nOriginal topic: ${topic}`,
      signal,
    )

    const postGateResult = this.recordGate('post', synthResult)

    yield {
      type: 'gate_result',
      gate: 'post',
      verdict: synthResult.verdict,
      passed: postGateResult.passed,
      severity: postGateResult.severity,
      confidence: postGateResult.confidence,
      gateKind: postGateResult.gateKind,
      ignoreHash: postGateResult.ignoreHash,
      unavailable: postGateResult.unavailable,
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
  ): AsyncGenerator<LoopEvent, GateRunResult> {
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
    let unavailable = false

    try {
      for await (const event of orchestrator.run(topic, signal)) {
        // Passthrough debate events so consumer can track progress
        yield { type: 'debate_event', event }

        // Abort or orchestrator-level failure: gate cannot assess, fail open.
        if (event.type === 'error') {
          unavailable = true
        }
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
      unavailable = true
    } finally {
      // Track adapters then drain immediately — debate gates are fire-and-forget
      this.adapters.push(...Object.values(adapters))
    }

    // Detect infra failure (API down, missing key) before drainAdapters resets
    // adapter status. When every agent errored there is no real assessment to
    // feed into assessGate — feeding error text (e.g. "No API key configured")
    // would misread "API key" as a critical finding and wrongly block. Fail open.
    if (Object.values(adapters).every((a) => a.status === 'error')) {
      unavailable = true
    }
    this.drainAdapters()

    if (!finalVerdict) {
      finalVerdict = 'Debate completed but produced no verdict.'
      unavailable = true
    }

    // Fail-open: an unavailable gate is recorded as a clean pass, never assessed.
    // Feeding infra-error text to assessGate risks misclassifying "API key missing"
    // as a critical finding and wrongly blocking the commit.
    if (unavailable) {
      return {
        mode,
        totalRounds: finalRounds,
        statements: [],
        verdict: finalVerdict,
        winner: finalWinner,
        durationMs: finalDurationMs,
        assessment: { severity: 'low', confidence: 0, reasons: [] },
        decision: {
          block: false,
          silent: false,
          severity: 'low',
          confidence: 0,
          reason: 'GATE UNAVAILABLE',
        },
        unavailable: true,
      }
    }

    const assessment = assessGate(finalVerdict, this.config.gateKind)
    const decision = decideBlock(
      this.config.gateKind,
      assessment.severity,
      assessment.confidence,
      assessment.reasons[0] ?? '',
    )

    return {
      mode,
      totalRounds: finalRounds,
      statements: [],
      verdict: finalVerdict,
      winner: finalWinner,
      durationMs: finalDurationMs,
      assessment,
      decision,
    }
  }

  // ── Gate recording ──────────────────────────────────────────────────────

  /**
   * Build a GateResult from a gate run, persist it, write the structured JSONL
   * log line, and return it so the caller can yield the matching event.
   */
  private recordGate(gate: 'pre' | 'post', result: GateRunResult): GateResult {
    const gateResult: GateResult = {
      gate,
      verdict: result.verdict,
      winner: result.winner,
      passed: !result.decision.block,
      severity: result.assessment.severity,
      confidence: result.assessment.confidence,
      gateKind: this.config.gateKind,
      ignoreHash: result.decision.ignoreHash,
      durationMs: result.durationMs,
      unavailable: result.unavailable,
    }
    this.gateResults.push(gateResult)
    this.logGateJsonl(gateResult)
    return gateResult
  }

  /** Append one structured JSONL line for later false-positive-rate stats. */
  private logGateJsonl(gateResult: GateResult): void {
    try {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        sessionId: this.sessionId,
        loopType: this.loopType,
        gate: gateResult.gate,
        gateKind: gateResult.gateKind,
        severity: gateResult.severity,
        confidence: gateResult.confidence,
        passed: gateResult.passed,
        ignoreHash: gateResult.ignoreHash ?? null,
        unavailable: gateResult.unavailable ?? null,
        verdict: gateResult.verdict.slice(0, 400),
      })
      mkdirSync(dirname(GATE_LOG_PATH), { recursive: true })
      appendFileSync(GATE_LOG_PATH, `${line}\n`)
    } catch {
      // Best-effort: gate logging must never fail the loop.
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

    // Standalone (no REPL queryExecutor): every agent drives the
    // Anthropic-compatible endpoint directly. The claude/codex CLIs are not
    // wanted here — a heterogeneous debate against one endpoint is the whole
    // point, and DEBATE_MODEL_* picks the per-agent model.
    const standalone = !this.config.queryExecutor

    // claude-haha: use the REPL queryExecutor when available, else direct API
    if (standalone) {
      const override = this.config.agentConfigs?.['claude-haha']
      adapters['claude-haha'] = createDirectApiAdapter({
        maxTurns: 5,
        ...override,
        kind: 'claude-haha',
        model: DEBATE_MODELS['claude-haha'] ?? override?.model,
      })
    } else {
      const override = this.config.agentConfigs?.['claude-haha']
      adapters['claude-haha'] = createAgentAdapter('claude-haha', {
        maxTurns: 5,
        ...override,
        model: DEBATE_MODELS['claude-haha'] ?? override?.model,
        queryExecutor: this.config.queryExecutor,
      })
    }

    // claude-code / codex: CLI only in REPL mode and only when it can actually
    // spawn (a shim may resolve on PATH but still fail with EFTYPE on Windows);
    // standalone always uses direct API.
    for (const kind of ['claude-code', 'codex'] as const) {
      const override = this.config.agentConfigs?.[kind]
      const config: AgentConfig = {
        maxTurns: 5,
        ...override,
        model: DEBATE_MODELS[kind] ?? override?.model,
      }
      const useCli = !standalone && isCliSpawnable(CLI_BIN[kind])
      adapters[kind] = useCli
        ? createAgentAdapter(kind, config)
        : createDirectApiAdapter({ ...config, kind })
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
        gateKind: this.config.gateKind,
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
