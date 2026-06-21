// Provider smoke: live API provider smoke tests

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { maskKey } from '../utils/helpers'
import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

interface EnvVars {
  ANTHROPIC_BASE_URL?: string
  ANTHROPIC_AUTH_TOKEN?: string
  MINIMAX_BASE_URL?: string
  MINIMAX_API_KEY?: string
}

export async function runProviderSmoke(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now()
  const details: DetailItem[] = []

  if (!ctx.options.allowLive) {
    return {
      id: 'provider-smoke',
      title: 'Provider Smoke',
      status: 'skipped',
      durationMs: Date.now() - started,
      category: 'smoke',
      skipReason: 'Live provider smoke requires --allow-live',
      live: true,
    }
  }

  const envPath = join(ctx.rootDir, '.env')
  if (!existsSync(envPath)) {
    return {
      id: 'provider-smoke',
      title: 'Provider Smoke',
      status: 'skipped',
      durationMs: Date.now() - started,
      category: 'smoke',
      skipReason: '.env file not found',
      live: true,
    }
  }

  // Parse .env file
  const envContent = await Bun.file(envPath).text()
  const env: EnvVars = {}
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    ;(env as Record<string, string>)[key] = value
  }

  // Test Anthropic endpoint
  if (env.ANTHROPIC_BASE_URL) {
    await testEndpoint(
      details,
      'Anthropic',
      env.ANTHROPIC_BASE_URL,
      env.ANTHROPIC_AUTH_TOKEN,
    )
  } else {
    details.push({
      label: 'Anthropic',
      status: 'warn',
      message: 'ANTHROPIC_BASE_URL not set in .env',
    })
  }

  // Test MiniMax endpoint
  if (env.MINIMAX_BASE_URL) {
    await testEndpoint(
      details,
      'MiniMax',
      env.MINIMAX_BASE_URL,
      env.MINIMAX_API_KEY,
    )
  }

  const hasErrors = details.some((d) => d.status === 'error')

  return {
    id: 'provider-smoke',
    title: 'Provider Smoke',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'smoke',
    description: `Live API provider connectivity check`,
    details,
    live: true,
  }
}

async function testEndpoint(
  details: DetailItem[],
  name: string,
  baseUrl: string,
  token?: string,
): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const headers: Record<string, string> = {}
    if (token) {
      headers['x-api-key'] = token
      headers['Authorization'] = `Bearer ${token}`
    }

    const url = baseUrl.replace(/\/$/, '') + '/v1/models'
    const start = Date.now()
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(() => null)
    clearTimeout(timeout)
    const latency = Date.now() - start

    if (response && response.ok) {
      const maskedToken = token ? maskKey(token) : 'none'
      details.push({
        label: `${name}: OK`,
        status: 'ok',
        message: `Connected (${latency}ms) — key: ${maskedToken}`,
      })
    } else if (response) {
      details.push({
        label: `${name}: ${response.status}`,
        status: 'warn',
        message: `${response.statusText} (${latency}ms)`,
      })
    } else {
      details.push({
        label: `${name}: unreachable`,
        status: 'error',
        message: `No response from ${baseUrl} (timeout after 15s)`,
      })
    }
  } catch (err) {
    details.push({
      label: `${name}: error`,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
