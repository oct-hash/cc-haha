import { describe, expect, it } from 'bun:test'
import { djb2Hash, hashContent, hashPair } from '../hash'

describe('djb2Hash', () => {
  it('returns consistent hash for same string', () => {
    const h1 = djb2Hash('hello')
    const h2 = djb2Hash('hello')
    expect(h1).toBe(h2)
  })

  it('returns different hashes for different strings', () => {
    expect(djb2Hash('hello')).not.toBe(djb2Hash('world'))
  })

  it('returns integer', () => {
    expect(Number.isInteger(djb2Hash('test'))).toBe(true)
  })

  it('empty string returns consistent value', () => {
    expect(djb2Hash('')).toBe(djb2Hash(''))
  })

  it('is case-sensitive', () => {
    expect(djb2Hash('Test')).not.toBe(djb2Hash('test'))
  })
})

describe('hashContent', () => {
  it('returns string output', () => {
    const h = hashContent('test content')
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const h1 = hashContent('same content')
    const h2 = hashContent('same content')
    expect(h1).toBe(h2)
  })

  it('different content produces different hash', () => {
    const h1 = hashContent('content a')
    const h2 = hashContent('content b')
    expect(h1).not.toBe(h2)
  })
})

describe('hashPair', () => {
  it('returns string output', () => {
    const h = hashPair('a', 'b')
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(hashPair('a', 'b')).toBe(hashPair('a', 'b'))
  })

  it('distinguishes concatenated from separate', () => {
    // hashPair('ts', 'code') should differ from hashPair('tsc', 'ode')
    expect(hashPair('ts', 'code')).not.toBe(hashPair('tsc', 'ode'))
  })

  it('different order produces different hash', () => {
    expect(hashPair('a', 'b')).not.toBe(hashPair('b', 'a'))
  })
})
