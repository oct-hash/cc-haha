import { describe, expect, it } from 'bun:test'
import { sequential } from '../sequential'

describe('sequential', () => {
  it('passes through function results', async () => {
    const fn = sequential(async (x: number) => x * 2)
    const result = await fn(21)
    expect(result).toBe(42)
  })

  it('executes calls sequentially', async () => {
    const order: number[] = []
    const fn = sequential(async (id: number) => {
      order.push(id)
      await new Promise((r) => setTimeout(r, 10))
      return id
    })

    const results = await Promise.all([fn(1), fn(2), fn(3)])
    expect(order).toEqual([1, 2, 3])
    expect(results).toEqual([1, 2, 3])
  })

  it('handles errors without breaking queue', async () => {
    const fn = sequential(async (x: number) => {
      if (x < 0) throw new Error('negative')
      return x
    })

    let error: Error | null = null
    try {
      await fn(-1)
    } catch (e) {
      error = e as Error
    }

    expect(error).toBeTruthy()
    expect(error!.message).toBe('negative')

    // Subsequent call should still work
    const result = await fn(42)
    expect(result).toBe(42)
  })

  it('can be called with multiple arguments', async () => {
    const fn = sequential(async (a: number, b: number) => a + b)
    const result = await fn(1, 2)
    expect(result).toBe(3)
  })
})
