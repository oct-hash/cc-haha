import { describe, expect, it } from 'bun:test'
import { Stream } from '../stream'

describe('Stream', () => {
  it('yields enqueued values via async iteration', async () => {
    const stream = new Stream<number>()
    stream.enqueue(1)
    stream.enqueue(2)
    stream.done()

    const result = await stream.next()
    expect(result.done).toBe(false)
    expect(result.value).toBe(1)

    const result2 = await stream.next()
    expect(result2.done).toBe(false)
    expect(result2.value).toBe(2)

    const result3 = await stream.next()
    expect(result3.done).toBe(true)
  })

  it('enqueues values before iteration starts', async () => {
    const stream = new Stream<string>()
    stream.enqueue('a')
    stream.enqueue('b')
    stream.enqueue('c')
    stream.done()

    const values: string[] = []
    for await (const val of stream) {
      values.push(val)
    }
    expect(values).toEqual(['a', 'b', 'c'])
  })

  it('supports enqueue after next() is called (push pattern)', async () => {
    const stream = new Stream<number>()
    const nextPromise = stream.next()
    stream.enqueue(42)
    const result = await nextPromise
    expect(result.done).toBe(false)
    expect(result.value).toBe(42)
  })

  it('done() resolves pending next()', async () => {
    const stream = new Stream<number>()
    const nextPromise = stream.next()
    stream.done()
    const result = await nextPromise
    expect(result.done).toBe(true)
  })

  it('error() rejects pending next()', async () => {
    const stream = new Stream<number>()
    const nextPromise = stream.next()
    stream.error(new Error('boom'))
    await expect(nextPromise).rejects.toThrow('boom')
  })

  it('error() causes subsequent next() to reject', async () => {
    const stream = new Stream<number>()
    stream.error(new Error('failed'))
    await expect(stream.next()).rejects.toThrow('failed')
  })

  it('done() causes subsequent next() to resolve done', async () => {
    const stream = new Stream<number>()
    stream.done()
    const result = await stream.next()
    expect(result.done).toBe(true)
  })

  it('throws when iterated more than once', () => {
    const stream = new Stream<number>()
    stream.done()
    // First iteration starts
    const _it = stream[Symbol.asyncIterator]()
    // Second iteration should throw
    expect(() => stream[Symbol.asyncIterator]()).toThrow('Stream can only be iterated once')
  })

  it('calls returned callback on return()', async () => {
    let called = false
    const stream = new Stream<number>(() => {
      called = true
    })
    await stream.return()
    expect(called).toBe(true)
  })

  it('serves queued values before resolving pending next', async () => {
    const stream = new Stream<number>()
    stream.enqueue(1)
    stream.enqueue(2)

    // First next gets the queued value
    const r1 = await stream.next()
    expect(r1.value).toBe(1)

    // Second next also gets from queue
    const r2 = await stream.next()
    expect(r2.value).toBe(2)

    // Third next is pending
    const r3Promise = stream.next()
    stream.enqueue(3)
    const r3 = await r3Promise
    expect(r3.value).toBe(3)
  })

  it('returns empty stream via for-await', async () => {
    const stream = new Stream<number>()
    stream.done()
    const values: number[] = []
    for await (const val of stream) {
      values.push(val)
    }
    expect(values).toEqual([])
  })
})
