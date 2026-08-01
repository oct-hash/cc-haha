import { describe, expect, it } from 'bun:test'
import { toInkColor } from '../ink'

describe('toInkColor', () => {
  it('returns default color for undefined input', () => {
    expect(toInkColor(undefined)).toBe('cyan_FOR_SUBAGENTS_ONLY')
  })

  it('maps known agent color "blue" to theme color', () => {
    const result = toInkColor('blue')
    // Known agent colors are mapped to theme keys
    expect(typeof result).toBe('string')
    expect(result).not.toBe('ansi:blue') // Should be theme-mapped, not raw
  })

  it('falls back to ansi: prefix for unknown colors', () => {
    expect(toInkColor('neon-green')).toBe('ansi:neon-green')
  })
})
