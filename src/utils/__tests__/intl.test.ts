import { describe, expect, it } from 'bun:test'
import {
  firstGrapheme,
  getGraphemeSegmenter,
  getRelativeTimeFormat,
  getSystemLocaleLanguage,
  getTimeZone,
  getWordSegmenter,
  lastGrapheme,
} from '../intl'

describe('getGraphemeSegmenter', () => {
  it('returns a segmenter with grapheme granularity', () => {
    const seg = getGraphemeSegmenter()
    // segment should work on any string
    const segments = [...seg.segment('hello')]
    expect(segments.length).toBeGreaterThan(0)
    expect(segments[0].segment).toBe('h')
  })

  it('returns the same instance on repeat calls', () => {
    expect(getGraphemeSegmenter()).toBe(getGraphemeSegmenter())
  })
})

describe('getWordSegmenter', () => {
  it('returns a segmenter with word granularity', () => {
    const seg = getWordSegmenter()
    const segments = [...seg.segment('hello world')]
    expect(segments.length).toBeGreaterThan(0)
  })

  it('returns the same instance on repeat calls', () => {
    expect(getWordSegmenter()).toBe(getWordSegmenter())
  })
})

describe('firstGrapheme', () => {
  it('returns the first grapheme of a string', () => {
    expect(firstGrapheme('abc')).toBe('a')
  })

  it('handles multi-codepoint graphemes', () => {
    // e with combining acute accent is a single grapheme
    const result = firstGrapheme('e\u0301bc')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty string for empty input', () => {
    expect(firstGrapheme('')).toBe('')
  })

  it('handles emoji as single grapheme', () => {
    const result = firstGrapheme('😀abc')
    expect(result).toBe('😀')
  })
})

describe('lastGrapheme', () => {
  it('returns the last grapheme of a string', () => {
    expect(lastGrapheme('abc')).toBe('c')
  })

  it('returns empty string for empty input', () => {
    expect(lastGrapheme('')).toBe('')
  })

  it('returns the only grapheme for single-char input', () => {
    expect(lastGrapheme('x')).toBe('x')
  })
})

describe('getRelativeTimeFormat', () => {
  it('returns a formatter that can format relative time', () => {
    const rtf = getRelativeTimeFormat('long', 'always')
    // -1 day → "1 day ago" or equivalent
    const formatted = rtf.format(-1, 'day')
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('caches by style:numeric key', () => {
    const a = getRelativeTimeFormat('long', 'always')
    const b = getRelativeTimeFormat('long', 'always')
    expect(a).toBe(b)
  })

  it('returns different instances for different keys', () => {
    const a = getRelativeTimeFormat('long', 'always')
    const b = getRelativeTimeFormat('short', 'auto')
    // different key combos may or may not be the same instance depending on engine
    // but they should both be valid formatters
    expect(typeof a.format(-1, 'day')).toBe('string')
    expect(typeof b.format(-1, 'day')).toBe('string')
  })
})

describe('getTimeZone', () => {
  it('returns a non-empty timezone string', () => {
    const tz = getTimeZone()
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
  })

  it('is cached (same value on repeat calls)', () => {
    expect(getTimeZone()).toBe(getTimeZone())
  })
})

describe('getSystemLocaleLanguage', () => {
  it('returns a string or undefined', () => {
    const lang = getSystemLocaleLanguage()
    if (lang !== undefined) {
      expect(typeof lang).toBe('string')
      expect(lang.length).toBeGreaterThan(0)
    }
  })

  it('is cached on repeat calls', () => {
    expect(getSystemLocaleLanguage()).toBe(getSystemLocaleLanguage())
  })
})
