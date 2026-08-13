import { describe, expect, it } from 'bun:test'
import { isMacosOptionChar, MACOS_OPTION_SPECIAL_CHARS } from '../keyboardShortcuts'

describe('MACOS_OPTION_SPECIAL_CHARS', () => {
  it('maps option+t to thinking toggle', () => {
    expect(MACOS_OPTION_SPECIAL_CHARS['†']).toBe('alt+t')
  })

  it('maps option+p to model picker', () => {
    expect(MACOS_OPTION_SPECIAL_CHARS.π).toBe('alt+p')
  })

  it('maps option+o to fast mode', () => {
    expect(MACOS_OPTION_SPECIAL_CHARS.ø).toBe('alt+o')
  })
})

describe('isMacosOptionChar', () => {
  it('returns true for known option characters', () => {
    expect(isMacosOptionChar('†')).toBe(true)
    expect(isMacosOptionChar('π')).toBe(true)
    expect(isMacosOptionChar('ø')).toBe(true)
  })

  it('returns false for unknown characters', () => {
    expect(isMacosOptionChar('a')).toBe(false)
    expect(isMacosOptionChar('1')).toBe(false)
    expect(isMacosOptionChar('@')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isMacosOptionChar('')).toBe(false)
  })
})
