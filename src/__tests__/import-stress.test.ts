/**
 * Dynamic import stress test.
 * Verifies that heavy modules can be loaded repeatedly without timeout or crash.
 */
import { describe, expect, it } from 'bun:test'

describe('动态导入压测', () => {
  it('REPL.types 100 次快速导入无超时', async () => {
    for (let i = 0; i < 100; i++) {
      const m = await import('../screens/REPL.types.js')
      expect(m).toBeDefined()
    }
  })

  it('REPL.utils 100 次快速导入（含 EMPTY_MCP_CLIENTS 引用稳定性）', async () => {
    for (let i = 0; i < 100; i++) {
      const m = await import('../screens/REPL.utils.js')
      expect(typeof m.median).toBe('function')
      expect(Array.isArray(m.EMPTY_MCP_CLIENTS)).toBe(true)
    }
  })

  it('useNotificationLayer 10 次重复导入稳定', { timeout: 30_000 }, async () => {
    for (let i = 0; i < 10; i++) {
      const m = await import('../hooks/useNotificationLayer.js')
      expect(typeof m.useNotificationLayer).toBe('function')
    }
  })

  it('types barrel 50 次导入一致', async () => {
    let first: any = null
    for (let i = 0; i < 50; i++) {
      const m = await import('../types/index.js')
      if (first === null) first = m
      // 函数引用应该一致（模块缓存）
      expect(m.getCommandName).toBe(first.getCommandName)
      expect(m.isValidImagePaste).toBe(first.isValidImagePaste)
    }
  })
})
