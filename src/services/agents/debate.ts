/**
 * Three-Agent Debate Orchestrator — multi-agent deliberation module.
 *
 * Modes:
 *   - council  — all agents answer independently, judge picks best via voting
 *   - debate   — sequential propose → critique → revise rounds, then converge
 *   - relay    — chain handoff: A → B → C, each builds on the previous
 *
 * Design references:
 *   - MAD (Du et al., 2023): heterogeneous models outperform homogeneous
 *   - ConfMAD (EMNLP 2025): confidence calibration reduces overconfidence
 *   - claude-synod-debate: lightweight 3-model heterogeneous pattern
 */

import type { AgentAdapter } from './adapter.js'
import type { AgentKind, } from './types.js'

// ── Types ─────────────────────────────────────────────────────────────────

export type DebateMode = 'council' | 'debate' | 'relay' | 'auto'

export interface AutoConfig {
  /** Jaccard agreement threshold above which agents fast-vote (default 0.8). */
  highAgreement?: number
  /** Jaccard agreement threshold below which debate is escalated (default 0.4). */
  lowAgreement?: number
  /** Max rounds when agreement is moderate (default 3). */
  debateRounds?: number
  /** Max rounds when agreement is low — escalated mode (default 2). */
  escalatedRounds?: number
}

export interface DebateConfig {
  mode: DebateMode
  /** Max debate rounds (debate mode only, default 3). */
  maxRounds?: number
  /** Agent kind to use as final judge. 'majority' uses voting. */
  judge?: AgentKind | 'majority'
  /** Timeout per agent response in ms (default 120_000). */
  perAgentTimeoutMs?: number
  /** Auto-mode routing configuration. */
  auto?: AutoConfig
}

export interface AgentPosition {
  kind: AgentKind
  label: string // e.g. "Proposer", "Critic", "Revise"
}

export interface AgentStatement {
  agent: AgentKind
  content: string
  confidence: number // 0–1
  round: number
  timestamp: Date
}

export interface DebateRound {
  roundNumber: number
  statements: AgentStatement[]
}

export type DebatePhase =
  | 'init'
  | 'auto_probe'
  | 'council_deliberation'
  | 'debate_propose'
  | 'debate_critique'
  | 'debate_revise'
  | 'relay_handoff'
  | 'judge_deliberation'
  | 'done'

export type DebateEvent =
  | { type: 'debate_start'; mode: DebateMode; agents: AgentKind[] }
  | {
      type: 'auto_decision'
      agreement: number
      route: 'vote' | 'debate' | 'escalate'
      reason: string
    }
  | { type: 'phase_change'; phase: DebatePhase }
  | { type: 'round_start'; round: number }
  | { type: 'agent_thinking'; agent: AgentKind }
  | { type: 'agent_response'; statement: AgentStatement }
  | { type: 'agent_error'; agent: AgentKind; message: string }
  | { type: 'round_end'; round: number }
  | { type: 'verdict'; content: string; winner?: AgentKind }
  | { type: 'debate_end'; summary: DebateSummary }
  | { type: 'error'; message: string }

export interface DebateSummary {
  mode: DebateMode
  totalRounds: number
  statements: AgentStatement[]
  verdict: string
  winner?: AgentKind
  durationMs: number
}

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_ROUNDS = 3
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_AUTO: Required<AutoConfig> = {
  highAgreement: 0.8,
  lowAgreement: 0.4,
  debateRounds: 3,
  escalatedRounds: 2,
}
const ROLES: Record<DebateMode, AgentPosition[]> = {
  auto: [
    { kind: 'claude-haha', label: 'Probe A' },
    { kind: 'claude-code', label: 'Probe B' },
    { kind: 'codex', label: "Devil's Advocate" },
  ],
  council: [
    { kind: 'claude-haha', label: 'Analyst A' },
    { kind: 'claude-code', label: 'Analyst B' },
    { kind: 'codex', label: "Devil's Advocate" },
  ],
  debate: [
    { kind: 'claude-haha', label: 'Proposer' },
    { kind: 'claude-code', label: 'Critic' },
    { kind: 'codex', label: 'Reviser' },
  ],
  relay: [
    { kind: 'claude-haha', label: 'First Pass' },
    { kind: 'claude-code', label: 'Second Pass' },
    { kind: 'codex', label: 'Final Pass' },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Collect full text from a chatStream, discarding tool events. */
async function collectResponse(
  adapter: AgentAdapter,
  message: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)

  const linkedAbort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', linkedAbort, { once: true })

  const parts: string[] = []
  try {
    for await (const event of adapter.chatStream(message, controller)) {
      if (event.type === 'text_chunk') parts.push(event.content)
      if (event.type === 'error') parts.push(`[ERROR: ${event.message}]`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg !== 'timeout') parts.push(`[ERROR: ${msg}]`)
  } finally {
    clearTimeout(timeoutId)
    signal.removeEventListener('abort', linkedAbort)
  }

  return parts.join('').trim()
}

const CONFIDENCE_TAIL_WINDOW = 500 // last N chars scanned for structured CONFIDENCE: marker
const MINORITY_JACCARD_THRESHOLD = 0.3 // below this, candidate is a potential minority
const MAJORITY_COHESION_THRESHOLD = 0.5 // majority agents must agree above this to confirm a real minority exists
const DEFAULT_CONFIDENCE = 0.5 // neutral fallback when no structured marker found

/** Extract a confidence score (0–1) from the tail of agent response text. */
function extractConfidence(text: string): number {
  // Only match CONFIDENCE: in the trailing portion (last N chars)
  const tail = text.slice(-CONFIDENCE_TAIL_WINDOW)
  // Anchored: must appear as its own line with numeric value
  const anchored = tail.match(/^\s*CONFIDENCE:\s*(0\.\d+|1\.0|1|0)(?:\s*$|\s*\n)/im)
  if (anchored) {
    const n = parseFloat(anchored[1])
    if (!isNaN(n)) return Math.max(0, Math.min(1, n))
  }
  return DEFAULT_CONFIDENCE
}

/** Extract the final answer/verdict from an agent response. */
function extractFinalAnswer(text: string): string {
  // Try to find explicit answer markers
  const markers = [
    /(?:final|my)\s*answer\s*(?:is|:)\s*(.+?)(?:\n\n|$)/is,
    /(?:verdict|conclusion|summary)[:\s]\n*(.+?)(?:\n\n|$)/is,
    /(?:\*\*)?(?:final|answer|verdict|conclusion)(?:\*\*)?[:\s]\n*(.+?)(?:\n\n|$)/is,
  ]

  for (const m of markers) {
    const match = text.match(m)
    if (match) return match[1].trim().slice(0, 500)
  }

  // Fallback: last substantial paragraph or trailing text
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20)
  const fallback =
    paragraphs[paragraphs.length - 1]?.trim().slice(0, 500) ?? text.slice(-500).trim()
  return fallback || '[No explicit final answer found]'
}

/**
 * Compute pairwise Jaccard word-overlap agreement across agent responses.
 * Returns a score in [0, 1] where higher means more agreement.
 *
 * Reference: MAGI (fshiori/magi) — `_estimate_agreement()` uses word-level
 * Jaccard similarity to decide whether to vote, debate, or escalate.
 */
function computeAgreement(responses: string[]): number {
  if (responses.length < 2) return 1

  const tokenized = responses.map((r) => {
    const lower = r.toLowerCase()
    // Extract words, filter out very short tokens
    const words = lower.split(/[\s,.;:!?()[\]{}"'`@#$%^&*+=<>|\\/~-]+/).filter((w) => w.length > 1)
    return new Set(words)
  })

  let totalJaccard = 0
  let pairCount = 0

  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const a = tokenized[i]
      const b = tokenized[j]
      if (a.size === 0 && b.size === 0) {
        totalJaccard += 1
      } else if (a.size === 0 || b.size === 0) {
        totalJaccard += 0
      } else {
        let intersection = 0
        for (const word of a) {
          if (b.has(word)) intersection++
        }
        const union = a.size + b.size - intersection
        totalJaccard += intersection / union
      }
      pairCount++
    }
  }

  return pairCount > 0 ? totalJaccard / pairCount : 0
}

/**
 * Heuristic reasoning quality score (0–1) as an auxiliary signal.
 *
 * This is NOT a replacement for confidence — it measures structural indicators
 * of careful reasoning: consideration of trade-offs, acknowledgment of
 * limitations, evidence of code/file references, and argument depth.
 *
 * Used by judge() to flag potentially shallow but high-confidence responses.
 */
export function computeReasoningQuality(text: string): number {
  let score = 0

  // Trade-off indicators: "on the other hand", "however", "alternatively"
  const tradeoffs = text.match(
    /\b(on the other hand|however|alternatively|conversely|trade.?off|pros?.{0,10}cons?)\b/gi,
  )
  if (tradeoffs && tradeoffs.length >= 2) score += 0.2
  else if (tradeoffs && tradeoffs.length >= 1) score += 0.1

  // Limitation acknowledgment: "limitation", "caveat", "drawback", "risk"
  const limitations = text.match(
    /\b(limitation|caveat|drawback|risk|pitfall|weakness|downside|caution)\b/gi,
  )
  if (limitations && limitations.length >= 2) score += 0.2
  else if (limitations && limitations.length >= 1) score += 0.1

  // Code/file references: backtick-wrapped or path-like (exclude domain names)
  const codeRefs = text.match(
    /`[^`]+`|(?<![/@.])\b[\w./-]+\.(ts|tsx|js|jsx|json|py|rs|go)(?::\d+)?\b/gi,
  )
  if (codeRefs && codeRefs.length >= 3) score += 0.2
  else if (codeRefs && codeRefs.length >= 1) score += 0.1

  // Argument depth: at least 3 substantial paragraphs (>100 chars each)
  const substantialParas = text.split(/\n\n+/).filter((p) => p.trim().length > 100)
  if (substantialParas.length >= 3) score += 0.2
  else if (substantialParas.length >= 1) score += 0.1

  // Specificity: concrete numbers, measurements, or percentages
  const specifics = text.match(/\b\d+[%]|\b\d+\.?\d*\s*(ms|s|mb|gb|kb|rps|qps|ops)\b/gi)
  if (specifics && specifics.length >= 1) score += 0.2

  return Math.min(1, score)
}

/** Simple string hash for reproducible topic-based seeding. */
function hashCode(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Fisher-Yates shuffle with seeded randomness for reproducibility. */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    // Simple LCG: s = (s * 1664525 + 1013904223) & 0xffffffff
    s = Math.abs((s * 1664525 + 1013904223) | 0)
    const j = s % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ── Input Sanitization ─────────────────────────────────────────────────────

const MAX_TOPIC_LENGTH = 4000
// Anchored to line-start (after optional whitespace) — same approach as the
// CONFIDENCE regex above. Mid-text "winner:" or "final answer:" in natural
// language topics is legitimate and should pass through.
const INJECTION_MARKERS = /^\s*(?:FINAL\s*ANSWER|FINAL\s*VERDICT|WINNER)\s*:\s*.*$/gim

/**
 * Sanitize user-provided debate topic to prevent prompt injection.
 *
 * - Truncates to 4000 characters
 * - Blocks standalone CONFIDENCE: <score> lines (aligned with extractConfidence parser)
 * - Strips lines containing FINAL ANSWER: / FINAL VERDICT: / WINNER: markers
 */
export function sanitizeDebateInput(topic: string): string {
  let sanitized = String(topic ?? '').slice(0, MAX_TOPIC_LENGTH)

  // Block only standalone CONFIDENCE: <score> lines — same format extractConfidence() parses.
  // This avoids mangling legitimate uses like "statistical confidence: p < 0.05".
  sanitized = sanitized.replace(/^\s*CONFIDENCE\s*:\s*[0-9.]+/gim, '[blocked: confidence score]')

  // Strip lines that contain output-hijacking injection markers
  sanitized = sanitized.replace(INJECTION_MARKERS, '[blocked: injection marker detected]')

  return sanitized
}

// ── Prompts ───────────────────────────────────────────────────────────────

function buildSystemPrompt(position: AgentPosition, mode: DebateMode, topic: string): string {
  const base = `You are participating in a multi-agent ${mode} discussion. Your role: ${position.label}.

IMPORTANT: You are an independent thinker. Do NOT simply agree with other agents. If you disagree, state your disagreement explicitly and explain why. Your value comes from diverse perspectives, not from consensus. Rank your arguments by quality, not by agreement with others.`

  const devilsAdvocate = `You are the Devil's Advocate. Your job is to find the strongest counter-argument to the consensus position. If everyone agrees, you MUST disagree on principle — find a genuine weakness or alternative interpretation. Do not concede easily.

CRITICAL: If you cannot find a substantive counter-argument backed by specific evidence, concede gracefully. Say: "After thorough examination, I agree with the consensus. Here is additional supporting evidence..." and state what corroborates the majority view. Never fabricate objections or nitpick inconsequential details just to fulfill your role. Quality dissent is evidence-based, not reflexive.`

  const modeInstructions: Record<DebateMode, string> = {
    council: `
All three analysts will independently analyze the same question.
${position.label === "Devil's Advocate" ? devilsAdvocate : 'Provide your best analysis. Be thorough and factual.'}
End your response with:
CONFIDENCE: <0.0-1.0>
FINAL ANSWER: <your conclusion>`,
    debate: `
This is a structured debate. You will see proposals from other agents.
${position.label === 'Proposer' ? 'Present your best solution with reasoning.' : ''}
${position.label === 'Critic' ? 'Identify flaws, gaps, and risks in the proposal. Be constructive.' : ''}
${position.label === 'Reviser' ? 'Synthesize the proposal and critique into an improved solution.' : ''}
End your response with:
CONFIDENCE: <0.0-1.0>
FINAL ANSWER: <your conclusion>`,
    relay: `
This is a sequential handoff. You will receive the output from the previous agent.
${position.label === 'First Pass' ? 'Start the analysis with your best initial approach.' : ''}
${position.label === 'Second Pass' ? 'Review, refine, and extend the first pass.' : ''}
${position.label === 'Final Pass' ? 'Produce the polished final output, integrating all prior work.' : ''}
End your response with:
CONFIDENCE: <0.0-1.0>
FINAL ANSWER: <your conclusion>`,
    auto: `
This is an auto-routed probe round. All three agents analyze the question independently.
${position.label === "Devil's Advocate" ? devilsAdvocate : position.label === 'Probe A' ? 'Focus on factual accuracy and completeness.' : position.label === 'Probe B' ? 'Focus on alternative perspectives and edge cases.' : ''}
Provide your best analysis. Be concise and specific.
End your response with:
CONFIDENCE: <0.0-1.0>
FINAL ANSWER: <your conclusion>`,
  }
  return `${base}\n${modeInstructions[mode]}\n\nTopic: ${topic}`
}

function buildJudgePrompt(
  topic: string,
  statements: AgentStatement[],
  groupthinkWarnings: string[],
): string {
  const summaries = statements
    .map((s) => {
      const finalAnswer = extractFinalAnswer(s.content)
      return `### ${s.agent} (confidence: ${s.confidence.toFixed(2)})\nArguments:\n${s.content.slice(0, 2000)}\n\nFINAL ANSWER: ${finalAnswer}`
    })
    .join('\n\n')

  return `You are the judge in a multi-agent debate. Review all agent responses and produce a final verdict.

TOPIC: ${topic}

AGENT RESPONSES:
${summaries}

${groupthinkWarnings.length > 0 ? `⚠️ GROUPTHINK WARNINGS:\n${groupthinkWarnings.map((w) => `- ${w}`).join('\n')}\n\n` : ''}Instructions:
1. Evaluate each response for correctness, completeness, and reasoning quality.
2. Factor in the confidence scores — high confidence with poor reasoning is a red flag.
3. A confidence of exactly 0.50 may mean the agent did not provide a structured CONFIDENCE marker.
4. If there is a clear winner, name them. If responses are complementary, synthesize.
5. If groupthink warnings are present above, scrutinize whether the apparent consensus may have overlooked minority arguments.
6. End with:
WINNER: <agent-name or "none">
FINAL VERDICT: <your synthesized conclusion>`
}

// ── Orchestrator ──────────────────────────────────────────────────────────

export class DebateOrchestrator {
  private adapters: Record<AgentKind, AgentAdapter>
  private config: DebateConfig
  private statements: AgentStatement[] = []
  private startedAt = 0
  private groupthinkWarnings: string[] = []
  private minorityReport: {
    agent: AgentKind
    jaccard: number
    content: string
  } | null = null

  constructor(adapters: Record<AgentKind, AgentAdapter>, config: DebateConfig) {
    const kinds = Object.keys(adapters) as AgentKind[]
    if (kinds.length < 3) {
      throw new Error(`Debate requires 3 agents, got ${kinds.length}: ${kinds.join(', ')}`)
    }
    this.adapters = adapters
    this.config = {
      maxRounds: DEFAULT_MAX_ROUNDS,
      perAgentTimeoutMs: DEFAULT_TIMEOUT_MS,
      judge: 'majority',
      ...config,
    }
  }

  async *run(
    topic: string,
    signal?: AbortSignal,
  ): AsyncGenerator<DebateEvent, DebateSummary, unknown> {
    this.startedAt = Date.now()
    this.groupthinkWarnings = []
    this.minorityReport = null
    const abortSignal = signal ?? new AbortController().signal
    const timeoutMs = this.config.perAgentTimeoutMs ?? DEFAULT_TIMEOUT_MS
    const mode = this.config.mode
    const maxRounds = this.config.maxRounds ?? DEFAULT_MAX_ROUNDS
    const agents = Object.keys(this.adapters) as AgentKind[]
    const sanitizedTopic = sanitizeDebateInput(topic)

    // Emit start
    yield { type: 'debate_start', mode, agents }

    try {
      switch (mode) {
        case 'council':
          yield* this.runCouncil(sanitizedTopic, abortSignal, timeoutMs)
          break
        case 'debate':
          yield* this.runDebate(sanitizedTopic, abortSignal, timeoutMs, maxRounds)
          break
        case 'relay':
          yield* this.runRelay(sanitizedTopic, abortSignal, timeoutMs)
          break
        case 'auto':
          yield* this.runAuto(sanitizedTopic, abortSignal, timeoutMs)
          break
      }

      // Check for abort after mode execution
      if (abortSignal.aborted) {
        yield { type: 'error', message: 'Debate aborted' }
      } else {
        // ── Rebuttal round: cross-examine minority opinion ──────────────
        yield* this.runRebuttal(sanitizedTopic, abortSignal, timeoutMs)

        // Judge phase
        yield { type: 'phase_change', phase: 'judge_deliberation' }
        const verdict = await this.judge(sanitizedTopic, abortSignal, timeoutMs)
        const winner = this.determineWinner()
        yield { type: 'verdict', content: verdict, winner }
      }
    } catch (err: unknown) {
      if (abortSignal.aborted) {
        yield { type: 'error', message: 'Debate aborted' }
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        yield { type: 'error', message: msg }
      }
    }

    const durationMs = Date.now() - this.startedAt
    const winner = this.determineWinner()
    const summary: DebateSummary = {
      mode,
      totalRounds: new Set(this.statements.map((s) => s.round)).size,
      statements: this.statements,
      verdict:
        this.statements.length > 0
          ? extractFinalAnswer(this.statements[this.statements.length - 1]?.content ?? '')
          : '',
      winner,
      durationMs,
    }

    yield { type: 'debate_end', summary }
    return summary
  }

  // ── Council Mode ───────────────────────────────────────────────────────

  private async *runCouncil(
    topic: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): AsyncGenerator<DebateEvent, void, unknown> {
    yield { type: 'phase_change', phase: 'council_deliberation' }
    yield { type: 'round_start', round: 1 }

    const positions = shuffleWithSeed(ROLES.council, hashCode(topic))

    // Run all 3 agents in parallel by launching them, then collecting
    const promises = positions.map(async (pos) => {
      if (signal.aborted) return null
      const adapter = this.adapters[pos.kind]
      const prompt = buildSystemPrompt(pos, 'council', topic)
      const content = await collectResponse(adapter, prompt, signal, timeoutMs)
      if (signal.aborted) return null
      const confidence = extractConfidence(content)
      return {
        agent: pos.kind,
        content,
        confidence,
        round: 1,
        timestamp: new Date(),
      } satisfies AgentStatement
    })

    // Yield agent_thinking events as they start
    for (const pos of positions) {
      yield { type: 'agent_thinking', agent: pos.kind }
    }

    const settled = await Promise.all(promises)
    for (const stmt of settled) {
      if (stmt === null) continue
      this.statements.push(stmt)
      yield { type: 'agent_response', statement: stmt }
    }

    yield { type: 'round_end', round: 1 }
  }

  // ── Debate Mode ────────────────────────────────────────────────────────

  private async *runDebate(
    topic: string,
    signal: AbortSignal,
    timeoutMs: number,
    maxRounds: number,
  ): AsyncGenerator<DebateEvent, void, unknown> {
    // Shuffle role assignment per topic — prevents fixed ordering bias
    const positions = shuffleWithSeed(ROLES.debate, hashCode(topic))
    const proposer = positions[0]
    const critic = positions[1]
    const reviser = positions[2]

    let previousContent = topic

    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) return
      yield { type: 'phase_change', phase: 'debate_propose' }
      yield { type: 'round_start', round }

      const roundStatements: AgentStatement[] = []

      // Phase 1: Proposer
      yield { type: 'agent_thinking', agent: proposer.kind }
      const proposerPrompt =
        round === 1
          ? buildSystemPrompt(proposer, 'debate', topic)
          : `Round ${round}. Previous round output:\n${previousContent}\n\nRevise your proposal based on the critique.`
      const proposeContent = await collectResponse(
        this.adapters[proposer.kind],
        proposerPrompt,
        signal,
        timeoutMs,
      )
      if (signal.aborted) return
      const proposeStmt: AgentStatement = {
        agent: proposer.kind,
        content: proposeContent,
        confidence: extractConfidence(proposeContent),
        round,
        timestamp: new Date(),
      }
      roundStatements.push(proposeStmt)
      this.statements.push(proposeStmt)
      yield { type: 'agent_response', statement: proposeStmt }

      // Phase 2: Critic
      yield { type: 'phase_change', phase: 'debate_critique' }
      yield { type: 'agent_thinking', agent: critic.kind }
      const criticPrompt = `Critique the following proposal. Identify flaws, missing edge cases, and risks.\n\nPROPOSAL:\n${proposeContent}`
      const critiqueContent = await collectResponse(
        this.adapters[critic.kind],
        criticPrompt,
        signal,
        timeoutMs,
      )
      if (signal.aborted) return
      const critiqueStmt: AgentStatement = {
        agent: critic.kind,
        content: critiqueContent,
        confidence: extractConfidence(critiqueContent),
        round,
        timestamp: new Date(),
      }
      roundStatements.push(critiqueStmt)
      this.statements.push(critiqueStmt)
      yield { type: 'agent_response', statement: critiqueStmt }

      // Phase 3: Reviser
      yield { type: 'phase_change', phase: 'debate_revise' }
      yield { type: 'agent_thinking', agent: reviser.kind }
      const reviserPrompt = `Synthesize the following proposal and critique into an improved solution.\n\nPROPOSAL:\n${proposeContent}\n\nCRITIQUE:\n${critiqueContent}\n\nProduce a revised, improved answer.`
      const reviseContent = await collectResponse(
        this.adapters[reviser.kind],
        reviserPrompt,
        signal,
        timeoutMs,
      )
      if (signal.aborted) return
      const reviseStmt: AgentStatement = {
        agent: reviser.kind,
        content: reviseContent,
        confidence: extractConfidence(reviseContent),
        round,
        timestamp: new Date(),
      }
      roundStatements.push(reviseStmt)
      this.statements.push(reviseStmt)
      yield { type: 'agent_response', statement: reviseStmt }

      yield { type: 'round_end', round }
      previousContent = reviseContent

      // Two-tier groupthink detection:
      //   >0.9  → hard groupthink, force another round
      //   0.7-0.9 → mild concern, add warning but converge
      //   <=0.7 with high confidence → confident impasse (genuine disagreement)
      const allHighConfidence = roundStatements.every((s) => s.confidence >= 0.8)
      const roundAgreement = computeAgreement(roundStatements.map((s) => s.content))
      const isHardGroupthink = allHighConfidence && roundAgreement > 0.9
      const isMildGroupthink = allHighConfidence && roundAgreement > 0.7 && roundAgreement <= 0.9
      if (allHighConfidence && !isHardGroupthink) {
        if (isMildGroupthink) {
          this.groupthinkWarnings.push(
            `Round ${round}: agents highly aligned (agreement=${roundAgreement.toFixed(2)}). ` +
              `Verify that no counter-arguments were overlooked in the final verdict.`,
          )
        } else if (roundAgreement <= 0.7) {
          this.groupthinkWarnings.push(
            `Round ${round}: agents are confident but divergent (agreement=${roundAgreement.toFixed(2)}). ` +
              `Possible genuine impasse — not groupthink. Verify each position's evidence independently.`,
          )
        }
        break
      }
      if (isHardGroupthink) {
        this.groupthinkWarnings.push(
          `Round ${round}: potential groupthink detected (agreement=${roundAgreement.toFixed(2)} > 0.9). ` +
            `Forcing additional round to surface dissent.`,
        )
      }
    }
  }

  // ── Relay Mode ─────────────────────────────────────────────────────────

  private async *runRelay(
    topic: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): AsyncGenerator<DebateEvent, void, unknown> {
    yield { type: 'phase_change', phase: 'relay_handoff' }
    yield { type: 'round_start', round: 1 }

    let handoff = topic
    const positions = shuffleWithSeed(ROLES.relay, hashCode(topic))

    for (const pos of positions) {
      if (signal.aborted) return
      yield { type: 'agent_thinking', agent: pos.kind }

      const prompt =
        pos.label === 'First Pass'
          ? buildSystemPrompt(pos, 'relay', topic)
          : `Previous agent output:\n${handoff}\n\n${pos.label === 'Second Pass' ? 'Review, refine, and extend this analysis.' : 'Produce the polished final output, integrating all prior work.'}\n\nEnd with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your conclusion>`

      const content = await collectResponse(this.adapters[pos.kind], prompt, signal, timeoutMs)
      if (signal.aborted) return

      const stmt: AgentStatement = {
        agent: pos.kind,
        content,
        confidence: extractConfidence(content),
        round: 1,
        timestamp: new Date(),
      }
      this.statements.push(stmt)
      yield { type: 'agent_response', statement: stmt }
      handoff = content
    }

    yield { type: 'round_end', round: 1 }
  }

  // ── Auto Mode ───────────────────────────────────────────────────────────

  private async *runAuto(
    topic: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): AsyncGenerator<DebateEvent, void, unknown> {
    const autoCfg = { ...DEFAULT_AUTO, ...this.config.auto }
    const agents = Object.keys(this.adapters) as AgentKind[]
    const positions = shuffleWithSeed(ROLES.auto, hashCode(topic))

    // ── Phase 1: Probe round — all agents answer independently ────────
    yield { type: 'phase_change', phase: 'auto_probe' }
    yield { type: 'round_start', round: 0 }

    const probeResults: AgentStatement[] = []
    const probeContent: string[] = []

    const probePromises = positions.map(async (pos) => {
      if (signal.aborted) return null
      const adapter = this.adapters[pos.kind]
      const prompt = buildSystemPrompt(pos, 'council', topic)
      const content = await collectResponse(adapter, prompt, signal, timeoutMs)
      if (signal.aborted) return null
      return {
        agent: pos.kind,
        content,
        confidence: extractConfidence(content),
        round: 0,
        timestamp: new Date(),
      } satisfies AgentStatement
    })

    for (const pos of positions) {
      yield { type: 'agent_thinking', agent: pos.kind }
    }

    const settled = await Promise.all(probePromises)
    for (const stmt of settled) {
      if (stmt === null) continue
      probeResults.push(stmt)
      probeContent.push(stmt.content)
      this.statements.push(stmt)
      yield { type: 'agent_response', statement: stmt }
    }

    yield { type: 'round_end', round: 0 }

    if (signal.aborted) return

    // ── Phase 2: Compute agreement & route ─────────────────────────────
    const agreement = computeAgreement(probeContent)
    const route: 'vote' | 'debate' | 'escalate' =
      agreement >= autoCfg.highAgreement
        ? 'vote'
        : agreement <= autoCfg.lowAgreement
          ? 'escalate'
          : 'debate'

    const reason =
      route === 'vote'
        ? `High agreement (${agreement.toFixed(3)} >= ${autoCfg.highAgreement}) — fast vote`
        : route === 'debate'
          ? `Moderate agreement (${agreement.toFixed(3)} in [${autoCfg.lowAgreement}, ${autoCfg.highAgreement}]) — critique protocol`
          : `Low agreement (${agreement.toFixed(3)} <= ${autoCfg.lowAgreement}) — escalated critique`

    yield { type: 'auto_decision', agreement, route, reason }

    // ── Phase 3: Fast vote — probe answers are sufficient ──────────────
    if (route === 'vote') {
      return // Go directly to judge
    }

    // ── Phase 4: Debate / Escalate — critique rounds ───────────────────
    const maxRounds = route === 'debate' ? autoCfg.debateRounds : autoCfg.escalatedRounds
    const escalateMode = route === 'escalate'

    // Build initial context: each agent sees its own probe + others' probes
    const probeContext = probeResults
      .map(
        (stmt) =>
          `### ${stmt.agent} (probe, confidence: ${stmt.confidence.toFixed(2)})\n${stmt.content.slice(0, 1500)}`,
      )
      .join('\n\n')

    let roundContext = probeContext

    // Shuffle debate roles per topic — prevents fixed ordering bias
    // (same seed used for probe-phase shuffle to keep the assignment consistent)
    const debatePositions = shuffleWithSeed(ROLES.debate, hashCode(topic))
    const proposer = debatePositions[0]
    const critic = debatePositions[1]
    const reviser = debatePositions[2]

    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) return
      yield { type: 'phase_change', phase: 'debate_propose' }
      yield { type: 'round_start', round }

      const roundStatements: AgentStatement[] = []

      // Proposer: synthesizes or revises based on prior context
      yield { type: 'agent_thinking', agent: proposer.kind }
      const proposerPrompt = escalateMode
        ? `ESCLATED CRITIQUE — agreement was low (${agreement.toFixed(2)}). You MUST produce a concrete answer. Do not hedge.\n\nTOPIC: ${topic}\n\nALL PROBE ANSWERS:\n${roundContext}\n\nRound ${round}/${maxRounds}. Provide a decisive, specific answer. End with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your conclusion>`
        : `DEBATE ROUND ${round}/${maxRounds}.\n\nTOPIC: ${topic}\n\nALL ANSWERS SO FAR:\n${roundContext}\n\nReview all answers, synthesise the strongest arguments, and produce an improved answer. End with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your conclusion>`
      const proposeContent = await collectResponse(
        this.adapters[proposer.kind],
        proposerPrompt,
        signal,
        timeoutMs,
      )
      if (signal.aborted) return
      const proposeStmt: AgentStatement = {
        agent: proposer.kind,
        content: proposeContent,
        confidence: extractConfidence(proposeContent),
        round,
        timestamp: new Date(),
      }
      roundStatements.push(proposeStmt)
      this.statements.push(proposeStmt)
      yield { type: 'agent_response', statement: proposeStmt }

      // Critic
      yield { type: 'phase_change', phase: 'debate_critique' }
      yield { type: 'agent_thinking', agent: critic.kind }
      const criticPrompt = escalateMode
        ? `ESCLATED CRITIQUE ROUND ${round}/${maxRounds}.\n\nCRITIQUE the following answer — identify weaknesses, contradictions with other probe answers, and missing evidence. Be specific.\n\nANSWER TO CRITIQUE:\n${proposeContent}\n\nOTHER PROBE ANSWERS:\n${roundContext}\n\nEnd with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your assessment>`
        : `Evaluate the following answer. Identify strengths and weaknesses compared to the other agents.\n\nANSWER:\n${proposeContent}\n\nALL PRIOR ANSWERS:\n${roundContext}\n\nEnd with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your assessment>`
      const critiqueContent = await collectResponse(
        this.adapters[critic.kind],
        criticPrompt,
        signal,
        timeoutMs,
      )
      if (signal.aborted) return
      const critiqueStmt: AgentStatement = {
        agent: critic.kind,
        content: critiqueContent,
        confidence: extractConfidence(critiqueContent),
        round,
        timestamp: new Date(),
      }
      roundStatements.push(critiqueStmt)
      this.statements.push(critiqueStmt)
      yield { type: 'agent_response', statement: critiqueStmt }

      // Reviser
      yield { type: 'phase_change', phase: 'debate_revise' }
      yield { type: 'agent_thinking', agent: reviser.kind }
      const reviserPrompt = escalateMode
        ? `FINAL SYNTHESIS ROUND ${round}/${maxRounds}.\n\nYou MUST produce a concrete, specific final answer. Synthesize the proposal and critique.\n\nPROPOSAL:\n${proposeContent}\n\nCRITIQUE:\n${critiqueContent}\n\nEnd with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your conclusion>`
        : `Synthesize the proposal and critique into an improved answer.\n\nPROPOSAL:\n${proposeContent}\n\nCRITIQUE:\n${critiqueContent}\n\nEnd with:\nCONFIDENCE: <0.0-1.0>\nFINAL ANSWER: <your conclusion>`
      const reviseContent = await collectResponse(
        this.adapters[reviser.kind],
        reviserPrompt,
        signal,
        timeoutMs,
      )
      if (signal.aborted) return
      const reviseStmt: AgentStatement = {
        agent: reviser.kind,
        content: reviseContent,
        confidence: extractConfidence(reviseContent),
        round,
        timestamp: new Date(),
      }
      roundStatements.push(reviseStmt)
      this.statements.push(reviseStmt)
      yield { type: 'agent_response', statement: reviseStmt }

      yield { type: 'round_end', round }

      // Update context for next round
      roundContext = roundStatements
        .map(
          (s) =>
            `### ${s.agent} (round ${round}, confidence: ${s.confidence.toFixed(2)})\n${s.content.slice(0, 1500)}`,
        )
        .join('\n\n')

      // Two-tier groupthink detection (same as runDebate)
      const allHigh = roundStatements.every((s) => s.confidence >= 0.8)
      const roundAgreement = computeAgreement(roundStatements.map((s) => s.content))
      const isHardGroupthink = allHigh && roundAgreement > 0.9
      const isMildGroupthink = allHigh && roundAgreement > 0.7 && roundAgreement <= 0.9
      if (allHigh && !isHardGroupthink) {
        if (isMildGroupthink) {
          this.groupthinkWarnings.push(
            `Auto round ${round}: agents highly aligned (agreement=${roundAgreement.toFixed(2)}). ` +
              `Verify that no counter-arguments were overlooked in the final verdict.`,
          )
        } else if (roundAgreement <= 0.7) {
          this.groupthinkWarnings.push(
            `Auto round ${round}: agents are confident but divergent (agreement=${roundAgreement.toFixed(2)}). ` +
              `Possible genuine impasse — not groupthink. Verify each position's evidence independently.`,
          )
        }
        break
      }
      if (isHardGroupthink) {
        this.groupthinkWarnings.push(
          `Auto round ${round}: potential groupthink detected (agreement=${roundAgreement.toFixed(2)} > 0.9). ` +
            `Forcing additional round to surface dissent.`,
        )
      }
    }
  }

  // ── Rebuttal ───────────────────────────────────────────────────────────

  /**
   * Find the agent whose response is least similar to the group.
   * Returns [minorityAgent, jaccardScore] or null if no clear minority exists.
   */
  private findMinority(): { agent: AgentKind; jaccard: number; statement: AgentStatement } | null {
    const lastRound = Math.max(...this.statements.map((s) => s.round))
    const finalStatements = this.statements.filter((s) => s.round === lastRound)
    // Need >= 3 statements to detect a 2-vs-1 split. With only 1-2 statements
    // there isn't enough data to establish a majority bloc vs minority pattern.
    if (finalStatements.length < 3) return null

    let minIsolation = 1
    let minorityMajorityCohesion = 1
    let minority: { agent: AgentKind; jaccard: number; statement: AgentStatement } | null = null

    for (const stmt of finalStatements) {
      const otherContents = finalStatements
        .filter((s) => s.agent !== stmt.agent)
        .map((s) => s.content)
      // Per-agent isolation: average pairwise Jaccard of this agent vs each other agent.
      // Using only agent-vs-other pairs avoids inflating the score when other agents
      // strongly agree with each other (which would otherwise mask outlier dissent).
      let totalJaccard = 0
      for (const oc of otherContents) {
        totalJaccard += computeAgreement([stmt.content, oc])
      }
      const avgIsolation = otherContents.length > 0 ? totalJaccard / otherContents.length : 1

      // Majority cohesion: compute Jaccard between the other agents themselves.
      // If they don't agree with each other, there is no coherent "majority"
      // — the group is just fragmented (3-way disagreement, not 2-vs-1).
      const majorityCohesion = otherContents.length >= 2 ? computeAgreement(otherContents) : 1

      if (avgIsolation < minIsolation) {
        minIsolation = avgIsolation
        minorityMajorityCohesion = majorityCohesion
        minority = { agent: stmt.agent, jaccard: avgIsolation, statement: stmt }
      }
    }

    // Require BOTH: candidate is isolated AND the rest actually form a coherent bloc
    if (minority && minority.jaccard < MINORITY_JACCARD_THRESHOLD) {
      if (minorityMajorityCohesion < MAJORITY_COHESION_THRESHOLD) {
        // The "majority" doesn't agree with each other — this is
        // a 3-way disagreement, not a 2-vs-1 minority situation.
        return null
      }
      return minority
    }
    return null
  }

  /**
   * Cross-examination rebuttal round: when a minority opinion is detected
   * (Jaccard < 0.3), send it back to the other 2 agents for targeted rebuttal.
   * This forces the majority to engage with dissent before the final verdict.
   */
  private async *runRebuttal(
    topic: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): AsyncGenerator<DebateEvent, void, unknown> {
    const minority = this.findMinority()
    if (!minority) return

    // Store for judge() — after rebuttal, the minority statement is at a
    // different round than majority rebuttal responses, so findMinority()
    // alone cannot re-discover it in the judge phase.
    this.minorityReport = {
      agent: minority.agent,
      jaccard: minority.jaccard,
      content: minority.statement.content,
    }

    const majorityAgents = (Object.keys(this.adapters) as AgentKind[]).filter(
      (k) => k !== minority.agent,
    )
    if (majorityAgents.length < 1) return

    yield { type: 'phase_change', phase: 'debate_critique' }
    yield {
      type: 'round_start',
      round: this.statements.length > 0 ? Math.max(...this.statements.map((s) => s.round)) + 1 : 1,
    }

    const minorityContent = minority.statement.content.slice(0, 2000)
    const rebuttalRound =
      this.statements.length > 0 ? Math.max(...this.statements.map((s) => s.round)) + 1 : 1

    // Send minority opinion to each majority agent for rebuttal
    const rebuttalPromises = majorityAgents.map(async (agentKind) => {
      if (signal.aborted) return null
      const adapter = this.adapters[agentKind]
      const prompt = `REBUTTAL ROUND: A minority dissenting opinion has been raised. You must engage with it substantively.

TOPIC: ${topic}

MINORITY OPINION (from ${minority.agent}):
${minorityContent}

YOUR TASK:
1. Identify any valid points the minority raises — acknowledge them if they have merit.
2. If the minority is mistaken, explain specifically why with evidence.
3. If the minority exposes a genuine gap, admit it and refine your position accordingly.
4. End with:
CONFIDENCE: <0.0-1.0>
FINAL ANSWER: <your rebuttal or refined position>`

      const content = await collectResponse(adapter, prompt, signal, timeoutMs)
      if (signal.aborted) return null
      return {
        agent: agentKind,
        content,
        confidence: extractConfidence(content),
        round: rebuttalRound,
        timestamp: new Date(),
      } satisfies AgentStatement
    })

    // Yield thinking events for rebuttal participants
    for (const agentKind of majorityAgents) {
      yield { type: 'agent_thinking', agent: agentKind }
    }

    const settled = await Promise.all(rebuttalPromises)
    for (const stmt of settled) {
      if (stmt === null) continue
      this.statements.push(stmt)
      yield { type: 'agent_response', statement: stmt }
    }

    // Note: the minority agent's original statement already exists in this.statements
    // from the probe/council/debate phase. We intentionally do NOT re-add it here
    // — re-adding with a different round/timestamp would create a duplicate that
    // corrupts determineWinner() and judge() summaries.

    yield { type: 'round_end', round: rebuttalRound }
  }

  // ── Judge ──────────────────────────────────────────────────────────────

  private async judge(topic: string, signal: AbortSignal, timeoutMs: number): Promise<string> {
    if (this.statements.length === 0) return 'No statements to judge.'

    const judgeKind = this.config.judge ?? 'majority'

    if (judgeKind === 'majority') {
      // Simple majority: pick the statement with highest confidence
      const best = this.statements.reduce((a, b) => (a.confidence >= b.confidence ? a : b))

      // Warn if all agents returned default confidence (no structured markers found)
      const allDefault = this.statements.every((s) => s.confidence === 0.5)
      const defaultWarning = allDefault
        ? '\n[WARNING: All agents returned default confidence — no structured CONFIDENCE markers found. Winner selected arbitrarily.]'
        : ''

      // Detect minority opinion (post-rebuttal) + reasoning quality flags
      let minorityNote = ''
      let qualityNote = ''
      if (this.minorityReport) {
        minorityNote = `\n\n[MINORITY OPINION: ${this.minorityReport.agent} presents a dissenting view (Jaccard=${this.minorityReport.jaccard.toFixed(2)}) that survived rebuttal — consider this before accepting the majority.]`
      }

      const lastRound = Math.max(...this.statements.map((s) => s.round))
      const finalStatements = this.statements.filter((s) => s.round === lastRound)
      if (finalStatements.length >= 2) {
        // Reasoning quality: flag high-confidence but shallow responses
        const qualityScores = finalStatements.map((s) => ({
          agent: s.agent,
          quality: computeReasoningQuality(s.content),
        }))
        const highConfLowQuality = finalStatements.filter((s) => {
          const q = qualityScores.find((qs) => qs.agent === s.agent)?.quality ?? 0
          return s.confidence >= 0.8 && q < 0.3
        })
        if (highConfLowQuality.length > 0) {
          qualityNote = `\n\n[QUALITY FLAG: ${highConfLowQuality.map((s) => s.agent).join(', ')} reported high confidence (≥0.8) but low reasoning quality — verify before relying on these assessments.]`
        }
      }

      return `[Majority vote — selected ${best.agent} (confidence: ${best.confidence.toFixed(2)})]\n\n${extractFinalAnswer(best.content)}${minorityNote}${qualityNote}${defaultWarning}`
    }

    // Use a specific agent as judge
    const judgeAdapter = this.adapters[judgeKind]
    if (!judgeAdapter) {
      return `Judge agent '${judgeKind}' not available. Falling back to majority vote.\n\n${extractFinalAnswer(this.statements.reduce((a, b) => (a.confidence >= b.confidence ? a : b)).content)}`
    }

    const prompt = buildJudgePrompt(topic, this.statements, this.groupthinkWarnings)
    const verdict = await collectResponse(judgeAdapter, prompt, signal, timeoutMs)
    return verdict
  }

  /** Determine the winner based on confidence scores in the final round. */
  private determineWinner(): AgentKind | undefined {
    if (this.statements.length === 0) return undefined

    // Get statements from the last round only
    const lastRound = Math.max(...this.statements.map((s) => s.round))
    const finalStatements = this.statements.filter((s) => s.round === lastRound)
    if (finalStatements.length === 0) return undefined

    // When all confidences are default (0.5), use response length as tiebreaker.
    // This signals that no agent produced a structured CONFIDENCE: marker, so
    // the verdict is inherently low-quality — log for diagnostics.
    const allDefault = finalStatements.every((s) => s.confidence === DEFAULT_CONFIDENCE)
    if (allDefault) {
      console.warn(
        `[debate] All agents at default confidence (${DEFAULT_CONFIDENCE}) — using response-length tiebreaker. ` +
          `Agent response lengths: ${finalStatements.map((s) => `${s.agent}=${s.content.length}ch`).join(', ')}`,
      )
      const longest = finalStatements.reduce((a, b) =>
        a.content.length >= b.content.length ? a : b,
      )
      return longest.agent
    }

    const best = finalStatements.reduce((a, b) => (a.confidence >= b.confidence ? a : b))
    return best.agent
  }

  /** Release all agent adapters. */
  dispose(): void {
    for (const adapter of Object.values(this.adapters)) {
      try {
        adapter.dispose()
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
