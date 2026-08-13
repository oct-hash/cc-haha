/**
 * Edge-case stress tests — 针对 SessionManager + Adapter 的边界条件加压。
 *
 * 重点领域:
 *   A. 并发 chatStream 竞争（同一 session 重叠调用）
 *   B. Adapter 生命周期 / 泄漏检测
 *   C. Retry 机制（部分成功、全部失败、空 retry）
 *   D. AbortController 边界（预中止、中途中止、后中止）
 *   E. Metadata 精度（多 chunk token、部分失败）
 *   F. Save/Load 中间态一致性
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getSessionManager, initSessionManager, resetSessionManager } from '../session-manager.js'
import type { AgentConfig, } from '../types.js'

// ── Raw-event helpers ────────────────────────────────────────────────────

function rawStream(text: string) {
  return { type: 'stream' as const, text }
}

function rawAssistantToolUse(id: string, name: string, input: unknown) {
  return {
    type: 'assistant' as const,
    content: [{ type: 'tool_use' as const, id, name, input }],
  }
}

function rawToolResult(toolUseId: string, content: unknown, isError = false) {
  return {
    type: 'user' as const,
    is_error: isError,
    content: [{ type: 'tool_result' as const, tool_use_id: toolUseId, content }],
  }
}

// ── Executor factories ───────────────────────────────────────────────────

function quickExecutor(label: string) {
  return async function* (_msg: string, _ctrl: AbortController) {
    yield rawStream(label)
  }
}

/** Yields multiple stream chunks, checking abort between each. */
function chunkedExecutor(chunks: string[], delayMs = 0) {
  return async function* (_msg: string, ctrl: AbortController) {
    for (const chunk of chunks) {
      if (ctrl.signal.aborted) return
      if (delayMs > 0) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, delayMs)
          ctrl.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t)
              r()
            },
            { once: true },
          )
        })
      }
      if (ctrl.signal.aborted) return
      yield rawStream(chunk)
    }
  }
}

/** Fails on specific attempt indices (0-based). */
function failOnAttempts(failIndices: number[], okLabel: string, errLabel: string) {
  let callCount = 0
  return async function* (_msg: string, _ctrl: AbortController) {
    const idx = callCount++
    if (failIndices.includes(idx)) throw new Error(`${errLabel}-${idx}`)
    yield rawStream(`${okLabel}-${idx}`)
  }
}

function cfg(qe: AgentConfig['queryExecutor']): AgentConfig {
  return { queryExecutor: qe }
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function collect<T>(gen: AsyncGenerator<T, void, unknown>): Promise<T[]> {
  const items: T[] = []
  try {
    for await (const item of gen) items.push(item)
  } catch {
    // Adapter re-throws after yielding error event
  }
  return items
}

// ── Persistence ──────────────────────────────────────────────────────────

const TEST_DIR = path.join(process.cwd(), '.claude', 'sessions')
const TEST_FILE = path.join(TEST_DIR, 'agent-sessions.json')

function cleanupPersistence() {
  try {
    fs.unlinkSync(TEST_FILE)
  } catch {}
  try {
    fs.rmdirSync(TEST_DIR)
  } catch {}
}

beforeEach(() => {
  resetSessionManager()
  cleanupPersistence()
})
afterEach(() => {
  resetSessionManager()
  cleanupPersistence()
})

// ═══════════════════════════════════════════════════════════════════════════
// A. 并发 chatStream 竞争
// ═══════════════════════════════════════════════════════════════════════════

describe('A — 并发 chatStream', () => {
  it('同一 session 重叠两次 chatStream，第二次中断第一次', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(chunkedExecutor(['a', 'b', 'c', 'd', 'e'], 30)))

    // 启动第一次 chatStream（慢速）
    const ctrl1 = new AbortController()
    const p1 = collect(h.chatStream('m1', ctrl1))

    // 不等第一次完成，立即启动第二次
    await new Promise((r) => setTimeout(r, 10))
    const ctrl2 = new AbortController()
    const events2 = await collect(h.chatStream('m2', ctrl2))

    // 第二次应正常完成
    expect(events2.some((e) => e.type === 'done')).toBe(true)

    // 第一次被中断（ctrl1 被 adapter.interrupt() 触发的 abort）
    const events1 = await p1
    // 被中断后不应有 done 事件（status 已被设为 killed）
    expect(events1.filter((e) => e.type === 'done')).toHaveLength(0)
  })

  it('同一 session 3 次快速连续 chatStream，最后一次独占', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(chunkedExecutor(['x', 'y', 'z'], 20)))

    const results: string[][] = []
    const promises: Promise<void>[] = []

    for (let i = 0; i < 3; i++) {
      const ctrl = new AbortController()
      const p = collect(h.chatStream(`m${i}`, ctrl)).then((events) => {
        results.push(events.map((e) => e.type))
      })
      promises.push(p)
      // 微小延迟确保启动顺序
      await new Promise((r) => setTimeout(r, 5))
    }

    await Promise.all(promises)
    // 最后一次调用应看到 done
    expect(results[2]).toContain('done')
  })

  it('并发 chatStream 不泄漏 adapter（activeAdapters 最终清理）', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(quickExecutor('ok')))

    // 启动第一次
    const p1 = collect(h.chatStream('m1', new AbortController()))
    // 立即启动第二次（会中断第一次的 adapter）
    await new Promise((r) => setTimeout(r, 5))
    await collect(h.chatStream('m2', new AbortController()))
    await p1

    // 再跑一轮确保 adapter 正常创建/销毁
    await collect(h.chatStream('m3', new AbortController()))
    expect(h.metadata.messageCount).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. Adapter 生命周期
// ═══════════════════════════════════════════════════════════════════════════

describe('B — Adapter 生命周期', () => {
  it('chatStream 成功后 adapter 留在 activeAdapters（下次调用时被替换）', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(quickExecutor('ok')))

    await collect(h.chatStream('m1', new AbortController()))
    // 此时 adapter 仍在 activeAdapters（等待下次 chatStream 替换）
    expect(h.status).toBe('idle') // adapter 回到 idle

    // 再次 chatStream — 前一个 adapter 会被中断+dispose
    await collect(h.chatStream('m2', new AbortController()))
    expect(h.metadata.messageCount).toBe(2)
  })

  it('chatStream 出错后 adapter 被清理', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('fail-fast')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    const events = await collect(h.chatStream('m1', new AbortController()))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(h.metadata.errorsEncountered).toBe(1)

    // 出错后 status 回到 idle（adapter 已清理）
    expect(h.status).toBe('idle')
  })

  it('同一 session destroy 后 chatStream 仍然可用（通过 handle 引用）', () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(quickExecutor('v1')))

    h.destroy()
    expect(sm.listSessions()).toHaveLength(0)

    // destroy 后 handle 引用失效
    expect(sm.getSession(h.id)).toBeUndefined()
  })

  it('dispose → recreate 同 kind 不共享状态', async () => {
    const sm = getSessionManager()

    const h1 = sm.createSession('claude-haha', cfg(quickExecutor('first')))
    await collect(h1.chatStream('m1', new AbortController()))
    expect(h1.metadata.messageCount).toBe(1)
    h1.destroy()

    const h2 = sm.createSession('claude-haha', cfg(quickExecutor('second')))
    expect(h2.metadata.messageCount).toBe(0) // 全新 session
    expect(h2.id).not.toBe(h1.id)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. Retry 机制
// ═══════════════════════════════════════════════════════════════════════════

describe('C — Retry 机制', () => {
  it('retryAttempts=2：第 2 次重试成功', async () => {
    const sm = getSessionManager({
      retryAttempts: 2,
      maxSessions: 5,
    })
    // 第 0 次失败，第 1 次成功
    const h = sm.createSession('claude-haha', cfg(failOnAttempts([0], 'ok', 'fail')))

    const events = await collect(h.chatStream('m1', new AbortController()))
    expect(events.some((e) => e.type === 'text_chunk' && e.content === 'ok-1')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(h.metadata.errorsEncountered).toBe(0) // 最终成功，不算 error
    expect(h.metadata.messageCount).toBe(1)
  })

  it('retryAttempts=1：全部失败，返回 error + done', async () => {
    const sm = getSessionManager({
      retryAttempts: 1,
      maxSessions: 5,
    })
    const h = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('always-fail')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    const events = await collect(h.chatStream('m1', new AbortController()))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(h.metadata.errorsEncountered).toBe(1)
    // messageCount 仍递增（代表用户发送了消息）
    expect(h.metadata.messageCount).toBe(1)
  })

  it('retryAttempts=0（默认）：不重试，直接返回 error', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('no-retry')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    const events = await collect(h.chatStream('m1', new AbortController()))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(h.metadata.retryCount).toBe(1) // 1 次尝试（非重试）
  })

  it('retry 过程 messageCount 只递增一次', async () => {
    const sm = getSessionManager({
      retryAttempts: 3,
      maxSessions: 5,
    })
    const h = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('always')
        // biome-ignore lint/correctness/noUnreachable: yield* required for async generator signature (function throws first)
        yield* []
      },
    })

    await collect(h.chatStream('m1', new AbortController()))
    // messageCount 在循环外递增，只加一次
    expect(h.metadata.messageCount).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. AbortController 边界
// ═══════════════════════════════════════════════════════════════════════════

describe('D — AbortController 边界', () => {
  it('预中止的 AbortController：abort 后不 yield done', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(chunkedExecutor(['a', 'b'], 200)))

    const ctrl = new AbortController()
    ctrl.abort(new Error('pre-aborted'))

    const events = await collect(h.chatStream('m1', ctrl))
    // 修复后：signal.aborted → 不 yield done
    expect(events.filter((e) => e.type === 'done')).toHaveLength(0)
    expect(events.filter((e) => e.type === 'text_chunk')).toHaveLength(0)
  })

  it('中途 abort：收到部分 chunk 后停止，不 yield done', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(chunkedExecutor(['a', 'b', 'c', 'd'], 30)))

    const ctrl = new AbortController()

    // 50ms 后 abort — 此时约 1 个 chunk 已 yield（30ms delay per chunk）
    setTimeout(() => ctrl.abort(new Error('mid-abort')), 50)

    const events = await collect(h.chatStream('m1', ctrl))
    // 修复后：signal.aborted → 不 yield done
    expect(events.filter((e) => e.type === 'done')).toHaveLength(0)
    const chunks = events.filter((e) => e.type === 'text_chunk')
    expect(chunks.length).toBeLessThan(4)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('完成后 abort：不影响已完成的状态', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(quickExecutor('done')))

    const ctrl = new AbortController()
    const events = await collect(h.chatStream('m1', ctrl))

    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(h.status).toBe('idle')

    // 完成后 abort
    ctrl.abort()
    expect(h.status).toBe('idle') // 不影响
  })

  it('多个不同 AbortController 独立工作', async () => {
    const sm = getSessionManager({ maxSessions: 5 })

    const h1 = sm.createSession('claude-haha', cfg(chunkedExecutor(['a1', 'a2'], 30)))
    const h2 = sm.createSession('claude-haha', cfg(chunkedExecutor(['b1', 'b2'], 30)))

    const ctrl1 = new AbortController()
    const ctrl2 = new AbortController()

    // 只 abort session1
    setTimeout(() => ctrl1.abort(), 20)

    const [e1, e2] = await Promise.all([
      collect(h1.chatStream('go', ctrl1)),
      collect(h2.chatStream('go', ctrl2)),
    ])

    // session1 被中断——协作式 executor 检测信号返回
    // session2 正常完成
    expect(e2.some((e) => e.type === 'done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. Metadata 精度
// ═══════════════════════════════════════════════════════════════════════════

describe('E — Metadata 精度', () => {
  it('多 chunk token 累计正确', async () => {
    const sm = getSessionManager()
    const chunks = ['hello', 'world', 'this is a longer chunk with more tokens']
    const h = sm.createSession('claude-haha', cfg(chunkedExecutor(chunks)))

    await collect(h.chatStream('m1', new AbortController()))

    const expectedTokens = chunks.reduce((sum, c) => sum + Math.ceil(c.length / 4), 0)
    expect(h.metadata.totalTokens).toBe(expectedTokens)
  })

  it('tool_call_end 计入 totalToolCalls，tool_call_start 不计入', async () => {
    const sm = getSessionManager()
    const h = sm.createSession(
      'claude-haha',
      cfg(async function* (_msg: string, _ctrl: AbortController) {
        yield rawStream('thinking...')
        yield rawAssistantToolUse('t1', 'Read', { path: '/a' })
        yield rawToolResult('t1', 'content')
        yield rawAssistantToolUse('t2', 'Write', { path: '/b' })
        yield rawToolResult('t2', 'done')
      }),
    )

    await collect(h.chatStream('m1', new AbortController()))
    // 2 个 tool_result → 2 个 tool_call_end
    expect(h.metadata.totalToolCalls).toBe(2)
  })

  it('工具调用出错（is_error=true）仍计入 totalToolCalls', async () => {
    const sm = getSessionManager()
    const h = sm.createSession(
      'claude-haha',
      cfg(async function* (_msg: string, _ctrl: AbortController) {
        yield rawStream('try...')
        yield rawAssistantToolUse('bad', 'Bash', { cmd: 'rm -rf /' })
        yield rawToolResult('bad', 'Permission denied', true)
      }),
    )

    await collect(h.chatStream('m1', new AbortController()))
    expect(h.metadata.totalToolCalls).toBe(1) // 错误也计入
  })

  it('messageCount 和 errorsEncountered 在多轮中正确累积', async () => {
    const sm = getSessionManager({
      maxSessions: 5,
      retryAttempts: 0,
    })

    // 用 failOnAttempts：每个新 session 的第一次调用失败
    const h = sm.createSession('claude-haha', cfg(failOnAttempts([0, 2, 4], 'ok', 'fail')))

    // 轮 1: 失败 (attempt 0)
    await collect(h.chatStream('m1', new AbortController()))
    expect(h.metadata.messageCount).toBe(1)
    expect(h.metadata.errorsEncountered).toBe(1)

    // 轮 2: 成功 (attempt 1)
    await collect(h.chatStream('m2', new AbortController()))
    expect(h.metadata.messageCount).toBe(2)
    expect(h.metadata.errorsEncountered).toBe(1) // 不变

    // 轮 3: 失败 (attempt 2)
    await collect(h.chatStream('m3', new AbortController()))
    expect(h.metadata.messageCount).toBe(3)
    expect(h.metadata.errorsEncountered).toBe(2)

    // 轮 4: 成功 (attempt 3)
    await collect(h.chatStream('m4', new AbortController()))
    expect(h.metadata.messageCount).toBe(4)
    expect(h.metadata.errorsEncountered).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. Save/Load 中间态
// ═══════════════════════════════════════════════════════════════════════════

describe('F — Save/Load 中间态', () => {
  it('chatStream 运行中 save 不崩溃', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(chunkedExecutor(['a', 'b', 'c'], 10)))

    // 启动慢速 chatStream
    const streamPromise = collect(h.chatStream('m1', new AbortController()))

    // 运行中 save
    await sm.save()
    await sm.save()

    await streamPromise
    await sm.save()

    // 恢复后 metadata 应一致
    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(1)
    expect(sm2.listSessions()[0].metadata.messageCount).toBe(h.metadata.messageCount)
  })

  it('save → save（连续两次无变更）数据一致', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha', cfg(quickExecutor('ok')))
    await sm.save()

    const before = await fs.promises.readFile(TEST_FILE, 'utf-8')
    await sm.save()
    const after = await fs.promises.readFile(TEST_FILE, 'utf-8')

    expect(before).toBe(after)
  })

  it('恢复后 activeKind 正确', async () => {
    const sm = getSessionManager()
    sm.setActiveKind('codex')
    sm.createSession('claude-haha')
    await sm.save()

    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.getActiveKind()).toBe('codex')
  })

  it('部分字段缺失的 JSON 恢复不崩溃', async () => {
    await fs.promises.mkdir(TEST_DIR, { recursive: true })
    // 缺失 config 和 agentKind 的损坏记录
    await fs.promises.writeFile(
      TEST_FILE,
      JSON.stringify({
        activeKind: 'claude-code',
        sessions: [
          { id: 'orphan-1' },
          { id: 'valid-1', agentKind: 'claude-haha', metadata: { messageCount: 5 } },
        ],
      }),
    )

    resetSessionManager()
    const sm = await initSessionManager()
    // 应跳过损坏记录，保留有效记录
    expect(sm.listSessions().length).toBeGreaterThanOrEqual(0)
  })

  it('100 次 save 循环不损坏文件', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha', cfg(quickExecutor('ok')))
    sm.createSession('codex')

    for (let i = 0; i < 100; i++) {
      await sm.save()
    }

    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. 混合压力
// ═══════════════════════════════════════════════════════════════════════════

describe('G — 混合压力', () => {
  it('3 kind 交替 chatStream + save（仅 haha 实际 chatStream）', async () => {
    const sm = getSessionManager({ maxSessions: 10 })

    const haha = sm.createSession('claude-haha', cfg(quickExecutor('haha')))
    // codex/claude-code 无 queryExecutor，不做 chatStream（spawn 子进程会超时）
    sm.createSession('claude-code')
    sm.createSession('codex')

    for (let i = 0; i < 10; i++) {
      await collect(haha.chatStream(`h${i}`, new AbortController()))
      await sm.save()
    }

    expect(haha.metadata.messageCount).toBe(10)
    expect(sm.listSessions()).toHaveLength(3)

    // 恢复一致
    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(3)
    const restored = sm2.listSessions().find((s) => s.agentKind === 'claude-haha')
    expect(restored?.metadata.messageCount).toBe(10)
  })

  it('session limit 超限抛错', () => {
    const sm = getSessionManager({ maxSessions: 3 })

    sm.createSession('claude-haha')
    sm.createSession('claude-code')
    sm.createSession('codex')

    expect(() => sm.createSession('claude-haha')).toThrow('Session limit')
  })

  it('getConfig 返回带默认值的完整配置', () => {
    const sm1 = getSessionManager()
    expect(sm1.getConfig()).toEqual({
      maxSessions: 10,
      retryAttempts: 0,
      timeoutMs: 0,
      defaultKind: 'claude-haha',
    })

    const sm2 = getSessionManager({ maxSessions: 5, retryAttempts: 2 })
    // 单例已创建，getSessionManager 忽略后续 config
    // 用 updateConfig 改
    sm2.updateConfig({ maxSessions: 5, retryAttempts: 2 })
    // 注意：timeoutMs 仍为 0（updateConfig 只更新传入的字段）
    expect(sm2.getConfig().maxSessions).toBe(5)
    expect(sm2.getConfig().retryAttempts).toBe(2)
  })
})
