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
  let hasErrors = false

  // Agent-reach CLI tool checks (always run)
  const reachDetails = checkAgentReachTools()
  details.push(...reachDetails)
  if (reachDetails.some((d) => d.status === 'error')) hasErrors = true

  // MCP server connectivity checks
  if (!existsSync(mcpPath)) {
    details.push({
      label: 'MCP servers',
      status: 'warn',
      message: 'mcp.json not found',
    })
  } else {
    const config = readJSON<McpConfig>(mcpPath)
    if (!config?.mcpServers || Object.keys(config.mcpServers).length === 0) {
      details.push({
        label: 'MCP servers',
        status: 'warn',
        message: 'No MCP servers configured',
      })
    } else {
      const servers = config.mcpServers

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
    }
  }

  return {
    id: 'server-checks',
    title: 'Server & Tool Checks',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'integration',
    description: 'Probed MCP servers + agent-reach CLI tools',
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

/** Check agent-reach CLI tool availability (3 tiers) */
function checkAgentReachTools(): DetailItem[] {
  const results: DetailItem[] = []

  // Tier 1 — Core (missing = error)
  const coreTools = [
    { cmd: 'agent-reach', label: 'agent-reach (router)' },
    { cmd: 'mcporter', label: 'mcporter (MCP bridge)' },
  ]
  for (const { cmd, label } of coreTools) {
    const found = commandInPath(cmd)
    results.push({
      label,
      status: found ? 'ok' : 'error',
      message: found ? `${cmd} found` : `${cmd} not in PATH`,
    })
  }

  // Tier 2 — Zero-config (missing = warn)
  const zeroConfigTools = [
    { cmd: 'gh', label: 'GitHub CLI' },
    { cmd: 'yt-dlp', label: 'yt-dlp (video)' },
    { cmd: 'bili', label: 'bili-cli (B站)' },
    { cmd: 'curl', label: 'curl (web/V2EX)' },
  ]
  for (const { cmd, label } of zeroConfigTools) {
    const found = commandInPath(cmd)
    results.push({
      label,
      status: found ? 'ok' : 'warn',
      message: found ? `${cmd} found` : `${cmd} not in PATH`,
    })
  }

  // Tier 3 — Login-required (info only, never fail)
  const loginTools = [
    { cmd: 'opencli', label: 'opencli (OpenCLI bridge)' },
    { cmd: 'twitter', label: 'twitter-cli' },
    { cmd: 'rdt', label: 'rdt-cli (Reddit)' },
    { cmd: 'xhs', label: 'xhs-cli (xiaohongshu legacy)' },
  ]
  for (const { cmd, label } of loginTools) {
    const found = commandInPath(cmd)
    results.push({
      label,
      status: 'ok',
      message: found ? `${cmd} found` : `${cmd} not installed (login-required, optional)`,
    })
  }

  return results
}
