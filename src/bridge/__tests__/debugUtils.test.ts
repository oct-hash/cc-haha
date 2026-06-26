import { describe, it, expect } from 'bun:test'
import {
  redactSecrets,
  debugTruncate,
  debugBody,
  describeAxiosError,
  extractHttpStatus,
  extractErrorDetail,
} from '../debugUtils'

describe('redactSecrets', () => {
  it('redacts long secret values', () => {
    const input = '{"token":"sk-very-long-secret-key-12345678"}'
    const result = redactSecrets(input)
    expect(result).not.toContain('sk-very-long-secret-key-12345678')
    expect(result).toContain('sk-very-')
    expect(result).toContain('...')
    expect(result).toContain('5678')
  })

  it('fully redacts short values', () => {
    const input = '{"secret":"abc"}'
    expect(redactSecrets(input)).toContain('[REDACTED]')
  })

  it('passes through strings without secrets', () => {
    const input = '{"name":"hello","count":42}'
    expect(redactSecrets(input)).toBe(input)
  })

  it('redacts access_token field', () => {
    const input = '{"access_token":"ghp_abcdefghijklmnop12345678"}'
    const result = redactSecrets(input)
    expect(result).not.toContain('ghp_abcdefghijklmnop12345678')
  })
})

describe('debugTruncate', () => {
  it('collapses newlines', () => {
    expect(debugTruncate('hello\nworld')).toBe('hello\\nworld')
  })

  it('returns short strings unchanged', () => {
    const s = 'short message'
    expect(debugTruncate(s)).toBe(s)
  })

  it('truncates long strings', () => {
    const long = 'x'.repeat(2500)
    const result = debugTruncate(long)
    expect(result.length).toBeLessThan(2100)
    expect(result).toContain('chars)')
  })
})

describe('debugBody', () => {
  it('serializes objects and redacts secrets', () => {
    const result = debugBody({ token: 'sk-abcdefghijklmnop12345678', name: 'test' })
    expect(result).toContain('name')
    expect(result).not.toContain('sk-abcdefghijklmnop12345678')
  })

  it('handles plain strings', () => {
    expect(debugBody('hello')).toBe('hello')
  })
})

describe('describeAxiosError', () => {
  it('extracts message from plain Error', () => {
    expect(describeAxiosError(new Error('network fail'))).toBe('network fail')
  })

  it('appends response body message for axios errors', () => {
    const err = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { message: 'Invalid session ID' } },
    })
    expect(describeAxiosError(err)).toBe('Request failed with status code 400: Invalid session ID')
  })

  it('appends error.message from nested error object', () => {
    const err = Object.assign(new Error('Bad Request'), {
      response: { data: { error: { message: 'Token expired' } } },
    })
    expect(describeAxiosError(err)).toBe('Bad Request: Token expired')
  })

  it('stringifies non-Error values', () => {
    expect(describeAxiosError('plain string')).toBe('plain string')
  })
})

describe('extractHttpStatus', () => {
  it('extracts status from axios error', () => {
    const err = { response: { status: 404 } }
    expect(extractHttpStatus(err)).toBe(404)
  })

  it('returns undefined for non-http errors', () => {
    expect(extractHttpStatus(new Error('timeout'))).toBeUndefined()
    expect(extractHttpStatus(null)).toBeUndefined()
    expect(extractHttpStatus('string')).toBeUndefined()
  })

  it('returns undefined when status is not a number', () => {
    const err = { response: { status: '404' } }
    expect(extractHttpStatus(err)).toBeUndefined()
  })
})

describe('extractErrorDetail', () => {
  it('extracts data.message', () => {
    expect(extractErrorDetail({ message: 'Not found' })).toBe('Not found')
  })

  it('extracts data.error.message', () => {
    expect(extractErrorDetail({ error: { message: 'Unauthorized' } })).toBe('Unauthorized')
  })

  it('prefers data.message over data.error.message', () => {
    const result = extractErrorDetail({ message: 'first', error: { message: 'second' } })
    expect(result).toBe('first')
  })

  it('returns undefined for non-objects', () => {
    expect(extractErrorDetail(null)).toBeUndefined()
    expect(extractErrorDetail('string')).toBeUndefined()
    expect(extractErrorDetail(42)).toBeUndefined()
  })

  it('returns undefined when no message found', () => {
    expect(extractErrorDetail({ code: 500 })).toBeUndefined()
  })
})
