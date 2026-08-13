/**
 * E2E Stress Test — Shared Helpers
 *
 * Provides isolation, MCP mock, CLI spawn, concurrency orchestration,
 * and result validation utilities shared by component-stress and pipeline-stress tests.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { createLinkedTransportPair } from '../../services/mcp/InProcessTransport.js'

// ═══════════════════════════════════════════════════════════════════════════════
// Isolation helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function createTempHome(): string {
  return mkdtempSync(join(tmpdir(), 'e2e-stress-home-'))
}

export function createTempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-stress-config-'))
  mkdirSync(join(dir, 'skills'), { recursive: true })
  mkdirSync(join(dir, 'hooks'), { recursive: true })
  return dir
}

export function cleanupTemp(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows may hold file handles briefly */
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Skill file writers
// ═══════════════════════════════════════════════════════════════════════════════

export function writeSkillFile(skillsDir: string, name: string, content: string): string {
  const dir = join(skillsDir, name)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, 'SKILL.md')
  writeFileSync(filePath, content)
  return filePath
}

export function writeSimpleSkill(
  skillsDir: string,
  name: string,
  description: string,
  body?: string,
): string {
  const frontmatter = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    'user-invocable: true',
    '---',
    '',
    body ?? `# ${name}\n\n${description}\n`,
  ].join('\n')
  return writeSkillFile(skillsDir, name, frontmatter)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP mock server factory
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockMCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  handler?: (args: Record<string, unknown>) => unknown
}

export interface MockMCPServer {
  clientTransport: Transport
  serverTransport: Transport
  close: () => Promise<void>
  /** Push a notification/message from server→client without a request */
  push: (msg: JSONRPCMessage) => void
}

/**
 * Creates an in-process MCP mock server with registered tools.
 * The server handles initialize, tools/list, and tools/call
 * for the given tool set.
 */
export function createMockMCPServer(tools: MockMCPTool[] = []): MockMCPServer {
  const [clientTransport, serverTransport] = createLinkedTransportPair()

  const toolMap = new Map(tools.map((t) => [t.name, t]))

  serverTransport.onmessage = async (msg: JSONRPCMessage) => {
    // Only handle JSON-RPC requests (methods)
    if (!('method' in msg)) return

    const id = 'id' in msg ? (msg as { id: unknown }).id : undefined

    try {
      switch (msg.method) {
        case 'initialize': {
          if (id !== undefined) {
            serverTransport.send({
              jsonrpc: '2.0',
              id: id as number,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mock-mcp', version: '1.0.0' },
              },
            } as JSONRPCMessage)
          }
          return
        }
        case 'notifications/initialized':
          return // no response needed
        case 'tools/list': {
          if (id !== undefined) {
            serverTransport.send({
              jsonrpc: '2.0',
              id: id as number,
              result: {
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description ?? `Mock tool: ${t.name}`,
                  inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
                })),
              },
            } as JSONRPCMessage)
          }
          return
        }
        case 'tools/call': {
          const params = (msg as { params: { name: string; arguments?: Record<string, unknown> } })
            .params
          const tool = toolMap.get(params.name)
          if (id !== undefined) {
            if (tool) {
              try {
                const result = tool.handler ? tool.handler(params.arguments ?? {}) : { ok: true }
                serverTransport.send({
                  jsonrpc: '2.0',
                  id: id as number,
                  result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
                } as JSONRPCMessage)
              } catch (err) {
                serverTransport.send({
                  jsonrpc: '2.0',
                  id: id as number,
                  result: {
                    content: [{ type: 'text', text: `Error: ${String(err)}` }],
                    isError: true,
                  },
                } as JSONRPCMessage)
              }
            } else {
              serverTransport.send({
                jsonrpc: '2.0',
                id: id as number,
                result: {
                  content: [{ type: 'text', text: `Tool not found: ${params.name}` }],
                  isError: true,
                },
              } as JSONRPCMessage)
            }
          }
          return
        }
        default: {
          if (id !== undefined) {
            serverTransport.send({
              jsonrpc: '2.0',
              id: id as number,
              error: { code: -32601, message: `Method not found: ${msg.method}` },
            } as JSONRPCMessage)
          }
        }
      }
    } catch {
      // Transport may already be closed - ignore
    }
  }

  let started = false
  const startPromise = (async () => {
    if (!started) {
      started = true
      await serverTransport.start()
      await clientTransport.start()
    }
  })()
  // Kick off start
  startPromise.catch(() => {})

  return {
    clientTransport,
    serverTransport,
    close: async () => {
      try {
        await clientTransport.close()
      } catch {}
      try {
        await serverTransport.close()
      } catch {}
    },
    push: (msg: JSONRPCMessage) => {
      try {
        clientTransport.onmessage?.(msg)
      } catch {}
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI spawn helper
// ═══════════════════════════════════════════════════════════════════════════════

export interface CLISpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function spawnHeadlessCLI(
  args: string[],
  env?: Record<string, string>,
  timeoutMs = 30000,
): Promise<CLISpawnResult> {
  const proc = Bun.spawn(['bun', 'run', './src/localRecoveryCli.ts', ...args], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  })

  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {}
  }, timeoutMs)

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  clearTimeout(timer)

  return { stdout, stderr, exitCode }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Concurrency orchestrators
// ═══════════════════════════════════════════════════════════════════════════════

export async function runConcurrently<T>(
  n: number,
  fn: (index: number) => Promise<T>,
): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)))
}

export async function runBurst<T>(n: number, fn: (index: number) => Promise<T>): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < n; i++) {
    results.push(await fn(i))
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════════════════
// Result validators
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExitCodeResult {
  exitCode: number
  stdout?: string
  stderr?: string
}

export function assertAllSucceed(results: ExitCodeResult[]): void {
  const failed = results.filter((r) => r.exitCode !== 0)
  if (failed.length > 0) {
    throw new Error(
      `${failed.length}/${results.length} operations failed: ` +
        failed.map((r) => `exit=${r.exitCode}`).join(', '),
    )
  }
}

export function assertSurvivalRate(
  results: ExitCodeResult[],
  minRate: number,
  label = 'operations',
): { survived: number; total: number; rate: number } {
  const total = results.length
  const survived = results.filter((r) => r.exitCode === 0).length
  const rate = total > 0 ? survived / total : 1
  if (rate < minRate) {
    throw new Error(
      `Survival rate ${(rate * 100).toFixed(1)}% below minimum ${(minRate * 100).toFixed(1)}% ` +
        `(${survived}/${total} ${label})`,
    )
  }
  return { survived, total, rate }
}

export function countFailures(results: ExitCodeResult[]): number {
  return results.filter((r) => r.exitCode !== 0).length
}

// ═══════════════════════════════════════════════════════════════════════════════
// ECC hook helpers
// ═══════════════════════════════════════════════════════════════════════════════

const ECC_HOOKS_DIR = '.claude/hooks/workflow-enforcement'

/**
 * Spawn a specific ECC representative hook script via bash.
 * Uses the same pattern as hooks-stress.test.ts — Bun.spawn bash with stdin JSON.
 */
export async function runECCHook(
  script: string,
  stdin: Record<string, unknown>,
  homeEnv: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const tmp = mkdtempSync(join(tmpdir(), 'ecc-hook-'))
  const inputFile = join(tmp, 'input.json')
  writeFileSync(inputFile, JSON.stringify(stdin))

  try {
    const scriptPath = join(ECC_HOOKS_DIR, script).replace(/\\/g, '/')
    const inputFileUnix = inputFile.replace(/\\/g, '/')
    const proc = Bun.spawn(['bash', '-c', `"${scriptPath}" < "${inputFileUnix}"`], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: homeEnv },
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    return { stdout, stderr, exitCode }
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP JSON-RPC helper: send request and wait for response
// Supports concurrent requests on the same transport via a pending-request map.
// ═══════════════════════════════════════════════════════════════════════════════

type PendingEntry = {
  resolve: (msg: JSONRPCMessage) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingMap = new WeakMap<Transport, Map<number, PendingEntry>>()

function ensureMultiplexer(transport: Transport): Map<number, PendingEntry> {
  const existing = pendingMap.get(transport)
  if (existing) return existing

  const map = new Map<number, PendingEntry>()
  pendingMap.set(transport, map)

  const origOnMessage = transport.onmessage
  transport.onmessage = (msg: JSONRPCMessage) => {
    // Forward to original handler first
    if (origOnMessage) origOnMessage(msg)

    if ('id' in msg) {
      const id = (msg as { id: unknown }).id
      if (typeof id === 'number') {
        const entry = map.get(id)
        if (entry) {
          map.delete(id)
          clearTimeout(entry.timer)
          entry.resolve(msg)
        }
      }
    }
  }

  return map
}

export function mcpRequest(
  transport: Transport,
  method: string,
  params?: Record<string, unknown>,
): Promise<JSONRPCMessage> {
  const map = ensureMultiplexer(transport)
  const id = Math.floor(Math.random() * 100000)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      map.delete(id)
      reject(new Error(`MCP request ${method} timed out`))
    }, 10000)

    map.set(id, { resolve, reject, timer })

    transport
      .send({
        jsonrpc: '2.0',
        id,
        method,
        params,
      } as JSONRPCMessage)
      .catch((err) => {
        map.delete(id)
        clearTimeout(timer)
        reject(err)
      })
  })
}

/** Helper to wait one micro-tick for async transport delivery */
export const tick = () => new Promise((r) => queueMicrotask(r))
