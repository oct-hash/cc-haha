import { describe, expect, it } from 'bun:test'
import { eagerParseCliFlag, extractArgsAfterDoubleDash } from '../cliArgs'

describe('eagerParseCliFlag', () => {
  it('parses --flag=value syntax', () => {
    expect(eagerParseCliFlag('--settings', ['node', 'app', '--settings=/path'])).toBe('/path')
  })

  it('parses --flag value syntax', () => {
    expect(eagerParseCliFlag('--settings', ['node', 'app', '--settings', '/path'])).toBe('/path')
  })

  it('returns undefined when flag is not present', () => {
    expect(eagerParseCliFlag('--settings', ['node', 'app'])).toBeUndefined()
  })

  it('returns undefined for empty argv', () => {
    expect(eagerParseCliFlag('--settings', [])).toBeUndefined()
  })

  it('handles flag with empty value via equals syntax', () => {
    expect(eagerParseCliFlag('--flag', ['--flag='])).toBe('')
  })

  it('handles equals-separated flag with value containing equals', () => {
    expect(eagerParseCliFlag('--config', ['--config=a=b=c'])).toBe('a=b=c')
  })

  it('does not match partial flag names', () => {
    expect(eagerParseCliFlag('--settings', ['node', '--settings-file=/path'])).toBeUndefined()
  })

  it('returns value after flag even if next arg looks like another flag', () => {
    expect(eagerParseCliFlag('--settings', ['--settings', '--other'])).toBe('--other')
  })
})

describe('extractArgsAfterDoubleDash', () => {
  it('passes through command when not "--"', () => {
    const result = extractArgsAfterDoubleDash('status', ['--verbose'])
    expect(result).toEqual({ command: 'status', args: ['--verbose'] })
  })

  it('extracts command after "--" separator', () => {
    const result = extractArgsAfterDoubleDash('--', ['status', '--verbose'])
    expect(result).toEqual({ command: 'status', args: ['--verbose'] })
  })

  it('passes through when "--" but no args follow', () => {
    const result = extractArgsAfterDoubleDash('--', [])
    expect(result).toEqual({ command: '--', args: [] })
  })

  it('returns empty args when none provided', () => {
    const result = extractArgsAfterDoubleDash('help')
    expect(result).toEqual({ command: 'help', args: [] })
  })

  it('handles multiple args after "--"', () => {
    const result = extractArgsAfterDoubleDash('--', ['subcmd', '--flag', 'arg'])
    expect(result).toEqual({ command: 'subcmd', args: ['--flag', 'arg'] })
  })
})
