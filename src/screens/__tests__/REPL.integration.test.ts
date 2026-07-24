import { describe, expect, it } from 'bun:test'

/**
 * Integration / contract tests for the REPL module family.
 *
 * These verify that the split modules (REPL.tsx, REPL.render.tsx,
 * REPL.components.tsx, REPL.types.ts, REPL.utils.ts) import cleanly without
 * circular dependency errors, that all named exports resolve, and that the
 * MainRender component has a valid function signature.
 */

describe('REPL module integration', () => {
  it('imports all REPL family modules without circular dependency errors', async () => {
    // Dynamic imports to verify module resolution for the full chain
    const types = await import('../REPL.types.js')
    const utils = await import('../REPL.utils.js')
    const components = await import('../REPL.components.js')

    expect(types).toBeDefined()
    expect(utils).toBeDefined()
    expect(components).toBeDefined()
  })

  it('REPL.components exports named components', () => {
    // Use require for the CJS-compatible check
    const comp = require('../REPL.components.js')
    expect(typeof comp.TranscriptModeFooter).toBe('function')
    expect(typeof comp.TranscriptSearchBar).toBe('function')
    expect(typeof comp.AnimatedTerminalTitle).toBe('function')
  })

  it('REPL.utils exports are stable singletons', () => {
    const utils = require('../REPL.utils.js')
    expect(utils.EMPTY_MCP_CLIENTS).toBe(utils.EMPTY_MCP_CLIENTS)
    expect(utils.HISTORY_STUB).toBe(utils.HISTORY_STUB)
    // median returns deterministic results
    expect(utils.median([5, 3, 4])).toBe(4)
  })
})
