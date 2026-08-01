import { describe, expect, it } from 'bun:test'
import { stripDisplayTags, stripDisplayTagsAllowEmpty, stripIdeContextTags } from '../displayTags'

describe('stripDisplayTags', () => {
  it('returns text unchanged when no tags present', () => {
    expect(stripDisplayTags('Hello world')).toBe('Hello world')
  })

  it('strips XML-like tag blocks', () => {
    // With surrounding text, the tag block is stripped
    expect(stripDisplayTags('before <foo>bar</foo> after')).toBe('before  after')
  })

  it('strips multi-line tag content with surrounding text', () => {
    expect(stripDisplayTags('before <foo>line1\nline2</foo> after')).toBe('before  after')
  })

  it('does not strip uppercase tags (JSX/HTML)', () => {
    expect(stripDisplayTags('<Button>Click</Button>')).toBe('<Button>Click</Button>')
  })

  it('does not strip self-closing or unmatched brackets', () => {
    expect(stripDisplayTags('x < y and a > b')).toBe('x < y and a > b')
  })

  it('returns original text if stripping would produce empty string', () => {
    // When only a tag block exists, result would be "" — returns original
    expect(stripDisplayTags('<foo>bar</foo>')).toBe('<foo>bar</foo>')
  })

  it('preserves text surrounding tags', () => {
    expect(stripDisplayTags('prefix <foo>bar</foo> suffix')).toBe('prefix  suffix')
  })

  it('strips tags with attributes', () => {
    expect(stripDisplayTags('keep <foo attr="val">content</foo> keep')).toBe('keep  keep')
  })
})

describe('stripDisplayTagsAllowEmpty', () => {
  it('returns empty string when all content is tags', () => {
    expect(stripDisplayTagsAllowEmpty('<foo>bar</foo>')).toBe('')
  })

  it('preserves surrounding text', () => {
    expect(stripDisplayTagsAllowEmpty('keep <tag>drop</tag> keep')).toBe('keep  keep')
  })
})

describe('stripIdeContextTags', () => {
  it('strips ide_opened_file tags', () => {
    expect(stripIdeContextTags('<ide_opened_file>src/main.ts</ide_opened_file>')).toBe('')
  })

  it('strips ide_selection tags', () => {
    expect(stripIdeContextTags('<ide_selection>selected text</ide_selection>')).toBe('')
  })

  it('does not strip other lowercase tags', () => {
    expect(stripIdeContextTags('<code>foo</code>')).toBe('<code>foo</code>')
  })

  it('preserves text around IDE tags', () => {
    expect(stripIdeContextTags('query <ide_opened_file>src/a.ts</ide_opened_file> end')).toBe(
      'query  end',
    )
  })
})
