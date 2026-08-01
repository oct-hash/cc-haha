/**
 * AgentAdapter — abstract interface every agent backend must implement.
 *
 * All three adapters (claude-haha, claude-code, codex) conform to this
 * interface so the REPL can consume them through a single code path.
 *
 * Design: `chatStream(userMessage, abortController)` — a simple string + abort.
 * The claude-haha adapter is pre-configured at creation time with a query executor
 * closure that wraps all the internal QueryParams assembly.
 */

import type { AgentConfig, AgentKind, AgentStatus, NormalizedEvent } from './types.js'

export interface AgentAdapter {
  /** Which backend this adapter wraps. */
  readonly kind: AgentKind

  /** Current lifecycle status. */
  readonly status: AgentStatus

  /**
   * Start a streaming chat turn.
   *
   * @param userMessage — the user's raw input text
   * @param abortController — external abort signal (e.g., Ctrl+C in REPL)
   *
   * Returns an AsyncGenerator that yields NormalizedEvent values.
   */
  chatStream(
    userMessage: string,
    abortController: AbortController,
  ): AsyncGenerator<NormalizedEvent, void, unknown>

  /**
   * Interrupt (abort) the current turn.
   * Must be safe to call when idle (no-op).
   */
  interrupt(): void

  /**
   * Release all resources (subprocess handles, file descriptors, timers).
   * After dispose() the adapter must not be reused.
   */
  dispose(): void
}

/** Constructor signature. Each adapter module exports a function of this type. */
export type AgentAdapterFactory = (config?: AgentConfig) => AgentAdapter
