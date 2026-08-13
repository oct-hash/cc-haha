import { describe, expect, it } from 'bun:test'
import { createSignal } from '../signal'

describe('createSignal', () => {
  it('creates signal with subscribe/emit/clear', () => {
    const signal = createSignal()
    expect(typeof signal.subscribe).toBe('function')
    expect(typeof signal.emit).toBe('function')
    expect(typeof signal.clear).toBe('function')
  })

  it('emit calls all subscribers', () => {
    const signal = createSignal<[string]>()
    const received: string[] = []
    signal.subscribe((msg) => received.push(msg))
    signal.subscribe((msg) => received.push(`2:${msg}`))
    signal.emit('hello')
    expect(received).toEqual(['hello', '2:hello'])
  })

  it('emit with multiple args passes them through', () => {
    const signal = createSignal<[string, number]>()
    let result: [string, number] | null = null
    signal.subscribe((a, b) => {
      result = [a, b]
    })
    signal.emit('count', 42)
    expect(result).toEqual(['count', 42])
  })

  it('subscribe returns unsubscribe function', () => {
    const signal = createSignal()
    const calls: number[] = []
    const unsub = signal.subscribe(() => calls.push(1))
    signal.emit()
    expect(calls).toHaveLength(1)
    unsub()
    signal.emit()
    expect(calls).toHaveLength(1) // not called again
  })

  it('clear removes all listeners', () => {
    const signal = createSignal()
    let count = 0
    signal.subscribe(() => count++)
    signal.subscribe(() => count++)
    signal.clear()
    signal.emit()
    expect(count).toBe(0)
  })

  it('multiple subscribers independently unsubscribe', () => {
    const signal = createSignal()
    const calls: string[] = []
    const unsub1 = signal.subscribe(() => calls.push('a'))
    const unsub2 = signal.subscribe(() => calls.push('b'))
    unsub1()
    signal.emit()
    expect(calls).toEqual(['b'])
    unsub2()
    signal.emit()
    expect(calls).toEqual(['b']) // no new calls
  })

  it('handles empty emit (no args)', () => {
    const signal = createSignal()
    let called = false
    signal.subscribe(() => {
      called = true
    })
    signal.emit()
    expect(called).toBe(true)
  })

  it('handles subscriber that throws', () => {
    const signal = createSignal()
    let secondCalled = false
    signal.subscribe(() => {
      throw new Error('boom')
    })
    signal.subscribe(() => {
      secondCalled = true
    })
    expect(() => signal.emit()).toThrow('boom')
    expect(secondCalled).toBe(false) // first throws before second runs
  })
})
