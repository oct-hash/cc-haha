import { describe, expect, it } from 'bun:test'
import { matchesKeepGoingKeyword, matchesNegativeKeyword } from '../userPromptKeywords'

describe('matchesNegativeKeyword', () => {
  it('detects "wtf" as negative', () => {
    expect(matchesNegativeKeyword('wtf is this')).toBe(true)
  })

  it('detects "shit" as negative', () => {
    expect(matchesNegativeKeyword('this is shit')).toBe(true)
  })

  it('detects "fucking broken" as negative', () => {
    expect(matchesNegativeKeyword('this is fucking broken')).toBe(true)
  })

  it('does not flag neutral input', () => {
    expect(matchesNegativeKeyword('hello world')).toBe(false)
  })

  it('is case insensitive', () => {
    expect(matchesNegativeKeyword('WTF')).toBe(true)
  })

  it('matches word boundaries only', () => {
    // "shit" should only match as a whole word
    expect(matchesNegativeKeyword('shitzu')).toBe(false)
  })

  it('detects "screw this" as negative', () => {
    expect(matchesNegativeKeyword('screw this')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(matchesNegativeKeyword('')).toBe(false)
  })
})

describe('matchesKeepGoingKeyword', () => {
  it('matches exact "continue"', () => {
    expect(matchesKeepGoingKeyword('continue')).toBe(true)
  })

  it('does not match "continue" as part of longer text', () => {
    expect(matchesKeepGoingKeyword('please continue working')).toBe(false)
  })

  it('matches "keep going"', () => {
    expect(matchesKeepGoingKeyword('keep going')).toBe(true)
  })

  it('matches "go on"', () => {
    expect(matchesKeepGoingKeyword('go on')).toBe(true)
  })

  it('does not flag unrelated input', () => {
    expect(matchesKeepGoingKeyword('what is the weather')).toBe(false)
  })
})
