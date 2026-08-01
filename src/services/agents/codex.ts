/**
 * Codex CLI Adapter — spawns the `codex` CLI binary.
 *
 * Subprocess protocol:
 *   codex exec --json <message>
 *
 * Each stdout line is a JSON object. We parse and translate to NormalizedEvent.
 */

import type { Subprocess } from 'bun'
import { randomUUID } from 'crypto'
import type { AgentAdapter } from './adapter.js'
import type { AgentConfig, AgentKind, AgentStatus, NormalizedEvent } from './types.js'

const CODEX_BIN = 'codex'

export function createCodexAdapter(config?: AgentConfig): AgentAdapter {
  const sessionId = randomUUID()
  let status: AgentStatus = 'idle'
  let proc: Subprocess | null = null

  function buildArgs(userMessage: string): string[] {
    const args = ['exec', '--json', userMessage]

    if (config?.systemPromptPath) {
      args.push('--system-prompt', config.systemPromptPath)
    }

    if (config?.extraArgs) {
      args.push(...config.extraArgs)
    }

    return args
  }

  return {
    kind: 'codex' as AgentKind,

    get status() {
      return status
    },

    async *chatStream(
      userMessage: string,
      abortController: AbortController,
    ): AsyncGenerator<NormalizedEvent, void, unknown> {
      if (status !== 'idle') {
        yield { type: 'error', message: `Agent is not idle (current status: ${status})` }
        return
      }

      status = 'running'

      const onAbort = () => this.interrupt()
      abortController.signal.addEventListener('abort', onAbort)

      yield { type: 'session', sessionId }

      proc = Bun.spawn([CODEX_BIN, ...buildArgs(userMessage)], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: config?.cwd,
        env: config?.env,
      })

      try {
        const stdout = proc.stdout
        if (!stdout || typeof stdout === 'number') {
          status = 'error'
          yield { type: 'error', message: 'Failed to capture subprocess stdout' }
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        for await (const chunk of stdout) {
          buffer += decoder.decode(chunk, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue
            yield* processLine(line)
          }
        }

        buffer += decoder.decode()
        const remaining = buffer.split('\n').filter(Boolean)
        for (const line of remaining) {
          yield* processLine(line)
        }
      } finally {
        abortController.signal.removeEventListener('abort', onAbort)
        if (proc) {
          const stderr = proc.stderr
          if (stderr && typeof stderr !== 'number') {
            const stderrText = await Bun.readableStreamToText(stderr)
            if (stderrText.trim()) {
              yield { type: 'error', message: stderrText.trim() }
            }
          }
        }
        proc = null
      }

      if (status === 'running' && !abortController.signal.aborted) {
        yield { type: 'done' }
        status = 'idle'
      }
    },

    interrupt(): void {
      if (proc) {
        proc.kill()
        status = 'killed'
        proc = null
      }
    },

    dispose(): void {
      this.interrupt()
    },
  }
}

// -- line-level JSON parsing (Codex CLI NDJSON format) --------------------

async function* processLine(line: string): AsyncGenerator<NormalizedEvent, void, unknown> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line)
  } catch {
    yield { type: 'text_chunk', content: line }
    return
  }

  const eventType = String(parsed.type ?? '')

  switch (eventType) {
    case 'assistant': {
      const message = parsed.message as
        | {
            content?: Array<{
              type: string
              text?: string
              name?: string
              id?: string
              input?: unknown
            }>
          }
        | undefined
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            yield { type: 'text_chunk', content: block.text }
          }
          if (block.type === 'tool_use') {
            yield {
              type: 'tool_call_start',
              toolUseId: block.id ?? randomUUID(),
              name: block.name ?? 'unknown',
              inputPreview:
                typeof block.input === 'object' && block.input !== null
                  ? JSON.stringify(block.input).slice(0, 200)
                  : String(block.input ?? ''),
            }
          }
        }
      }
      break
    }

    case 'user': {
      const message = parsed.message as
        | {
            content?: Array<{
              type: string
              tool_use_id?: string
              content?: unknown
              is_error?: boolean
            }>
          }
        | undefined
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool_result') {
            yield {
              type: 'tool_call_end',
              toolUseId: block.tool_use_id ?? 'unknown',
              isError: block.is_error === true,
              outputPreview:
                typeof block.content === 'string'
                  ? block.content.slice(0, 200)
                  : JSON.stringify(block.content ?? '').slice(0, 200),
            }
          }
        }
      }
      break
    }

    case 'result': {
      if (parsed.subtype === 'error' || parsed.is_error) {
        yield { type: 'error', message: String(parsed.message ?? 'Codex execution error') }
      }
      break
    }

    case 'error': {
      yield { type: 'error', message: String(parsed.message ?? 'Unknown error') }
      break
    }

    case 'stream_event': {
      const delta = parsed.delta as { type?: string; text?: string } | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        yield { type: 'text_chunk', content: delta.text }
      }
      break
    }

    default:
      break
  }
}
