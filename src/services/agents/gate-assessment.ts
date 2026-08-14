/**
 * Gate Assessment Engine — keyword-driven severity/confidence extraction plus
 * the single authoritative blocking decision matrix.
 *
 * This is a pure, IO-free module so the blocking logic can be unit-tested
 * without spinning up agents. `assessGate` turns a free-text debate verdict
 * into a structured `{ severity, confidence }` signal; `decideBlock` applies
 * the differentiated per-gate policy. LoopManager consumes these two and owns
 * all output/logging concerns.
 *
 * Keyword-based for now (per the mock-first plan). The seam to swap in a
 * structured-LLM assessment pass is `assessGate` itself — callers only depend
 * on its return type.
 */

import { djb2Hash } from '../../utils/hash.js'

// ── Types ──────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type GateKind = 'pre-implementation' | 'post-review' | 'pre-commit'

export interface GateAssessment {
  severity: Severity
  /** 0–1. < SILENT_CONFIDENCE means the finding is too uncertain to surface. */
  confidence: number
  reasons: string[]
}

export interface BlockDecision {
  /** Whether the gate hard-blocks. Only ever true for pre-commit. */
  block: boolean
  /** Whether the finding is below the visibility floor (debug-log only). */
  silent: boolean
  severity: Severity
  confidence: number
  reason: string
  /** Present only when `block` is true — the GATE-IGNORE override hash. */
  ignoreHash?: string
}

// ── Thresholds (single source of truth) ────────────────────────────────────

/** Critical findings block at/above this confidence (pre-commit only). */
export const BLOCK_CRITICAL_CONFIDENCE = 0.85
/** High findings block at/above this confidence (pre-commit only). */
export const BLOCK_HIGH_CONFIDENCE = 0.8
/** Findings below this confidence are fully silent (debug log only). */
export const SILENT_CONFIDENCE = 0.75

// ── Keyword rules ──────────────────────────────────────────────────────────

interface SeverityRule {
  severity: Severity
  /** Confidence assigned when a pattern in this tier matches cleanly. */
  confidence: number
  patterns: RegExp[]
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
}

const SEVERITY_RULES: SeverityRule[] = [
  {
    severity: 'critical',
    confidence: 0.92,
    patterns: [
      /sql\s*injection/i,
      /sql\s*注入/i,
      /hardcod(?:ed|ing)?\s*(?:secret|credential|api\s*key|password|token)/i,
      /硬编码\s*(?:密钥|密码|token|凭证|api\s*key|口令)/i,
      /\bxss\b/i,
      /跨站脚本/,
      /command\s*injection/i,
      /命令注入/,
      /path\s*traversal/i,
      /路径(?:穿越|遍历)/,
      /\brce\b/i,
      /远程代码执行/,
      /auth(?:entication)?\s*bypass/i,
      /认证绕过/,
      /credential\s*(?:exposure|leak)/i,
      /凭据(?:泄露|泄漏)/,
    ],
  },
  {
    severity: 'high',
    confidence: 0.85,
    patterns: [
      /deadlock/i,
      /死锁/,
      /missing\s*transaction/i,
      /事务(?:缺失|未提交|未开启)/,
      /race\s*condition/i,
      /竞态(?:条件)?/,
      /memory\s*leak/i,
      /内存(?:泄漏|泄露)/,
      /unhandled\s*(?:exception|error|rejection)/i,
      /未处理(?:的)?(?:异常|错误)/,
      /n\+1\s*query/i,
      /n\+1\s*查询/,
      /missing\s*(?:authorization|permission\s*check)/i,
      /权限(?:校验|检查)缺失/,
    ],
  },
  {
    severity: 'medium',
    confidence: 0.78,
    patterns: [
      /performance\s*(?:issue|problem|bottleneck)?/i,
      /性能(?:问题|瓶颈|不佳)?/,
      /maintainability/i,
      /可维护性/,
      /\bnaming\b/i,
      /命名/,
      /duplicat(?:ed|e)\s*code/i,
      /重复(?:代码|逻辑)/,
      /cyclomatic\s*complexity/i,
      /复杂度/,
    ],
  },
  {
    severity: 'low',
    confidence: 0.75,
    patterns: [
      /code\s*style/i,
      /代码风格/,
      /formatting/i,
      /(?:格式化|缩进)/,
    ],
  },
]

/** Matches when the text immediately before a keyword negates it ("no SQL injection"). */
const NEGATION_PATTERN = /(?:no|not|none|without|没有|未|不存在|无|没)\s*$/i

function isNegated(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 20), matchIndex)
  return NEGATION_PATTERN.test(before)
}

// ── Assessment ─────────────────────────────────────────────────────────────

/**
 * Extract a structured severity/confidence signal from a free-text verdict.
 * Returns severity 'low' with confidence 0 when no recognizable finding is
 * present (i.e. a clean review) — that maps to a silent, non-blocking pass.
 */
export function assessGate(verdict: string, _gateKind: GateKind): GateAssessment {
  const text = verdict ?? ''
  if (!text.trim()) {
    return { severity: 'low', confidence: 0, reasons: [] }
  }

  let best: { severity: Severity; confidence: number; reason: string } | null = null

  for (const rule of SEVERITY_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text)
      if (match && !isNegated(text, match.index)) {
        if (!best || SEVERITY_RANK[rule.severity] > SEVERITY_RANK[best.severity]) {
          best = { severity: rule.severity, confidence: rule.confidence, reason: match[0] }
        }
        break // one clean match per tier is enough
      }
    }
  }

  if (!best) {
    return { severity: 'low', confidence: 0, reasons: [] }
  }

  return {
    severity: best.severity,
    confidence: best.confidence,
    reasons: [best.reason],
  }
}

// ── Blocking decision ──────────────────────────────────────────────────────

function isForcePass(): boolean {
  return process.env.GATE_FORCE_PASS === '1'
}

/**
 * The single authoritative blocking decision.
 *
 * Policy:
 *   - GATE_FORCE_PASS=1 is a disaster-recovery escape hatch only (never blocks).
 *   - pre-implementation / post-review never block (report/needs-attention only).
 *   - pre-commit blocks only on critical≥0.85 or high≥0.80, with an ignore hash.
 *   - confidence < SILENT_CONFIDENCE is silent regardless of severity.
 */
export function decideBlock(
  gateKind: GateKind,
  severity: Severity,
  confidence: number,
  finding?: string,
): BlockDecision {
  const silent = confidence < SILENT_CONFIDENCE

  if (isForcePass()) {
    return {
      block: false,
      silent,
      severity,
      confidence,
      reason: 'GATE_FORCE_PASS=1 forced pass',
    }
  }

  if (gateKind !== 'pre-commit') {
    return {
      block: false,
      silent,
      severity,
      confidence,
      reason: `${gateKind} gate never hard-blocks`,
    }
  }

  const shouldBlock =
    (severity === 'critical' && confidence >= BLOCK_CRITICAL_CONFIDENCE) ||
    (severity === 'high' && confidence >= BLOCK_HIGH_CONFIDENCE)

  if (!shouldBlock) {
    return {
      block: false,
      silent,
      severity,
      confidence,
      reason: `${severity} severity below block threshold`,
    }
  }

  return {
    block: true,
    silent,
    severity,
    confidence,
    reason: `${severity} severity, confidence ${confidence.toFixed(2)}`,
    ignoreHash: generateIgnoreHash(severity, finding ?? ''),
  }
}

// ── Ignore hash ────────────────────────────────────────────────────────────

/**
 * Stable per-finding hash for the `// GATE-IGNORE: <hash>` override. Uses the
 * deterministic djb2 hash so the same finding yields the same code across runs.
 */
export function generateIgnoreHash(severity: Severity, finding: string): string {
  const raw = `${severity}:${finding.trim().toLowerCase()}`
  return (djb2Hash(raw) >>> 0).toString(16).padStart(8, '0')
}
