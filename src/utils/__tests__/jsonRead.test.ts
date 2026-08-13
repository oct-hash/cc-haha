import { describe, expect, it } from 'bun:test'
import { stripBOM } from '../jsonRead'

describe('stripBOM', () => {
  it('strips UTF-8 BOM from beginning of string', () => {
    const bom = '\uFEFF'
    const input = `${bom}{"key": "value"}`
    expect(stripBOM(input)).toBe('{"key": "value"}')
  })

  it('returns string unchanged when no BOM present', () => {
    expect(stripBOM('{"key": "value"}')).toBe('{"key": "value"}')
  })

  it('returns empty string unchanged', () => {
    expect(stripBOM('')).toBe('')
  })

  it('does not strip BOM if not at start', () => {
    const bom = '\uFEFF'
    expect(stripBOM(`a${bom}b`)).toBe(`a${bom}b`)
  })

  it('returns string unchanged for BOM-only string', () => {
    expect(stripBOM('\uFEFF')).toBe('')
  })

  it('handles strings starting with similar but different chars', () => {
    // Different Unicode characters, not BOM
    expect(stripBOM('\uFE00hello')).toBe('\uFE00hello')
  })
})
