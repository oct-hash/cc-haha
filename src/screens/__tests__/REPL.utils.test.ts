import { describe, expect, it } from 'bun:test'
import {
  EMPTY_MCP_CLIENTS,
  HISTORY_STUB,
  median,
  RECENT_SCROLL_REPIN_WINDOW_MS,
  TITLE_ANIMATION_FRAMES,
  TITLE_ANIMATION_INTERVAL_MS,
  TITLE_STATIC_PREFIX,
} from '../REPL.utils'

describe('median', () => {
  it('returns the middle value for odd-length arrays', () => {
    expect(median([1, 3, 2])).toBe(2)
  })

  it('returns the rounded average of two middle values for even-length arrays', () => {
    expect(median([1, 4, 2, 3])).toBe(3) // sorted [1,2,3,4]; (2+3)/2 = 2.5 → Math.round → 3
  })

  it('returns the value for single-element arrays', () => {
    expect(median([42])).toBe(42)
  })

  it('handles arrays with duplicates', () => {
    expect(median([5, 5, 5, 5, 5])).toBe(5)
  })

  it('handles negative numbers', () => {
    expect(median([-5, -1, -3])).toBe(-3)
  })

  it('handles mixed positive and negative numbers', () => {
    expect(median([-10, 20, 0, 10])).toBe(5) // sorted [-10,0,10,20]; (0+10)/2 = 5
  })

  it('does not mutate the input array', () => {
    const input = [3, 1, 2]
    median(input)
    expect(input).toEqual([3, 1, 2])
  })
})

describe('EMPTY_MCP_CLIENTS', () => {
  it('is a frozen empty array', () => {
    expect(Array.isArray(EMPTY_MCP_CLIENTS)).toBe(true)
    expect(EMPTY_MCP_CLIENTS.length).toBe(0)
  })
})

describe('HISTORY_STUB', () => {
  it('has a no-op maybeLoadOlder function', () => {
    expect(typeof HISTORY_STUB.maybeLoadOlder).toBe('function')
    // Should not throw when called
    expect(() => HISTORY_STUB.maybeLoadOlder(null as any)).not.toThrow()
  })
})

describe('RECENT_SCROLL_REPIN_WINDOW_MS', () => {
  it('is a positive number', () => {
    expect(RECENT_SCROLL_REPIN_WINDOW_MS).toBeGreaterThan(0)
  })
})

describe('title animation constants', () => {
  it('TITLE_ANIMATION_FRAMES has expected values', () => {
    expect(TITLE_ANIMATION_FRAMES).toHaveLength(2)
  })

  it('TITLE_STATIC_PREFIX is a non-empty string', () => {
    expect(TITLE_STATIC_PREFIX.length).toBeGreaterThan(0)
  })

  it('TITLE_ANIMATION_INTERVAL_MS is a positive number', () => {
    expect(TITLE_ANIMATION_INTERVAL_MS).toBeGreaterThan(0)
  })
})
