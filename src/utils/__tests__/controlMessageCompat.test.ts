import { describe, expect, it } from 'bun:test'
import { normalizeControlMessageKeys } from '../controlMessageCompat'

describe('normalizeControlMessageKeys', () => {
  it('returns primitive values unchanged', () => {
    expect(normalizeControlMessageKeys(null)).toBeNull()
    expect(normalizeControlMessageKeys(42)).toBe(42)
    expect(normalizeControlMessageKeys('hello')).toBe('hello')
    expect(normalizeControlMessageKeys(undefined)).toBeUndefined()
  })

  it('renames requestId to request_id on top-level object', () => {
    const obj: Record<string, unknown> = { requestId: 'abc', data: 42 }
    normalizeControlMessageKeys(obj)
    expect(obj).toEqual({ request_id: 'abc', data: 42 })
  })

  it('does not add request_id if it already exists', () => {
    const obj: Record<string, unknown> = { requestId: 'old', request_id: 'existing' }
    normalizeControlMessageKeys(obj)
    expect(obj).toEqual({ requestId: 'old', request_id: 'existing' })
  })

  it('renames requestId inside nested response', () => {
    const obj: Record<string, unknown> = {
      response: { requestId: 'xyz', data: 99 },
    }
    normalizeControlMessageKeys(obj)
    expect(obj).toEqual({
      response: { request_id: 'xyz', data: 99 },
    })
  })

  it('skips nested response when it already has request_id', () => {
    const obj: Record<string, unknown> = {
      response: { requestId: 'bad', request_id: 'good' },
    }
    normalizeControlMessageKeys(obj)
    expect(obj).toEqual({
      response: { requestId: 'bad', request_id: 'good' },
    })
  })

  it('handles object with neither requestId nor response', () => {
    const obj: Record<string, unknown> = { foo: 'bar' }
    normalizeControlMessageKeys(obj)
    expect(obj).toEqual({ foo: 'bar' })
  })

  it('skips null response field', () => {
    const obj: Record<string, unknown> = { response: null }
    normalizeControlMessageKeys(obj)
    expect(obj).toEqual({ response: null })
  })
})
