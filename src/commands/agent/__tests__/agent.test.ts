/**
 * Unit tests for /agent command.
 *
 * Covers: empty args, invalid kind, valid switch, same-kind no-op, case insensitivity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { resetSessionManager } from '../../../services/agents/session-manager.js'

let call: (args: string) => Promise<{ type: string; value: string }>

beforeEach(async () => {
  resetSessionManager()
  const mod = await import('../agent.js')
  call = mod.call as (args: string) => Promise<{ type: string; value: string }>
})

afterEach(() => {
  resetSessionManager()
})

describe('/agent command', () => {
  it('returns error for empty args', async () => {
    const r = await call('')
    expect(r.type).toBe('text')
    expect(r.value).toContain('Invalid agent kind')
    expect(r.value).toContain('(none)')
  })

  it('returns error for whitespace-only args', async () => {
    const r = await call('   ')
    expect(r.type).toBe('text')
    expect(r.value).toContain('Invalid agent kind')
  })

  it('returns error for invalid kind', async () => {
    const r = await call('gpt-5')
    expect(r.type).toBe('text')
    expect(r.value).toContain('Invalid agent kind')
    expect(r.value).toContain('gpt-5')
  })

  it('returns error for undefined args (no argument)', async () => {
    const r = await call(undefined as unknown as string)
    expect(r.type).toBe('text')
    expect(r.value).toContain('Invalid agent kind')
  })

  it('lists valid options in error message', async () => {
    const r = await call('')
    expect(r.value).toContain('claude-haha')
    expect(r.value).toContain('claude-code')
    expect(r.value).toContain('codex')
  })

  it('switches to valid kind (case insensitive)', async () => {
    const r = await call('CODEX')
    expect(r.type).toBe('text')
    expect(r.value).toContain('Switched agent')
    expect(r.value).toContain('codex')
  })

  it('handles leading/trailing whitespace', async () => {
    const r = await call('  claude-code  ')
    expect(r.type).toBe('text')
    expect(r.value).toContain('claude-code')
  })

  it('detects same-kind no-op', async () => {
    await call('codex')
    const r = await call('codex')
    expect(r.value).toContain('already set')
    expect(r.value).toContain('No change')
  })

  it('switches between all three kinds', async () => {
    const r1 = await call('claude-code')
    expect(r1.value).toContain('claude-haha')
    expect(r1.value).toContain('claude-code')

    const r2 = await call('codex')
    expect(r2.value).toContain('claude-code')
    expect(r2.value).toContain('codex')

    const r3 = await call('claude-haha')
    expect(r3.value).toContain('codex')
    expect(r3.value).toContain('claude-haha')
  })
})
