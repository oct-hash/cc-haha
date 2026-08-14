/**
 * Task Intent Detector — distinguishes implementation requests and code-review
 * requests from decision questions (already routed to auto-debate) and other
 * messages.
 *
 * Mirrors the weighted PatternGroup structure of decisionDetector.ts. Kept
 * conservative on purpose: trivial one-off code-gen ("写一个函数") does NOT
 * route to a gate — only non-trivial "do it for me" implementation requests do.
 */

interface PatternGroup {
  /** Weight contributed when a pattern from this group matches. */
  weight: number
  patterns: RegExp[]
}

// ── Implementation requests ────────────────────────────────────────────────

const IMPLEMENT_PATTERNS: PatternGroup[] = [
  {
    weight: 3,
    patterns: [
      // Chinese: explicit "do it for me" implementation requests
      /(?:帮我|请|给我|来)\s*(?:实现|写|构建|搭建|开发|创建|新增|添加|接入|集成|迁移|重构|修复)\s*(?:一个|个|一下)?\s*[\w\u4e00-\u9fa5]/,
      // English: imperative implementation verbs
      /^(?:please\s+)?(?:implement|build|create|write|develop|refactor|migrate|integrate)\b/i,
      /(?:帮我|请)?\s*(?:重构|refactor)\b/i,
      /(?:帮我|请)?\s*(?:接入|集成|迁移)\s*(?:到|进)?\s*\w/i,
    ],
  },
  {
    weight: 2,
    patterns: [
      // Chinese: feature/module-level changes
      /(?:新增|添加|增加|删除|移除|更新)\s*(?:一个|个)?\s*(?:功能|接口|模块|页面|组件|方法|函数|字段|配置|服务)/,
      /(?:开发|实现|搭建|重构)\s*(?:一个|个)?\s*(?:功能|模块|接口|页面|系统|服务|组件)/,
      // English: change-oriented verbs on a named target
      /\b(?:add|remove|delete|update|rename|optimize)\s+(?:a|an|the)?\s*[\w.]/i,
    ],
  },
]

// How-to / definition / factual / decision phrasing that should NOT route to a
// gate. Decision questions are handled upstream by isDecisionQuestion, but the
// exclusion here keeps the detectors independently safe.
const IMPLEMENT_NEGATIVE: RegExp[] = [
  /^(?:should|which|would)\b/i,
  /^(?:应该|哪个|哪种|如何选择|选|帮我选)/,
  /^(?:怎么|如何)\s*(?:实现|写|构建|修复|做|搭建)/,
  /^how\s+(?:do|can|to)\b/i,
  /^(?:什么是|什么|啥)\s*(?:是|叫|叫做)/,
  /^(?:when|where|who|how\s+(?:many|much))\b/i,
]

// ── Review requests ────────────────────────────────────────────────────────

const REVIEW_RE =
  /(?:审查|评审|检查|走查|review|code\s*review|audit|critique|帮我看看|看一下|看看这段|检查一下|审查一下|评审一下)/i

const REVIEW_NEGATIVE: RegExp[] = [
  /^(?:should|which|应该|哪个|选|帮我选)/,
  /^(?:实现|写|构建|修复|添加|创建|新增|开发|重构)/,
]

// ── Detection ─────────────────────────────────────────────────────────────

/**
 * True when the message asks for a code review / audit (not a decision, not an
 * implementation request).
 */
export function isReviewRequest(message: string): boolean {
  const m = message.trim()
  if (!m) return false
  for (const neg of REVIEW_NEGATIVE) {
    if (neg.test(m)) return false
  }
  return REVIEW_RE.test(m)
}

/**
 * True when the message is a non-trivial "implement this for me" request that
 * would benefit from a pre-implementation approach gate.
 */
export function isImplementationTask(message: string): boolean {
  const m = message.trim()
  if (!m) return false
  if (isReviewRequest(m)) return false
  for (const neg of IMPLEMENT_NEGATIVE) {
    if (neg.test(m)) return false
  }

  let score = 0
  for (const group of IMPLEMENT_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(m)) {
        score += group.weight
        break // one match per group
      }
    }
  }
  return score >= 3
}
