import { describe, expect, it } from 'bun:test'
import { createHyperlink, OSC8_END, OSC8_START } from '../hyperlink'

describe('createHyperlink', () => {
  it('wraps url in OSC 8 escape sequences when supported', () => {
    const result = createHyperlink('https://example.com', undefined, {
      supportsHyperlinks: true,
    })
    expect(result).toContain(OSC8_START)
    expect(result).toContain('https://example.com')
    expect(result).toContain(OSC8_END)
    expect(result.startsWith(OSC8_START)).toBe(true)
  })

  it('returns plain url when hyperlinks not supported', () => {
    const result = createHyperlink('https://example.com', undefined, {
      supportsHyperlinks: false,
    })
    expect(result).toBe('https://example.com')
  })

  it('uses content as display text when provided', () => {
    const result = createHyperlink('https://example.com', 'click here', {
      supportsHyperlinks: true,
    })
    expect(result).toContain('click here')
    // URL is always in the OSC8 escape sequence; display text is the content
    expect(result).toContain(`${OSC8_START}https://example.com${OSC8_END}`)
  })

  it('uses URL as display text when content is omitted', () => {
    const result = createHyperlink('https://example.com', undefined, {
      supportsHyperlinks: true,
    })
    expect(result).toContain('https://example.com')
  })
})
