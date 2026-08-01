import { describe, expect, it } from 'bun:test'
import type { AssistantMessage, UserMessage } from '../../types/message'
import { computeFingerprint, extractFirstMessageText, FINGERPRINT_SALT } from '../fingerprint'

describe('extractFirstMessageText', () => {
  it('returns text from first user message with string content', () => {
    const messages: (UserMessage | AssistantMessage)[] = [
      {
        type: 'user',
        message: { role: 'user', content: 'hello world' },
      } as UserMessage,
    ]
    expect(extractFirstMessageText(messages)).toBe('hello world')
  })

  it('returns text from content array with text block', () => {
    const messages: (UserMessage | AssistantMessage)[] = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'from array' }],
        },
      } as UserMessage,
    ]
    expect(extractFirstMessageText(messages)).toBe('from array')
  })

  it('skips non-text blocks in content array', () => {
    const messages: (UserMessage | AssistantMessage)[] = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'image', source: {} },
            { type: 'text', text: 'after image' },
          ],
        },
      } as UserMessage,
    ]
    expect(extractFirstMessageText(messages)).toBe('after image')
  })

  it('returns empty string when no user message exists', () => {
    const messages: AssistantMessage[] = [
      {
        type: 'assistant',
        message: { role: 'assistant', content: 'reply' },
      } as AssistantMessage,
    ]
    expect(extractFirstMessageText(messages)).toBe('')
  })

  it('returns empty string for empty messages array', () => {
    expect(extractFirstMessageText([])).toBe('')
  })

  it('returns empty string when content array has no text block', () => {
    const messages: (UserMessage | AssistantMessage)[] = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'image', source: {} }],
        },
      } as UserMessage,
    ]
    expect(extractFirstMessageText(messages)).toBe('')
  })

  it('grabs only the first user message', () => {
    const messages: (UserMessage | AssistantMessage)[] = [
      {
        type: 'user',
        message: { role: 'user', content: 'first' },
      } as UserMessage,
      {
        type: 'user',
        message: { role: 'user', content: 'second' },
      } as UserMessage,
    ]
    expect(extractFirstMessageText(messages)).toBe('first')
  })
})

describe('computeFingerprint', () => {
  it('returns a 3-character hex string', () => {
    const fp = computeFingerprint('hello world', '1.0.0')
    expect(fp.length).toBe(3)
    expect(/^[0-9a-f]{3}$/.test(fp)).toBe(true)
  })

  it('uses "0" for indices beyond string length', () => {
    // String "ab" has no char at index 4, 7, 20 → all "0"
    // SHA256(salt + "000" + version)[:3]
    const fp = computeFingerprint('ab', '1.0.0')
    expect(fp.length).toBe(3)
  })

  it('produces different fingerprints for different inputs', () => {
    const fp1 = computeFingerprint('hello world', '1.0.0')
    const fp2 = computeFingerprint('goodbye world', '1.0.0')
    expect(fp1).not.toBe(fp2)
  })

  it('produces different fingerprints for different versions', () => {
    const fp1 = computeFingerprint('hello world', '1.0.0')
    const fp2 = computeFingerprint('hello world', '2.0.0')
    expect(fp1).not.toBe(fp2)
  })

  it('is deterministic', () => {
    const fp1 = computeFingerprint('test input here', '3.2.1')
    const fp2 = computeFingerprint('test input here', '3.2.1')
    expect(fp1).toBe(fp2)
  })
})

describe('FINGERPRINT_SALT', () => {
  it('is a non-empty string', () => {
    expect(typeof FINGERPRINT_SALT).toBe('string')
    expect(FINGERPRINT_SALT.length).toBeGreaterThan(0)
  })
})
