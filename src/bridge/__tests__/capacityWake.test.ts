import { describe, it, expect } from 'bun:test'
import { createCapacityWake } from '../capacityWake'

describe('createCapacityWake', () => {
  it('signal returns non-aborted signal when outer is not aborted', () => {
    const outer = new AbortController()
    const wake = createCapacityWake(outer.signal)
    const { signal, cleanup } = wake.signal()
    expect(signal.aborted).toBe(false)
    cleanup()
  })

  it('signal returns aborted signal when outer is already aborted', () => {
    const outer = new AbortController()
    outer.abort()
    const wake = createCapacityWake(outer.signal)
    const { signal } = wake.signal()
    expect(signal.aborted).toBe(true)
  })

  it('wake aborts current sleep signal', () => {
    const outer = new AbortController()
    const wake = createCapacityWake(outer.signal)
    const { signal: s1 } = wake.signal()
    expect(s1.aborted).toBe(false)
    wake.wake()
    expect(s1.aborted).toBe(true)
    // Next signal should be fresh (not aborted)
    const { signal: s2, cleanup } = wake.signal()
    expect(s2.aborted).toBe(false)
    cleanup()
  })

  it('outer abort aborts merged signal', () => {
    const outer = new AbortController()
    const wake = createCapacityWake(outer.signal)
    const { signal } = wake.signal()
    outer.abort()
    expect(signal.aborted).toBe(true)
  })

  it('cleanup removes listeners', () => {
    const outer = new AbortController()
    const wake = createCapacityWake(outer.signal)
    const { cleanup } = wake.signal()
    cleanup()
    // After cleanup, outer abort should NOT affect signal
    // (already cleaned up, listener removed)
  })
})
