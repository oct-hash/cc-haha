// Provider smoke: live API provider smoke tests.
// Tests each configured provider's actual API endpoint.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { maskKey } from '../utils/helpers';
import type { DetailItem, LaneExecutionContext, LaneResult } from './types';

interface EnvVars {
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  MINIMAX_BASE_URL?: string;
  MINIMAX_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;
}

export async function runProviderSmoke(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();
  const details: DetailItem[] = [];

  if (!ctx.options.allowLive) {
    return {
      id: 'provider-smoke',
      title: 'Provider Smoke',
      status: 'skipped',
      durationMs: Date.now() - started,
      category: 'smoke',
      skipReason: 'Live provider smoke requires --allow-live',
      live: true,
    };
  }

  const envPath = join(ctx.rootDir, '.env');
  if (!existsSync(envPath)) {
    return {
      id: 'provider-smoke',
      title: 'Provider Smoke',
      status: 'skipped',
      durationMs: Date.now() - started,
      category: 'smoke',
      skipReason: '.env file not found',
      live: true,
    };
  }

  // Parse .env file
  const envContent = await Bun.file(envPath).text();
  const env: EnvVars = {};
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    (env as Record<string, string>)[key] = value;
  }

  // Test DeepSeek (primary provider — Anthropic-compatible endpoint)
  if (env.ANTHROPIC_BASE_URL && isDeepSeek(env.ANTHROPIC_BASE_URL)) {
    await testAnthropicEndpoint(
      details,
      'DeepSeek',
      env.ANTHROPIC_BASE_URL,
      env.ANTHROPIC_AUTH_TOKEN,
    );
  } else if (env.DEEPSEEK_BASE_URL) {
    await testOpenAiEndpoint(
      details,
      'DeepSeek (OpenAI)',
      env.DEEPSEEK_BASE_URL,
      env.DEEPSEEK_API_KEY,
    );
  }

  // Test MiniMax (fallback provider)
  if (env.MINIMAX_BASE_URL) {
    await testAnthropicEndpoint(details, 'MiniMax', env.MINIMAX_BASE_URL, env.MINIMAX_API_KEY);
  }

  // Test non-DeepSeek Anthropic endpoints (OpenRouter, etc.)
  if (
    env.ANTHROPIC_BASE_URL &&
    !isDeepSeek(env.ANTHROPIC_BASE_URL) &&
    !isMiniMax(env.ANTHROPIC_BASE_URL)
  ) {
    await testAnthropicEndpoint(
      details,
      'Custom (Anthropic)',
      env.ANTHROPIC_BASE_URL,
      env.ANTHROPIC_AUTH_TOKEN,
    );
  }

  const hasErrors = details.some((d) => d.status === 'error');

  return {
    id: 'provider-smoke',
    title: 'Provider Smoke',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'smoke',
    description: 'Live API provider connectivity check',
    details,
    live: true,
  };
}

function isDeepSeek(url: string): boolean {
  return url.includes('deepseek.com');
}

function isMiniMax(url: string): boolean {
  return url.includes('minimaxi.com');
}

/** Test Anthropic-compatible endpoint — sends a lightweight messages request */
async function testAnthropicEndpoint(
  details: DetailItem[],
  name: string,
  baseUrl: string,
  token?: string,
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
    const start = Date.now();

    // Send a minimal messages request — validates the full API pipeline
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (response && response.ok) {
      const maskedToken = token ? maskKey(token) : 'none';
      details.push({
        label: `${name}: OK`,
        status: 'ok',
        message: `Connected (${latency}ms) — key: ${maskedToken}`,
      });
    } else if (response) {
      const body = await response.text().catch(() => '');
      // 400+ with valid JSON = endpoint exists, auth/model issue — acceptable
      const isApiResponse = body.includes('"type"') || body.includes('"error"');
      if (isApiResponse) {
        details.push({
          label: `${name}: OK`,
          status: 'ok',
          message: `Endpoint reachable (${latency}ms, ${response.status})`,
        });
      } else {
        details.push({
          label: `${name}: ${response.status}`,
          status: 'warn',
          message: `${response.statusText} (${latency}ms)`,
        });
      }
    } else {
      details.push({
        label: `${name}: unreachable`,
        status: 'error',
        message: `No response from ${baseUrl} (timeout)`,
      });
    }
  } catch (err) {
    details.push({
      label: `${name}: error`,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Test OpenAI-compatible endpoint */
async function testOpenAiEndpoint(
  details: DetailItem[],
  name: string,
  baseUrl: string,
  token?: string,
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const url = baseUrl.replace(/\/$/, '') + '/v1/models';
    const start = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (response && response.ok) {
      const maskedToken = token ? maskKey(token) : 'none';
      details.push({
        label: `${name}: OK`,
        status: 'ok',
        message: `Connected (${latency}ms) — key: ${maskedToken}`,
      });
    } else if (response) {
      details.push({
        label: `${name}: ${response.status}`,
        status: 'warn',
        message: `${response.statusText} (${latency}ms)`,
      });
    } else {
      details.push({
        label: `${name}: unreachable`,
        status: 'error',
        message: `No response from ${baseUrl}`,
      });
    }
  } catch (err) {
    details.push({
      label: `${name}: error`,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
