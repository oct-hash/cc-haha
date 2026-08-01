import { describe, expect, it } from 'bun:test'
import { withResolvers } from '../withResolvers'

describe('withResolvers', () => {
  it('returns an object with promise, resolve, and reject', () => {
    const result = withResolvers<string>()
    expect(result).toHaveProperty('promise')
    expect(result).toHaveProperty('resolve')
    expect(result).toHaveProperty('reject')
    expect(result.promise).toBeInstanceOf(Promise)
    expect(typeof result.resolve).toBe('function')
    expect(typeof result.reject).toBe('function')
  })

  it('resolves the promise with the given value', async () => {
    const { promise, resolve } = withResolvers<number>()
    resolve(42)
    await expect(promise).resolves.toBe(42)
  })

  it('rejects the promise with the given reason', async () => {
    const { promise, reject } = withResolvers<string>()
    reject(new Error('test error'))
    await expect(promise).rejects.toThrow('test error')
  })

  it('handles different types', async () => {
    const { promise, resolve } = withResolvers<{ name: string }>()
    resolve({ name: 'claude' })
    await expect(promise).resolves.toEqual({ name: 'claude' })
  })

  it('resolve with PromiseLike works', async () => {
    const { promise, resolve } = withResolvers<number>()
    resolve(Promise.resolve(7))
    await expect(promise).resolves.toBe(7)
  })
})
