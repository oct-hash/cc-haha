/**
 * Claude Code Official Adapter — spawns the `claude` CLI binary.
 *
 * Subprocess protocol:
 *   claude --print <message> --output-format stream-json --verbose
 *          --include-partial-messages --permission-mode acceptEdits
 *          [--mcp-config <path>] [--append-system-prompt <path>]
 *          [--allowedTools <tool1,tool2,...>]
 *
 * Each stdout line is a JSON object. We parse and translate to NormalizedEvent.
 * Reference: DataFlow-WebUI backend/app/services/agents/claude_adapter.py
 */

import type { Subprocess } from 'bun'
import { randomUUID } from 'node:crypto'
import type { AgentAdapter } from './adapter.js'
import type { AgentConfig, AgentKind, AgentStatus, NormalizedEvent } from './types.js'

const CLAUDE_BIN = 'claude'

export function createClaudeCodeAdapter(config?: AgentConfig): AgentAdapter {
  const sessionId = randomUUID()
  let status: AgentStatus = 'idle'
  let proc: Subprocess | null = null

  function buildArgs(userMessage: string): string[] {
    const args = [
      '--print',
      userMessage,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits',
    ]

    if (config?.model) {
      args.push('--model', config.model)
    }

    if (config?.systemPromptPath) {
      args.push('--append-system-prompt', config.systemPromptPath)
    }

    if (config?.extraArgs) {
      const dangerous = config.extraArgs.filter((a) =>
        /^--(permission-mode|dangerously-skip-permissions|dangerously-disable-sandbox)(?:[=\s]|$)/.test(
          a,
        ),
      )
      if (dangerous.length > 0) {
        throw new Error(
          `AgentConfig.extraArgs contains dangerous flags that would override security defaults: ${dangerous.join(', ')}`,
        )
      }
      args.push(...config.extraArgs)
    }

    return args
  }

  return {
    kind: 'claude-code' as AgentKind,

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

      proc = Bun.spawn([CLAUDE_BIN, ...buildArgs(userMessage)], {
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

        // Flush remaining buffer
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

// -- line-level JSON parsing -----------------------------------------------

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
    case 'stream_event':
    case 'content_block_delta': {
      const delta = parsed.delta as { type?: string; text?: string } | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        yield { type: 'text_chunk', content: delta.text }
      }
      break
    }

    case 'assistant': {
      const content = parsed.content as
        | Array<{ type: string; name?: string; id?: string; input?: unknown }>
        | undefined
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            const inputPreview =
              typeof block.input === 'object' && block.input !== null
                ? JSON.stringify(block.input).slice(0, 200)
                : String(block.input ?? '')
            yield {
              type: 'tool_call_start',
              toolUseId: block.id ?? randomUUID(),
              name: block.name ?? 'unknown',
              inputPreview,
            }
          }
        }
      }
      break
    }

    case 'user': {
      const content = parsed.content as
        | Array<{ type: string; tool_use_id?: string; content?: unknown }>
        | undefined
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            const outputPreview =
              typeof block.content === 'string'
                ? block.content.slice(0, 200)
                : JSON.stringify(block.content ?? '').slice(0, 200)

            const isError = typeof parsed.is_error === 'boolean' ? parsed.is_error : false

            yield {
              type: 'tool_call_end',
              toolUseId: block.tool_use_id ?? 'unknown',
              isError,
              outputPreview,
            }
          }
        }
      }
      break
    }

    case 'result': {
      const subtype = String(parsed.subtype ?? '')
      if (subtype === 'error_during_execution' || subtype === 'error_max_turns') {
        yield { type: 'error', message: String(parsed.message ?? subtype) }
      }
      break
    }

    case 'error': {
      yield { type: 'error', message: String(parsed.message ?? 'Unknown error') }
      break
    }

    default:
      break
  }
}
