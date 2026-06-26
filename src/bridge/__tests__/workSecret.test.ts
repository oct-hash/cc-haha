import { describe, it, expect } from 'bun:test'
import { buildSdkUrl, sameSessionId, buildCCRv2SdkUrl, decodeWorkSecret } from '../workSecret'

describe('buildSdkUrl', () => {
  it('uses ws:// for localhost', () => {
    const url = buildSdkUrl('http://localhost:3000', 'session_123')
    expect(url).toStartWith('ws://localhost:3000/')
  })

  it('uses wss:// for production URLs', () => {
    const url = buildSdkUrl('https://api.example.com', 'session_456')
    expect(url).toStartWith('wss://api.example.com/')
    expect(url).toContain('/v1/session_ingress/ws/session_456')
  })

  it('uses v2 for localhost', () => {
    const url = buildSdkUrl('http://127.0.0.1:8080', 'abc')
    expect(url).toContain('/v2/session_ingress/ws/abc')
  })

  it('strips trailing slash from base URL', () => {
    const url = buildSdkUrl('https://api.example.com/', 'session_789')
    expect(url).not.toContain('//v1')
  })
})

describe('sameSessionId', () => {
  it('matches identical IDs', () => {
    expect(sameSessionId('session_abc', 'session_abc')).toBe(true)
  })

  it('matches IDs with different tags but same body', () => {
    expect(sameSessionId('session_abc123', 'cse_abc123')).toBe(true)
  })

  it('rejects different body IDs', () => {
    expect(sameSessionId('session_abc', 'session_def')).toBe(false)
  })

  it('rejects short suffixes (guard against accidental matches)', () => {
    // cse_x and session_x — body is 'x' (1 char), below min length 4
    expect(sameSessionId('cse_x', 'session_x')).toBe(false)
  })

  it('requires body >= 4 chars', () => {
    expect(sameSessionId('tag_a', 'other_a')).toBe(false)
    expect(sameSessionId('tag_abcd', 'other_abcd')).toBe(true)
  })
})

describe('buildCCRv2SdkUrl', () => {
  it('builds v2 session URL', () => {
    expect(buildCCRv2SdkUrl('https://api.example.com', 'session_123')).toBe(
      'https://api.example.com/v1/code/sessions/session_123',
    )
  })

  it('strips trailing slash', () => {
    expect(buildCCRv2SdkUrl('https://api.example.com/', 'session_456')).toStartWith(
      'https://api.example.com/v1/',
    )
  })
})

describe('decodeWorkSecret', () => {
  it('decodes a valid base64url work secret', () => {
    const secret = {
      version: 1,
      session_ingress_token: 'tok_abc123def456',
      api_base_url: 'https://api.example.com',
    }
    const encoded = Buffer.from(JSON.stringify(secret)).toString('base64url')
    const result = decodeWorkSecret(encoded)
    expect(result.session_ingress_token).toBe('tok_abc123def456')
    expect(result.api_base_url).toBe('https://api.example.com')
  })

  it('throws on wrong version', () => {
    const secret = { version: 2, session_ingress_token: 'x', api_base_url: 'url' }
    const encoded = Buffer.from(JSON.stringify(secret)).toString('base64url')
    expect(() => decodeWorkSecret(encoded)).toThrow('Unsupported work secret version')
  })

  it('throws on missing session_ingress_token', () => {
    const secret = { version: 1, api_base_url: 'url' }
    const encoded = Buffer.from(JSON.stringify(secret)).toString('base64url')
    expect(() => decodeWorkSecret(encoded)).toThrow('session_ingress_token')
  })

  it('throws on empty session_ingress_token', () => {
    const secret = { version: 1, session_ingress_token: '', api_base_url: 'url' }
    const encoded = Buffer.from(JSON.stringify(secret)).toString('base64url')
    expect(() => decodeWorkSecret(encoded)).toThrow('session_ingress_token')
  })

  it('throws on missing api_base_url', () => {
    const secret = { version: 1, session_ingress_token: 'tok' }
    const encoded = Buffer.from(JSON.stringify(secret)).toString('base64url')
    expect(() => decodeWorkSecret(encoded)).toThrow('api_base_url')
  })
})
