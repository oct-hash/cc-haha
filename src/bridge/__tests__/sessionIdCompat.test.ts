import { describe, expect, it } from 'bun:test'
import { setCseShimGate, toCompatSessionId, toInfraSessionId } from '../sessionIdCompat'

describe('toCompatSessionId', () => {
  it('re-tags cse_ to session_', () => {
    expect(toCompatSessionId('cse_abc123')).toBe('session_abc123')
  })

  it('returns non-cse IDs unchanged', () => {
    expect(toCompatSessionId('session_abc123')).toBe('session_abc123')
    expect(toCompatSessionId('abc123')).toBe('abc123')
  })

  it('preserves full UUID after prefix', () => {
    expect(toCompatSessionId('cse_550e8400-e29b-41d4-a716-446655440000')).toBe(
      'session_550e8400-e29b-41d4-a716-446655440000',
    )
  })
})

describe('toInfraSessionId', () => {
  it('re-tags session_ to cse_', () => {
    expect(toInfraSessionId('session_abc123')).toBe('cse_abc123')
  })

  it('returns non-session IDs unchanged', () => {
    expect(toInfraSessionId('cse_abc123')).toBe('cse_abc123')
    expect(toInfraSessionId('abc123')).toBe('abc123')
  })
})

describe('setCseShimGate', () => {
  it('allows setting a gate function', () => {
    setCseShimGate(() => true)
    // After setting gate that returns true, cse shim is active
    expect(toCompatSessionId('cse_test')).toBe('session_test')
  })

  it('gate returning false disables the shim', () => {
    setCseShimGate(() => false)
    expect(toCompatSessionId('cse_test')).toBe('cse_test')
  })
})
