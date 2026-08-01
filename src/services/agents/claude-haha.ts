/**
 * Claude Haha Adapter — wraps the built-in query() AsyncGenerator.
 *
 * This is the zero-overhead path: no subprocess, no serialization.
 *
 * At creation time, the adapter is configured with a `queryExecutor` closure
 * that assembles QueryParams (messages, systemPrompt, userContext, etc.) and
 * calls `query()`. The adapter itself only handles event translation.
 */

import type { AgentAdapter, AgentAdapterFactory } from './adapter.js'
import type { AgentConfig, AgentStatus, NormalizedEvent } from './types.js'

// -- internal types ----------------------------------------------------------

/** The subset of a Message event from query() that has a content field. */
interface ContentMessage {
  type: string
  content?: unknown
  message?: unknown
}

type StreamEventShape = { type: string; text?: string; delta?: { type?: string; text?: string } }

type RawEvent = StreamEventShape | ContentMessage | { type: string; [k: string]: unknown }

/**
 * Function that the handler configures and passes to the adapter.
 * Internally assembles `QueryParams` and calls `query()`.
 */
export type QueryExecutor = (
  userMessage: string,
  abortController: AbortController,
) => AsyncGenerator<RawEvent, void, unknown>

// -- factory -----------------------------------------------------------------

interface ClaudeHahaConfig extends AgentConfig {
  /** Pre-configured query executor (handler assembles QueryParams internally). */
  queryExecutor: QueryExecutor
}

export const createClaudeHahaAdapter: AgentAdapterFactory = (
  config?: AgentConfig,
): AgentAdapter => {
  const hahaConfig = config as ClaudeHahaConfig | undefined
  if (!hahaConfig?.queryExecutor) {
    throw new Error(
      'claude-haha adapter requires `queryExecutor` in config — this is configured by the REPL handler',
    )
  }

  const queryExecutor = hahaConfig.queryExecutor
  let status: AgentStatus = 'idle'
  let activeAbortController: AbortController | null = null

  return {
    kind: 'claude-haha',

    get status() {
      return status
    },

    async *chatStream(
      userMessage: string,
      abortController: AbortController,
    ): AsyncGenerator<NormalizedEvent, void, unknown> {
      if (status !== 'idle') {
        yield { type: 'error', message: `Agent is not idle (current: ${status})` }
        return
      }

      status = 'running'
      activeAbortController = abortController

      try {
        for await (const event of queryExecutor(userMessage, abortController)) {
          yield* translateEvent(event)
        }
      } catch (err: unknown) {
        if ((status as AgentStatus) !== 'killed') {
          status = 'error'
          const message = err instanceof Error ? err.message : 'Unexpected error'
          yield { type: 'error', message }
          throw err // Re-throw so retry loops (SessionManager) can detect failure
        }
        return
      } finally {
        activeAbortController = null
      }

      if (status === 'running' && !abortController.signal.aborted) {
        yield { type: 'done' }
        status = 'idle'
      }
    },

    interrupt(): void {
      status = 'killed'
      activeAbortController?.abort()
    },

    dispose(): void {
      this.interrupt()
    },
  }
}

// -- event translation -------------------------------------------------------

async function* translateEvent(event: RawEvent): AsyncGenerator<NormalizedEvent, void, unknown> {
  switch (event.type) {
    case 'stream': {
      // StreamEvent carries incremental text deltas
      const se = event as StreamEventShape
      const text = se.text ?? se.delta?.text
      if (typeof text === 'string') {
        yield { type: 'text_chunk', content: text }
      }
      break
    }

    case 'assistant': {
      // AssistantMessage — extract text content and tool_use blocks
      const msg = event as ContentMessage
      const content = extractContentBlocks(msg)
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          yield { type: 'text_chunk', content: block.text }
        }
        if (block.type === 'tool_use') {
          yield {
            type: 'tool_call_start',
            toolUseId: block.id ?? 'unknown',
            name: block.name ?? 'unknown',
            inputPreview: safePreview(block.input),
          }
        }
      }
      break
    }

    case 'user': {
      const msg = event as ContentMessage & { is_error?: boolean }
      const content = extractContentBlocks(msg)
      for (const block of content) {
        if (block.type === 'tool_result') {
          yield {
            type: 'tool_call_end',
            toolUseId: block.tool_use_id ?? 'unknown',
            isError: msg.is_error === true,
            outputPreview: safePreview(block.content),
          }
        }
      }
      break
    }

    case 'request_start':
    case 'tool_use_summary':
    case 'tombstone':
    case 'attachment':
    case 'system':
      // Structural/framework events — not surfaced to user
      break

    default:
      break
  }
}

// -- helpers -----------------------------------------------------------------

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
}

function extractContentBlocks(msg: ContentMessage): ContentBlock[] {
  const raw = msg.content ?? msg.message
  if (Array.isArray(raw)) return raw as ContentBlock[]
  if (typeof raw === 'object' && raw !== null) {
    const inner = (raw as Record<string, unknown>).content
    if (Array.isArray(inner)) return inner as ContentBlock[]
  }
  return []
}

function safePreview(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 200)
  try {
    return JSON.stringify(value).slice(0, 200)
  } catch {
    return ''
  }
}
