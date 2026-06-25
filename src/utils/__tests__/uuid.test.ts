import { describe, it, expect } from 'bun:test'
import { validateUuid, createAgentId } from '../uuid'

describe('validateUuid', () => {
  it('accepts valid UUID v4', () => {
    expect(validateUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('accepts uppercase UUID', () => {
    expect(validateUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550E8400-E29B-41D4-A716-446655440000',
    )
  })

  it('rejects non-string input', () => {
    expect(validateUuid(123)).toBeNull()
    expect(validateUuid(null)).toBeNull()
    expect(validateUuid(undefined)).toBeNull()
  })

  it('rejects empty string', () => {
    expect(validateUuid('')).toBeNull()
  })

  it('rejects malformed UUID', () => {
    expect(validateUuid('not-a-uuid')).toBeNull()
    expect(validateUuid('550e8400-e29b-41d4-a716')).toBeNull()
  })

  it('rejects overly long UUID', () => {
    expect(
      validateUuid('550e8400-e29b-41d4-a716-4466554400000'),
    ).toBeNull()
  })
})

describe('createAgentId', () => {
  it('returns prefixed ID with a-prefix', () => {
    const id = createAgentId()
    expect(id.startsWith('a')).toBe(true)
    expect(id.length).toBe(17) // 'a' + 16 hex chars
  })

  it('includes label in prefix when provided', () => {
    const id = createAgentId('test')
    expect(id.startsWith('atest-')).toBe(true)
    expect(id.length).toBeGreaterThan(16)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createAgentId()))
    expect(ids.size).toBe(100)
  })
})
