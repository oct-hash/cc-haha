/**
 * Tests for gate-assessment — pure severity/confidence extraction and the
 * blocking decision matrix. No agents are spun up; these lock the keyword
 * tiers, threshold boundaries, per-gate policy, silence floor, and the
 * deterministic ignore-hash.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import {
  assessGate,
  BLOCK_CRITICAL_CONFIDENCE,
  BLOCK_HIGH_CONFIDENCE,
  decideBlock,
  generateIgnoreHash,
  SILENT_CONFIDENCE,
} from '../gate-assessment.js'

// ── assessGate: keyword → severity/confidence ──────────────────────────────

describe('assessGate severity extraction', () => {
  it('maps SQL injection to critical with high confidence', () => {
    const r = assessGate('The query uses SQL injection via string concat', 'pre-commit')
    expect(r.severity).toBe('critical')
    expect(r.confidence).toBe(0.92)
    expect(r.reasons).toContain('SQL injection')
  })

  it('maps hardcoded secret to critical', () => {
    const r = assessGate('This code has a hardcoded API key in plaintext', 'pre-commit')
    expect(r.severity).toBe('critical')
  })

  it('maps Chinese SQL injection to critical', () => {
    const r = assessGate('存在 SQL 注入风险', 'pre-commit')
    expect(r.severity).toBe('critical')
  })

  it('maps deadlock to high', () => {
    const r = assessGate('Lock ordering here can cause a deadlock', 'pre-commit')
    expect(r.severity).toBe('high')
    expect(r.confidence).toBe(0.85)
  })

  it('maps race condition to high', () => {
    const r = assessGate('There is a race condition on the counter', 'pre-commit')
    expect(r.severity).toBe('high')
  })

  it('maps performance issue to medium', () => {
    const r = assessGate('This loop has a performance problem', 'pre-commit')
    expect(r.severity).toBe('medium')
    expect(r.confidence).toBe(0.78)
  })

  it('maps code style to low', () => {
    const r = assessGate('Minor code style inconsistencies', 'pre-commit')
    expect(r.severity).toBe('low')
    expect(r.confidence).toBe(0.75)
  })

  it('prefers the highest-severity match when multiple tiers hit', () => {
    const r = assessGate('code style and SQL injection both present', 'pre-commit')
    expect(r.severity).toBe('critical')
  })

  it('returns low/0 for empty verdict', () => {
    const r = assessGate('', 'pre-commit')
    expect(r.severity).toBe('low')
    expect(r.confidence).toBe(0)
    expect(r.reasons).toEqual([])
  })

  it('returns low/0 when no keyword matches', () => {
    const r = assessGate('Looks good, nothing to report', 'pre-commit')
    expect(r.severity).toBe('low')
    expect(r.confidence).toBe(0)
  })

  it('ignores a negated keyword ("no SQL injection")', () => {
    const r = assessGate('There is no SQL injection here', 'pre-commit')
    expect(r.severity).toBe('low')
    expect(r.confidence).toBe(0)
  })
})

// ── decideBlock: thresholds and per-gate policy ────────────────────────────

describe('decideBlock threshold boundaries', () => {
  it('blocks pre-commit critical at/above threshold', () => {
    const d = decideBlock('pre-commit', 'critical', BLOCK_CRITICAL_CONFIDENCE, 'x')
    expect(d.block).toBe(true)
    expect(d.ignoreHash).toBeDefined()
  })

  it('does not block critical just below threshold', () => {
    const d = decideBlock('pre-commit', 'critical', BLOCK_CRITICAL_CONFIDENCE - 0.01, 'x')
    expect(d.block).toBe(false)
  })

  it('blocks pre-commit high at/above threshold', () => {
    const d = decideBlock('pre-commit', 'high', BLOCK_HIGH_CONFIDENCE, 'x')
    expect(d.block).toBe(true)
  })

  it('does not block high just below threshold', () => {
    const d = decideBlock('pre-commit', 'high', BLOCK_HIGH_CONFIDENCE - 0.01, 'x')
    expect(d.block).toBe(false)
  })

  it('never blocks medium or low even at high confidence', () => {
    expect(decideBlock('pre-commit', 'medium', 0.99, 'x').block).toBe(false)
    expect(decideBlock('pre-commit', 'low', 0.99, 'x').block).toBe(false)
  })
})

describe('decideBlock per-gate policy', () => {
  it('never blocks pre-implementation regardless of severity', () => {
    const d = decideBlock('pre-implementation', 'critical', 0.99, 'x')
    expect(d.block).toBe(false)
  })

  it('never blocks post-review regardless of severity', () => {
    const d = decideBlock('post-review', 'critical', 0.99, 'x')
    expect(d.block).toBe(false)
  })
})

describe('decideBlock silence floor', () => {
  it('marks findings below the silence floor as silent', () => {
    const d = decideBlock('pre-commit', 'critical', SILENT_CONFIDENCE - 0.01, 'x')
    expect(d.silent).toBe(true)
    expect(d.block).toBe(false)
  })

  it('does not mark at/above the floor as silent', () => {
    const d = decideBlock('pre-commit', 'medium', SILENT_CONFIDENCE, 'x')
    expect(d.silent).toBe(false)
  })
})

describe('decideBlock force-pass escape hatch', () => {
  afterEach(() => {
    delete process.env.GATE_FORCE_PASS
  })

  it('forces block=false when GATE_FORCE_PASS=1', () => {
    process.env.GATE_FORCE_PASS = '1'
    const d = decideBlock('pre-commit', 'critical', 0.99, 'x')
    expect(d.block).toBe(false)
    expect(d.reason).toContain('GATE_FORCE_PASS')
  })
})

// ── generateIgnoreHash: determinism ────────────────────────────────────────

describe('generateIgnoreHash', () => {
  it('is stable across calls for the same input', () => {
    expect(generateIgnoreHash('critical', 'SQL injection')).toBe(
      generateIgnoreHash('critical', 'SQL injection'),
    )
  })

  it('differs across severities', () => {
    expect(generateIgnoreHash('critical', 'x')).not.toBe(generateIgnoreHash('high', 'x'))
  })

  it('differs across findings', () => {
    expect(generateIgnoreHash('critical', 'a')).not.toBe(generateIgnoreHash('critical', 'b'))
  })

  it('produces an 8-char lowercase hex string', () => {
    expect(generateIgnoreHash('critical', 'SQL injection')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('is case-insensitive across finding text', () => {
    expect(generateIgnoreHash('critical', 'SQL Injection')).toBe(
      generateIgnoreHash('critical', 'sql injection'),
    )
  })
})
