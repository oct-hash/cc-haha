import { describe, expect, it } from 'bun:test'
import { isAwsCredentialsProviderError, isValidAwsStsOutput } from '../aws'

describe('isAwsCredentialsProviderError', () => {
  it('returns true for CredentialsProviderError', () => {
    const err = { name: 'CredentialsProviderError', message: 'boom' }
    expect(isAwsCredentialsProviderError(err)).toBe(true)
  })

  it('returns false for other error names', () => {
    expect(isAwsCredentialsProviderError({ name: 'TypeError' })).toBe(false)
  })

  it('returns false for objects without name', () => {
    expect(isAwsCredentialsProviderError({ message: 'no name' })).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isAwsCredentialsProviderError(null)).toBe(false)
    expect(isAwsCredentialsProviderError(undefined)).toBe(false)
    expect(isAwsCredentialsProviderError('string')).toBe(false)
  })
})

describe('isValidAwsStsOutput', () => {
  it('returns true for valid STS output', () => {
    const valid = {
      Credentials: {
        AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        SessionToken: 'FQoGZXIvYXdzE...',
      },
    }
    expect(isValidAwsStsOutput(valid)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isValidAwsStsOutput(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isValidAwsStsOutput(undefined)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isValidAwsStsOutput('not-an-object')).toBe(false)
  })

  it('returns false when Credentials is missing', () => {
    expect(isValidAwsStsOutput({})).toBe(false)
  })

  it('returns false when Credentials is not an object', () => {
    expect(isValidAwsStsOutput({ Credentials: 'not-object' })).toBe(false)
  })

  it('returns false when AccessKeyId is empty', () => {
    expect(
      isValidAwsStsOutput({
        Credentials: {
          AccessKeyId: '',
          SecretAccessKey: 'secret',
          SessionToken: 'token',
        },
      }),
    ).toBe(false)
  })

  it('returns false when SecretAccessKey is empty', () => {
    expect(
      isValidAwsStsOutput({
        Credentials: {
          AccessKeyId: 'key',
          SecretAccessKey: '',
          SessionToken: 'token',
        },
      }),
    ).toBe(false)
  })

  it('returns false when SessionToken is empty', () => {
    expect(
      isValidAwsStsOutput({
        Credentials: {
          AccessKeyId: 'key',
          SecretAccessKey: 'secret',
          SessionToken: '',
        },
      }),
    ).toBe(false)
  })

  it('returns false when a field is missing type (AccessKeyId is number)', () => {
    expect(
      isValidAwsStsOutput({
        Credentials: {
          AccessKeyId: 123,
          SecretAccessKey: 'secret',
          SessionToken: 'token',
        },
      }),
    ).toBe(false)
  })

  it('also accepts Expiration field', () => {
    const valid = {
      Credentials: {
        AccessKeyId: 'key',
        SecretAccessKey: 'secret',
        SessionToken: 'token',
        Expiration: '2025-01-01T00:00:00Z',
      },
    }
    expect(isValidAwsStsOutput(valid)).toBe(true)
  })
})
