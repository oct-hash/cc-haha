import { describe, expect, it } from 'bun:test'
import { parseDirectMemberMessage } from '../directMemberMessage'

describe('parseDirectMemberMessage', () => {
  it('parses @agent-name followed by message', () => {
    const result = parseDirectMemberMessage('@coder please review this PR')
    expect(result).toEqual({
      recipientName: 'coder',
      message: 'please review this PR',
    })
  })

  it('handles hyphenated agent names', () => {
    const result = parseDirectMemberMessage('@code-reviewer check the diff')
    expect(result).toEqual({
      recipientName: 'code-reviewer',
      message: 'check the diff',
    })
  })

  it('handles underscore in agent name', () => {
    const result = parseDirectMemberMessage('@my_agent hello world')
    expect(result).toEqual({
      recipientName: 'my_agent',
      message: 'hello world',
    })
  })

  it('returns null when no @mention prefix', () => {
    expect(parseDirectMemberMessage('hello world')).toBeNull()
  })

  it('returns null when @mention has no space after name', () => {
    expect(parseDirectMemberMessage('@agent')).toBeNull()
  })

  it('returns null when @mention has empty message', () => {
    expect(parseDirectMemberMessage('@agent   ')).toBeNull()
  })

  it('trims trailing whitespace from message', () => {
    const result = parseDirectMemberMessage('@bot  do the thing   ')
    expect(result).toEqual({
      recipientName: 'bot',
      message: 'do the thing',
    })
  })

  it('preserves newlines in message (s flag)', () => {
    const result = parseDirectMemberMessage('@bot line1\nline2')
    expect(result).toEqual({
      recipientName: 'bot',
      message: 'line1\nline2',
    })
  })

  it('does not match @ at non-start position', () => {
    expect(parseDirectMemberMessage('say @agent hello')).toBeNull()
  })
})
