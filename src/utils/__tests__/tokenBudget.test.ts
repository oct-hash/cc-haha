import { describe, expect, it } from 'bun:test'
import {
  findTokenBudgetPositions,
  getBudgetContinuationMessage,
  parseTokenBudget,
} from '../tokenBudget'

describe('parseTokenBudget', () => {
  it('parses shorthand at start of text (+500k)', () => {
    expect(parseTokenBudget('+500k tokens limit')).toBe(500_000)
  })

  it('parses shorthand with decimal (+1.5m)', () => {
    expect(parseTokenBudget('+1.5m budget')).toBe(1_500_000)
  })

  it('parses shorthand at end of text', () => {
    expect(parseTokenBudget('limit is +200k')).toBe(200_000)
  })

  it('parses verbose "use N tokens" format', () => {
    expect(parseTokenBudget('use 100k tokens')).toBe(100_000)
  })

  it('parses verbose "spend N tokens" format', () => {
    expect(parseTokenBudget('spend 2m tokens on this')).toBe(2_000_000)
  })

  it('returns null for text without budget', () => {
    expect(parseTokenBudget('hello world')).toBeNull()
  })

  it('parses billion suffix (+1b)', () => {
    expect(parseTokenBudget('+1b tokens')).toBe(1_000_000_000)
  })

  it('is case-insensitive for suffix', () => {
    expect(parseTokenBudget('+500K')).toBe(500_000)
    expect(parseTokenBudget('+1M')).toBe(1_000_000)
  })

  it('does not match shorthand in middle of text', () => {
    expect(parseTokenBudget('here is +500k in middle')).toBeNull()
  })

  it('shorthand at start takes priority over verbose', () => {
    expect(parseTokenBudget('+300k use 100k tokens')).toBe(300_000)
  })

  it('handles ! after shorthand at end', () => {
    expect(parseTokenBudget('done +200k!')).toBe(200_000)
  })
})

describe('findTokenBudgetPositions', () => {
  it('finds shorthand at start position', () => {
    const positions = findTokenBudgetPositions('+500k tokens limit')
    expect(positions).toHaveLength(1)
    expect(positions[0]!.start).toBe(0)
    expect(positions[0]!.end).toBe(5)
  })

  it('does not double-count when input is only shorthand', () => {
    const positions = findTokenBudgetPositions('+500k')
    expect(positions).toHaveLength(1)
  })

  it('finds multiple verbose matches', () => {
    const positions = findTokenBudgetPositions('use 100k tokens and use 200k tokens')
    expect(positions).toHaveLength(2)
  })
})

describe('getBudgetContinuationMessage', () => {
  it('formats budget message with formatted numbers', () => {
    const msg = getBudgetContinuationMessage(75, 75000, 100000)
    expect(msg).toContain('75%')
    expect(msg).toContain('75,000')
    expect(msg).toContain('100,000')
  })

  it('includes continuation instruction', () => {
    const msg = getBudgetContinuationMessage(50, 5000, 10000)
    expect(msg).toContain('Keep working')
    expect(msg).toContain('do not summarize')
  })
})
