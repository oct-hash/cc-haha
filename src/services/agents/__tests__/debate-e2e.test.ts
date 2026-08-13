/**
 * E2E tests for the Debate Orchestrator — full tick with real LLM API calls.
 *
 * These tests verify the complete pipeline:
 *   adapter creation → prompt → stream → orchestrator → verdict
 *
 * Requires ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in environment.
 * Tests are skipped if neither is available.
 */

import { describe, expect, it } from 'bun:test'
import { DebateOrchestrator, type DebateSummary } from '../debate.js'
import type { AgentAdapter, AgentKind, AgentStatus, NormalizedEvent } from '../types.js'

// ── Direct API adapter (same pattern as debate-mcp.ts) ────────────────────

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  else if (apiKey) headers['x-api-key'] = apiKey
  return headers
}

function getApiUrl(): string {
  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  return base.endsWith('/') ? `${base}v1/messages` : `${base}/v1/messages`
}

function createE2EAdapter(kind: AgentKind, model?: string): AgentAdapter {
  let status: AgentStatus = 'idle'

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
        yield { type: 'error', message: `Not idle (current: ${status})` }
        return
      }
      status = 'running'

      try {
        const response = await fetch(getApiUrl(), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: userMessage }],
            stream: true,
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          status = 'error'
          yield { type: 'error', message: `API ${response.status}: ${errText.slice(0, 300)}` }
          return
        }

        const body = response.body
        if (!body) {
          status = 'error'
          yield { type: 'error', message: 'Empty response body' }
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
            } catch {
              /* skip */
            }
          }
        }
      } catch (err: unknown) {
        if (abortController.signal.aborted) {
          status = 'killed'
          return
        }
        status = 'error'
        yield { type: 'error', message: err instanceof Error ? err.message : 'Unknown error' }
        return
      }

      if (status === 'running' && !abortController.signal.aborted) {
        yield { type: 'done' }
        status = 'idle'
      }
    },

    interrupt() {
      status = 'killed'
    },
    dispose() {
      this.interrupt()
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function hasApiKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

function shouldRunE2E(): boolean {
  return hasApiKey() && process.env.DEBATE_E2E === '1'
}

async function collectDebateResult(
  mode: 'council' | 'debate' | 'auto',
  topic: string,
): Promise<{ summary: DebateSummary | null; events: string[] }> {
  const models = {
    'claude-haha': process.env.DEBATE_MODEL_HAHA,
    'claude-code': process.env.DEBATE_MODEL_CLAUDE,
    codex: process.env.DEBATE_MODEL_CODEX,
  }
  const adapters: Record<AgentKind, AgentAdapter> = {
    'claude-haha': createE2EAdapter('claude-haha', models['claude-haha']),
    'claude-code': createE2EAdapter('claude-code', models['claude-code']),
    codex: createE2EAdapter('codex', models['codex']),
  }

  const orch = new DebateOrchestrator(adapters, {
    mode,
    perAgentTimeoutMs: 90_000,
    judge: 'majority',
  })

  let finalSummary: DebateSummary | null = null
  const events: string[] = []
  try {
    for await (const event of orch.run(topic, new AbortController().signal)) {
      if (event.type === 'agent_response') {
        events.push(
          `[agent_response] ${event.statement.agent} conf=${event.statement.confidence.toFixed(2)} len=${event.statement.content.length} preview="${event.statement.content.slice(0, 200)}"`,
        )
      } else if (event.type === 'debate_end') {
        finalSummary = event.summary
        events.push(
          `[debate_end] verdict="${finalSummary.verdict.slice(0, 200)}" statements=${finalSummary.statements.length}`,
        )
      } else if (event.type === 'error') {
        events.push(`[error] ${event.message}`)
      } else if (event.type === 'auto_decision') {
        events.push(`[auto_decision] agreement=${event.agreement?.toFixed(3)} route=${event.route}`)
      } else if (event.type === 'verdict') {
        events.push(`[verdict] content="${event.content?.slice(0, 200)}" winner=${event.winner}`)
      }
    }
  } finally {
    orch.dispose()
  }
  return { summary: finalSummary, events }
}

describe.skipIf(!shouldRunE2E())('DebateOrchestrator — E2E (real API)', () => {
  it('debate_approach: produces a verdict for a simple architecture question', async () => {
    const topic = `What is the best approach for caching in a Next.js app?

Consider these options:
1. Next.js built-in fetch caching
2. Redis via upstash
3. In-memory LRU cache

The app serves 10k daily active users with mostly read-heavy traffic.`

    const { summary: result } = await collectDebateResult('auto', topic)

    expect(result).not.toBeNull()
    expect(result!.statements.length).toBeGreaterThanOrEqual(1)
    expect(result!.totalRounds).toBeGreaterThanOrEqual(1)
    expect(result!.durationMs).toBeGreaterThan(0)
    expect(result!.verdict.length).toBeGreaterThan(0)
    expect(['claude-haha', 'claude-code', 'codex', 'none']).toContain(result!.winner!)
  }, 300_000)

  it('debate_review: reviews a code diff in council mode', async () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
+export async function login(email: string, password: string) {
+  const user = await db.query('SELECT * FROM users WHERE email = \${email}')
+  if (!user) throw new Error('User not found')
+  if (user.password !== password) throw new Error('Invalid password')
+  return { token: generateToken(user.id) }
+}`

    const { summary: result } = await collectDebateResult('council', diff)

    expect(result).not.toBeNull()
    expect(result!.statements.length).toBeGreaterThanOrEqual(1)
    const allContent = result!.statements.map((s) => s.content.toLowerCase()).join(' ')
    const foundIssues = ['sql injection', 'plaintext', 'hash', 'password'].filter((kw) =>
      allContent.includes(kw),
    )
    expect(foundIssues.length).toBeGreaterThanOrEqual(1)
  }, 300_000)

  it('debate_root_cause: diagnoses an error via debate mode', async () => {
    const errorLog = `Error: Connection timeout after 30000ms
    at Database.connect (src/db/connection.ts:45:12)
    at App.start (src/app.ts:23:8)
Stack:
  Database.connect — connection pool exhausted, all 10 connections in use
  Previous queries (from logs):
    SELECT * FROM users WHERE id = 1 — 29.8s (still running)
    SELECT * FROM users WHERE id = 2 — 29.5s (still running)
    ... (8 more similar)`

    // Use 1-round debate to avoid timeout (debate mode runs proposer→critic→reviser per round)
    const models = {
      'claude-haha': process.env.DEBATE_MODEL_HAHA,
      'claude-code': process.env.DEBATE_MODEL_CLAUDE,
      codex: process.env.DEBATE_MODEL_CODEX,
    }
    const adapters: Record<AgentKind, AgentAdapter> = {
      'claude-haha': createE2EAdapter('claude-haha', models['claude-haha']),
      'claude-code': createE2EAdapter('claude-code', models['claude-code']),
      codex: createE2EAdapter('codex', models['codex']),
    }
    const orch = new DebateOrchestrator(adapters, {
      mode: 'debate',
      maxRounds: 1,
      perAgentTimeoutMs: 60_000,
      judge: 'majority',
    })

    let finalSummary: DebateSummary | null = null
    try {
      for await (const event of orch.run(errorLog, new AbortController().signal)) {
        if (event.type === 'debate_end') finalSummary = event.summary
      }
    } finally {
      orch.dispose()
    }

    expect(finalSummary).not.toBeNull()
    expect(finalSummary!.statements.length).toBeGreaterThanOrEqual(1)
    expect(finalSummary!.totalRounds).toBeGreaterThanOrEqual(1)
    const verdict = finalSummary!.verdict.toLowerCase()
    expect(
      ['pool', 'connection', 'timeout', 'leak', 'query'].some((kw) => verdict.includes(kw)),
    ).toBe(true)
  }, 300_000)
})
