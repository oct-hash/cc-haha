import { describe, expect, it } from 'bun:test'
import {
  formatDuration,
  formatFileSize,
  formatLogMetadata,
  formatNumber,
  formatRelativeTime,
  formatRelativeTimeAgo,
  formatResetText,
  formatResetTime,
  formatSecondsShort,
  formatTokens,
} from '../format'

describe('formatFileSize', () => {
  it('returns bytes for values under 1KB', () => {
    expect(formatFileSize(0)).toBe('0 bytes')
    expect(formatFileSize(512)).toBe('512 bytes')
    expect(formatFileSize(1023)).toBe('1023 bytes')
  })

  it('formats KB values', () => {
    expect(formatFileSize(1024)).toBe('1KB')
    expect(formatFileSize(1536)).toBe('1.5KB')
    expect(formatFileSize(2048)).toBe('2KB')
  })

  it('formats MB values', () => {
    expect(formatFileSize(1048576)).toBe('1MB')
    expect(formatFileSize(1572864)).toBe('1.5MB')
  })

  it('formats GB values', () => {
    expect(formatFileSize(1073741824)).toBe('1GB')
    expect(formatFileSize(1610612736)).toBe('1.5GB')
  })

  it('removes trailing .0 for whole numbers', () => {
    expect(formatFileSize(1024)).toBe('1KB')
    expect(formatFileSize(1048576)).toBe('1MB')
  })
})

describe('formatSecondsShort', () => {
  it('formats milliseconds as seconds with 1 decimal', () => {
    expect(formatSecondsShort(1234)).toBe('1.2s')
    expect(formatSecondsShort(1500)).toBe('1.5s')
    expect(formatSecondsShort(0)).toBe('0.0s')
    expect(formatSecondsShort(10000)).toBe('10.0s')
  })
})

describe('formatDuration', () => {
  it('returns 0s for zero', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('formats sub-millisecond durations with decimal', () => {
    // ms < 1 triggers the decimal path: (ms / 1000).toFixed(1)
    expect(formatDuration(0.5)).toBe('0.0s')
    expect(formatDuration(0.001)).toBe('0.0s')
  })

  it('handles fractional seconds under 1s', () => {
    // < 1ms check is for ms < 1, not ms < 1000
    expect(formatDuration(999)).toBe('0s')
  })

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(59000)).toBe('59s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s')
    expect(formatDuration(90000)).toBe('1m 30s')
  })

  it('formats hours, minutes, seconds', () => {
    expect(formatDuration(3600000)).toBe('1h 0m 0s')
    expect(formatDuration(3660000)).toBe('1h 1m 0s')
  })

  it('formats days', () => {
    expect(formatDuration(86400000)).toBe('1d 0h 0m')
    expect(formatDuration(90000000)).toBe('1d 1h 0m')
  })

  it('handles edge of minute boundary', () => {
    const ms = 59500 // 59.5s — this is < 60000 so it shows 59s (floor)
    expect(formatDuration(ms)).toBe('59s')
  })

  it('rounds overflow within the 60s+ branch', () => {
    // 119500ms = 1m 59.5s → rounds to 2m 0s (carry-over)
    expect(formatDuration(119500)).toBe('2m 0s')
  })

  it('hideTrailingZeros removes zero components at the end', () => {
    expect(formatDuration(3600000, { hideTrailingZeros: true })).toBe('1h')
    expect(formatDuration(3660000, { hideTrailingZeros: true })).toBe('1h 1m')
    expect(formatDuration(86400000, { hideTrailingZeros: true })).toBe('1d')
  })

  it('mostSignificantOnly shows only the largest unit', () => {
    expect(formatDuration(86400000, { mostSignificantOnly: true })).toBe('1d')
    expect(formatDuration(3600000, { mostSignificantOnly: true })).toBe('1h')
    expect(formatDuration(120000, { mostSignificantOnly: true })).toBe('2m')
    expect(formatDuration(45000, { mostSignificantOnly: true })).toBe('45s')
  })
})

describe('formatNumber', () => {
  it('returns numbers under 1000 as-is', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
  })

  it('uses compact notation for 1000+', () => {
    expect(formatNumber(1000)).toBe('1.0k')
    expect(formatNumber(1321)).toBe('1.3k')
    expect(formatNumber(1000000)).toBe('1.0m')
  })
})

describe('formatTokens', () => {
  it('removes .0 from formatNumber output', () => {
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(1321)).toBe('1.3k')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-23T12:00:00Z')

  it('formats past times with narrow style (default)', () => {
    const past = new Date(now.getTime() - 3600000) // 1 hour ago
    expect(formatRelativeTime(past, { now })).toBe('1h ago')
  })

  it('formats future times with narrow style', () => {
    const future = new Date(now.getTime() + 3600000) // in 1 hour
    expect(formatRelativeTime(future, { now })).toBe('in 1h')
  })

  it('formats days ago', () => {
    const past = new Date(now.getTime() - 86400000 * 3) // 3 days ago
    expect(formatRelativeTime(past, { now })).toBe('3d ago')
  })

  it('formats minutes ago', () => {
    const past = new Date(now.getTime() - 120000) // 2 minutes ago
    expect(formatRelativeTime(past, { now })).toBe('2m ago')
  })

  it('shows 0s ago for sub-second past', () => {
    const past = new Date(now.getTime() - 500) // 0.5s ago
    expect(formatRelativeTime(past, { now })).toBe('0s ago')
  })
})

describe('formatRelativeTimeAgo', () => {
  const now = new Date('2026-07-23T12:00:00Z')

  it('formats past dates with ago', () => {
    const past = new Date(now.getTime() - 7200000)
    expect(formatRelativeTimeAgo(past, { now })).toBe('2h ago')
  })

  it('formats future dates without ago', () => {
    const future = new Date(now.getTime() + 7200000)
    const result = formatRelativeTimeAgo(future, { now })
    expect(result).not.toContain('ago')
    expect(result).toContain('in ')
  })
})

describe('formatLogMetadata', () => {
  it('formats metadata with file size', () => {
    const result = formatLogMetadata({
      modified: new Date('2026-07-23T10:00:00Z'),
      messageCount: 5,
      fileSize: 2048,
    })
    expect(result).toContain('2KB')
    expect(result).toContain('·')
  })

  it('formats metadata with message count fallback', () => {
    const result = formatLogMetadata({
      modified: new Date('2026-07-23T10:00:00Z'),
      messageCount: 10,
    })
    expect(result).toContain('10 messages')
  })

  it('includes optional git branch', () => {
    const result = formatLogMetadata({
      modified: new Date('2026-07-23T10:00:00Z'),
      messageCount: 1,
      gitBranch: 'main',
    })
    expect(result).toContain('main')
  })

  it('includes optional tag with # prefix', () => {
    const result = formatLogMetadata({
      modified: new Date('2026-07-23T10:00:00Z'),
      messageCount: 1,
      tag: 'v1.0',
    })
    expect(result).toContain('#v1.0')
  })

  it('includes optional PR number', () => {
    const result = formatLogMetadata({
      modified: new Date('2026-07-23T10:00:00Z'),
      messageCount: 1,
      prNumber: 42,
    })
    expect(result).toContain('#42')
  })

  it('includes PR repository when provided', () => {
    const result = formatLogMetadata({
      modified: new Date('2026-07-23T10:00:00Z'),
      messageCount: 1,
      prNumber: 42,
      prRepository: 'owner/repo',
    })
    expect(result).toContain('owner/repo#42')
  })
})

describe('formatResetTime', () => {
  it('returns undefined for undefined input', () => {
    expect(formatResetTime(undefined)).toBeUndefined()
  })

  it('returns undefined for 0', () => {
    expect(formatResetTime(0)).toBeUndefined()
  })

  it('formats time within 24 hours as time only', () => {
    const now = new Date()
    const in2Hours = Math.floor(now.getTime() / 1000) + 7200
    const result = formatResetTime(in2Hours)
    expect(result).toBeDefined()
    // Should contain am/pm
    expect(result!).toMatch(/am|pm/)
  })

  it('includes timezone when showTimezone is true', () => {
    const now = new Date()
    const in2Hours = Math.floor(now.getTime() / 1000) + 7200
    const result = formatResetTime(in2Hours, true)
    expect(result).toBeDefined()
  })

  it('can hide time', () => {
    const far = Math.floor(Date.now() / 1000) + 86400 * 7
    const result = formatResetTime(far, false, false)
    expect(result).toBeDefined()
  })
})

describe('formatResetText', () => {
  it('formats ISO string reset time', () => {
    const result = formatResetText('2026-07-24T12:00:00Z')
    expect(result).toBeDefined()
  })
})
