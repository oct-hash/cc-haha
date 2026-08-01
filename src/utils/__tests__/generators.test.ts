import { describe, expect, it } from 'bun:test'
import { all, fromArray, lastX, returnValue, toArray } from '../generators'

async function* range(n: number): AsyncGenerator<number, void> {
  for (let i = 0; i < n; i++) yield i
}

describe('lastX', () => {
  it('returns the last value from a generator', async () => {
    expect(await lastX(fromArray([1, 2, 3]))).toBe(3)
  })

  it('throws on empty generator', async () => {
    await expect(lastX(fromArray([]))).rejects.toThrow('No items in generator')
  })

  it('returns the only value for single-item generator', async () => {
    expect(await lastX(fromArray([42]))).toBe(42)
  })
})

describe('returnValue', () => {
  it('captures the return value of a completed async generator', async () => {
    async function* gen() {
      yield 1
      yield 2
      return 'done'
    }
    expect(await returnValue(gen())).toBe('done')
  })

  it('returns undefined if generator has no explicit return', async () => {
    expect(await returnValue(range(3))).toBeUndefined()
  })
})

describe('toArray', () => {
  it('collects all values into an array', async () => {
    expect(await toArray(fromArray([10, 20, 30]))).toEqual([10, 20, 30])
  })

  it('returns empty array for empty generator', async () => {
    expect(await toArray(fromArray([]))).toEqual([])
  })
})

describe('fromArray', () => {
  it('yields array elements in order', async () => {
    expect(await toArray(fromArray(['a', 'b', 'c']))).toEqual(['a', 'b', 'c'])
  })

  it('yields nothing from empty array', async () => {
    expect(await toArray(fromArray([]))).toEqual([])
  })
})

describe('all', () => {
  it('interleaves values from multiple generators', async () => {
    const results = await toArray(all([range(3), range(3)]))
    expect(results.sort((a, b) => a - b)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('respects concurrency cap of 1 (sequential)', async () => {
    // With concurrency 1, execution is sequential
    const results = await toArray(all([range(3), range(3)], 1))
    expect(results.sort((a, b) => a - b)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('returns empty for no generators', async () => {
    expect(await toArray(all([]))).toEqual([])
  })
})
