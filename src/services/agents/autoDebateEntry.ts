/**
 * Auto-Debate Entry Point — bridges the query layer to the multi-agent debate system.
 *
 * When the query layer detects a decision-type question, it calls `runAutoDebate()`
 * instead of the normal `queryLoop()`. This function:
 *   1. Creates AgentAdapter instances for all 3 agent kinds
 *   2. Falls back to claude-haha for any CLI-based adapter that fails
 *   3. Runs the DebateOrchestrator in auto mode
 *   4. Collects the verdict and yields it as query-compatible stream events
 *
 * The `queryFn` callback avoids a circular import between this module and query.ts:
 * the caller (query.ts) wraps `query()` into a closure and passes it in.
 */

import type { AgentAdapter } from './adapter.js'
import type { DebateEvent, } from './debate.js'
import { DebateOrchestrator } from './debate.js'
import { createAgentAdapter } from './factory.js'
import type { AgentKind } from './types.js'

// ── Query Fn callback ──────────────────────────────────────────────────────

/**
 * Simplified query interface that the caller (query.ts) implements by wrapping
 * the real `query()` function. Takes a prompt string + AbortController and
 * yields raw query events.
 */
export type QueryFn = (
  prompt: string,
  abortController: AbortController,
  modelOverride?: string,
) => AsyncGenerator<{ type: string; text?: string; [k: string]: unknown }, void, unknown>

// ── Result type ────────────────────────────────────────────────────────────

export interface AutoDebateResult {
  verdict: string
  winner?: AgentKind
  durationMs: number
  totalRounds: number
}

// ── Entry point ────────────────────────────────────────────────────────────

/**
 * Run a decision question through the multi-agent debate system (auto mode).
 *
 * Creates 3 agent adapters with graceful fallback: tries claude-code and codex
 * as CLI subprocesses first; if either fails (binary not installed, etc.), falls
 * back to claude-haha using the provided `queryFn`.
 *
 * Yields progress events during debate execution. Once the verdict is ready,
 * yields it as `text_chunk` events compatible with the query stream consumer.
 */
export async function* runAutoDebate(
  userMessage: string,
  queryFn: QueryFn,
  signal?: AbortSignal,
): AsyncGenerator<DebateEvent | { type: 'text_chunk'; content: string }, AutoDebateResult> {
  const abortController = new AbortController()
  const linkedAbort = () => abortController.abort()
  signal?.addEventListener('abort', linkedAbort, { once: true })

  // ── Create query executor for claude-haha adapter ───────────────────────
  const queryExecutor = (
    prompt: string,
    ac: AbortController,
    modelOverride?: string,
  ): AsyncGenerator<{ type: string; text?: string; [k: string]: unknown }, void, unknown> => {
    return queryFn(prompt, ac, modelOverride)
  }

  // ── Model heterogeneity: assign different models per agent kind ──────────
  const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
  function validateModel(value: string | undefined, envVar: string): string | undefined {
    if (value === undefined) return undefined
    if (!MODEL_PATTERN.test(value)) {
      console.error(
        `[autoDebate] ${envVar}="${value}" is not a valid model name — ignoring. Expected alphanumeric with dots/hyphens (max 128 chars).`,
      )
      return undefined
    }
    return value
  }

  const DEBATE_MODELS: Partial<Record<AgentKind, string | undefined>> = {
    'claude-haha': validateModel(process.env.DEBATE_MODEL_HAHA, 'DEBATE_MODEL_HAHA'),
    'claude-code': validateModel(process.env.DEBATE_MODEL_CLAUDE, 'DEBATE_MODEL_CLAUDE'),
    codex: validateModel(process.env.DEBATE_MODEL_CODEX, 'DEBATE_MODEL_CODEX'),
  }

  // ── Build adapters with graceful fallback ───────────────────────────────
  const adapters = {} as Record<AgentKind, AgentAdapter>

  // claude-haha always works (uses the queryFn callback)
  adapters['claude-haha'] = createAgentAdapter('claude-haha', {
    queryExecutor,
    maxTurns: 5,
    model: DEBATE_MODELS['claude-haha'],
  })

  // Try CLI-based adapters, fall back to claude-haha on failure
  const cliKinds: AgentKind[] = ['claude-code', 'codex']
  for (const kind of cliKinds) {
    try {
      adapters[kind] = createAgentAdapter(kind, {
        maxTurns: 5,
        model: DEBATE_MODELS[kind],
      })
    } catch {
      // CLI binary not available — reuse claude-haha with a distinct instance.
      // Drop the model override: the env var was configured for a different CLI
      // backend and may not be compatible with claude-haha's API.
      console.error(
        `[autoDebate] ${kind} adapter unavailable, falling back to claude-haha. ` +
          `Model override "${DEBATE_MODELS[kind]}" dropped — may not be compatible.`,
      )
      adapters[kind] = createAgentAdapter('claude-haha', {
        queryExecutor,
        maxTurns: 5,
      })
    }
  }

  // ── Run debate ──────────────────────────────────────────────────────────
  const orchestrator = new DebateOrchestrator(adapters, {
    mode: 'auto',
    perAgentTimeoutMs: 120_000,
  })

  let finalVerdict = ''
  let finalWinner: AgentKind | undefined
  let finalRounds = 0
  let finalDurationMs = 0

  try {
    for await (const event of orchestrator.run(userMessage, abortController.signal)) {
      // Forward debate events so the caller can track progress
      yield event

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
    finalVerdict = `Debate failed: ${msg}. Please try rephrasing your question.`
  } finally {
    signal?.removeEventListener('abort', linkedAbort)
  }

  // ── Ensure we always have a verdict to surface ───────────────────────────
  if (!finalVerdict) {
    finalVerdict = 'Debate completed but produced no verdict. Please try rephrasing your question.'
  }

  // ── Yield verdict as text chunks ────────────────────────────────────────
  if (finalVerdict) {
    // Yield in reasonable chunks so the TUI renders progressively
    const chunkSize = 80
    for (let i = 0; i < finalVerdict.length; i += chunkSize) {
      yield {
        type: 'text_chunk',
        content: finalVerdict.slice(i, i + chunkSize),
      }
    }
  }

  return {
    verdict: finalVerdict,
    winner: finalWinner,
    durationMs: finalDurationMs,
    totalRounds: finalRounds,
  }
}
