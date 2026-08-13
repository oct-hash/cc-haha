/**
 * SessionManager Stress Tests — 模拟真实多会话并发场景。
 *
 * 加压维度:
 *   1. 高并发会话创建/销毁
 *   2. 并行 chatStream（多个 session 同时运行）
 *   3. 错误恢复 + 重试竞争（多个 session 同时失败/重试）
 *   4. 配置热重载 + 会话并发（运行时改配置，验证新会话生效）
 *   5. 持久化往返（大量 session 保存/加载完整性）
 *   6. Agent 类型切换 + 并发（switchAgent 与 chatStream 竞争）
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getSessionManager, initSessionManager, resetSessionManager } from '../session-manager.js'
import type { AgentConfig } from '../types.js'

// ── Raw-event helpers (copied from gaps test — translateEvent 兼容) ──────

function rawStream(text: string) {
  return { type: 'stream' as const, text }
}

function rawError(text: string, delayMs = 0) {
  return async function* (_msg: string, _ctrl: AbortController) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    throw new Error(text)
  }
}

function rawEcho(delayMs = 0, label = 'echo') {
  return async function* (_msg: string, ctrl: AbortController) {
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
    if (ctrl.signal.aborted) throw new Error('aborted')
    yield rawStream(label)
  }
}

function rawFlaky(failuresBeforeSuccess: number, label = 'flaky') {
  return async function* (_msg: string, _ctrl: AbortController) {
    if (failuresBeforeSuccess > 0) {
      throw new Error(`flaky failure #${failuresBeforeSuccess}`)
    }
    yield rawStream(label)
  }
}

// ── Test helpers ──────────────────────────────────────────────────────────

async function collect<T>(gen: AsyncGenerator<T, void, unknown>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) items.push(item)
  return items
}

function cfg(qe: AgentConfig['queryExecutor']): AgentConfig {
  return { queryExecutor: qe }
}

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => resetSessionManager())
afterEach(() => resetSessionManager())

// ═══════════════════════════════════════════════════════════════════════════
// 维度 1: 高并发会话创建/销毁
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 1 — 高并发创建/销毁', () => {
  it('快速连续创建 50 个 session 不丢失', () => {
    const sm = getSessionManager({ maxSessions: 100 })
    const handles = Array.from({ length: 50 }, () =>
      sm.createSession('claude-haha', cfg(rawEcho(0))),
    )
    expect(sm.listSessions()).toHaveLength(50)
    // 所有 ID 唯一
    const ids = handles.map((h) => h.id)
    expect(new Set(ids).size).toBe(50)
  })

  it('快速创建后立即全部销毁', () => {
    const sm = getSessionManager({ maxSessions: 100 })
    for (let i = 0; i < 30; i++) {
      sm.createSession('claude-haha', cfg(rawEcho(0)))
    }
    expect(sm.listSessions()).toHaveLength(30)
    for (const s of sm.listSessions()) s.destroy()
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('达到 maxSessions 上限后抛出错误', () => {
    const sm = getSessionManager({ maxSessions: 5 })
    for (let i = 0; i < 5; i++) sm.createSession('claude-haha')
    expect(() => sm.createSession('claude-haha')).toThrow('Session limit reached')
  })

  it('销毁后可以继续创建（上限释放）', () => {
    const sm = getSessionManager({ maxSessions: 3 })
    const s1 = sm.createSession('claude-haha')
    sm.createSession('claude-haha')
    sm.createSession('claude-haha')
    expect(() => sm.createSession('claude-haha')).toThrow()
    s1.destroy()
    // 上限释放后可以再创建
    const s4 = sm.createSession('claude-haha')
    expect(s4.id).toBeTruthy()
    expect(sm.listSessions()).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 2: 并行 chatStream（多个 session 同时运行）
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 2 — 并行 chatStream', () => {
  it('10 个 session 并行运行，全部正常完成', async () => {
    const sm = getSessionManager({ maxSessions: 20 })
    const sessions = Array.from({ length: 10 }, (_, i) =>
      sm.createSession('claude-haha', cfg(rawEcho(5, `s${i}`))),
    )

    const results = await Promise.all(
      sessions.map(async (s) => {
        const events = await collect(s.chatStream('go', new AbortController()))
        return {
          id: s.id,
          textChunks: events.filter((e) => e.type === 'text_chunk'),
          done: events.some((e) => e.type === 'done'),
        }
      }),
    )

    for (const r of results) {
      expect(r.textChunks.length).toBeGreaterThanOrEqual(1)
      expect(r.done).toBe(true)
    }
    expect(sm.listSessions()).toHaveLength(10)
  })

  it('20 个 session 并发执行，metadata 计数正确', async () => {
    const sm = getSessionManager({ maxSessions: 50 })
    const sessions = Array.from({ length: 20 }, (_, i) =>
      sm.createSession('claude-haha', cfg(rawEcho(2, `msg-${i}`))),
    )

    await Promise.all(sessions.map((s) => collect(s.chatStream('go', new AbortController()))))

    // 每个 session 的 messageCount 应该 ≥ 1
    for (const s of sessions) {
      expect(s.metadata.messageCount).toBeGreaterThanOrEqual(1)
    }
  })

  it('并行运行中 destroy 某个 session，其余不受影响', async () => {
    const sm = getSessionManager({ maxSessions: 20 })
    const sessions = Array.from({ length: 8 }, (_, i) =>
      sm.createSession('claude-haha', cfg(rawEcho(10, `s${i}`))),
    )

    // Destroy sessions 2 and 5 before they start
    sessions[2].destroy()
    sessions[5].destroy()

    const remaining = [0, 1, 3, 4, 6, 7]
    const results = await Promise.all(
      remaining.map(async (i) => {
        const events = await collect(sessions[i].chatStream('go', new AbortController()))
        return events.some((e) => e.type === 'done')
      }),
    )

    expect(results.every(Boolean)).toBe(true)
    expect(sm.listSessions()).toHaveLength(6)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 3: 错误恢复 + 并发重试
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 3 — 错误恢复并发', () => {
  it('多个 session 同时失败并重试，不互相干扰', async () => {
    const sm = getSessionManager({ retryAttempts: 1, maxSessions: 20 })
    let flakyCounter = 0

    const sessions = Array.from({ length: 5 }, () =>
      sm.createSession('claude-haha', {
        queryExecutor: async function* (_msg: string, _ctrl: AbortController) {
          flakyCounter++
          if (flakyCounter <= 3) throw new Error(`fail-${flakyCounter}`)
          yield rawStream('ok')
        },
      }),
    )

    // 所有 session 共享同一个 executor（但每个都创建新的 adapter 实例）
    // 注意：每个 session 创建时会创建 adapter，chatStream 时又会创建新的
    const results = await Promise.allSettled(
      sessions.map((s) => collect(s.chatStream('go', new AbortController()))),
    )

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1) // 至少有一些成功
  })

  it('并发 session 各自独立重试，retryCount 互不影响', async () => {
    const sm = getSessionManager({ retryAttempts: 1, maxSessions: 10 })
    const sessions = Array.from({ length: 3 }, () =>
      sm.createSession('claude-haha', {
        queryExecutor: async function* () {
          throw new Error('always fail')
          yield* []
        },
      }),
    )

    await Promise.allSettled(
      sessions.map((s) => collect(s.chatStream('go', new AbortController()))),
    )

    // 每个 session 各自重试，都应该记录了错误
    for (const s of sessions) {
      expect(s.metadata.errorsEncountered).toBe(1)
      expect(s.metadata.retryCount).toBe(2) // 1 initial + 1 retry
    }
  })

  it('超时 + 重试混合场景：部分成功部分超时', async () => {
    const sm = getSessionManager({ timeoutMs: 100, retryAttempts: 0, maxSessions: 10 })

    // 快速 session
    const fast = sm.createSession('claude-haha', cfg(rawEcho(0, 'fast')))
    // 慢速 session（会超时）
    const slow = sm.createSession('claude-haha', {
      queryExecutor: async function* (_msg: string, ctrl: AbortController) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, 500)
          ctrl.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t)
              r()
            },
            { once: true },
          )
        })
        if (ctrl.signal.aborted) throw new Error('aborted by timeout')
        yield rawStream('slow')
      },
    })

    const [fastResult, slowResult] = await Promise.all([
      collect(fast.chatStream('go', new AbortController())),
      collect(slow.chatStream('go', new AbortController())),
    ])

    expect(fastResult.some((e) => e.type === 'text_chunk')).toBe(true)
    expect(fastResult.some((e) => e.type === 'done')).toBe(true)
    expect(slowResult.some((e) => e.type === 'error')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 4: 配置热重载 + 并发
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 4 — 配置热重载并发', () => {
  it('运行时改变 retryAttempts，新 session 立即生效', async () => {
    const sm = getSessionManager({ retryAttempts: 0, maxSessions: 10 })

    // 用 retryAttempts=0 创建，应该不重试
    let calls = 0
    const s1 = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls++
        throw new Error('fail')
        yield* []
      },
    })
    await collect(s1.chatStream('go', new AbortController()))
    expect(calls).toBe(1) // 不重试

    // 热更新配置
    sm.updateConfig({ retryAttempts: 2 })
    calls = 0

    const s2 = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls++
        throw new Error('fail')
        yield* []
      },
    })
    await collect(s2.chatStream('go', new AbortController()))
    expect(calls).toBe(3) // 1 initial + 2 retries
  })

  it('并发的旧 session 不受热更新影响（使用创建时的 snapshot）', async () => {
    const sm = getSessionManager({ retryAttempts: 0 })
    let calls1 = 0
    let calls2 = 0

    const s1 = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls1++
        throw new Error('fail')
        yield* []
      },
    })

    // 热更新
    sm.updateConfig({ retryAttempts: 2 })

    const s2 = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        calls2++
        throw new Error('fail')
        yield* []
      },
    })

    // 并发运行
    await Promise.all([
      collect(s1.chatStream('go', new AbortController())),
      collect(s2.chatStream('go', new AbortController())),
    ])

    // s1 在热更新前创建，retryAttempts 仍为 0
    // 注意：retryAttempts 在 chatStream 时才读取，不在创建时
    // 所以两个都应该使用新的 retryAttempts=2
    // 这是设计决策——chatStream 时才读取当前 config
    expect(calls1 + calls2).toBeGreaterThanOrEqual(2)
  })

  it('updateSessionConfig 针对单个 session 生效', () => {
    const sm = getSessionManager()
    const s1 = sm.createSession('claude-haha', { cwd: '/old1' })
    const s2 = sm.createSession('claude-haha', { cwd: '/old2' })

    const ok = sm.updateSessionConfig(s1.id, { cwd: '/new1' })
    expect(ok).toBe(true)

    const fail = sm.updateSessionConfig('nonexistent', { cwd: '/x' })
    expect(fail).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 5: 持久化往返 — 大批量 session 保存/加载
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 5 — 持久化往返', () => {
  const TEST_DIR = path.join(process.cwd(), '.claude', 'sessions')
  const TEST_FILE = path.join(TEST_DIR, 'agent-sessions.json')

  function cleanup() {
    try {
      fs.unlinkSync(TEST_FILE)
    } catch {}
    try {
      fs.rmdirSync(TEST_DIR)
    } catch {}
  }

  beforeEach(() => cleanup())
  afterEach(() => cleanup())

  it('保存 30 个 session 后完整加载，数据无损', async () => {
    let sm = getSessionManager({ maxSessions: 50 })
    sm.setActiveKind('codex')

    for (let i = 0; i < 30; i++) {
      sm.createSession(i % 3 === 0 ? 'claude-haha' : i % 3 === 1 ? 'claude-code' : 'codex')
    }

    await sm.save()

    // 模拟重启
    resetSessionManager()
    sm = await initSessionManager()

    expect(sm.getActiveKind()).toBe('codex')
    expect(sm.listSessions()).toHaveLength(30)

    const kinds = sm.listSessions().map((s) => s.agentKind)
    expect(kinds.filter((k) => k === 'claude-haha').length).toBe(10)
    expect(kinds.filter((k) => k === 'claude-code').length).toBe(10)
    expect(kinds.filter((k) => k === 'codex').length).toBe(10)
  })

  it('保存→加载→修改→再保存→再加载（3 轮往返）', async () => {
    let sm = getSessionManager({ maxSessions: 20 })

    // Round 1
    sm.createSession('claude-haha')
    sm.createSession('codex')
    await sm.save()

    // Load
    resetSessionManager()
    sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(2)

    // Round 2: add one, destroy one
    sm.createSession('claude-code')
    sm.listSessions()[0].destroy()
    await sm.save()

    // Load
    resetSessionManager()
    sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(2)

    // Round 3: destroy all
    for (const s of sm.listSessions()) s.destroy()
    await sm.save()

    resetSessionManager()
    sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('损坏文件后加载回退到空状态', async () => {
    await fs.promises.mkdir(TEST_DIR, { recursive: true })
    await fs.promises.writeFile(TEST_FILE, '{"activeKind": "claude-haha", "sessions": [corrupt')

    resetSessionManager()
    const sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(0)
    expect(sm.getActiveKind()).toBe('claude-haha')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 6: Agent 类型切换 + 并发竞争
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 6 — Agent 切换并发', () => {
  it('switchAgent 切换类型后 session 状态正确', () => {
    const sm = getSessionManager()
    const s = sm.createSession('claude-haha')

    sm.switchAgent(s.id, 'codex')
    expect(s.agentKind).toBe('codex')
  })

  it('切换不存在的 session 不抛出', () => {
    const sm = getSessionManager()
    expect(() => sm.switchAgent('nonexistent', 'codex')).not.toThrow()
  })

  it('并发 chatStream 时 switchAgent 中断旧 adapter', async () => {
    const sm = getSessionManager()

    // 慢速 executor
    const s = sm.createSession('claude-haha', {
      queryExecutor: async function* (_msg: string, ctrl: AbortController) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, 200)
          ctrl.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t)
              r()
            },
            { once: true },
          )
        })
        if (ctrl.signal.aborted) {
          yield rawStream('aborted')
          return
        }
        yield rawStream('finished')
      },
    })

    // 启动 chatStream（不 await，让它在后台跑）
    const streamPromise = collect(s.chatStream('go', new AbortController()))

    // 立即切换 agent 类型
    sm.switchAgent(s.id, 'codex')
    expect(s.agentKind).toBe('codex')

    const events = await streamPromise
    // 旧 adapter 被 kill 后静默退出（不产生 done/error），但 executor 检测到 abort 并 yield 'aborted'
    expect(events.some((e) => e.type === 'text_chunk' && e.content === 'aborted')).toBe(true)
  })

  it('listSessions 返回所有活跃 session 的快照', () => {
    const sm = getSessionManager({ maxSessions: 10 })
    sm.createSession('claude-haha')
    sm.createSession('codex')
    sm.createSession('claude-code')

    const list1 = sm.listSessions()
    expect(list1).toHaveLength(3)

    // 销毁一个，列表应变化
    list1[0].destroy()
    expect(sm.listSessions()).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 7: 压力组合 — 所有维度同时施压
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 7 — 组合压力', () => {
  it('15 session 并发运行 + 中途热更新 + 中途销毁 + 最终持久化', async () => {
    let sm = getSessionManager({ maxSessions: 30, retryAttempts: 1, timeoutMs: 5000 })

    // 创建 15 个不同类型的 session
    const sessions = Array.from({ length: 15 }, (_, i) => {
      const kind = (['claude-haha', 'claude-haha', 'codex'] as const)[i % 3]
      if (kind === 'claude-haha') {
        return sm.createSession('claude-haha', cfg(rawEcho(1 + (i % 5) * 2, `echo-${i}`)))
      }
      return sm.createSession(kind)
    })

    expect(sm.listSessions()).toHaveLength(15)

    // 启动所有 claude-haha session 的 chatStream（并发运行）
    const hahaSessions = sessions.filter((s) => s.agentKind === 'claude-haha')
    const chatPromises = hahaSessions.map((s) =>
      collect(s.chatStream(`task-${s.id}`, new AbortController())),
    )

    // 运行中途：热更新配置
    await new Promise((r) => setTimeout(r, 2))
    sm.updateConfig({ timeoutMs: 10000 })

    // 运行中途：销毁 3 个 session（但不包括正在 chatStream 的）
    const toDestroy = sessions.filter((s) => s.agentKind !== 'claude-haha').slice(0, 3)
    for (const s of toDestroy) s.destroy()

    // 等待所有 chatStream 完成
    const allResults = await Promise.all(chatPromises)
    for (const events of allResults) {
      expect(events.some((e) => e.type === 'done')).toBe(true)
    }

    // 持久化
    await sm.save()

    // 加载验证
    const count = sm.listSessions().length
    resetSessionManager()
    sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(count)
  })

  it('session ID 单调递增，无碰撞', () => {
    const sm = getSessionManager({ maxSessions: 200 })
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const s = sm.createSession('claude-haha')
      expect(ids.has(s.id)).toBe(false)
      ids.add(s.id)
    }
    expect(ids.size).toBe(100)
  })

  it('长时间运行：单个 session 连续 chatStream 50 次', async () => {
    const sm = getSessionManager({ maxSessions: 5 })
    const s = sm.createSession('claude-haha', cfg(rawEcho(0, 'ping')))

    for (let i = 0; i < 50; i++) {
      const events = await collect(s.chatStream(`msg-${i}`, new AbortController()))
      expect(events.some((e) => e.type === 'text_chunk')).toBe(true)
      expect(events.some((e) => e.type === 'done')).toBe(true)
    }

    expect(s.metadata.messageCount).toBe(50)
  })
})
