import { describe, expect, it } from 'bun:test'

describe('REPL module imports', () => {
  it('imports REPL.types without error', async () => {
    const mod = await import('../REPL.types.js')
    expect(mod).toBeDefined()
  })

  it('imports REPL.utils without error', async () => {
    const mod = await import('../REPL.utils.js')
    expect(mod).toBeDefined()
    expect(typeof mod.median).toBe('function')
    expect(Array.isArray(mod.EMPTY_MCP_CLIENTS)).toBe(true)
  })

  it('REPL.utils EMPTY_MCP_CLIENTS is the same reference in every import', async () => {
    const a = await import('../REPL.utils.js')
    const b = await import('../REPL.utils.js')
    expect(a.EMPTY_MCP_CLIENTS).toBe(b.EMPTY_MCP_CLIENTS)
  })

  it('REPL.utils HISTORY_STUB is the same reference in every import', async () => {
    const a = await import('../REPL.utils.js')
    const b = await import('../REPL.utils.js')
    expect(a.HISTORY_STUB).toBe(b.HISTORY_STUB)
  })
})

describe('useNotificationLayer', () => {
  it('imports without error', async () => {
    const mod = await import('../../hooks/useNotificationLayer.js')
    expect(mod).toBeDefined()
    expect(typeof mod.useNotificationLayer).toBe('function')
  })
})
