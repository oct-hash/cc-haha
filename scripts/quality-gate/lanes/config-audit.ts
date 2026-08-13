// Configuration audit lane: deep validation of .env, .mcp.json, settings.json

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJSON } from '../utils/helpers'
import type { DetailItem, LaneExecutionContext, LaneResult } from './types'

export async function runConfigAudit(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now()
  const details: DetailItem[] = []
  let hasErrors = false
  const rootDir = ctx.rootDir

  // 1. .env.example vs .env key parity
  const envExample = join(rootDir, '.env.example')
  const envFile = join(rootDir, '.env')
  if (existsSync(envExample)) {
    const exampleKeys = parseEnvKeys(envExample)
    if (existsSync(envFile)) {
      const envKeys = parseEnvKeys(envFile)
      const missingInEnv = exampleKeys.filter((k) => !envKeys.includes(k))
      if (missingInEnv.length > 0) {
        details.push({
          label: '.env.example → .env parity',
          status: 'warn',
          message: `${missingInEnv.length} keys in .env.example not in .env: ${missingInEnv.slice(0, 5).join(', ')}${missingInEnv.length > 5 ? '...' : ''}`,
        })
      } else {
        details.push({
          label: '.env.example → .env parity',
          status: 'ok',
          message: 'All keys present',
        })
      }
    } else {
      details.push({
        label: '.env',
        status: 'warn',
        message: 'File not found (copy from .env.example)',
      })
    }
  }

  // 2. .mcp.json structure validation
  const mcpJson = join(rootDir, '.mcp.json')
  const claudeMcpJson = join(rootDir, '.claude', 'mcp.json')
  for (const mcpPath of [mcpJson, claudeMcpJson]) {
    if (!existsSync(mcpPath)) continue
    const config = readJSON<{ mcpServers?: Record<string, unknown> }>(mcpPath)
    if (!config) {
      hasErrors = true
      details.push({
        label: relative(ctx.rootDir, mcpPath),
        status: 'error',
        message: 'Invalid JSON',
      })
      continue
    }
    if (config.mcpServers) {
      const serverCount = Object.keys(config.mcpServers).length
      let validCount = 0
      for (const [name, entry] of Object.entries(config.mcpServers)) {
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>
          if (e.command || e.url) validCount++
        }
      }
      details.push({
        label: relative(ctx.rootDir, mcpPath),
        status: validCount === serverCount ? 'ok' : 'warn',
        message: `${validCount}/${serverCount} servers have valid config`,
      })
    }
  }

  // 3. settings.json schema
  const settingsPath = join(rootDir, '.claude', 'settings.json')
  if (existsSync(settingsPath)) {
    const settings = readJSON<Record<string, unknown>>(settingsPath)
    if (settings) {
      const hasPermissions = !!settings.permissions
      const hasHooks = !!settings.hooks
      details.push({
        label: 'settings.json',
        status: hasPermissions ? 'ok' : 'warn',
        message: `permissions:${hasPermissions ? '✓' : '✗'} hooks:${hasHooks ? '✓' : '✗'}`,
      })
    } else {
      hasErrors = true
      details.push({ label: 'settings.json', status: 'error', message: 'Invalid JSON' })
    }
  }

  // 4. tsconfig.json best practices
  const tsconfigPath = join(rootDir, 'tsconfig.json')
  if (existsSync(tsconfigPath)) {
    const tsconfig = readJSON<{
      compilerOptions?: { strict?: boolean; noEmit?: boolean; include?: string[] }
    }>(tsconfigPath)
    if (tsconfig?.compilerOptions) {
      const checks: string[] = []
      if (tsconfig.compilerOptions.strict) checks.push('strict:✓')
      else checks.push('strict:✗')
      if (tsconfig.compilerOptions.noEmit) checks.push('noEmit:✓')
      details.push({ label: 'tsconfig.json', status: 'ok', message: checks.join(' ') })
    }
  }

  return {
    id: 'config-audit',
    title: 'Configuration Audit',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `${details.filter((d) => d.status === 'error').length} errors`,
    details,
  }
}

function parseEnvKeys(path: string): string[] {
  try {
    const content = readFileSync(path, 'utf8')
    return content
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0]!.trim())
      .filter((k) => k && !k.startsWith('#') && /^[A-Z_][A-Z0-9_]*$/.test(k))
  } catch {
    return []
  }
}

function relative(base: string, path: string): string {
  return path.replace(base, '').replace(/^[/\\]+/, '')
}
