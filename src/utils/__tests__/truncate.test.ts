import { describe, expect, it } from 'bun:test'
import {
  truncate,
  truncatePathMiddle,
  truncateStartToWidth,
  truncateToWidth,
  truncateToWidthNoEllipsis,
  wrapText,
} from '../truncate'

// All test strings are ASCII so stringWidth() returns the same as length.

describe('truncateToWidth', () => {
  it('returns string as-is when within width', () => {
    expect(truncateToWidth('hello', 10)).toBe('hello')
    expect(truncateToWidth('hello', 5)).toBe('hello')
  })

  it('truncates with ellipsis when too long', () => {
    expect(truncateToWidth('hello world', 8)).toBe('hello w…')
  })

  it('returns just ellipsis when maxWidth <= 1', () => {
    expect(truncateToWidth('hello', 1)).toBe('…')
    expect(truncateToWidth('hello', 0)).toBe('…')
  })

  it('handles empty string', () => {
    expect(truncateToWidth('', 5)).toBe('')
  })
})

describe('truncateStartToWidth', () => {
  it('returns string as-is when within width', () => {
    expect(truncateStartToWidth('hello', 10)).toBe('hello')
  })

  it('truncates from the start preserving the end', () => {
    const result = truncateStartToWidth('hello world', 8)
    expect(result.startsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(8)
  })

  it('returns just ellipsis when maxWidth <= 1', () => {
    expect(truncateStartToWidth('hello', 1)).toBe('…')
  })

  it('handles empty string', () => {
    expect(truncateStartToWidth('', 5)).toBe('')
  })
})

describe('truncateToWidthNoEllipsis', () => {
  it('returns string as-is when within width', () => {
    expect(truncateToWidthNoEllipsis('hello', 10)).toBe('hello')
  })

  it('truncates without appending ellipsis', () => {
    const result = truncateToWidthNoEllipsis('hello world', 8)
    expect(result).toBe('hello wo')
    expect(result).not.toContain('…')
  })

  it('returns empty string when maxWidth <= 0', () => {
    expect(truncateToWidthNoEllipsis('hello', 0)).toBe('')
  })
})

describe('truncatePathMiddle', () => {
  it('returns path as-is when within maxLength', () => {
    expect(truncatePathMiddle('src/main.ts', 30)).toBe('src/main.ts')
  })

  it('truncates middle of long path', () => {
    const result = truncatePathMiddle('src/components/deeply/nested/folder/MyComponent.tsx', 30)
    expect(result).toContain('…')
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it('preserves filename in truncated path', () => {
    const result = truncatePathMiddle('very/long/path/to/somefile.ts', 25)
    expect(result).toContain('somefile.ts')
  })

  it('returns ellipsis for maxLength <= 0', () => {
    expect(truncatePathMiddle('some/path', 0)).toBe('…')
  })

  it('uses truncateToWidth fallback for very small maxLength', () => {
    const result = truncatePathMiddle('a/b/c/d.ts', 3)
    expect(result).toContain('…')
  })

  it('handles path without slashes', () => {
    expect(truncatePathMiddle('justafile.ts', 20)).toBe('justafile.ts')
    expect(truncatePathMiddle('justafile.ts', 8)).toContain('…')
  })
})

describe('truncate', () => {
  it('returns string as-is when within maxWidth', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates with ellipsis when too long', () => {
    expect(truncate('hello world', 8)).toBe('hello w…')
  })

  it('truncates at first newline when singleLine is true', () => {
    const result = truncate('line1\nline2\nline3', 100, true)
    expect(result).toBe('line1…')
    expect(result).not.toContain('\n')
  })

  it('does not add extra ellipsis if result fits with it', () => {
    const result = truncate('abc\ndef', 4, true)
    expect(result).toBe('abc…')
  })

  it('handles newline + width limit in singleLine mode', () => {
    const result = truncate('hello world\nmore text', 8, true)
    expect(result).toBe('hello w…')
  })
})

describe('wrapText', () => {
  it('returns single line when text fits width', () => {
    expect(wrapText('hello', 10)).toEqual(['hello'])
  })

  it('wraps text at width boundaries (preserves spaces)', () => {
    // wrapText keeps spaces as part of segments — it doesn't strip them
    const result = wrapText('hello world', 6)
    expect(result.length).toBeGreaterThan(1)
  })

  it('wraps text at multiple break points', () => {
    const result = wrapText('the quick brown fox', 10)
    expect(result.length).toBeGreaterThan(1)
  })

  it('handles empty string', () => {
    expect(wrapText('', 10)).toEqual([])
  })
})
