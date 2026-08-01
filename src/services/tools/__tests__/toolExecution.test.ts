import { describe, expect, it } from 'bun:test'
import { TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../../utils/errors'
import { classifyToolError } from '../toolExecution'

describe('classifyToolError', () => {
  it('extracts telemetryMessage from TelemetrySafeError', () => {
    const err = new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      'full message',
      'safe telemetry',
    )
    expect(classifyToolError(err)).toBe('safe telemetry')
  })

  it('falls back to message when telemetryMessage is not provided', () => {
    const err = new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      'same message for both',
    )
    expect(classifyToolError(err)).toBe('same message for both')
  })

  it('truncates long telemetry messages to 200 chars', () => {
    const long = 'x'.repeat(300)
    const err = new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS('full', long)
    expect(classifyToolError(err)).toBe(long.slice(0, 200))
  })

  it('extracts errno code from filesystem errors', () => {
    const err = Object.assign(new Error('file not found'), { code: 'ENOENT' })
    expect(classifyToolError(err)).toBe('Error:ENOENT')
  })

  it('extracts EACCES code from permission errors', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    expect(classifyToolError(err)).toBe('Error:EACCES')
  })

  it('uses error name when it is not "Error" and longer than 3 chars', () => {
    class ShellError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'ShellError'
      }
    }
    expect(classifyToolError(new ShellError('bash failed'))).toBe('ShellError')
  })

  it('falls back to "Error" for plain Error instances', () => {
    expect(classifyToolError(new Error('something went wrong'))).toBe('Error')
  })

  it('falls back to "Error" for Error with short name', () => {
    const err = new Error('test')
    err.name = 'Ab'
    expect(classifyToolError(err)).toBe('Error')
  })

  it('falls back to "Error" for Error with name equal to "Error"', () => {
    expect(classifyToolError(new Error('test'))).toBe('Error')
  })

  it('returns "UnknownError" for non-Error values', () => {
    expect(classifyToolError('string error')).toBe('UnknownError')
  })

  it('returns "UnknownError" for null', () => {
    expect(classifyToolError(null)).toBe('UnknownError')
  })

  it('returns "UnknownError" for plain objects without Error prototype', () => {
    expect(classifyToolError({ message: 'looks like error' })).toBe('UnknownError')
  })

  it('prioritizes errno code over error name', () => {
    const err = Object.assign(new Error('denied'), {
      code: 'EACCES',
      name: 'FancyError',
    })
    // errno code check comes first
    expect(classifyToolError(err)).toBe('Error:EACCES')
  })

  it('handles undefined gracefully', () => {
    expect(classifyToolError(undefined)).toBe('UnknownError')
  })
})
