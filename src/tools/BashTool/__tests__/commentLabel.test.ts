import { describe, it, expect } from 'bun:test'
import { extractBashCommentLabel } from '../commentLabel'

describe('extractBashCommentLabel', () => {
  it('extracts label from comment line', () => {
    expect(extractBashCommentLabel('# List files\nls -la')).toBe('List files')
  })

  it('returns undefined for non-comment first line', () => {
    expect(extractBashCommentLabel('ls -la')).toBeUndefined()
  })

  it('returns undefined for shebang', () => {
    expect(extractBashCommentLabel('#!/bin/bash\necho hi')).toBeUndefined()
  })

  it('handles multi-# prefix', () => {
    expect(extractBashCommentLabel('## Section header\necho hi')).toBe('Section header')
  })

  it('handles single-line command (no newline)', () => {
    expect(extractBashCommentLabel('# Install dependencies')).toBe('Install dependencies')
  })

  it('returns undefined for whitespace-only label', () => {
    expect(extractBashCommentLabel('# ')).toBeUndefined()
  })

  it('returns undefined for empty command', () => {
    expect(extractBashCommentLabel('')).toBeUndefined()
  })
})
