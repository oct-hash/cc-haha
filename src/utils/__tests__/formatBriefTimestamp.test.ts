import { describe, expect, it } from 'bun:test'
import { formatBriefTimestamp } from '../formatBriefTimestamp'

describe('formatBriefTimestamp', () => {
  it('returns empty string for invalid date', () => {
    expect(formatBriefTimestamp('not-a-date')).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(formatBriefTimestamp('')).toBe('')
  })

  it('returns non-empty string for valid date', () => {
    const result = formatBriefTimestamp('2026-07-23T14:30:00Z')
    expect(result.length).toBeGreaterThan(0)
  })

  it('produces different format for same-day vs older dates', () => {
    const now = new Date('2026-07-23T14:30:00Z')
    const sameDay = formatBriefTimestamp('2026-07-23T09:15:00Z', now)
    const yesterday = formatBriefTimestamp('2026-07-22T09:15:00Z', now)

    expect(sameDay.length).toBeGreaterThan(0)
    expect(yesterday.length).toBeGreaterThan(0)
    // Same day is time-only, yesterday has weekday+time — should be longer
    expect(yesterday.length).toBeGreaterThan(sameDay.length)
  })

  it('produces progressively more detailed format for older dates', () => {
    const now = new Date('2026-07-23T14:30:00Z')
    const sameDay = formatBriefTimestamp('2026-07-23T09:15:00Z', now)
    const fourDaysAgo = formatBriefTimestamp('2026-07-19T09:15:00Z', now)
    const old = formatBriefTimestamp('2026-05-15T09:15:00Z', now)

    // Older dates (with month+day+weekday) should be longest
    expect(old.length).toBeGreaterThan(sameDay.length)
    // 4 days ago uses weekday+time format
    expect(fourDaysAgo.length).toBeGreaterThan(sameDay.length)
  })

  it('returns non-empty string for future dates', () => {
    const now = new Date('2026-07-23T14:30:00Z')
    const future = '2026-07-24T09:15:00Z'
    const result = formatBriefTimestamp(future, now)
    expect(result.length).toBeGreaterThan(0)
  })

  it('defaults now to current time when not provided', () => {
    const result = formatBriefTimestamp('2026-07-23T14:30:00Z')
    expect(result.length).toBeGreaterThan(0)
  })

  it('all output formats contain time (colon separator)', () => {
    const now = new Date('2026-07-23T14:30:00Z')
    const sameDay = formatBriefTimestamp('2026-07-23T09:15:00Z', now)
    const yesterday = formatBriefTimestamp('2026-07-22T09:15:00Z', now)
    const old = formatBriefTimestamp('2026-05-15T09:15:00Z', now)

    // All formats include time with colon separator
    expect(sameDay).toMatch(/:/)
    expect(yesterday).toMatch(/:/)
    expect(old).toMatch(/:/)
  })
})
