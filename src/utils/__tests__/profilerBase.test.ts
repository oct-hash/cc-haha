import { describe, expect, it } from 'bun:test'
import { formatMs, formatTimelineLine } from '../profilerBase'

describe('formatMs', () => {
  it('formats milliseconds to 3 decimal places', () => {
    expect(formatMs(1.23456)).toBe('1.235')
  })

  it('formats whole numbers with decimal', () => {
    expect(formatMs(100)).toBe('100.000')
  })

  it('formats zero', () => {
    expect(formatMs(0)).toBe('0.000')
  })
})

describe('formatTimelineLine', () => {
  it('renders basic timeline line without memory', () => {
    const line = formatTimelineLine(100.5, 50.2, 'my-step', undefined, 8, 7)
    expect(line).toContain('100.500')
    expect(line).toContain('50.200')
    expect(line).toContain('my-step')
    expect(line).not.toContain('RSS')
  })

  it('renders timeline line with memory info', () => {
    const mem = { rss: 100 * 1024 * 1024, heapUsed: 50 * 1024 * 1024 }
    const line = formatTimelineLine(100.5, 50.2, 'step', mem, 8, 7)
    expect(line).toContain('RSS')
    expect(line).toContain('Heap')
  })

  it('includes extra text when provided', () => {
    const line = formatTimelineLine(100, 50, 'step', undefined, 8, 7, 'extra-info')
    expect(line).toContain('extra-info')
  })
})
