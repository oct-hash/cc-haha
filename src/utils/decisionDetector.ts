/**
 * Decision Question Detector
 *
 * Classifies user messages to determine if they are decision-type questions
 * that would benefit from multi-agent debate. Used by the query layer to
 * auto-route decision questions through DebateOrchestrator auto mode.
 */

export interface DecisionSignal {
  /** Whether this is a decision-type question. */
  isDecision: boolean
  /** Confidence score 0–1. */
  confidence: number
  /** Human-readable reasons for the classification. */
  reasons: string[]
}

// ── Keyword Patterns ──────────────────────────────────────────────────────

interface PatternGroup {
  /** Weight contributed when a pattern from this group matches. */
  weight: number
  patterns: RegExp[]
}

const DECISION_PATTERNS: PatternGroup[] = [
  // ── Strong indicators (weight 3) ──────────────────────────────────────
  {
    weight: 3,
    patterns: [
      // English: direct decision solicitation
      /should\s+(?:I|we)\s+(?:choose|pick|select|use|go\s+with|adopt)/i,
      /which\s+(?:approach|option|solution|method|framework|library|tool|language|architecture|pattern|strategy|one)\s+(?:is|would\s+be)\s+(?:better|best|more\s+\w+)/i,
      /which\s+(?:\w+\s+){1,2}(?:is|are|would\s+be)\s+(?:the\s+)?(?:better|best|more\s+\w+)/i,
      /(?:what|which)\s+(?:\w+\s+)?(?:would|do)\s+you\s+(?:recommend|suggest|advise)/i,
      /pros\s+(?:and|&)\s+cons/i,
      /trade[-\s]?off/i,

      // Chinese: strong decision indicators
      /帮我(?:选|选择|决策|决定|权衡|拿个主意)/,
      /(?:你|大家)(?:觉得|认为)\s*(?:选|哪个|怎样|如何)/,
      /(?:方案|选项)\s*[A-C一二三]/,
      /如何(?:选择|抉择|取舍|权衡)/,
      /哪个(?:方案|选项|方法|框架|库|更好|更合适|更优|更适合|比较好)/,
      /(?:优缺点|利弊|优劣|好坏)/,
    ],
  },

  // ── Moderate indicators (weight 2) ─────────────────────────────────────
  {
    weight: 2,
    patterns: [
      // English: comparison / choice language
      /(?:better|best)\s+(?:choice|option|approach|solution|way)\b/i,
      /(?:choose|pick|decide|select)\s+(?:between|among|from)/i,
      /\bvs\.?\s+/i,
      /\bversus\b/i,
      /which\s+(?:one|of\s+these)/i,
      /is\s+it\s+(?:better|worth)\b/i,
      /compare\s+(?:these|the\s+following|options?|approaches?)/i,
      /(?:approach|option|solution)\s+(?:A|B|1|2)\s+(?:and|or)\s+(?:approach|option|solution)/i,

      // Chinese: moderate decision indicators
      /(?:应该|该)\s*(?:用|选|采用|使用|做|怎么)/,
      /(?:最好|最优|最佳)\s*(?:的|方案|方法|做法|选择)/,
      /(?:对比|比较)\s*(?:一下|哪个|哪种|优劣)/,
      /(?:还是|或者)\s*.*?(?:好|合适|推荐|靠谱)/,
      /(?:选|选哪个|选什么|怎么选)/,
      /(?:推荐|建议)\s*(?:用|选|哪个|什么)/,
      /(?:值得|值不值得|是否值得)\s*(?:吗|呢|\?|？)?/,
    ],
  },

  // ── Weak indicators (weight 1) — boost when combined with others ───────
  {
    weight: 1,
    patterns: [
      /(?:what|which)\s+(?:is|are)\s+(?:the|your)\s+(?:best|better)\b/i,
      /\b(?:权衡|取舍|决策)\b/,
      /\b(?:怎么办|怎么做|怎么弄|怎么处理)\b/,
      /(?:方案|选项|方法|办法)\s*(?:很多|较多|太多|不少)/,
      /(?:选|挑|抉择)\s*(?:一个|哪种|哪个)/,
      /(?:更|比较)\s*(?:推荐|建议|看好|倾向)/,
    ],
  },
]

// ── Negative patterns — things that look like decisions but aren't ───────

const NEGATIVE_PATTERNS: RegExp[] = [
  // Pure how-to questions (not about choosing)
  /^how\s+(?:do|can|would|to)\s+(?:I|we|you)\s+(?:implement|build|create|write|fix|debug|deploy|install|setup|configure|run|start)/i,
  /^(?:怎么|如何)\s*(?:实现|构建|写|修复|部署|安装|配置|运行|启动|设置)/,
  // Definition requests
  /^what\s+(?:is|are|does|do)\s+(?:a|an)\b/i,
  /^(?:什么|啥)\s*(?:是|叫|叫做)/,
  // Single-answer factual questions
  /^(?:when|where|who|how\s+many|how\s+much)\b/i,
  /^(?:什么时候|哪里|谁|多少)/,
  // Code generation without choices
  /^(?:write|generate|create)\s+(?:a|an)\s+(?:function|class|component|module|script|file)\b/i,
  /^(?:写|生成|创建)\s*(?:一个|个)\s*(?:函数|类|组件|模块|脚本|文件)/,
]

// ── Detection ─────────────────────────────────────────────────────────────

/**
 * Detect if a message is a decision-type question that would benefit
 * from multi-agent debate.
 */
export function detectDecisionQuestion(message: string): DecisionSignal {
  if (!message || message.trim().length === 0) {
    return { isDecision: false, confidence: 0, reasons: [] }
  }

  // Strip common Chinese question prefixes so negative patterns can anchor at ^
  const stripped = message
    .trim()
    .replace(/^(?:请问|大佬们?|能不能|问一下|想问下|想问一下|各位|大家好)[,，。.\s]*/, '')

  // Check negative patterns first — if a strong negative matches, bail out
  for (const neg of NEGATIVE_PATTERNS) {
    if (neg.test(message.trim()) || neg.test(stripped)) {
      return { isDecision: false, confidence: 0, reasons: ['Matched negative pattern'] }
    }
  }

  let score = 0
  const matchedReasons: string[] = []

  for (const group of DECISION_PATTERNS) {
    for (const pattern of group.patterns) {
      const match = pattern.exec(message)
      if (match) {
        score += group.weight
        matchedReasons.push(`"${match[0].slice(0, 40)}" (w:${group.weight})`)
        // Only count first match per group to avoid double-counting similar patterns
        break
      }
    }
  }

  // Additional structural signals
  const keywordScore = score
  const structuralScore = scoreStructuralSignals(message)
  score += structuralScore.score
  if (structuralScore.reasons.length > 0) {
    matchedReasons.push(...structuralScore.reasons)
  }

  // Only penalize short messages when no keyword patterns matched
  if (message.length < 20 && keywordScore === 0) {
    score -= 1
    matchedReasons.push('Message too short for a complex decision')
  }

  // Normalize to 0–1 confidence (divisor = typical max reachable score)
  const confidence = Math.max(0, Math.min(1, score / 4))

  return {
    isDecision: confidence >= 0.5,
    confidence,
    reasons: matchedReasons,
  }
}

/**
 * Score structural signals in the message that suggest a decision context.
 */
function scoreStructuralSignals(message: string): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // Multiple options listed with A/B/C or 1/2/3
  const optionListRe = /(?:^|\n)\s*(?:[-*]\s*|[A-Ca-c][.)]\s*|\d+[.)]\s*)/gm
  const optionMatches = message.match(optionListRe)
  if (optionMatches && optionMatches.length >= 2) {
    const boost = optionMatches.length >= 3 ? 3 : 2
    score += boost
    reasons.push(`Multiple listed options (${optionMatches.length})`)
  }

  // Contains question marks (asking, not stating)
  const questionCount = (message.match(/[?？]/g) ?? []).length
  if (questionCount >= 2) {
    score += 1
    reasons.push(`Multiple questions (${questionCount})`)
  } else if (questionCount === 1) {
    score += 0.5
  }

  // (Length penalty moved to caller — only applies when no keyword match)

  // Contains "or" or Chinese "还是/或者" suggesting alternatives
  if (/(?:\bor\b|还是|或者)/i.test(message) && message.length > 20) {
    score += 0.5
    reasons.push('Contains alternative comparison')
  }

  return { score, reasons }
}

/**
 * Quick check — returns true only for high-confidence decision questions.
 * Use when you want fewer false positives.
 */
export function isDecisionQuestion(message: string): boolean {
  const signal = detectDecisionQuestion(message)
  return signal.isDecision && signal.confidence >= 0.5
}
