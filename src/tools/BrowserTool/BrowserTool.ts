import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { BROWSER_CLI_COMMANDS, type BrowserCLITool } from '../../utils/tool-aliases.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import type { ExecResult } from '../../utils/ShellCommand.js'
import { exec } from '../../utils/Shell.js'

const DESCRIPTION = 'Browser automation tool for screenshots, PDF generation, DOM scraping, and JavaScript evaluation using Puppeteer'
const PROMPT = 'Execute browser automation commands: screenshot (capture page screenshots), pdf (generate PDF from pages), scrape (extract DOM content), evaluate (run JavaScript in page context)'

// Input schema for browser operations
export const inputSchema = z.object({
  operation: z.enum(['screenshot', 'pdf', 'scrape', 'evaluate']).describe('Browser operation to perform'),
  url: z.string().url().describe('URL of the page to operate on'),
  outputPath: z.string().optional().describe('Output file path (PNG for screenshot, PDF for pdf, JSON for scrape/evaluate)'),
  selector: z.string().optional().describe('CSS selector for scrape operation'),
  jsCode: z.string().optional().describe('JavaScript code for evaluate operation'),
  width: z.number().optional().default(1280).describe('Viewport width'),
  height: z.number().optional().default(720).describe('Viewport height'),
  options: z.object({
    landscape: z.boolean().optional().default(false).describe('PDF landscape mode'),
    format: z.enum(['A4', 'Letter', 'Legal']).optional().default('A4').describe('PDF page format'),
    printBackground: z.boolean().optional().default(true).describe('Print background colors'),
  }).optional().describe('Additional options'),
})

type InputSchema = z.infer<typeof inputSchema>

const outputSchema = z.object({
  success: z.boolean(),
  outputPath: z.string().optional(),
  data: z.string().optional(),
  error: z.string().optional(),
})
type OutputSchema = z.infer<typeof outputSchema>
type Output = OutputSchema

async function runBrowserOperation(input: InputSchema): Promise<Output> {
  const { operation, url, outputPath, selector, jsCode, width, height, options } = input

  try {
    switch (operation) {
      case 'screenshot': {
        const output = outputPath || 'screenshot.png'
        const script = BROWSER_CLI_COMMANDS['chrome-screenshot']
        const result = await exec(`node "${script}" "${url}" "${output}" ${width || 1280} ${height || 720}`)
        return {
          success: result.exitCode === 0,
          outputPath: output,
          data: result.stdout,
          error: result.exitCode !== 0 ? result.stderr : undefined,
        }
      }

      case 'pdf': {
        const output = outputPath || 'output.pdf'
        const script = BROWSER_CLI_COMMANDS['chrome-pdf']
        const opts = options || {}
        const formatArgs = `--format ${opts.format || 'A4'}`
        const landscapeArgs = opts.landscape ? '--landscape' : ''
        const backgroundArgs = opts.printBackground ? '' : '--no-print-background'
        const result = await exec(`node "${script}" "${url}" "${output}" ${formatArgs} ${landscapeArgs} ${backgroundArgs}`)
        return {
          success: result.exitCode === 0,
          outputPath: output,
          data: result.stdout,
          error: result.exitCode !== 0 ? result.stderr : undefined,
        }
      }

      case 'scrape': {
        const output = outputPath || null
        const script = BROWSER_CLI_COMMANDS['chrome-scrape']
        const sel = selector || 'body'
        let result: ExecResult
        if (output) {
          result = await exec(`node "${script}" "${url}" "${sel}" "${output}"`)
        } else {
          result = await exec(`node "${script}" "${url}" "${sel}"`)
        }
        return {
          success: result.exitCode === 0,
          outputPath: output || undefined,
          data: result.stdout,
          error: result.exitCode !== 0 ? result.stderr : undefined,
        }
      }

      case 'evaluate': {
        if (!jsCode) {
          return {
            success: false,
            error: 'JavaScript code is required for evaluate operation',
          }
        }
        const output = outputPath || null
        const script = BROWSER_CLI_COMMANDS['chrome-evaluate']
        // Escape quotes in jsCode for shell
        const escapedCode = jsCode.replace(/"/g, '\\"')
        let result: ExecResult
        if (output) {
          result = await exec(`node "${script}" "${url}" "${escapedCode}" "${output}"`)
        } else {
          result = await exec(`node "${script}" "${url}" "${escapedCode}"`)
        }
        return {
          success: result.exitCode === 0,
          outputPath: output || undefined,
          data: result.stdout,
          error: result.exitCode !== 0 ? result.stderr : undefined,
        }
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const BrowserTool = buildTool({
  isMcp: false,
  name: 'browser',
  maxResultSizeChars: 50_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema
  },
  get outputSchema(): OutputSchema {
    return outputSchema
  },
  async call(input: InputSchema): Promise<Output> {
    return runBrowserOperation(input)
  },
  async checkPermissions(): Promise<PermissionResult> {
    return {
      behavior: 'prompt',
      message: 'BrowserTool requires permission to run puppeteer scripts and access the network.',
    }
  },
  userFacingName: () => 'browser',
} satisfies ToolDef<InputSchema, Output>)
