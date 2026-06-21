// Server checks: probe MCP server connectivity

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readJSON } from '../utils/helpers'
import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

interface McpServerEntry {
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>
}

export async function runServerChecks(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now()
  const mcpPath = join(ctx.rootDir, '.claude', 'mcp.json')
  const details: DetailItem[] = []

  if (!existsSync(mcpPath)) {
    return {
      id: 'server-checks',
      title: 'MCP Server Checks',
      status: 'skipped',
      durationMs: Date.now() - started,
      category: 'integration',
      skipReason: 'mcp.json not found',
    }
  }

  const config = readJSON<McpConfig>(mcpPath)
  if (!config?.mcpServers || Object.keys(config.mcpServers).length === 0) {
    return {
      id: 'server-checks',
      title: 'MCP Server Checks',
      status: 'skipped',
      durationMs: Date.now() - started,
      category: 'integration',
      skipReason: 'No MCP servers configured',
    }
  }

  const servers = config.mcpServers
  let hasErrors = false

  for (const [name, entry] of Object.entries(servers)) {
    // HTTP/SSE transport
    if (entry.url) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const start = Date.now()
        const response = await fetch(entry.url, {
          method: 'HEAD',
          signal: controller.signal,
        }).catch(() => null)
        clearTimeout(timeout)

        const latency = Date.now() - start

        if (response) {
          details.push({
            label: `${name} (HTTP)`,
            status: 'ok',
            message: `${response.status} ${response.statusText} — ${latency}ms`,
          })
        } else {
          details.push({
            label: `${name} (HTTP)`,
            status: 'warn',
            message: `No response from ${entry.url} (${latency}ms timeout)`,
          })
        }
      } catch {
        details.push({
          label: `${name} (HTTP)`,
          status: 'warn',
          message: `Connection failed to ${entry.url}`,
        })
        hasErrors = true
      }
      continue
    }

    // stdio transport — check command binary exists
    if (entry.command) {
      const resolvedCommand = entry.command.includes('/') || entry.command.includes('\\')
        ? entry.command
        : entry.command // just check by name for PATH binaries
      const exists = existsSync(resolvedCommand) || commandInPath(entry.command)
      details.push({
        label: `${name} (stdio)`,
        status: exists ? 'ok' : 'warn',
        message: exists
          ? `Command found: ${entry.command}`
          : `Command not found: ${entry.command}`,
      })
      if (!exists) hasErrors = true
      continue
    }

    details.push({
      label: `${name}`,
      status: 'warn',
      message: 'Unknown transport (no url or command)',
    })
  }

  return {
    id: 'server-checks',
    title: 'MCP Server Checks',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'integration',
    description: `Probed ${Object.keys(servers).length} MCP server(s)`,
    details,
  }
}

function commandInPath(cmd: string): boolean {
  try {
    const proc = Bun.spawnSync(['where', cmd], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    return proc.exitCode === 0
  } catch {
    return false
  }
}
