import { describe, expect, it } from 'bun:test'
import { partiallySanitizeUnicode, recursivelySanitizeUnicode } from '../sanitization'

describe('partiallySanitizeUnicode', () => {
  it('passes normal text unchanged', () => {
    expect(partiallySanitizeUnicode('hello world')).toBe('hello world')
  })

  it('removes zero-width spaces', () => {
    expect(partiallySanitizeUnicode('hello​world')).toBe('helloworld')
  })

  it('removes byte order mark', () => {
    expect(partiallySanitizeUnicode('﻿hello')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(partiallySanitizeUnicode('')).toBe('')
  })

  it('preserves CJK characters', () => {
    expect(partiallySanitizeUnicode('你好世界')).toBe('你好世界')
  })

  it('removes directional formatting characters', () => {
    expect(partiallySanitizeUnicode('a‪b‬c')).toBe('abc')
  })

  it('stabilizes after repeated application', () => {
    const input = 'test'
    const first = partiallySanitizeUnicode(input)
    const second = partiallySanitizeUnicode(first)
    expect(second).toBe(first)
  })
})

describe('recursivelySanitizeUnicode', () => {
  it('sanitizes strings in arrays', () => {
    const result = recursivelySanitizeUnicode(['hello​', 'world'])
    expect(result).toEqual(['hello', 'world'])
  })

  it('sanitizes nested objects', () => {
    const result = recursivelySanitizeUnicode({ name: 'test﻿', count: 1 })
    expect(result).toEqual({ name: 'test', count: 1 })
  })

  it('passes non-string scalars through', () => {
    expect(recursivelySanitizeUnicode(42)).toBe(42)
    expect(recursivelySanitizeUnicode(null)).toBe(null)
    expect(recursivelySanitizeUnicode(true)).toBe(true)
  })

  it('handles deeply nested structures', () => {
    const input = { items: [{ text: 'a​b' }], meta: { clean: 'ok' } }
    const result = recursivelySanitizeUnicode(input) as typeof input
    expect(result.items[0]!.text).toBe('ab')
    expect(result.meta.clean).toBe('ok')
  })
})
