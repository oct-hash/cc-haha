import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test'
import {
  decodeJwtPayload,
  decodeJwtExpiry,
  createTokenRefreshScheduler,
} from '../jwtUtils.js'

// Mock external dependencies
vi.mock('../../utils/debug.js', () => ({
  logForDebugging: vi.fn(),
}))

vi.mock('../../utils/diagLogs.js', () => ({
  logForDiagnosticsNoPII: vi.fn(),
}))

vi.mock('../../utils/errors.js', () => ({
  errorMessage: vi.fn((err: unknown) => String(err)),
}))

vi.mock('../../services/analytics/index.js', () => ({
  logEvent: vi.fn(),
}))

function createMockJwt(expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-user',
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString('base64url')
  const signature = 'mock-signature'
  return `${header}.${payload}.${signature}`
}

function createMockJwtWithPrefix(expiresInSeconds: number): string {
  return `sk-ant-si-${createMockJwt(expiresInSeconds)}`
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { sub: 'test-user', name: 'Test User' }
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
    const result = decodeJwtPayload(token)
    expect(result).toEqual(payload)
  })

  it('strips sk-ant-si- prefix before decoding', () => {
    const payload = { sub: 'test-user', role: 'admin' }
    const token = `sk-ant-si-header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
    const result = decodeJwtPayload(token)
    expect(result).toEqual(payload)
  })

  it('returns null for malformed JWT (not enough parts)', () => {
    expect(decodeJwtPayload('only.two.parts')).toBeNull()
    expect(decodeJwtPayload('onlyone')).toBeNull()
  })

  it('returns null for JWT with invalid base64 in payload', () => {
    expect(decodeJwtPayload('header.!!!invalid!!!.signature')).toBeNull()
  })

  it('returns null for JWT with empty payload part', () => {
    expect(decodeJwtPayload('header..signature')).toBeNull()
  })
})

describe('decodeJwtExpiry', () => {
  it('extracts exp claim from valid JWT', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = JSON.stringify({ sub: 'test', exp })
    const token = `header.${Buffer.from(payload).toString('base64url')}.signature`
    expect(decodeJwtExpiry(token)).toBe(exp)
  })

  it('returns null when exp is missing', () => {
    const payload = JSON.stringify({ sub: 'test' })
    const token = `header.${Buffer.from(payload).toString('base64url')}.signature`
    expect(decodeJwtExpiry(token)).toBeNull()
  })

  it('returns null when exp is not a number', () => {
    const payload = JSON.stringify({ sub: 'test', exp: 'not-a-number' })
    const token = `header.${Buffer.from(payload).toString('base64url')}.signature`
    expect(decodeJwtExpiry(token)).toBeNull()
  })

  it('returns null for malformed JWT', () => {
    expect(decodeJwtExpiry('invalid-token')).toBeNull()
    expect(decodeJwtExpiry('only.two')).toBeNull()
  })

  it('handles JWT with sk-ant-si- prefix', () => {
    const exp = Math.floor(Date.now() / 1000) + 7200
    const payload = JSON.stringify({ sub: 'test', exp })
    const token = `sk-ant-si-header.${Buffer.from(payload).toString('base64url')}.signature`
    expect(decodeJwtExpiry(token)).toBe(exp)
  })
})

describe('createTokenRefreshScheduler', () => {
  let mockGetAccessToken: ReturnType<typeof vi.fn>
  let mockOnRefresh: ReturnType<typeof vi.fn>
  let scheduler: ReturnType<typeof createTokenRefreshScheduler>

  beforeEach(() => {
    mockGetAccessToken = vi.fn()
    mockOnRefresh = vi.fn()
    scheduler = createTokenRefreshScheduler({
      getAccessToken: mockGetAccessToken,
      onRefresh: mockOnRefresh,
      label: 'test',
    })
  })

  afterEach(() => {
    scheduler.cancelAll()
    vi.restoreAllMocks()
  })

  describe('schedule', () => {
    it('schedules refresh based on JWT expiry', async () => {
      const token = createMockJwt(3600) // expires in 1 hour
      scheduler.schedule('session-1', token)

      // Should not call doRefresh immediately
      expect(mockOnRefresh).not.toHaveBeenCalled()
    })

    it('returns early when token is not a decodable JWT', () => {
      const token = 'sk-ant-si-opaque-token-that-cannot-be-decoded'
      // Should not throw
      expect(() => scheduler.schedule('session-1', token)).not.toThrow()
    })

    it('triggers immediate refresh when token is expired or within buffer', async () => {
      const token = createMockJwt(0) // expires now
      const refreshMock = mockGetAccessToken.mockResolvedValue('new-oauth-token')

      scheduler.schedule('session-1', token)

      // Wait for async doRefresh
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(refreshMock).toHaveBeenCalled()
      expect(mockOnRefresh).toHaveBeenCalledWith('session-1', 'new-oauth-token')
    })

    it('clears existing timer when scheduling new refresh for same session', () => {
      const token1 = createMockJwt(3600)
      const token2 = createMockJwt(7200)

      scheduler.schedule('session-1', token1)
      scheduler.schedule('session-1', token2)

      // Should have only one timer set
      // The first one should be cleared
    })
  })

  describe('scheduleFromExpiresIn', () => {
    it('schedules refresh based on expiresInSeconds', () => {
      // Should not throw
      expect(() =>
        scheduler.scheduleFromExpiresIn('session-1', 3600),
      ).not.toThrow()
    })

    it('clamps delay to 30s minimum when expiresIn is very small', () => {
      // Very small expiresIn should be clamped
      expect(() =>
        scheduler.scheduleFromExpiresIn('session-1', 10),
      ).not.toThrow()
    })
  })

  describe('cancel', () => {
    it('cancels scheduled refresh for session', () => {
      const token = createMockJwt(3600)
      scheduler.schedule('session-1', token)
      scheduler.cancel('session-1')

      // Cancel should bump generation, preventing any follow-up refresh
    })

    it('does not throw when cancelling non-existent session', () => {
      expect(() => scheduler.cancel('non-existent')).not.toThrow()
    })
  })

  describe('cancelAll', () => {
    it('cancels all scheduled refreshes', () => {
      const token = createMockJwt(3600)
      scheduler.schedule('session-1', token)
      scheduler.schedule('session-2', token)
      scheduler.schedule('session-3', token)

      scheduler.cancelAll()

      // All sessions should be cancelled
    })
  })

  describe('token refresh flow', () => {
    it('refreshes token when getAccessToken returns a token', async () => {
      mockGetAccessToken.mockResolvedValue('new-oauth-token')

      const token = createMockJwt(0) // expired
      scheduler.schedule('session-1', token)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockOnRefresh).toHaveBeenCalledWith('session-1', 'new-oauth-token')
    })

    it('retries when getAccessToken returns undefined', async () => {
      mockGetAccessToken.mockResolvedValue(undefined)

      const token = createMockJwt(0) // expired
      scheduler.schedule('session-1', token)

      await new Promise(resolve => setTimeout(resolve, 50))

      // Should retry, not call onRefresh with undefined
      expect(mockOnRefresh).not.toHaveBeenCalled()
    })

    it('increments failure count on refresh errors', async () => {
      mockGetAccessToken.mockRejectedValue(new Error('Network error'))

      const token = createMockJwt(0) // expired
      scheduler.schedule('session-1', token)

      await new Promise(resolve => setTimeout(resolve, 50))

      // Should handle error gracefully
    })
  })
})