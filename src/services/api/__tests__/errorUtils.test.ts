import { describe, expect, it } from 'bun:test'
import {
  extractConnectionErrorDetails,
  formatAPIError,
  getSSLErrorHint,
  sanitizeAPIError,
} from '../errorUtils'

describe('extractConnectionErrorDetails', () => {
  it('extracts code from error in cause chain', () => {
    const cause = Object.assign(new Error('cert expired'), { code: 'CERT_HAS_EXPIRED' })
    const error = Object.assign(new Error('Connection error.'), { cause })
    const result = extractConnectionErrorDetails(error)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('CERT_HAS_EXPIRED')
    expect(result!.isSSLError).toBe(true)
  })

  it('returns null for non-object input', () => {
    expect(extractConnectionErrorDetails(null)).toBeNull()
    expect(extractConnectionErrorDetails('string')).toBeNull()
  })

  it('detects non-SSL error codes', () => {
    const cause = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    const error = Object.assign(new Error('Connection error.'), { cause })
    const result = extractConnectionErrorDetails(error)
    expect(result).not.toBeNull()
    expect(result!.isSSLError).toBe(false)
  })

  it('walks multiple levels of cause chain', () => {
    const root = Object.assign(new Error('bad cert'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' })
    const mid = Object.assign(new Error('wrap'), { cause: root })
    const top = Object.assign(new Error('Connection error.'), { cause: mid })
    const result = extractConnectionErrorDetails(top)
    expect(result!.code).toBe('SELF_SIGNED_CERT_IN_CHAIN')
  })

  it('stops at max depth', () => {
    let current: any = Object.assign(new Error('no code here'), {})
    for (let i = 0; i < 10; i++) {
      current = Object.assign(new Error('wrap'), { cause: current })
    }
    expect(extractConnectionErrorDetails(current)).toBeNull()
  })
})

describe('getSSLErrorHint', () => {
  it('returns hint for SSL errors', () => {
    const cause = Object.assign(new Error('cert'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
    const error = Object.assign(new Error('Connection error.'), { cause })
    const hint = getSSLErrorHint(error)
    expect(hint).toContain('SSL certificate error')
    expect(hint).toContain('NODE_EXTRA_CA_CERTS')
  })

  it('returns null for non-SSL errors', () => {
    const cause = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    const error = Object.assign(new Error('Connection error.'), { cause })
    expect(getSSLErrorHint(error)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getSSLErrorHint(null)).toBeNull()
  })
})

describe('sanitizeAPIError', () => {
  it('returns message unchanged when no HTML', () => {
    const err = { message: 'Rate limit exceeded', status: 429 } as any
    expect(sanitizeAPIError(err)).toBe('Rate limit exceeded')
  })

  it('extracts title from HTML response', () => {
    const err = {
      message:
        '<!DOCTYPE html><html><head><title>Cloudflare Error</title></head><body></body></html>',
      status: 502,
    } as any
    expect(sanitizeAPIError(err)).toBe('Cloudflare Error')
  })

  it('returns empty for HTML without title', () => {
    const err = { message: '<html><body>error</body></html>', status: 500 } as any
    expect(sanitizeAPIError(err)).toBe('')
  })

  it('handles undefined message', () => {
    const err = { status: 500 } as any
    expect(sanitizeAPIError(err)).toBe('')
  })
})

describe('formatAPIError', () => {
  it('returns timeout message', () => {
    const cause = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    const err = Object.assign(new Error('Connection error.'), { cause, status: 500 }) as any
    expect(formatAPIError(err)).toContain('timed out')
  })

  it('returns SSL error with specific message', () => {
    const cause = Object.assign(new Error('expired'), {
      code: 'CERT_HAS_EXPIRED',
    })
    const err = Object.assign(new Error('Connection error.'), { cause, status: 500 }) as any
    expect(formatAPIError(err)).toContain('expired')
  })

  it('returns connection error with code', () => {
    const cause = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
    const err = Object.assign(new Error('Connection error.'), { cause }) as any
    expect(formatAPIError(err)).toContain('ECONNREFUSED')
  })

  it('returns generic connection error without code', () => {
    const err = { message: 'Connection error.', status: 500 } as any
    expect(formatAPIError(err)).toContain('Check your internet connection')
  })

  it('returns sanitized message for normal API errors', () => {
    const err = { message: 'Rate limit exceeded', status: 429 } as any
    expect(formatAPIError(err)).toBe('Rate limit exceeded')
  })

  it('handles errors without message (deserialized from JSONL)', () => {
    const err = {
      status: 400,
      error: { error: { message: 'Invalid model' } },
    } as any
    expect(formatAPIError(err)).toBe('Invalid model')
  })
})
