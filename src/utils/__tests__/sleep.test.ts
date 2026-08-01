import { describe, expect, it } from 'bun:test'
import { sleep, withTimeout } from '../sleep'

describe('sleep', () => {
  it('resolves after the given milliseconds', async () => {
    const start = Date.now()
    await sleep(30)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it('resolves immediately when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const start = Date.now()
    await sleep(100, controller.signal)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(50)
  })

  it('resolves early when signal aborts during sleep', async () => {
    const controller = new AbortController()
    const promise = sleep(100, controller.signal)
    setTimeout(() => controller.abort(), 10)
    const start = Date.now()
    await promise
    expect(Date.now() - start).toBeLessThan(50)
  })

  it('rejects when throwOnAbort is true and signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sleep(100, controller.signal, { throwOnAbort: true })).rejects.toThrow('aborted')
  })

  it('rejects with custom error when abortError is provided', async () => {
    class CustomError extends Error {
      constructor() {
        super('custom abort')
      }
    }
    const controller = new AbortController()
    controller.abort()
    await expect(
      sleep(100, controller.signal, { abortError: () => new CustomError() }),
    ).rejects.toThrow('custom abort')
  })

  it('rejects when throwOnAbort and signal fires during sleep', async () => {
    const controller = new AbortController()
    const promise = sleep(100, controller.signal, { throwOnAbort: true })
    setTimeout(() => controller.abort(), 10)
    await expect(promise).rejects.toThrow('aborted')
  })

  it('does not abort when signal is not provided', async () => {
    await sleep(10)
  })
})

describe('withTimeout', () => {
  it('resolves with the promise value if it settles before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 100, 'too slow')
    expect(result).toBe(42)
  })

  it('rejects if the promise does not settle before timeout', async () => {
    let cleanup: () => void
    const slow = new Promise<unknown>((resolve) => {
      const timer = setTimeout(resolve, 5000)
      cleanup = () => clearTimeout(timer)
    })
    await expect(withTimeout(slow, 10, 'timed out')).rejects.toThrow('timed out')
    cleanup!()
  })

  it('rejects with the original error if promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('original error'))
    await expect(withTimeout(failing, 100, 'timeout')).rejects.toThrow('original error')
  })

  it('clears the timeout when promise resolves', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 100, 'timeout')
    expect(result).toBe('ok')
  })
})
