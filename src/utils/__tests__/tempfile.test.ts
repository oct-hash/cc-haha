import { describe, expect, it } from 'bun:test'
import { tmpdir } from 'os'
import { generateTempFilePath } from '../tempfile'

describe('generateTempFilePath', () => {
  it('returns path in tmp directory', () => {
    const path = generateTempFilePath()
    expect(path.startsWith(tmpdir())).toBe(true)
  })

  it('includes default prefix', () => {
    const path = generateTempFilePath()
    const filename = path.replace(tmpdir(), '')
    expect(filename).toMatch(/^[/\\].*claude-prompt/)
  })

  it('uses custom prefix', () => {
    const path = generateTempFilePath('custom-prefix')
    const filename = path.replace(tmpdir(), '')
    expect(filename).toMatch(/custom-prefix/)
  })

  it('uses default .md extension', () => {
    const path = generateTempFilePath()
    expect(path.endsWith('.md')).toBe(true)
  })

  it('uses custom extension', () => {
    const path = generateTempFilePath('p', '.txt')
    expect(path.endsWith('.txt')).toBe(true)
  })

  it('generates consistent path with contentHash option', () => {
    const a = generateTempFilePath('p', '.md', { contentHash: 'same content' })
    const b = generateTempFilePath('p', '.md', { contentHash: 'same content' })
    expect(a).toBe(b)
  })

  it('generates different paths for different contentHash', () => {
    const a = generateTempFilePath('p', '.md', { contentHash: 'content A' })
    const b = generateTempFilePath('p', '.md', { contentHash: 'content B' })
    expect(a).not.toBe(b)
  })

  it('generates different paths without contentHash (random UUID)', () => {
    const a = generateTempFilePath()
    const b = generateTempFilePath()
    expect(a).not.toBe(b)
  })
})
