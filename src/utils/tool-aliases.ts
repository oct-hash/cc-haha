/**
 * Browser CLI Tool Aliases
 *
 * Aliases for Puppeteer/Playwright CLI commands.
 * These mirror the pattern used in MODEL_ALIASES for consistency.
 */

export const BROWSER_CLI_ALIASES = [
  'puppeteer',
  'playwright',
  'chrome-headless',
  'chrome-screenshot',
  'chrome-pdf',
  'chrome-scrape',
  'chrome-evaluate',
] as const

export type BrowserCLITool = (typeof BROWSER_CLI_ALIASES)[number]

/**
 * Maps browser CLI aliases to their actual commands.
 * These are used by the BrowserTool to invoke the correct script.
 */
export const BROWSER_CLI_COMMANDS: Record<BrowserCLITool, string> = {
  puppeteer: 'npx puppeteer',
  playwright: 'npx playwright',
  'chrome-headless': 'google-chrome --headless --dump-dom',
  'chrome-screenshot': 'D:/hermes-kb/scripts/browser-cli/screenshot.js',
  'chrome-pdf': 'D:/hermes-kb/scripts/browser-cli/pdf.js',
  'chrome-scrape': 'D:/hermes-kb/scripts/browser-cli/scraper.js',
  'chrome-evaluate': 'D:/hermes-kb/scripts/browser-cli/evaluate.js',
} as const

/**
 * Check if a string is a valid browser CLI alias
 */
export function isBrowserCLITool(tool: string): tool is BrowserCLITool {
  return BROWSER_CLI_ALIASES.includes(tool as BrowserCLITool)
}

/**
 * Get the command for a browser CLI alias
 */
export function getBrowserCLICommand(tool: BrowserCLITool): string {
  return BROWSER_CLI_COMMANDS[tool]
}
