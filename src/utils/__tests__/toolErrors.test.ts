import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { AbortError, ShellError } from '../errors'
import { formatError, formatZodValidationError, getErrorParts } from '../toolErrors'

describe('formatError', () => {
  it('returns AbortError message', () => {
    const err = new AbortError('operation cancelled')
    expect(formatError(err)).toBe('operation cancelled')
  })

  it('returns default interrupt message for empty AbortError', () => {
    const err = new AbortError()
    const result = formatError(err)
    expect(result).toContain('interrupt')
  })

  it('formats ShellError with exit code', () => {
    const err = new ShellError('stdout', 'stderr output', 1, false)
    const result = formatError(err)
    expect(result).toContain('Exit code 1')
    expect(result).toContain('stderr output')
  })

  it('returns string representation for non-Error values', () => {
    expect(formatError('plain string')).toBe('plain string')
    expect(formatError(42)).toBe('42')
    expect(formatError(null)).toBe('null')
  })

  it('returns message for plain Error', () => {
    expect(formatError(new Error('test error'))).toBe('test error')
  })

  it('truncates very long error messages', () => {
    const long = 'x'.repeat(12000)
    const err = new Error(long)
    const result = formatError(err)
    expect(result.length).toBeLessThan(long.length)
    expect(result).toContain('truncated')
  })
})

describe('getErrorParts', () => {
  it('extracts ShellError parts', () => {
    const err = new ShellError('stdout', 'stderr text', 1, false)
    const parts = getErrorParts(err)
    expect(parts).toContain('Exit code 1')
    expect(parts).toContain('stderr text')
    expect(parts).toContain('stdout')
  })

  it('includes interrupt message for interrupted ShellError', () => {
    const err = new ShellError('', '', 130, true)
    const parts = getErrorParts(err)
    const hasInterrupt = parts.some((p) => p.includes('interrupt'))
    expect(hasInterrupt).toBe(true)
  })

  it('extracts stderr and stdout from Error-like objects', () => {
    const err = Object.assign(new Error('msg'), {
      stderr: 'error output',
      stdout: 'standard output',
    })
    const parts = getErrorParts(err)
    expect(parts).toContain('msg')
    expect(parts).toContain('error output')
    expect(parts).toContain('standard output')
  })
})

describe('formatZodValidationError', () => {
  it('falls back to error.message for unrecognized issues', () => {
    const schema = z.string()
    const result = schema.safeParse(42)
    if (result.success) throw new Error('expected failure')
    const formatted = formatZodValidationError('testTool', result.error)
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('reports missing required parameters', () => {
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({})
    if (result.success) throw new Error('expected failure')
    const formatted = formatZodValidationError('testTool', result.error)
    expect(formatted).toContain('`name`')
    expect(formatted).toContain('missing')
  })

  it('reports unexpected parameters', () => {
    const schema = z.object({}).strict()
    const result = schema.safeParse({ extra: 'value' })
    if (result.success) throw new Error('expected failure')
    const formatted = formatZodValidationError('testTool', result.error)
    expect(formatted).toContain('unexpected')
  })

  it('reports type mismatches', () => {
    const schema = z.object({ count: z.number() })
    const result = schema.safeParse({ count: 'not-a-number' })
    if (result.success) throw new Error('expected failure')
    const formatted = formatZodValidationError('testTool', result.error)
    expect(formatted).toContain('type')
  })

  it('includes tool name in error message', () => {
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({})
    if (result.success) throw new Error('expected failure')
    const formatted = formatZodValidationError('myTool', result.error)
    expect(formatted.startsWith('myTool')).toBe(true)
  })
})
