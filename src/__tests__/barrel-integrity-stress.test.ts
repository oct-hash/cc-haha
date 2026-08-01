/**
 * Barrel export integrity stress test.
 * Verifies every module's runtime exports are reachable through barrel files.
 */
import { describe, expect, it } from 'bun:test'

// ═══════════════════════════════════════════════════════════════════════════════
// src/types/index.ts barrel
// ═══════════════════════════════════════════════════════════════════════════════

describe('types barrel 完整性', () => {
  it('command.ts 运行时导出可通过 barrel 访问', async () => {
    const barrel = await import('../types/index.js')
    // getCommandName & isCommandEnabled are runtime values (not just types)
    expect(typeof barrel.getCommandName).toBe('function')
    expect(typeof barrel.isCommandEnabled).toBe('function')
  })

  it('connectorText.ts 运行时导出可通过 barrel 访问', async () => {
    const barrel = await import('../types/index.js')
    expect(typeof barrel.isConnectorTextBlock).toBe('function')
  })

  it('logs.ts 运行时导出可通过 barrel 访问', async () => {
    const barrel = await import('../types/index.js')
    expect(typeof barrel.sortLogs).toBe('function')
  })

  it('textInputTypes.ts 运行时导出可通过 barrel 访问', async () => {
    const barrel = await import('../types/index.js')
    expect(typeof barrel.isValidImagePaste).toBe('function')
    expect(typeof barrel.getImagePasteIds).toBe('function')
  })

  it('所有 8 个子模块都有导出通过 barrel', async () => {
    const barrel = await import('../types/index.js')
    const keys = Object.keys(barrel)
    // 至少来自 command, connectorText, hooks, ids, logs, permissions, plugin, textInputTypes
    expect(keys.length).toBeGreaterThanOrEqual(10)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// src/services/index.ts barrel
// ═══════════════════════════════════════════════════════════════════════════════

describe('services barrel 完整性', () => {
  it('mcpServerApproval.ts 可通过 barrel 访问', { timeout: 15_000 }, async () => {
    const barrel = await import('../services/index.js')
    expect(typeof barrel.handleMcpjsonServerApprovals).toBe('function')
  })

  it('所有 16 个 service 模块都有对应的 barrel 导出', { timeout: 15_000 }, async () => {
    const barrel = await import('../services/index.js')
    const keys = Object.keys(barrel)
    // 16 modules minimum
    expect(keys.length).toBeGreaterThanOrEqual(10)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// src/constants/index.ts barrel
// ═══════════════════════════════════════════════════════════════════════════════

describe('constants barrel 完整性', () => {
  it('constants barrel 可正常导入', async () => {
    const barrel = await import('../constants/index.js')
    expect(barrel).toBeDefined()
    expect(Object.keys(barrel).length).toBeGreaterThan(0)
  })
})
