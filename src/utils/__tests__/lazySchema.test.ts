import { describe, expect, it, mock } from 'bun:test'
import { lazySchema } from '../lazySchema'

describe('lazySchema', () => {
  it('returns factory result on first call', () => {
    const getValue = lazySchema(() => 42)
    expect(getValue()).toBe(42)
  })

  it('caches the value and does not call factory again', () => {
    const factory = mock(() => ({ data: 'expensive' }))
    const getValue = lazySchema(factory)

    const a = getValue()
    const b = getValue()

    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('handles null return from factory', () => {
    const getValue = lazySchema(() => null)
    expect(getValue()).toBeNull()
  })

  it('handles undefined return from factory', () => {
    const getValue = lazySchema(() => undefined)
    expect(getValue()).toBeUndefined()
  })

  it('returns same reference for object values', () => {
    const obj = { key: 'value' }
    const getValue = lazySchema(() => obj)
    expect(getValue()).toBe(obj)
  })
})
