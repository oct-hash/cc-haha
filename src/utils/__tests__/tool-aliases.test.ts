import { describe, expect, it } from 'bun:test'
import { BROWSER_CLI_ALIASES, getBrowserCLICommand, isBrowserCLITool } from '../tool-aliases'

describe('isBrowserCLITool', () => {
  it('returns true for puppeteer', () => {
    expect(isBrowserCLITool('puppeteer')).toBe(true)
  })

  it('returns true for playwright', () => {
    expect(isBrowserCLITool('playwright')).toBe(true)
  })

  it('returns true for all defined aliases', () => {
    for (const alias of BROWSER_CLI_ALIASES) {
      expect(isBrowserCLITool(alias)).toBe(true)
    }
  })

  it('returns false for unknown tools', () => {
    expect(isBrowserCLITool('unknown')).toBe(false)
    expect(isBrowserCLITool('')).toBe(false)
    expect(isBrowserCLITool('chrome')).toBe(false)
  })
})

describe('getBrowserCLICommand', () => {
  it('returns npx puppeteer for puppeteer alias', () => {
    expect(getBrowserCLICommand('puppeteer')).toBe('npx puppeteer')
  })

  it('returns npx playwright for playwright alias', () => {
    expect(getBrowserCLICommand('playwright')).toBe('npx playwright')
  })

  it('returns a non-empty string for each alias', () => {
    for (const alias of BROWSER_CLI_ALIASES) {
      expect(getBrowserCLICommand(alias).length).toBeGreaterThan(0)
    }
  })
})
