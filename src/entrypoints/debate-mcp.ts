/**
 * Debate MCP Server — exposes the 3-agent debate system as MCP tools.
 *
 * Three tools:
 *   debate_approach   — debate the best implementation approach (auto mode)
 *   debate_review     — review a code diff from 3 perspectives (council mode)
 *   debate_root_cause — diagnose root cause of an error (debate mode)
 *
 * Each call spawns 3 AgentAdapter instances with heterogeneous models and
 * returns a structured verdict with winner, confidence, and full transcript.
 *
 * Usage (registered in .mcp.json):
 *   bun --env-file=.env run src/entrypoints/debate-mcp.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { AgentAdapter } from '../services/agents/adapter.js'
import { DebateOrchestrator, type DebateSummary } from '../services/agents/debate.js'
import { createAgentAdapter } from '../services/agents/factory.js'
import type {
  AgentConfig,
  AgentKind,
  AgentStatus,
  NormalizedEvent,
} from '../services/agents/types.js'

// ── Tool definitions ────────────────────────────────────────────────────────

interface DebateApproachArgs {
  topic: string
  context?: string
}

interface DebateReviewArgs {
  diff: string
  context?: string
}

interface DebateRootCauseArgs {
  error_log: string
  context?: string
}

const TOOLS = [
  {
    name: 'debate_approach',
    description:
      'Three AI agents debate the best implementation approach for a task. ' +
      'Each agent uses a different model and argues independently. ' +
      'Returns a synthesized verdict with winner, confidence, and full debate transcript. ' +
      'Use before writing code to avoid wrong architectural decisions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'The task, question, or decision to debate.',
        },
        context: {
          type: 'string',
          description: 'Optional additional context (file paths, constraints, existing patterns).',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'debate_review',
    description:
      'Three AI agents independently review a code diff for correctness, security, ' +
      'performance, and maintainability. Each agent provides findings from a different ' +
      'perspective. Returns a verdict (PASS/REVISE/BLOCK) with specific, actionable findings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        diff: {
          type: 'string',
          description: 'The git diff or code changes to review.',
        },
        context: {
          type: 'string',
          description: 'What the change is trying to accomplish and any relevant constraints.',
        },
      },
      required: ['diff'],
    },
  },
  {
    name: 'debate_root_cause',
    description:
      'Three AI agents debate the root cause of an error or bug, analyzing ' +
      'evidence from logs, stack traces, and context. Uses a propose→critique→revise ' +
      'cycle to converge on the most likely root cause and repair plan.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        error_log: {
          type: 'string',
          description: 'Error messages, stack traces, logs, or symptom descriptions.',
        },
        context: {
          type: 'string',
          description: 'What was being done when the error occurred, relevant file paths.',
        },
      },
      required: ['error_log'],
    },
  },
]

// ── Model configuration ─────────────────────────────────────────────────────

const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

function validateModel(value: string | undefined, envVar: string): string | undefined {
  if (value === undefined) return undefined
  if (!MODEL_PATTERN.test(value)) {
    console.error(`[debate-mcp] ${envVar}="${value}" is not a valid model name — ignoring.`)
    return undefined
  }
  return value
}

function getDebateModels(): Partial<Record<AgentKind, string | undefined>> {
  return {
    'claude-haha': validateModel(process.env.DEBATE_MODEL_HAHA, 'DEBATE_MODEL_HAHA'),
    'claude-code': validateModel(process.env.DEBATE_MODEL_CLAUDE, 'DEBATE_MODEL_CLAUDE'),
    codex: validateModel(process.env.DEBATE_MODEL_CODEX, 'DEBATE_MODEL_CODEX'),
  }
}

// ── Direct API adapter (for claude-haha slot, no subprocess needed) ─────────

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
 * Lightweight adapter that calls the Anthropic-compatible API directly.
 * Used as the claude-haha agent in the MCP context where the REPL query()
 * infrastructure is not available.
 */
function createDirectApiAdapter(config?: AgentConfig): AgentAdapter {
  let status: AgentStatus = 'idle'

  return {
    kind: 'claude-haha' as AgentKind,

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

      const model = config?.model || 'claude-sonnet-4-6'
      const url = getMessagesUrl()
      const headers = getAuthHeaders()

      try {
        const response = await globalThis.fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: userMessage }],
            stream: true,
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

              // Anthropic SSE format: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.type === 'text_delta' &&
                typeof parsed.delta.text === 'string'
              ) {
                yield { type: 'text_chunk', content: parsed.delta.text }
              }

              // Handle error events in stream
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
      }

      if (status === 'running' && !abortController.signal.aborted) {
        yield { type: 'done' }
        status = 'idle'
      }
    },

    interrupt(): void {
      status = 'killed'
    },

    dispose(): void {
      this.interrupt()
    },
  }
}

// ── Adapter factory for MCP context ─────────────────────────────────────────

function buildAdapters(
  models: Partial<Record<AgentKind, string | undefined>>,
): Record<AgentKind, AgentAdapter> {
  const adapters = {} as Record<AgentKind, AgentAdapter>

  // claude-haha: always use direct API (no REPL query executor in MCP context)
  adapters['claude-haha'] = createDirectApiAdapter({
    maxTurns: 5,
    model: models['claude-haha'],
  })

  // claude-code: try CLI, fall back to direct API
  try {
    adapters['claude-code'] = createAgentAdapter('claude-code', {
      maxTurns: 5,
      model: models['claude-code'],
    })
  } catch {
    console.error('[debate-mcp] claude-code CLI unavailable, falling back to direct API adapter.')
    adapters['claude-code'] = createDirectApiAdapter({
      maxTurns: 5,
      model: models['claude-code'],
    })
  }

  // codex: try CLI, fall back to direct API
  try {
    adapters.codex = createAgentAdapter('codex', {
      maxTurns: 5,
      model: models.codex,
    })
  } catch {
    console.error('[debate-mcp] codex CLI unavailable, falling back to direct API adapter.')
    adapters.codex = createDirectApiAdapter({
      maxTurns: 5,
      model: models.codex,
    })
  }

  return adapters
}

// ── Prompt builders ──────────────────────────────────────────────────────────

interface ToolCallResult {
  verdict: string
  winner?: string
  totalRounds: number
  durationMs: number
  transcript: string
  error?: string
}

const PROMPT_BUILDERS: Record<
  string,
  (args: Record<string, unknown>) => { prompt: string; mode: 'auto' | 'council' | 'debate' }
> = {
  debate_approach: (args) => {
    const { topic, context } = args as unknown as DebateApproachArgs
    let prompt = `You are participating in a structured debate about the best implementation approach for a software engineering task.

TASK: ${topic}`

    if (context) {
      prompt += `\n\nCONTEXT:\n${context}`
    }

    prompt += `\n\nAnalyze the trade-offs between different approaches. Consider:
1. Simplicity vs flexibility
2. Performance implications
3. Maintainability and testability
4. Alignment with existing codebase patterns
5. Security and edge cases

Provide your recommendation with concrete reasoning. End with:
CONFIDENCE: <0.0-1.0>
FINAL ANSWER: <your recommended approach>`

    return { prompt, mode: 'auto' }
  },

  debate_review: (args) => {
    const { diff, context } = args as unknown as DebateReviewArgs
    let prompt = `You are participating in a structured code review. Review the following code diff independently and critically.

DIFF:
\`\`\`
${diff}
\`\`\``

    if (context) {
      prompt += `\n\nWHAT THIS CHANGE IS TRYING TO ACCOMPLISH:\n${context}`
    }

    prompt += `\n\nEvaluate the diff across these dimensions:
1. CORRECTNESS: Does the logic do what it intends? Are there edge-case bugs?
2. SECURITY: Any injection risks, leaked secrets, unsafe input handling?
3. PERFORMANCE: N+1 queries, unnecessary allocations, blocking operations?
4. MAINTAINABILITY: Is the code clear, well-named, and appropriately scoped?

Categorize your overall verdict as one of: PASS, REVISE, or BLOCK.
- PASS: The change is correct, safe, and ready to merge.
- REVISE: Minor issues that should be addressed but don't block merge.
- BLOCK: Critical issues (security, data loss, logic errors) that must be fixed.

End with:
CONFIDENCE: <0.0-1.0>
VERDICT: <PASS|REVISE|BLOCK>
FINAL ANSWER: <specific findings and recommendations>`

    return { prompt, mode: 'council' }
  },

  debate_root_cause: (args) => {
    const { error_log, context } = args as unknown as DebateRootCauseArgs
    let prompt = `You are participating in a structured root-cause analysis debate. Diagnose the underlying cause of the following error.

ERROR / SYMPTOMS:
\`\`\`
${error_log}
\`\`\``

    if (context) {
      prompt += `\n\nWHAT WAS HAPPENING:\n${context}`
    }

    prompt += `\n\nFollow this analytical framework:
1. List all POSSIBLE CAUSES (brainstorm without filtering)
2. Evaluate each cause against the EVIDENCE (what fits, what doesn't)
3. Identify the MOST LIKELY root cause with reasoning
4. Propose a SPECIFIC REPAIR PLAN with concrete steps

End with:
CONFIDENCE: <0.0-1.0>
ROOT CAUSE: <concise description of the root cause>
FINAL ANSWER: <repair plan with actionable steps>`

    return { prompt, mode: 'debate' }
  },
}

// ── Tool handler ────────────────────────────────────────────────────────────

async function runDebateTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const builder = PROMPT_BUILDERS[toolName]
  if (!builder) {
    return {
      verdict: '',
      totalRounds: 0,
      durationMs: 0,
      transcript: '',
      error: `Unknown tool: ${toolName}`,
    }
  }

  const { prompt, mode } = builder(args)
  const models = getDebateModels()
  const adapters = buildAdapters(models)

  const orchestrator = new DebateOrchestrator(adapters, {
    mode,
    perAgentTimeoutMs: 90_000,
    judge: 'majority',
  })

  const statements: string[] = []
  let finalSummary: DebateSummary | null = null
  let errorMessage: string | undefined

  try {
    for await (const event of orchestrator.run(prompt, new AbortController().signal)) {
      if (event.type === 'agent_response') {
        statements.push(
          `[${event.statement.agent}] (confidence: ${event.statement.confidence.toFixed(2)}):\n${event.statement.content.slice(0, 2000)}`,
        )
      }
      if (event.type === 'debate_end') {
        finalSummary = event.summary
      }
      if (event.type === 'error') {
        errorMessage = event.message
      }
    }
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Debate execution failed'
  }

  const transcript = statements.join('\n\n---\n\n')

  if (finalSummary) {
    return {
      verdict: finalSummary.verdict,
      winner: finalSummary.winner,
      totalRounds: finalSummary.totalRounds,
      durationMs: finalSummary.durationMs,
      transcript,
    }
  }

  return {
    verdict: errorMessage || 'Debate produced no verdict',
    totalRounds: 0,
    durationMs: 0,
    transcript,
    error: errorMessage,
  }
}

// ── MCP Server ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = new Server(
    {
      name: 'debate',
      version: MACRO.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async ({ params: { name, arguments: args } }) => {
    const result = await runDebateTool(name, (args ?? {}) as Record<string, unknown>)

    if (result.error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: result.error,
                partial_verdict: result.verdict,
                transcript: result.transcript,
              },
              null,
              2,
            ),
          },
        ],
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              verdict: result.verdict,
              winner: result.winner,
              totalRounds: result.totalRounds,
              durationMs: result.durationMs,
              transcript: result.transcript,
            },
            null,
            2,
          ),
        },
      ],
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[debate-mcp] Debate MCP server started')
}

main().catch((err) => {
  console.error('[debate-mcp] Fatal:', err)
  process.exit(1)
})
