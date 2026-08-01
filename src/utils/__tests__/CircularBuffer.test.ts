import { describe, expect, it } from 'bun:test'
import { CircularBuffer } from '../CircularBuffer'

describe('CircularBuffer', () => {
  describe('add', () => {
    it('adds items up to capacity without eviction', () => {
      const buf = new CircularBuffer<number>(3)
      buf.add(1)
      buf.add(2)
      expect(buf.length()).toBe(2)
      expect(buf.toArray()).toEqual([1, 2])
    })

    it('evicts oldest item when capacity exceeded', () => {
      const buf = new CircularBuffer<number>(3)
      buf.add(1)
      buf.add(2)
      buf.add(3)
      buf.add(4)
      expect(buf.length()).toBe(3)
      expect(buf.toArray()).toEqual([2, 3, 4])
    })

    it('wraps around correctly with multiple cycles', () => {
      const buf = new CircularBuffer<number>(3)
      buf.add(1)
      buf.add(2)
      buf.add(3)
      buf.add(4)
      buf.add(5)
      buf.add(6)
      expect(buf.length()).toBe(3)
      expect(buf.toArray()).toEqual([4, 5, 6])
    })
  })

  describe('addAll', () => {
    it('adds all items from an array', () => {
      const buf = new CircularBuffer<number>(5)
      buf.addAll([10, 20, 30])
      expect(buf.toArray()).toEqual([10, 20, 30])
    })

    it('evicts oldest when addAll exceeds capacity', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3, 4, 5])
      expect(buf.length()).toBe(3)
      expect(buf.toArray()).toEqual([3, 4, 5])
    })
  })

  describe('getRecent', () => {
    it('returns last N items when buffer has enough', () => {
      const buf = new CircularBuffer<number>(5)
      buf.addAll([1, 2, 3, 4, 5])
      expect(buf.getRecent(3)).toEqual([3, 4, 5])
    })

    it('returns all items when fewer than requested', () => {
      const buf = new CircularBuffer<number>(5)
      buf.addAll([1, 2])
      expect(buf.getRecent(5)).toEqual([1, 2])
    })

    it('returns correct recent items after wrap', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3, 4])
      expect(buf.getRecent(2)).toEqual([3, 4])
    })
  })

  describe('toArray', () => {
    it('returns empty array for empty buffer', () => {
      expect(new CircularBuffer<number>(3).toArray()).toEqual([])
    })

    it('returns items in insertion order (oldest first)', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3])
      expect(buf.toArray()).toEqual([1, 2, 3])
    })

    it('returns correct order after wrap-around', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3, 4, 5])
      expect(buf.toArray()).toEqual([3, 4, 5])
    })
  })

  describe('clear', () => {
    it('empties the buffer', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3])
      buf.clear()
      expect(buf.length()).toBe(0)
      expect(buf.toArray()).toEqual([])
    })

    it('allows reuse after clear', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3])
      buf.clear()
      buf.add(10)
      expect(buf.toArray()).toEqual([10])
    })
  })

  describe('length', () => {
    it('returns 0 initially', () => {
      expect(new CircularBuffer<number>(5).length()).toBe(0)
    })

    it('tracks actual count, not just capacity', () => {
      const buf = new CircularBuffer<number>(10)
      buf.addAll([1, 2, 3])
      expect(buf.length()).toBe(3)
    })

    it('caps at capacity after overflow', () => {
      const buf = new CircularBuffer<number>(3)
      buf.addAll([1, 2, 3, 4, 5])
      expect(buf.length()).toBe(3)
    })
  })
})
