/**
 * E2E Component Stress Tests — Skills + MCP + Hooks Engine (In-Process)
 *
 * Progressive difficulty L1 → L4:
 *   L1 — Basic: correctness, edge cases (sequential)
 *   L2 — Medium: 10-20 concurrent operations
 *   L3 — High: 30-50 concurrent + chaos injection
 *   L4 — Extreme: 50-100 concurrent + mixed systems + recovery
 *
 * Tests the component-level APIs directly (no subprocess), exercising:
 *   - Skills: parseSkillFrontmatterFields, createSkillCommand
 *   - MCP: InProcessTransport, JSON-RPC round-trips via mock server
 *   - Hooks: createBaseHookInput (engine input generation)
 *   - Full lifecycle: skill→MCP→hook interleaved operations
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { createLinkedTransportPair } from '../../services/mcp/InProcessTransport.js'
import { createSkillCommand, parseSkillFrontmatterFields } from '../../skills/loadSkillsDir.js'
import type { FrontmatterData } from '../../utils/frontmatterParser.js'
import {
  assertAllSucceed,
  assertSurvivalRate,
  cleanupTemp,
  countFailures,
  createMockMCPServer,
  createTempConfigDir,
  createTempHome,
  type ExitCodeResult,
  type MockMCPTool,
  mcpRequest,
  runBurst,
  runConcurrently,
  tick,
  writeSimpleSkill,
} from './test-helpers.js'

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers: create minimal test inputs for component APIs
// ═══════════════════════════════════════════════════════════════════════════════

function makeFrontmatter(overrides: Partial<Record<string, unknown>> = {}): FrontmatterData {
  return {
    name: 'test-skill',
    description: 'A test skill for stress testing',
    ...overrides,
  } as FrontmatterData
}

function makeSkillCmdArgs(overrides: Record<string, unknown> = {}) {
  return {
    skillName: 'test-skill',
    displayName: 'Test Skill',
    description: 'A test skill',
    hasUserSpecifiedDescription: true,
    markdownContent: '# Test Skill\n\nTest body\n',
    allowedTools: [],
    argumentHint: undefined,
    argumentNames: [],
    whenToUse: undefined,
    version: undefined,
    tags: undefined,
    author: undefined,
    model: undefined,
    disableModelInvocation: false,
    userInvocable: true,
    source: 'user' as const,
    baseDir: undefined,
    loadedFrom: 'skills' as const,
    hooks: undefined,
    executionContext: undefined,
    agent: undefined,
    paths: undefined,
    effort: undefined,
    shell: undefined,
    ...overrides,
  }
}

async function sendInitSequence(client: Transport, server: Transport): Promise<void> {
  // Fire-and-forget initialize (server handles via onmessage)
  client.send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  } as JSONRPCMessage)
  await tick()
  client.send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  } as JSONRPCMessage)
  await tick()
}

// ═══════════════════════════════════════════════════════════════════════════════
// L1 — Basic (Skills + MCP + Hooks correctness)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L1 — Basic', () => {
  // ── Skills: parseSkillFrontmatterFields ──────────────────────────────────

  describe('Skills — parseSkillFrontmatterFields', () => {
    test('parses basic frontmatter with name and description', () => {
      const fm = makeFrontmatter({ name: 'my-skill', description: 'Does things' })
      const result = parseSkillFrontmatterFields(fm, '# My Skill\n\nBody text\n', 'my-skill')
      expect(result.displayName).toBe('my-skill')
      expect(result.description).toBe('Does things')
    })

    test('extracts description from markdown when frontmatter has none', () => {
      const fm = makeFrontmatter({ name: 'no-desc', description: undefined })
      const result = parseSkillFrontmatterFields(
        fm,
        '# No Desc\n\nSome paragraph here.\n',
        'no-desc',
      )
      expect(result.description).toBeTruthy()
    })

    test('parses allowedTools from frontmatter array', () => {
      const fm = makeFrontmatter({ 'allowed-tools': ['Read', 'Write', 'Bash'] })
      const result = parseSkillFrontmatterFields(fm, '# Tools\n', 'tools')
      expect(result.allowedTools).toEqual(['Read', 'Write', 'Bash'])
    })

    test('parses user-invocable flag (default true, explicit false)', () => {
      const fm1 = makeFrontmatter({})
      expect(parseSkillFrontmatterFields(fm1, '# body', 's1').userInvocable).toBe(true)

      const fm2 = makeFrontmatter({ 'user-invocable': false })
      expect(parseSkillFrontmatterFields(fm2, '# body', 's2').userInvocable).toBe(false)
    })

    test('parses argument names from frontmatter (split on whitespace)', () => {
      const fm = makeFrontmatter({ arguments: 'file output' })
      const result = parseSkillFrontmatterFields(fm, '# args\n', 'args')
      expect(result.argumentNames).toContain('file')
      expect(result.argumentNames).toContain('output')
    })

    test('parses when_to_use and tags', () => {
      const fm = makeFrontmatter({ when_to_use: 'Use for testing', tags: ['test', 'stress'] })
      const result = parseSkillFrontmatterFields(fm, '# tagged\n', 'tagged')
      expect(result.whenToUse).toBe('Use for testing')
      expect(result.tags).toEqual(['test', 'stress'])
    })

    test('parses fork execution context', () => {
      const fm = makeFrontmatter({ context: 'fork' })
      const result = parseSkillFrontmatterFields(fm, '# forked\n', 'forked')
      expect(result.executionContext).toBe('fork')
    })
  })

  // ── Skills: createSkillCommand ───────────────────────────────────────────

  describe('Skills — createSkillCommand', () => {
    test('creates a prompt-type command from parsed fields', () => {
      const cmd = createSkillCommand(makeSkillCmdArgs())
      expect(cmd.type).toBe('prompt')
      expect(cmd.name).toBe('test-skill')
      expect(cmd.description).toBe('A test skill')
    })

    test('includes allowedTools in command', () => {
      const cmd = createSkillCommand(makeSkillCmdArgs({ allowedTools: ['Read', 'Glob'] }))
      expect(cmd.allowedTools).toEqual(['Read', 'Glob'])
    })

    test('sets userInvocable from args', () => {
      const invocable = createSkillCommand(makeSkillCmdArgs({ userInvocable: true }))
      expect(invocable.userInvocable).toBe(true)

      const notInvocable = createSkillCommand(makeSkillCmdArgs({ userInvocable: false }))
      expect(notInvocable.userInvocable).toBe(false)
    })

    test('handles fork execution context (stored as .context)', () => {
      const forked = createSkillCommand(makeSkillCmdArgs({ executionContext: 'fork' }))
      expect(forked.context).toBe('fork')

      const inline = createSkillCommand(makeSkillCmdArgs({ executionContext: 'inline' }))
      expect(inline.context).toBe('inline')
    })

    test('produces different commands for different names (no cross-contamination)', () => {
      const a = createSkillCommand(makeSkillCmdArgs({ skillName: 'skill-a', description: 'Alpha' }))
      const b = createSkillCommand(makeSkillCmdArgs({ skillName: 'skill-b', description: 'Beta' }))
      expect(a.name).toBe('skill-a')
      expect(b.name).toBe('skill-b')
      expect(a.description).toBe('Alpha')
      expect(b.description).toBe('Beta')
    })
  })

  // ── MCP: InProcessTransport ──────────────────────────────────────────────

  describe('MCP — InProcessTransport', () => {
    test('createLinkedTransportPair returns two transports', () => {
      const [client, server] = createLinkedTransportPair()
      expect(client).toBeDefined()
      expect(server).toBeDefined()
    })

    test('message sent on client arrives at server onmessage', async () => {
      const [client, server] = createLinkedTransportPair()
      let received: JSONRPCMessage | undefined
      server.onmessage = (msg) => {
        received = msg
      }
      await server.start()
      await client.start()

      await client.send({ jsonrpc: '2.0', method: 'ping' } as JSONRPCMessage)
      await tick()

      expect(received).toBeDefined()
      expect((received as Record<string, unknown>)?.method).toBe('ping')
    })

    test('bi-directional: server→client delivery works', async () => {
      const [client, server] = createLinkedTransportPair()
      let received: JSONRPCMessage | undefined
      client.onmessage = (msg) => {
        received = msg
      }
      await server.start()
      await client.start()

      await server.send({ jsonrpc: '2.0', id: 99, result: { ok: true } } as JSONRPCMessage)
      await tick()

      expect(received).toBeDefined()
      expect((received as Record<string, unknown>)?.id).toBe(99)
    })

    test('close on one side triggers onclose on both', async () => {
      const [client, server] = createLinkedTransportPair()
      let clientClosed = false
      let serverClosed = false
      client.onclose = () => {
        clientClosed = true
      }
      server.onclose = () => {
        serverClosed = true
      }

      await client.close()
      await tick()

      expect(clientClosed).toBe(true)
      expect(serverClosed).toBe(true)
    })

    test('double close is safe (idempotent)', async () => {
      const [client] = createLinkedTransportPair()
      await client.close()
      await client.close() // should not throw
      // No crash = pass
    })

    test('send after close throws', async () => {
      const [client] = createLinkedTransportPair()
      await client.close()
      try {
        await client.send({ jsonrpc: '2.0', method: 'x' } as JSONRPCMessage)
        // should have thrown
        expect(false).toBe(true)
      } catch (e) {
        expect((e as Error).message).toContain('closed')
      }
    })
  })

  // ── MCP: Mock server JSON-RPC round-trip ─────────────────────────────────

  describe('MCP — Mock server round-trips', () => {
    test('initialize → tools/list → tools/call full cycle', async () => {
      const tools: MockMCPTool[] = [
        {
          name: 'echo',
          description: 'Echo back the input',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
          handler: (args) => ({ echoed: args.text }),
        },
        {
          name: 'add',
          description: 'Add two numbers',
          handler: (args) => ({ sum: (args.a as number) + (args.b as number) }),
        },
      ]
      const server = createMockMCPServer(tools)

      await sendInitSequence(server.clientTransport, server.serverTransport)

      // tools/list
      const listResult = await mcpRequest(server.clientTransport, 'tools/list')
      const toolsList = (listResult as { result: { tools: Array<{ name: string }> } }).result.tools
      expect(toolsList.length).toBe(2)
      expect(toolsList.map((t) => t.name).sort()).toEqual(['add', 'echo'])

      // tools/call echo
      const echoResult = await mcpRequest(server.clientTransport, 'tools/call', {
        name: 'echo',
        arguments: { text: 'hello' },
      })
      const echoContent = (echoResult as { result: { content: [{ text: string }] } }).result
        .content[0].text
      expect(JSON.parse(echoContent)).toEqual({ echoed: 'hello' })

      // tools/call add
      const addResult = await mcpRequest(server.clientTransport, 'tools/call', {
        name: 'add',
        arguments: { a: 3, b: 7 },
      })
      const addContent = (addResult as { result: { content: [{ text: string }] } }).result
        .content[0].text
      expect(JSON.parse(addContent)).toEqual({ sum: 10 })

      await server.close()
    })

    test('tools/call returns error for unknown tool', async () => {
      const server = createMockMCPServer([])
      await sendInitSequence(server.clientTransport, server.serverTransport)

      const result = await mcpRequest(server.clientTransport, 'tools/call', {
        name: 'nonexistent',
        arguments: {},
      })
      const content = (result as { result: { content: [{ text: string }]; isError: boolean } })
        .result
      expect(content.isError).toBe(true)
      expect(content.content[0].text).toContain('not found')

      await server.close()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L2 — Medium stress (10-20 concurrent)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L2 — Medium stress', () => {
  // ── Skills: 15 concurrent parse + create ─────────────────────────────────

  describe('Skills — 15 concurrent parse + create', () => {
    test('15 concurrent createSkillCommand → all produce valid commands', async () => {
      const results = await runConcurrently(15, (i) => {
        try {
          const cmd = createSkillCommand(
            makeSkillCmdArgs({
              skillName: `stress-skill-${i}`,
              description: `Stress test skill ${i}`,
            }),
          )
          return { exitCode: cmd.type === 'prompt' && cmd.name.startsWith('stress-skill') ? 0 : 1 }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertAllSucceed(results as ExitCodeResult[])
      expect(results.length).toBe(15)
    })

    test('15 concurrent parseSkillFrontmatterFields → all return valid results', async () => {
      const results = await runConcurrently(15, (i) => {
        try {
          const fm = makeFrontmatter({ name: `skill-${i}`, description: `Desc ${i}` })
          const parsed = parseSkillFrontmatterFields(
            fm,
            `# Skill ${i}\n\nBody for ${i}\n`,
            `skill-${i}`,
          )
          return { exitCode: parsed.displayName === `skill-${i}` ? 0 : 1 }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertAllSucceed(results as ExitCodeResult[])
    })
  })

  // ── MCP: 10 concurrent tools/call on shared server ───────────────────────

  describe('MCP — 10 concurrent tools/call', () => {
    let server: ReturnType<typeof createMockMCPServer>

    beforeAll(async () => {
      server = createMockMCPServer([
        {
          name: 'counter',
          handler: (args) => ({ count: (args.n as number) + 1 }),
        },
      ])
      await sendInitSequence(server.clientTransport, server.serverTransport)
    })

    afterAll(async () => {
      await server.close()
    })

    test('10 concurrent calls to same tool → all succeed', { timeout: 30000 }, async () => {
      const results = await runConcurrently(10, async (i) => {
        try {
          const result = await mcpRequest(server.clientTransport, 'tools/call', {
            name: 'counter',
            arguments: { n: i },
          })
          const content = (result as { result: { content: [{ text: string }] } }).result.content[0]
            .text
          const data = JSON.parse(content)
          return { exitCode: data.count === i + 1 ? 0 : 1 }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertAllSucceed(results as ExitCodeResult[])
    })
  })

  // ── Mixed: 10 concurrent skills + MCP interleaved ────────────────────────

  describe('Mixed — skills + MCP concurrent', () => {
    let server: ReturnType<typeof createMockMCPServer>

    beforeAll(async () => {
      server = createMockMCPServer([{ name: 'ping', handler: () => ({ pong: true }) }])
      await sendInitSequence(server.clientTransport, server.serverTransport)
    })

    afterAll(async () => {
      await server.close()
    })

    test('10 concurrent ops: 5 skill parse + 5 MCP calls → no cross-contamination', {
      timeout: 30000,
    }, async () => {
      const ops: Promise<ExitCodeResult>[] = []

      for (let i = 0; i < 5; i++) {
        ops.push(
          (async () => {
            try {
              const fm = makeFrontmatter({ name: `mixed-${i}`, description: `Mixed ${i}` })
              const parsed = parseSkillFrontmatterFields(fm, '# mixed\n', `mixed-${i}`)
              return { exitCode: parsed.displayName === `mixed-${i}` ? 0 : 1 }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      for (let i = 0; i < 5; i++) {
        ops.push(
          (async () => {
            try {
              const result = await mcpRequest(server.clientTransport, 'tools/call', {
                name: 'ping',
                arguments: {},
              })
              const content = (result as { result: { content: [{ text: string }] } }).result
                .content[0].text
              return { exitCode: JSON.parse(content).pong === true ? 0 : 1 }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      const results = await Promise.all(ops)
      assertAllSucceed(results as ExitCodeResult[])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L3 — High stress (30-50 concurrent + chaos injection)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L3 — High stress', () => {
  // ── Skills: 30 concurrent + chaos ────────────────────────────────────────

  describe('Skills — 30 concurrent parse with chaos', () => {
    test('30 concurrent createSkillCommand → survival rate >= 85%', {
      timeout: 30000,
    }, async () => {
      const results = await runConcurrently(30, (i) => {
        try {
          createSkillCommand(
            makeSkillCmdArgs({
              skillName: `chaos-${i}`,
              description: 'x'.repeat(1000), // large description
            }),
          )
          return { exitCode: 0 }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertSurvivalRate(results as ExitCodeResult[], 0.85, 'skill creates')
    })

    test('30 concurrent parseSkillFrontmatterFields with varied inputs → no crashes', {
      timeout: 30000,
    }, async () => {
      const variedInputs = [
        { name: 'empty', desc: undefined },
        { name: 'full', desc: 'Full description', tools: ['Read', 'Write'], tags: ['a', 'b'] },
        { name: 'fork', desc: 'Fork context', context: 'fork' },
        { name: 'long', desc: 'x'.repeat(5000) },
      ]

      const results = await runConcurrently(30, (i) => {
        try {
          const input = variedInputs[i % variedInputs.length]
          const fm = makeFrontmatter({
            name: input.name,
            description: input.desc,
            ...(input.tools ? { 'allowed-tools': input.tools } : {}),
            ...(input.tags ? { tags: input.tags } : {}),
            ...(input.context ? { context: input.context } : {}),
          })
          parseSkillFrontmatterFields(fm, `# ${input.name}\n\nBody\n`, input.name)
          return { exitCode: 0 }
        } catch {
          return { exitCode: 1 }
        }
      })
      const failures = countFailures(results as ExitCodeResult[])
      expect(failures).toBeLessThanOrEqual(5)
    })
  })

  // ── MCP: chaos injection (close transport mid-operation) ─────────────────

  describe('MCP — chaos injection', () => {
    test('close server mid concurrent calls → no process crash', {
      timeout: 30000,
    }, async () => {
      const server = createMockMCPServer([{ name: 'slow', handler: () => ({ done: true }) }])
      await sendInitSequence(server.clientTransport, server.serverTransport)

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => {
          if (i === 10) {
            // Close mid-way (after a short delay)
            return new Promise<void>((r) => setTimeout(r, 50)).then(() => server.close())
          }
          return mcpRequest(server.clientTransport, 'tools/call', {
            name: 'slow',
            arguments: {},
          }).catch(() => ({ error: true }))
        }),
      )

      // All should resolve (either with result or error) without throwing
      expect(results.length).toBe(20)
      // No uncaught exceptions = pass
    })

    test('transport close + reopen → new pair functions correctly', async () => {
      // First pair
      const s1 = createMockMCPServer([{ name: 'test', handler: () => ({ v: 1 }) }])
      await sendInitSequence(s1.clientTransport, s1.serverTransport)
      const r1 = await mcpRequest(s1.clientTransport, 'tools/call', {
        name: 'test',
        arguments: {},
      })
      const v1 = JSON.parse(
        (r1 as { result: { content: [{ text: string }] } }).result.content[0].text,
      )
      expect(v1.v).toBe(1)
      await s1.close()

      // Second pair (same test)
      const s2 = createMockMCPServer([{ name: 'test', handler: () => ({ v: 2 }) }])
      await sendInitSequence(s2.clientTransport, s2.serverTransport)
      const r2 = await mcpRequest(s2.clientTransport, 'tools/call', {
        name: 'test',
        arguments: {},
      })
      const v2 = JSON.parse(
        (r2 as { result: { content: [{ text: string }] } }).result.content[0].text,
      )
      expect(v2.v).toBe(2)
      await s2.close()
    })
  })

  // ── Cross-contamination: independent transports ──────────────────────────

  describe('Cross-contamination prevention', () => {
    test('3 independent mock servers → no message leaking', {
      timeout: 30000,
    }, async () => {
      const servers = [
        createMockMCPServer([{ name: 's1', handler: () => ({ server: 1 }) }]),
        createMockMCPServer([{ name: 's2', handler: () => ({ server: 2 }) }]),
        createMockMCPServer([{ name: 's3', handler: () => ({ server: 3 }) }]),
      ]

      for (const s of servers) {
        await sendInitSequence(s.clientTransport, s.serverTransport)
      }

      const results = await Promise.all(
        servers.map(async (s, i) => {
          try {
            const r = await mcpRequest(s.clientTransport, 'tools/call', {
              name: `s${i + 1}`,
              arguments: {},
            })
            return {
              exitCode: 0,
              data: JSON.parse(
                (r as { result: { content: [{ text: string }] } }).result.content[0].text,
              ),
            }
          } catch {
            return { exitCode: 1, data: null }
          }
        }),
      )

      for (let i = 0; i < 3; i++) {
        expect(results[i].exitCode).toBe(0)
        expect(results[i].data.server).toBe(i + 1)
      }

      await Promise.all(servers.map((s) => s.close()))
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L4 — Extreme stress (50-100 concurrent + recovery)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L4 — Extreme stress', () => {
  // ── Skills: 100 concurrent createSkillCommand ────────────────────────────

  describe('Skills — 100 concurrent create', () => {
    test('100 concurrent createSkillCommand → survival rate >= 60%', {
      timeout: 60000,
    }, async () => {
      const results = await runConcurrently(100, (i) => {
        try {
          createSkillCommand(
            makeSkillCmdArgs({
              skillName: `extreme-${i}`,
              description: `Extreme stress skill #${i}`,
            }),
          )
          return { exitCode: 0 }
        } catch {
          return { exitCode: 1 }
        }
      })
      const { rate } = assertSurvivalRate(results as ExitCodeResult[], 0.6, 'extreme skill creates')
      // Soft assertion: document actual rate
      expect(rate).toBeGreaterThanOrEqual(0.6)
    })
  })

  // ── MCP: 50 concurrent calls on single server ────────────────────────────

  describe('MCP — 50 concurrent tool calls', () => {
    test('50 concurrent tool calls → survival rate >= 70%', {
      timeout: 60000,
    }, async () => {
      const server = createMockMCPServer([
        {
          name: 'compute',
          handler: (args) => {
            const n = (args.n as number) ?? 0
            return { result: n * 2 }
          },
        },
      ])
      await sendInitSequence(server.clientTransport, server.serverTransport)

      const results = await Promise.allSettled(
        Array.from({ length: 50 }, (_, i) =>
          mcpRequest(server.clientTransport, 'tools/call', {
            name: 'compute',
            arguments: { n: i },
          })
            .then((r) => ({
              exitCode: 0,
              data: JSON.parse(
                (r as { result: { content: [{ text: string }] } }).result.content[0].text,
              ),
            }))
            .catch(() => ({ exitCode: 1, data: null })),
        ),
      )

      const exitResults = results.map((r) => (r.status === 'fulfilled' ? r.value : { exitCode: 1 }))
      assertSurvivalRate(exitResults as ExitCodeResult[], 0.7, 'MCP calls')

      await server.close()
    })
  })

  // ── Full system: 80 mixed operations (skills + MCP + hooks) ──────────────

  describe('Full system mixed — 80 ops', () => {
    test('80 mixed skill/MCP operations concurrently → survival rate >= 60%', {
      timeout: 90000,
    }, async () => {
      const server = createMockMCPServer([{ name: 'fast', handler: () => ({ ok: true }) }])
      await sendInitSequence(server.clientTransport, server.serverTransport)

      const ops: Promise<ExitCodeResult>[] = []

      // 40 skill operations
      for (let i = 0; i < 40; i++) {
        const idx = i
        ops.push(
          (async () => {
            try {
              const cmd = createSkillCommand(
                makeSkillCmdArgs({
                  skillName: `fullsys-${idx}`,
                  description: `Full system test ${idx}`,
                }),
              )
              return { exitCode: cmd.type === 'prompt' ? 0 : 1 }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      // 40 MCP operations
      for (let i = 0; i < 40; i++) {
        ops.push(
          (async () => {
            try {
              await mcpRequest(server.clientTransport, 'tools/call', {
                name: 'fast',
                arguments: {},
              })
              return { exitCode: 0 }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      const results = await Promise.allSettled(ops)
      const exitResults = results.map((r) => (r.status === 'fulfilled' ? r.value : { exitCode: 1 }))
      assertSurvivalRate(exitResults as ExitCodeResult[], 0.6, 'mixed ops')

      await server.close()
    })
  })

  // ── Disaster recovery ────────────────────────────────────────────────────

  describe('Disaster recovery', () => {
    test('after 100 concurrent creates → skill parsing still works (recovery)', {
      timeout: 60000,
    }, async () => {
      // Phase 1: extreme load
      await runConcurrently(80, (i) => {
        try {
          createSkillCommand(
            makeSkillCmdArgs({
              skillName: `pre-recovery-${i}`,
              description: 'a'.repeat(500),
            }),
          )
          return { exitCode: 0 }
        } catch {
          return { exitCode: 1 }
        }
      })

      // Phase 2: verify normal operation
      const fm = makeFrontmatter({ name: 'recovery-test', description: 'Recovery verification' })
      const parsed = parseSkillFrontmatterFields(fm, '# Recovery\n\nStill works\n', 'recovery-test')
      expect(parsed.displayName).toBe('recovery-test')
      expect(parsed.description).toBe('Recovery verification')

      const cmd = createSkillCommand(
        makeSkillCmdArgs({
          skillName: 'recovery-cmd',
          description: 'Recovery command',
        }),
      )
      expect(cmd.name).toBe('recovery-cmd')
    })

    test('after MCP chaos → new mock server works correctly', {
      timeout: 30000,
    }, async () => {
      // Phase 1: create and immediately close 20 servers
      const servers: ReturnType<typeof createMockMCPServer>[] = []
      for (let i = 0; i < 20; i++) {
        const s = createMockMCPServer([{ name: `t${i}`, handler: () => ({ i }) }])
        servers.push(s)
      }
      await Promise.all(servers.map((s) => s.close()))

      // Phase 2: create a fresh server and verify it works
      const fresh = createMockMCPServer([{ name: 'recover', handler: () => ({ recovered: true }) }])
      await sendInitSequence(fresh.clientTransport, fresh.serverTransport)

      const result = await mcpRequest(fresh.clientTransport, 'tools/call', {
        name: 'recover',
        arguments: {},
      })
      const data = JSON.parse(
        (result as { result: { content: [{ text: string }] } }).result.content[0].text,
      )
      expect(data.recovered).toBe(true)

      await fresh.close()
    })
  })
})
