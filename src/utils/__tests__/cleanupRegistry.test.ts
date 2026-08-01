import { describe, expect, it } from 'bun:test'
import { registerCleanup, runCleanupFunctions } from '../cleanupRegistry'

describe('cleanupRegistry', () => {
  it('registerCleanup returns an unregister function', () => {
    const unregister = registerCleanup(async () => {})
    expect(typeof unregister).toBe('function')
  })

  it('runs registered cleanup functions', async () => {
    const calls: string[] = []

    registerCleanup(async () => {
      calls.push('first')
    })
    registerCleanup(async () => {
      calls.push('second')
    })

    await runCleanupFunctions()

    expect(calls).toContain('first')
    expect(calls).toContain('second')
  })

  it('unregister prevents function from running', async () => {
    const calls: string[] = []

    const unregister = registerCleanup(async () => {
      calls.push('should-run')
    })
    const unregisterSecond = registerCleanup(async () => {
      calls.push('should-not-run')
    })
    unregisterSecond()

    await runCleanupFunctions()

    expect(calls).toEqual(['should-run'])

    // Clean up the first one too
    unregister()
  })

  it('handles empty registry gracefully', async () => {
    // After all other tests have run cleanup, registry should be partially
    // populated from previous registrations. runCleanupFunctions drains them.
    // This should never throw.
    await expect(runCleanupFunctions()).resolves.toBeUndefined()
  })
})
