import { describe, expect, it } from 'bun:test'
import { createCombinedAbortSignal } from '../combinedAbortSignal'

describe('createCombinedAbortSignal', () => {
  it('returns a signal and cleanup function', () => {
    const { signal, cleanup } = createCombinedAbortSignal(undefined)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(typeof cleanup).toBe('function')
  })

  it('aborts immediately if the primary signal is already aborted', () => {
    const controller = new AbortController()
    controller.abort()
    const { signal } = createCombinedAbortSignal(controller.signal)
    expect(signal.aborted).toBe(true)
  })

  it('aborts immediately if signalB is already aborted', () => {
    const ctrlB = new AbortController()
    ctrlB.abort()
    const { signal } = createCombinedAbortSignal(undefined, { signalB: ctrlB.signal })
    expect(signal.aborted).toBe(true)
  })

  it('aborts when the primary signal fires', () => {
    const controller = new AbortController()
    const { signal, cleanup } = createCombinedAbortSignal(controller.signal)
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it('aborts when signalB fires', () => {
    const ctrlB = new AbortController()
    const { signal, cleanup } = createCombinedAbortSignal(undefined, { signalB: ctrlB.signal })
    expect(signal.aborted).toBe(false)
    ctrlB.abort()
    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it('aborts after timeoutMs elapses', async () => {
    const { signal, cleanup } = createCombinedAbortSignal(undefined, { timeoutMs: 5 })
    expect(signal.aborted).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it('does not abort if timeoutMs is not provided', async () => {
    const { signal, cleanup } = createCombinedAbortSignal(undefined)
    await new Promise((r) => setTimeout(r, 20))
    expect(signal.aborted).toBe(false)
    cleanup()
  })

  it('cleanup removes event listeners so subsequent aborts do not fire', () => {
    const controller = new AbortController()
    const ctrlB = new AbortController()
    const { signal, cleanup } = createCombinedAbortSignal(controller.signal, {
      signalB: ctrlB.signal,
    })
    cleanup()
    // After cleanup, aborting should not propagate
    controller.abort()
    ctrlB.abort()
    expect(signal.aborted).toBe(false)
  })

  it('cleanup clears timeout so it does not fire', async () => {
    const { signal, cleanup } = createCombinedAbortSignal(undefined, { timeoutMs: 100 })
    cleanup()
    await new Promise((r) => setTimeout(r, 30))
    expect(signal.aborted).toBe(false)
  })
})
