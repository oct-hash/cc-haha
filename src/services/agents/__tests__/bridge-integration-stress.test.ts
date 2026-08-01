/**
 * Bridge Integration Stress Tests — 模拟 REPL.handlers.ts 中 bridgeAdapterStream()
 * 和 startBackgroundBridgeStream() 的真实 SessionManager 使用模式。
 *
 * 加压维度:
 *   1. bridgeAdapterStream 模式：找同 kind session → 复用 → chatStream → save
 *   2. startBackgroundBridgeStream 模式：创建 → fire-and-forget → destroy → save
 *   3. 多 kind session 共存 + 持久化往返
 *   4. 连续 chatStream 复用 session（metadata 累积）
 *   5. 高并发 bridge session 创建/销毁
 *   6. save() 完整性：创建→save→恢复→修改→save→恢复
 *   7. Session 生命周期竞争（destroy vs chatStream）
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getSessionManager, initSessionManager, resetSessionManager } from '../session-manager.js'
import type { AgentConfig, AgentKind } from '../types.js'

// ── Raw-event helpers（与 translateEvent 兼容）──────────────────────────

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

function quickExecutor(label = 'ok') {
  return async function* (_msg: string, _ctrl: AbortController) {
    yield rawStream(label)
  }
}

function toolCycleExecutor(toolId: string) {
  return async function* (_msg: string, _ctrl: AbortController) {
    yield rawStream('thinking...')
    yield rawAssistantToolUse(toolId, 'read', { path: '/tmp/test' })
    yield rawToolResult(toolId, 'file contents')
  }
}

function delayedExecutor(label: string, delayMs: number) {
  return async function* (_msg: string, ctrl: AbortController) {
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
    if (ctrl.signal.aborted) throw new Error('aborted')
    yield rawStream(label)
  }
}

function flakyExecutor(failLabel: string, okLabel: string) {
  let firstCall = true
  return async function* (_msg: string, _ctrl: AbortController) {
    if (firstCall) {
      firstCall = false
      throw new Error(failLabel)
    }
    yield rawStream(okLabel)
  }
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

function cfg(qe: AgentConfig['queryExecutor']): AgentConfig {
  return { queryExecutor: qe }
}

// ── Persistence path ─────────────────────────────────────────────────────

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

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  resetSessionManager()
  cleanupPersistence()
})
afterEach(() => {
  resetSessionManager()
  cleanupPersistence()
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 1: bridgeAdapterStream 模式 — 找同 kind session → 复用 → save
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 1 — bridgeAdapterStream 复用模式', () => {
  it('同 kind 复用：第二次调用找到已有 session 不创建新的', async () => {
    const sm = getSessionManager()
    const kind: AgentKind = 'claude-haha'

    // 第一次：没有同 kind session，创建
    const existing1 = sm.listSessions().find((s) => s.agentKind === kind)
    const h1 = existing1 ?? sm.createSession(kind, cfg(quickExecutor('first')))
    expect(sm.listSessions()).toHaveLength(1)
    await sm.save()

    // 第一次 chatStream
    const events1 = await collect(h1.chatStream('msg1', new AbortController()))
    expect(events1.some((e) => e.type === 'text_chunk' && e.content === 'first')).toBe(true)
    await sm.save()

    // 第二次：同 kind 已有 session，复用
    const existing2 = sm.listSessions().find((s) => s.agentKind === kind)
    const h2 = existing2 ?? sm.createSession(kind, cfg(quickExecutor('second')))
    expect(h2.id).toBe(h1.id) // 复用同一个 session
    expect(sm.listSessions()).toHaveLength(1) // 没创建新的

    const events2 = await collect(h2.chatStream('msg2', new AbortController()))
    expect(events2.some((e) => e.type === 'text_chunk' && e.content === 'first')).toBe(true)
    await sm.save()
  })

  it('不同 kind：创建新 session，旧的不销毁', async () => {
    const sm = getSessionManager()

    // 先创建 claude-haha
    const h1 = sm.createSession('claude-haha', cfg(quickExecutor('haha')))
    await sm.save()

    // 换成 codex — 不同 kind，创建新的
    const existing = sm.listSessions().find((s) => s.agentKind === 'codex')
    const h2 = existing ?? sm.createSession('codex')
    expect(h2.id).not.toBe(h1.id)
    expect(sm.listSessions()).toHaveLength(2) // 两个并存

    // h1 仍可用
    const e1 = await collect(h1.chatStream('go', new AbortController()))
    expect(e1.some((e) => e.type === 'text_chunk' && e.content === 'haha')).toBe(true)
  })

  it('复用 session 后 metadata 累积正确', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(toolCycleExecutor('tool_1')))

    // 3 轮 chatStream
    for (let i = 0; i < 3; i++) {
      await collect(h.chatStream(`msg-${i}`, new AbortController()))
    }

    expect(h.metadata.messageCount).toBe(3)
    // 每轮 1 个 tool_result → 1 个 tool_call_end
    expect(h.metadata.totalToolCalls).toBe(3)
  })

  it('复用 session 的 token 估算随对话累积', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(quickExecutor('hello world')))

    await collect(h.chatStream('q1', new AbortController()))
    const after1 = h.metadata.totalTokens
    expect(after1).toBeGreaterThan(0)

    await collect(h.chatStream('q2', new AbortController()))
    const after2 = h.metadata.totalTokens
    expect(after2).toBeGreaterThan(after1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 2: startBackgroundBridgeStream 模式 — 创建 → fire-and-forget → destroy → save
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 2 — startBackgroundBridgeStream 模式', () => {
  it('创建 → chatStream → destroy → save 完整流程', async () => {
    const sm = getSessionManager()
    const handle = sm.createSession('claude-haha', cfg(quickExecutor('bg-result')))
    await sm.save()
    expect(sm.listSessions()).toHaveLength(1)

    // Fire-and-forget: 在后台运行
    const bgResult = await collect(handle.chatStream('bg-task', new AbortController()))
    expect(bgResult.some((e) => e.type === 'text_chunk' && e.content === 'bg-result')).toBe(true)

    // 完成后 destroy + save
    handle.destroy()
    sm.save().catch(() => {})
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('后台 session 异常后 destroy 正常释放', async () => {
    const sm = getSessionManager()
    const handle = sm.createSession('claude-haha', {
      queryExecutor: async function* () {
        throw new Error('bg-crash')
      },
    })
    await sm.save()
    expect(sm.listSessions()).toHaveLength(1)

    // 运行（会失败）；chatStream 结束后 adapter 已 dispose，status 回到 idle
    const bgEvents = await collect(handle.chatStream('bg-task', new AbortController()))
    expect(bgEvents.some((e) => e.type === 'error' && e.message === 'bg-crash')).toBe(true)
    expect(handle.metadata.errorsEncountered).toBe(1)

    // finally 中 destroy
    handle.destroy()
    sm.save().catch(() => {})
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('多个后台 session 并发运行', async () => {
    const sm = getSessionManager({ maxSessions: 20 })

    // 创建 5 个后台 session
    const handles = Array.from({ length: 5 }, (_, i) =>
      sm.createSession('claude-haha', cfg(quickExecutor(`bg-${i}`))),
    )
    await sm.save()
    expect(sm.listSessions()).toHaveLength(5)

    // 并发运行
    const results = await Promise.all(
      handles.map((h) => collect(h.chatStream(`task-${h.id}`, new AbortController()))),
    )
    for (let i = 0; i < results.length; i++) {
      expect(results[i].some((e) => e.type === 'text_chunk' && e.content === `bg-${i}`)).toBe(true)
    }

    // 全部 destroy + save
    for (const h of handles) h.destroy()
    sm.save().catch(() => {})
    expect(sm.listSessions()).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 3: 多 kind session 共存 + 持久化往返
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 3 — 多 kind 共存 + 持久化', () => {
  it('3 种 kind 各创建 session → save → 恢复后各 kind 保持', async () => {
    const sm = getSessionManager({ maxSessions: 20 })
    sm.setActiveKind('codex')

    sm.createSession('claude-haha', cfg(quickExecutor('h')))
    sm.createSession('claude-code')
    sm.createSession('codex')
    await sm.save()

    // 恢复
    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.getActiveKind()).toBe('codex')
    expect(sm2.listSessions()).toHaveLength(3)

    const kinds = sm2
      .listSessions()
      .map((s) => s.agentKind)
      .sort()
    expect(kinds).toEqual(['claude-code', 'claude-haha', 'codex'])
  })

  it('恢复后 claude-haha session 可继续 chatStream', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha', cfg(quickExecutor('restored')))
    await sm.save()

    resetSessionManager()
    const sm2 = await initSessionManager()
    const sessions = sm2.listSessions()
    expect(sessions).toHaveLength(1)

    // queryExecutor 是函数无法序列化，恢复后需重新注入
    sm2.updateSessionConfig(sessions[0].id, cfg(quickExecutor('restored')))
    const events = await collect(sessions[0].chatStream('go', new AbortController()))
    expect(events.some((e) => e.type === 'text_chunk' && e.content === 'restored')).toBe(true)
  })

  it('持久化后修改 config 再恢复', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha')
    sm.updateSessionConfig(h.id, { cwd: '/custom/path' })
    await sm.save()

    resetSessionManager()
    const sm2 = await initSessionManager()
    const restored = sm2.listSessions()[0]
    expect(restored.metadata.agentKind).toBe('claude-haha')
  })

  it('保存 metadata（messageCount/toolCalls）→ 恢复 → metadata 保持', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(toolCycleExecutor('t99')))

    // 运行 2 轮
    await collect(h.chatStream('m1', new AbortController()))
    await collect(h.chatStream('m2', new AbortController()))
    await sm.save()

    const msgCount = h.metadata.messageCount
    const toolCalls = h.metadata.totalToolCalls
    expect(msgCount).toBe(2)
    expect(toolCalls).toBe(2)

    resetSessionManager()
    const sm2 = await initSessionManager()
    const restored = sm2.listSessions()[0]
    expect(restored.metadata.messageCount).toBe(msgCount)
    expect(restored.metadata.totalToolCalls).toBe(toolCalls)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 4: 连续 chatStream 复用 session（模拟用户连续对话）
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 4 — 连续对话 session 复用', () => {
  it('单 session 连续 20 轮对话，复用不创建新 session', async () => {
    const sm = getSessionManager()
    const kind: AgentKind = 'claude-haha'

    // 第一轮：创建
    let existing = sm.listSessions().find((s) => s.agentKind === kind)
    const h = existing ?? sm.createSession(kind, cfg(quickExecutor('reply')))
    await sm.save()

    // 后续 20 轮 chatStream：复用
    for (let i = 0; i < 20; i++) {
      existing = sm.listSessions().find((s) => s.agentKind === kind)
      expect(existing?.id).toBe(h.id)
      const handle = existing ?? sm.createSession(kind, cfg(quickExecutor('reply')))
      await collect(handle.chatStream(`msg-${i}`, new AbortController()))
      // 每 5 轮 save 一次（模拟自动持久化）
      if (i % 5 === 4) await sm.save()
    }

    expect(sm.listSessions()).toHaveLength(1)
    expect(h.metadata.messageCount).toBe(20)
  })

  it('连续对话中 agent kind 切换', async () => {
    const sm = getSessionManager()

    // 用 claude-haha 对话
    const h1 = sm.createSession('claude-haha', cfg(quickExecutor('haha-reply')))
    await collect(h1.chatStream('msg1', new AbortController()))
    await sm.save()

    // 切换到 codex
    sm.switchAgent(h1.id, 'codex')
    await sm.save()

    const h2 = sm.listSessions().find((s) => s.agentKind === 'codex')
    expect(h2).toBeDefined()

    // 再切回 claude-haha
    sm.switchAgent(h1.id, 'claude-haha')
    await sm.save()

    const h3 = sm.listSessions().find((s) => s.agentKind === 'claude-haha')
    expect(h3).toBeDefined()
    await collect(h3!.chatStream('msg2', new AbortController()))
  })

  it('连续对话中 save() 不丢失 session', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(quickExecutor('ok')))

    // 多次 save（模拟每次操作后自动保存）
    await collect(h.chatStream('q1', new AbortController()))
    await sm.save()
    await collect(h.chatStream('q2', new AbortController()))
    await sm.save()
    await collect(h.chatStream('q3', new AbortController()))
    await sm.save()

    expect(h.metadata.messageCount).toBe(3)

    // 恢复后验证
    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(1)
    expect(sm2.listSessions()[0].metadata.messageCount).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 5: 高并发 bridge session 创建/销毁
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 5 — 高并发创建/销毁', () => {
  it('快速交替创建销毁 50 个 bridge session', () => {
    const sm = getSessionManager({ maxSessions: 100 })
    const kind: AgentKind = 'claude-haha'

    for (let i = 0; i < 50; i++) {
      const h = sm.createSession(kind, cfg(quickExecutor(`ok-${i}`)))
      h.destroy()
    }
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('多 kind bridge session 交织创建销毁', () => {
    const sm = getSessionManager({ maxSessions: 30 })
    const kinds: AgentKind[] = ['claude-haha', 'claude-code', 'codex']

    for (let i = 0; i < 10; i++) {
      for (const k of kinds) {
        sm.createSession(k)
      }
    }
    expect(sm.listSessions()).toHaveLength(30)

    // 按 kind 分批销毁
    for (const k of kinds) {
      for (const s of sm.listSessions().filter((s) => s.agentKind === k)) {
        s.destroy()
      }
    }
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('并发 destroy 同一个 session 不崩溃（幂等）', () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha')
    h.destroy()
    expect(() => h.destroy()).not.toThrow()
    expect(() => h.destroy()).not.toThrow()
    expect(sm.listSessions()).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 6: save() 完整性 — 多轮修改持久化
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 6 — save() 完整性', () => {
  it('create → save → chatStream → save → 恢复 → 状态完全一致', async () => {
    const sm = getSessionManager()

    // Phase 1: create + save
    const h1 = sm.createSession('claude-haha', cfg(toolCycleExecutor('tool_x')))
    await sm.save()
    expect(sm.listSessions()).toHaveLength(1)

    // Phase 2: chatStream + save
    await collect(h1.chatStream('phase2', new AbortController()))
    await sm.save()

    const msgCount = h1.metadata.messageCount
    const toolCalls = h1.metadata.totalToolCalls

    // Phase 3: 恢复
    resetSessionManager()
    const sm2 = await initSessionManager()
    const restored = sm2.listSessions()
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe(h1.id)
    expect(restored[0].metadata.messageCount).toBe(msgCount)
    expect(restored[0].metadata.totalToolCalls).toBe(toolCalls)
  })

  it('save → destroy → save → 恢复 → 空列表', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha', cfg(quickExecutor('tmp')))
    sm.createSession('codex')
    await sm.save()
    expect(sm.listSessions()).toHaveLength(2)

    for (const s of sm.listSessions()) s.destroy()
    await sm.save()

    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(0)
  })

  it('save() 并发调用不损坏文件', async () => {
    const sm = getSessionManager({ maxSessions: 50 })

    // 创建后多次并发 save
    sm.createSession('claude-haha', cfg(quickExecutor('ok')))
    await Promise.all([sm.save(), sm.save(), sm.save()])

    // 恢复验证
    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(1)
  })

  it('空 session 列表 save/恢复', async () => {
    const sm = getSessionManager()
    sm.setActiveKind('claude-code')
    await sm.save()

    resetSessionManager()
    const sm2 = await initSessionManager()
    expect(sm2.listSessions()).toHaveLength(0)
    expect(sm2.getActiveKind()).toBe('claude-code')
  })

  it('损坏的 JSON 文件加载不崩溃', async () => {
    await fs.promises.mkdir(TEST_DIR, { recursive: true })
    await fs.promises.writeFile(TEST_FILE, '{corrupt json!!!')
    await fs.promises.writeFile(
      path.join(TEST_DIR, 'agent-sessions-truncated.json'),
      '{"activeKind": "claude-haha", "sess',
    )

    resetSessionManager()
    const sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(0) // 降级到空状态
    expect(sm.getActiveKind()).toBe('claude-haha') // defaultKind
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 7: Session 生命周期竞争
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 7 — 生命周期竞争', () => {
  it('chatStream 进行中 destroy，不崩溃', async () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha', cfg(delayedExecutor('slow', 200)))

    // 启动 chatStream（不 await）
    const streamPromise = collect(h.chatStream('go', new AbortController()))

    // 立即 destroy
    await new Promise((r) => setTimeout(r, 10))
    h.destroy()
    expect(sm.listSessions()).toHaveLength(0)

    // stream 应该安全结束
    await streamPromise
  })

  it('destroy 后立即 create 同 kind session', () => {
    const sm = getSessionManager()
    const kind: AgentKind = 'claude-haha'

    const h1 = sm.createSession(kind, cfg(quickExecutor('v1')))
    h1.destroy()

    const h2 = sm.createSession(kind, cfg(quickExecutor('v2')))
    expect(h2.id).not.toBe(h1.id)
    expect(sm.listSessions()).toHaveLength(1)
  })

  it('session 被 destroy 后拿不到（getSession 返回 undefined）', () => {
    const sm = getSessionManager()
    const h = sm.createSession('claude-haha')
    h.destroy()
    expect(sm.getSession(h.id)).toBeUndefined()
  })

  it('listSessions 返回的是实时快照', () => {
    const sm = getSessionManager({ maxSessions: 10 })

    sm.createSession('claude-haha')
    sm.createSession('claude-code')
    const snapshot1 = sm.listSessions()
    expect(snapshot1).toHaveLength(2)

    // 销毁后重新获取
    snapshot1[0].destroy()
    const snapshot2 = sm.listSessions()
    expect(snapshot2).toHaveLength(1)
    expect(snapshot2[0].id).toBe(snapshot1[1].id)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 维度 8: 真实场景混合压力
// ═══════════════════════════════════════════════════════════════════════════

describe('维度 8 — 真实混合场景', () => {
  it('模拟用户切换 agent 三次 + 各对话两轮 + 持久化完整', async () => {
    let sm = getSessionManager()

    // 用户启动：用 claude-haha 对话
    const h1 = sm.createSession('claude-haha', cfg(quickExecutor('haha-1')))
    await collect(h1.chatStream('hello', new AbortController()))
    await collect(h1.chatStream('again', new AbortController()))
    await sm.save()

    // 用户 Ctrl+B 切换到 codex 做后台查询
    const bg1 = sm.createSession('codex')
    const bg1Events = await collect(bg1.chatStream('bg-task', new AbortController()))
    // codex 无 queryExecutor，可能返回 error
    if (bg1Events.some((e) => e.type === 'done')) {
      // 正常完成
    }
    bg1.destroy()
    sm.save().catch(() => {})

    // 用户切换到 claude-code（bridgeAdapterStream 模式）
    const existing = sm.listSessions().find((s) => s.agentKind === 'claude-code')
    const h2 = existing ?? sm.createSession('claude-code')
    await sm.save()

    // 验证持久化
    const sessionCount = sm.listSessions().length
    resetSessionManager()
    sm = await initSessionManager()
    expect(sm.listSessions()).toHaveLength(sessionCount)
  })

  it('同一 kind 多次 create/destroy（模拟频繁切换 agent）', () => {
    const sm = getSessionManager()

    for (let cycle = 0; cycle < 10; cycle++) {
      const h = sm.createSession('claude-haha', cfg(quickExecutor(`cycle-${cycle}`)))
      expect(sm.listSessions()).toHaveLength(1)
      h.destroy()
      expect(sm.listSessions()).toHaveLength(0)
    }
  })

  it('bridge 级别并发：5 个 claude-haha + 3 个 codex 同时运行', async () => {
    const sm = getSessionManager({ maxSessions: 30 })

    // 5 个 haha session（可 chatStream）
    const hahaSessions = Array.from({ length: 5 }, (_, i) =>
      sm.createSession('claude-haha', cfg(quickExecutor(`ha-${i}`))),
    )

    // 3 个 codex session（无 queryExecutor，chatStream 会报 error）
    const codexSessions = Array.from({ length: 3 }, () => sm.createSession('codex'))

    expect(sm.listSessions()).toHaveLength(8)

    // haha sessions 并行 chatStream
    const hahaResults = await Promise.all(
      hahaSessions.map((h) => collect(h.chatStream('go', new AbortController()))),
    )
    for (let i = 0; i < hahaResults.length; i++) {
      expect(hahaResults[i].some((e) => e.type === 'text_chunk' && e.content === `ha-${i}`)).toBe(
        true,
      )
    }

    // 全销毁
    for (const h of [...hahaSessions, ...codexSessions]) h.destroy()
    expect(sm.listSessions()).toHaveLength(0)
  })

  it('长时间运行：200 轮 create → chatStream → destroy 不泄漏', async () => {
    const sm = getSessionManager({ maxSessions: 5 })

    for (let i = 0; i < 200; i++) {
      const h = sm.createSession('claude-haha', cfg(quickExecutor('ping')))
      await collect(h.chatStream(`msg-${i}`, new AbortController()))
      h.destroy()
    }

    expect(sm.listSessions()).toHaveLength(0)
  })
})
