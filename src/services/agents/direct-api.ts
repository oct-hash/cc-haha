/**
 * Direct API Adapter — calls the Anthropic-compatible endpoint directly,
 * with no subprocess and no REPL query executor.
 *
 * This is the only agent path that works standalone against a DeepSeek-style
 * Anthropic-compatible endpoint. Used as a fallback when:
 *   - claude-haha has no queryExecutor (standalone, e.g. debate MCP / LoopManager)
 *   - claude-code / codex CLI binaries are unavailable or fail to spawn
 */

import type { AgentAdapter } from './adapter.js'
import type { AgentConfig, AgentKind, AgentStatus, NormalizedEvent } from './types.js'

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  const authToken = process.env.ANTHROPIC_AUTH_TOKEN
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  } else if (apiKey) {
    headers['x-api-key'] = apiKey
  }

  return headers
}

function getMessagesUrl(): string {
  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  return base.endsWith('/') ? `${base}v1/messages` : `${base}/v1/messages`
}

/**
 * Build an adapter that streams text from the Anthropic-compatible endpoint.
 *
 * @param config — AgentConfig plus an optional `kind` override (defaults to
 *   'claude-haha'). The model defaults to ANTHROPIC_MODEL so a bare call works
 *   against the configured endpoint without an explicit model name.
 */
export function createDirectApiAdapter(config?: AgentConfig & { kind?: AgentKind }): AgentAdapter {
  const kind: AgentKind = config?.kind ?? 'claude-haha'
  const model = config?.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
  let status: AgentStatus = 'idle'
  let currentAbort: AbortController | null = null

  return {
    kind,

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

      const apiKey = process.env.ANTHROPIC_API_KEY
      const authToken = process.env.ANTHROPIC_AUTH_TOKEN
      if (!apiKey && !authToken) {
        status = 'error'
        yield {
          type: 'error',
          message: 'No API key configured. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.',
        }
        return
      }

      const url = getMessagesUrl()
      const headers = getAuthHeaders()

      currentAbort = abortController

      try {
        const response = await globalThis.fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: userMessage }],
            stream: true,
            // Reasoning models (DeepSeek) emit a long thinking block before any
            // text; disable it so agents respond immediately instead of blowing
            // the per-agent timeout and producing empty responses.
            thinking: { type: 'disabled' },
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unable to read error body')
          status = 'error'
          yield {
            type: 'error',
            message: `API error ${response.status} (${url}): ${errText.slice(0, 500)}`,
          }
          return
        }

        const body = response.body
        if (!body) {
          status = 'error'
          yield { type: 'error', message: 'Empty response body from API' }
          return
        }

        const reader = body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue

            const data = trimmed.slice(6).trim()
            if (!data || data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)

              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.type === 'text_delta' &&
                typeof parsed.delta.text === 'string'
              ) {
                yield { type: 'text_chunk', content: parsed.delta.text }
              }

              if (parsed.type === 'error') {
                yield {
                  type: 'error',
                  message: parsed.error?.message || parsed.message || 'Stream error',
                }
              }
            } catch {
              // Skip unparseable SSE lines
            }
          }
        }
      } catch (err: unknown) {
        if (abortController.signal.aborted) {
          status = 'killed'
          return
        }
        status = 'error'
        const message = err instanceof Error ? err.message : 'Unknown error'
        yield { type: 'error', message }
        return
      } finally {
        if (currentAbort === abortController) {
          currentAbort = null
        }
      }

      if (status === 'running' && !abortController.signal.aborted) {
        yield { type: 'done' }
        status = 'idle'
      }
    },

    interrupt(): void {
      status = 'killed'
      currentAbort?.abort()
    },

    dispose(): void {
      this.interrupt()
    },
  }
}
