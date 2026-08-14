/**
 * Loop Gate Entry Point — bridges the query layer to LoopManager.
 *
 * The query layer detects an implementation or review request and calls
 * `runLoopGate()` instead of the normal `queryLoop()`. This wraps
 * `LoopManager.run()`, translates the gate verdict into query-compatible
 * stream events, and returns the final verdict string.
 *
 * The `queryFn` callback avoids a circular import between this module and
 * query.ts (same pattern as autoDebateEntry.ts).
 */

import { errorMessage } from '../../utils/errors.js'
import type { QueryFn } from './autoDebateEntry.js'
import type { GateKind } from './gate-assessment.js'
import { LoopManager, type LoopType } from './loop-manager.js'

export interface LoopGateOptions {
  loopType: LoopType
  gateKind: GateKind
  userMessage: string
  queryFn: QueryFn
  signal?: AbortSignal
}

const HEADER: Record<GateKind, string> = {
  'pre-implementation': '方案选择 Gate（实现前）',
  'post-review': '代码审查 Gate',
  'pre-commit': '提交前 Gate',
}

/**
 * Run a LoopManager gate and stream the verdict as text chunks.
 *
 * For the `implement` loopType (pre-implementation), only the pre-gate is
 * consumed — the placeholder ticks and the empty post-gate are skipped.
 */
export async function* runLoopGate(
  opts: LoopGateOptions,
): AsyncGenerator<{ type: 'text_chunk'; content: string }, string> {
  const { loopType, gateKind, userMessage, queryFn, signal } = opts

  const abortController = new AbortController()
  const linkedAbort = () => abortController.abort()
  signal?.addEventListener('abort', linkedAbort, { once: true })

  // Query executor for the claude-haha adapter (LoopManager owns the model
  // heterogeneity / CLI fallback logic itself).
  const queryExecutor = (
    prompt: string,
    ac: AbortController,
    modelOverride?: string,
  ): AsyncGenerator<{ type: string; text?: string; [k: string]: unknown }, void, unknown> =>
    queryFn(prompt, ac, modelOverride)

  const manager = new LoopManager({ loopType, gateKind, queryExecutor })

  let finalVerdict = ''

  try {
    for await (const event of manager.run(userMessage, abortController.signal)) {
      if (event.type === 'gate_result') {
        finalVerdict = event.verdict
        if (loopType === 'implement' && event.gate === 'pre') {
          // Pre-implementation: only the approach-selection gate matters.
          break
        }
      }
    }
  } catch (err: unknown) {
    finalVerdict = `Loop gate failed: ${errorMessage(err)}`
  } finally {
    manager.dispose()
    signal?.removeEventListener('abort', linkedAbort)
  }

  if (!finalVerdict) {
    finalVerdict = 'Loop gate completed but produced no verdict.'
  }

  yield { type: 'text_chunk', content: `\n=== ${HEADER[gateKind]} ===\n` }

  const chunkSize = 80
  for (let i = 0; i < finalVerdict.length; i += chunkSize) {
    yield { type: 'text_chunk', content: finalVerdict.slice(i, i + chunkSize) }
  }

  return finalVerdict
}
