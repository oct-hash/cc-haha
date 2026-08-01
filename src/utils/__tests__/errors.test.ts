import { describe, it, expect } from 'bun:test'
import {
  ClaudeError,
  AbortError,
  ConfigParseError,
  ShellError,
  isAbortError,
  hasExactErrorMessage,
  toError,
  errorMessage,
  isENOENT,
} from '../errors'

describe('ClaudeError', () => {
  it('sets name to class name', () => {
    const e = new ClaudeError('test')
    expect(e.name).toBe('ClaudeError')
    expect(e.message).toBe('test')
    expect(e).toBeInstanceOf(Error)
  })
})

describe('AbortError', () => {
  it('creates with default message', () => {
    const e = new AbortError()
    expect(e.name).toBe('AbortError')
  })

  it('creates with custom message', () => {
    const e = new AbortError('cancelled')
    expect(e.name).toBe('AbortError')
    expect(e.message).toBe('cancelled')
  })
})

describe('isAbortError', () => {
  it('matches AbortError', () => {
    expect(isAbortError(new AbortError())).toBe(true)
  })

  it('matches Error with name AbortError', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(isAbortError(e)).toBe(true)
  })

  it('rejects regular Error', () => {
    expect(isAbortError(new Error('fail'))).toBe(false)
  })

  it('rejects non-Error values', () => {
    expect(isAbortError('abort')).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(42)).toBe(false)
  })
})

describe('ConfigParseError', () => {
  it('stores filePath and defaultConfig', () => {
    const e = new ConfigParseError('bad json', '/path/.claude/settings.json', { theme: 'dark' })
    expect(e.name).toBe('ConfigParseError')
    expect(e.filePath).toBe('/path/.claude/settings.json')
    expect(e.defaultConfig).toEqual({ theme: 'dark' })
  })
})

describe('ShellError', () => {
  it('stores stdout/stderr/code attributes', () => {
    const e = new ShellError('out', 'err', 1, false)
    expect(e.stdout).toBe('out')
    expect(e.stderr).toBe('err')
    expect(e.code).toBe(1)
    expect(e.interrupted).toBe(false)
    expect(e.message).toBe('Shell command failed')
  })
})

describe('hasExactErrorMessage', () => {
  it('matches exact message', () => {
    expect(hasExactErrorMessage(new Error('not found'), 'not found')).toBe(true)
  })

  it('rejects partial match', () => {
    expect(hasExactErrorMessage(new Error('file not found'), 'not found')).toBe(false)
  })

  it('rejects non-Error', () => {
    expect(hasExactErrorMessage('some string', 'some string')).toBe(false)
  })
})

describe('toError', () => {
  it('returns Error as-is', () => {
    const e = new Error('test')
    expect(toError(e)).toBe(e)
  })

  it('wraps string into Error', () => {
    const e = toError('fail')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('fail')
  })

  it('wraps number into Error', () => {
    const e = toError(42)
    expect(e.message).toBe('42')
  })
})

describe('errorMessage', () => {
  it('extracts from Error', () => {
    const msg = errorMessage(new Error('oops'))
    expect(msg).toContain('oops')
  })

  it('stringifies non-Error', () => {
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
    expect(errorMessage('plain')).toBe('plain')
  })
})

describe('isENOENT', () => {
  it('matches ENOENT code', () => {
    const e = Object.assign(new Error('no such file'), { code: 'ENOENT' })
    expect(isENOENT(e)).toBe(true)
  })

  it('rejects other codes', () => {
    const e = Object.assign(new Error('permission'), { code: 'EACCES' })
    expect(isENOENT(e)).toBe(false)
  })

  it('rejects error without code', () => {
    expect(isENOENT(new Error('fail'))).toBe(false)
  })
})
