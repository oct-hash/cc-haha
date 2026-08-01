import { describe, expect, it } from 'bun:test'
import { getDefaultBashTimeoutMs, getMaxBashTimeoutMs } from '../timeouts'

describe('getDefaultBashTimeoutMs', () => {
  it('returns 120000 (2 min) when no env var is set', () => {
    expect(getDefaultBashTimeoutMs({})).toBe(120_000)
  })

  it('parses BASH_DEFAULT_TIMEOUT_MS from env', () => {
    expect(getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '5000' })).toBe(5000)
  })

  it('ignores negative values and returns default', () => {
    expect(getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '-1' })).toBe(120_000)
  })

  it('ignores zero and returns default', () => {
    expect(getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '0' })).toBe(120_000)
  })

  it('ignores non-numeric values and returns default', () => {
    expect(getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: 'abc' })).toBe(120_000)
  })

  it('ignores empty string and returns default', () => {
    expect(getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '' })).toBe(120_000)
  })

  it('handles large values', () => {
    expect(getDefaultBashTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: '300000' })).toBe(300_000)
  })
})

describe('getMaxBashTimeoutMs', () => {
  it('returns max of default (600000) and default timeout when no env set', () => {
    const result = getMaxBashTimeoutMs({})
    expect(result).toBeGreaterThanOrEqual(600_000)
    expect(result).toBeGreaterThanOrEqual(120_000)
    expect(result).toBe(600_000)
  })

  it('uses BASH_MAX_TIMEOUT_MS from env', () => {
    expect(getMaxBashTimeoutMs({ BASH_MAX_TIMEOUT_MS: '300000' })).toBe(300_000)
  })

  it('ensures max is at least default timeout', () => {
    // BASH_DEFAULT_TIMEOUT_MS is not set, so default is 120000
    // max is 10000 but must be >= default (120000)
    const result = getMaxBashTimeoutMs({ BASH_MAX_TIMEOUT_MS: '10000' })
    expect(result).toBe(120_000)
  })

  it('ensures max is at least BASH_DEFAULT_TIMEOUT_MS when set', () => {
    const result = getMaxBashTimeoutMs({
      BASH_MAX_TIMEOUT_MS: '10000',
      BASH_DEFAULT_TIMEOUT_MS: '300000',
    })
    expect(result).toBe(300_000)
  })

  it('returns default 600000 when BASH_MAX_TIMEOUT_MS is invalid', () => {
    expect(getMaxBashTimeoutMs({ BASH_MAX_TIMEOUT_MS: 'abc' })).toBe(600_000)
  })

  it('returns default 600000 when BASH_MAX_TIMEOUT_MS is zero', () => {
    expect(getMaxBashTimeoutMs({ BASH_MAX_TIMEOUT_MS: '0' })).toBe(600_000)
  })

  it('uses BASH_MAX_TIMEOUT_MS when both env vars are set to valid values', () => {
    const result = getMaxBashTimeoutMs({
      BASH_MAX_TIMEOUT_MS: '500000',
      BASH_DEFAULT_TIMEOUT_MS: '60000',
    })
    // 500000 > default 120000, so 500000 is used, and 500000 > 600000? No. So the max should be max(500000, 60000) = 500000
    // But wait: Math.max(parsed, getDefaultBashTimeoutMs(env))
    // parsed=500000, getDefault=60000 → Math.max(500000, 60000) = 500000
    expect(result).toBe(500_000)
  })
})
