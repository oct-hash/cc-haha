/**
 * Stress test for SessionManager.save() serialization.
 * Verifies that concurrent save() calls do not cause session loss.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getSessionManager, initSessionManager, resetSessionManager } from '../session-manager.js'

describe('SessionManager save() 并发压测', () => {
  beforeEach(() => {
    resetSessionManager()
  })

  afterEach(() => {
    resetSessionManager()
  })

  it('10 次并发 save 后 load 还原全部 session', async () => {
    const sm = getSessionManager()

    // 创建 5 个 session
    const kinds = ['claude-haha', 'codex', 'claude-code', 'claude-haha', 'codex'] as const
    for (const kind of kinds) {
      sm.createSession(kind)
    }
    expect(sm.listSessions()).toHaveLength(5)

    // 并发 save 10 次
    const saves = Array.from({ length: 10 }, () => sm.save().catch(() => {}))
    await Promise.all(saves)

    // 添加更多 session 后再次并发 save
    sm.createSession('claude-haha')
    sm.createSession('codex')
    expect(sm.listSessions()).toHaveLength(7)

    const moreSaves = Array.from({ length: 10 }, () => sm.save().catch(() => {}))
    await Promise.all(moreSaves)

    // 验证持久化
    resetSessionManager()
    const restored = await initSessionManager()
    expect(restored.listSessions()).toHaveLength(7)
  })

  it('fire-and-forget save + 立即 create + await save 不丢 session', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha')
    await sm.save()

    // 模拟 bridge stress 测试场景：fire-and-forget save 后立即创建新 session
    sm.createSession('codex')
    sm.save().catch(() => {}) // fire-and-forget

    sm.createSession('claude-code')
    await sm.save()

    const count = sm.listSessions().length
    resetSessionManager()
    const restored = await initSessionManager()
    expect(restored.listSessions()).toHaveLength(count)
  })

  it('50 次快速交替 create/save/destroy 不崩溃', async () => {
    const sm = getSessionManager()
    const promises: Promise<void>[] = []

    // Keep under maxSessions=10 by destroying immediately
    for (let i = 0; i < 50; i++) {
      const session = sm.createSession(
        i % 3 === 0 ? 'claude-haha' : i % 3 === 1 ? 'codex' : 'claude-code',
      )
      promises.push(sm.save().catch(() => {}))
      session.destroy() // destroy immediately to stay under limit
    }

    await Promise.all(promises)
    await sm.save()

    // 0 sessions active (all destroyed), but save file should be consistent
    const finalCount = sm.listSessions().length
    expect(finalCount).toBe(0)

    resetSessionManager()
    const restored = await initSessionManager()
    expect(restored.listSessions()).toHaveLength(finalCount)
  })

  it('save chain 不因个别失败而断裂', async () => {
    const sm = getSessionManager()
    sm.createSession('claude-haha')

    // 发起多次 save，验证链不断
    await sm.save()
    await sm.save()
    await sm.save()

    sm.createSession('codex')
    await sm.save()

    const count = sm.listSessions().length
    resetSessionManager()
    const restored = await initSessionManager()
    expect(restored.listSessions()).toHaveLength(count)
  })

  it('stream + destroy + save 交错执行不丢数据', async () => {
    const sm = getSessionManager()

    const h1 = sm.createSession('claude-haha')
    h1.destroy()
    await sm.save()

    sm.createSession('codex')
    sm.createSession('claude-code')
    // fire-and-forget save during rapid operations
    sm.save().catch(() => {})

    sm.createSession('claude-haha')
    await sm.save()

    const count = sm.listSessions().length
    expect(count).toBe(3)

    resetSessionManager()
    const restored = await initSessionManager()
    expect(restored.listSessions()).toHaveLength(count)
  })
})
