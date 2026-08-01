import { describe, expect, it } from 'bun:test'
import { validateBoundedIntEnvVar } from '../envValidation'

describe('validateBoundedIntEnvVar', () => {
  it('returns default when value is undefined', () => {
    expect(validateBoundedIntEnvVar('TEST', undefined, 10, 100)).toEqual({
      effective: 10,
      status: 'valid',
    })
  })

  it('returns default when value is empty string', () => {
    expect(validateBoundedIntEnvVar('TEST', '', 10, 100)).toEqual({
      effective: 10,
      status: 'valid',
    })
  })

  it('returns parsed value when within bounds', () => {
    expect(validateBoundedIntEnvVar('TEST', '42', 10, 100)).toEqual({
      effective: 42,
      status: 'valid',
    })
  })

  it('caps value at upper limit', () => {
    expect(validateBoundedIntEnvVar('TEST', '200', 10, 100)).toEqual({
      effective: 100,
      status: 'capped',
      message: 'Capped from 200 to 100',
    })
  })

  it('returns invalid for non-numeric string', () => {
    const result = validateBoundedIntEnvVar('TEST', 'abc', 10, 100)
    expect(result.status).toBe('invalid')
    expect(result.effective).toBe(10)
    expect(result.message).toContain('Invalid value')
    expect(result.message).toContain('abc')
  })

  it('returns invalid for zero', () => {
    expect(validateBoundedIntEnvVar('TEST', '0', 10, 100).status).toBe('invalid')
  })

  it('returns invalid for negative values', () => {
    expect(validateBoundedIntEnvVar('TEST', '-5', 10, 100).status).toBe('invalid')
  })

  it('parses integer from float string (truncates)', () => {
    expect(validateBoundedIntEnvVar('TEST', '3.14', 10, 100)).toEqual({
      effective: 3,
      status: 'valid',
    })
  })
})
