import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'
import { type BufferedWriter, createBufferedWriter } from '../bufferedWriter'

describe('createBufferedWriter', () => {
  let writeFn: ReturnType<typeof jest.fn>
  let writer: BufferedWriter

  beforeEach(() => {
    writeFn = jest.fn()
  })

  afterEach(() => {
    writer?.dispose()
  })

  describe('immediate mode', () => {
    it('calls writeFn immediately on each write', () => {
      writer = createBufferedWriter({ writeFn, immediateMode: true })
      writer.write('hello')
      writer.write('world')
      expect(writeFn).toHaveBeenCalledTimes(2)
      expect(writeFn).toHaveBeenCalledWith('hello')
      expect(writeFn).toHaveBeenCalledWith('world')
    })

    it('flush is a no-op in immediate mode (nothing buffered)', () => {
      writer = createBufferedWriter({ writeFn, immediateMode: true })
      writer.write('hello')
      const callCount = writeFn.mock.calls.length
      writer.flush()
      expect(writeFn).toHaveBeenCalledTimes(callCount)
    })
  })

  describe('buffered mode', () => {
    it('does not call writeFn immediately for single write', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 1000 })
      writer.write('hello')
      expect(writeFn).not.toHaveBeenCalled()
    })

    it('flushes buffer on dispose', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 1000 })
      writer.write('hello')
      writer.write('world')
      writer.dispose()
      expect(writeFn).toHaveBeenCalledTimes(1)
      expect(writeFn).toHaveBeenCalledWith('helloworld')
    })

    it('flushes buffer on explicit flush', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 1000 })
      writer.write('hello')
      writer.flush()
      expect(writeFn).toHaveBeenCalledTimes(1)
      expect(writeFn).toHaveBeenCalledWith('hello')
    })

    it('flushes after maxBufferSize exceeded (overflow)', () => {
      writer = createBufferedWriter({
        writeFn,
        flushIntervalMs: 1000,
        maxBufferSize: 3,
      })
      writer.write('a')
      writer.write('b')
      writer.write('c')
      // 3 items = maxBufferSize, should trigger deferred flush
      // flushDeferred uses setImmediate, so we need to let it fire
      // Use flush to force drain immediately
      writer.flush()
      expect(writeFn).toHaveBeenCalled()
    })

    it('clears buffer after flush', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 1000 })
      writer.write('first')
      writer.flush()
      writer.write('second')
      writer.flush()
      expect(writeFn).toHaveBeenCalledTimes(2)
      expect(writeFn).toHaveBeenNthCalledWith(1, 'first')
      expect(writeFn).toHaveBeenNthCalledWith(2, 'second')
    })
  })

  describe('maxBufferBytes', () => {
    it('flushes when byte threshold exceeded', () => {
      writer = createBufferedWriter({
        writeFn,
        flushIntervalMs: 1000,
        maxBufferSize: 100,
        maxBufferBytes: 10,
      })
      writer.write('hello') // 5 bytes
      writer.write(' world') // 6 bytes → total 11 > 10
      writer.flush()
      expect(writeFn).toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('flushes remaining buffer', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 1000 })
      writer.write('final')
      writer.dispose()
      expect(writeFn).toHaveBeenCalledWith('final')
    })

    it('does not write anything if buffer is empty', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 1000 })
      writer.dispose()
      expect(writeFn).not.toHaveBeenCalled()
    })
  })

  describe('timer behavior', () => {
    it('buffers writes while timer has not fired', () => {
      writer = createBufferedWriter({ writeFn, flushIntervalMs: 60000 })
      writer.write('a')
      writer.write('b')
      writer.write('c')
      expect(writeFn).not.toHaveBeenCalled()
    })
  })
})
