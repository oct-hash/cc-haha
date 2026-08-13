/**
 * Task Done Review Implementation
 * Analyzes task execution and generates comprehensive review report.
 */

import type { Message } from '../../types/message.js'
import { getSessionManager } from '../../utils/sessionContext.js'

interface ToolCall {
  name: string
  count: number
  purpose: string
}

interface ReviewResult {
  basic: {
    reviewTime: string
    taskType: string
    totalToolCalls: number
    conversationRounds: number
  }
  toolUsage: {
    stats: ToolCall[]
    shouldHaveUsed: { tool: string; reason: string; suggestion: string }[]
    misused: { tool: string; reason: string; betterAlternative: string }[]
    redundant: { tool: string; reason: string }[]
  }
  flow: {
    reasonable: { pattern: string; description: string }[]
    optimizable: { pattern: string; issue: string; suggestion: string }[]
  }
  errors: { severity: 'critical' | 'high' | 'medium'; description: string; fix: string }[]
  goodPractices: { pattern: string; example: string }[]
  iteration: {
    immediate: string[]
    longTerm: string[]
  }
  summary: string
  rating: 'excellent' | 'good' | 'needs-improvement' | 'poor'
}

const TASK_TYPE_PATTERNS = {
  功能开发: [/实现/, /添加.*功能/, /新增/, /feature/i],
  Bug修复: [/修复/, /fix/i, /bug/i, /错误/i],
  重构: [/重构/, /refactor/i, /重写/],
  文档: [/文档/, /doc/i, /注释/],
  代码审查: [/review/i, /审查/, /检查代码/],
  性能优化: [/优化/, /performance/i, /性能/],
}

const TRIGGER_PATTERNS = [
  '任务完成',
  '完成',
  'done',
  'task done',
  'finished',
  '做完了',
  '搞定了',
  '好',
  '可以',
  '行',
  '复盘',
]

// 工具推荐规则
const _TOOL_RECOMMENDATIONS: Record<
  string,
  { shouldFollow: string[]; betterAlternative: Record<string, string> }
> = {
  Read: {
    shouldFollow: ['在 Edit/Writ/Write 之前应先 Read 了解现状'],
    betterAlternative: {},
  },
  Edit: {
    shouldFollow: ['小幅度修改优先使用 Edit，而非 Write 全量覆盖'],
    betterAlternative: {
      'Bash(cat)': '直接用 Read 读取文件内容',
      'Bash(echo >)': '用 Write 创建新文件',
    },
  },
  Write: {
    shouldFollow: ['创建新文件或完全重写时使用 Write'],
    betterAlternative: {
      'Bash(echo)': '用 Write 替代 Bash echo 重定向',
    },
  },
  Bash: {
    shouldFollow: ['执行命令、运行脚本、git 操作、系统操作时使用 Bash'],
    betterAlternative: {
      'Bash(ls)': '用 Glob 搜索文件',
      'Bash(cat)': '用 Read 读取文件',
      'Bash(grep)': '用 Grep 搜索内容',
      'Bash(find)': '用 Glob 搜索文件',
      'Bash(ps aux)': '用 Bash 但要明确目的',
    },
  },
  Grep: {
    shouldFollow: ['搜索代码内容、查找函数/变量使用'],
    betterAlternative: {},
  },
  Glob: {
    shouldFollow: ['搜索文件、查找特定模式文件'],
    betterAlternative: {
      'Bash(find)': '用 Glob 更高效',
    },
  },
}

// 工具使用顺序规则
const TOOL_SEQUENCE_RULES = [
  {
    name: 'Edit前应Read',
    check: (sequence: string[]) => {
      const editIndices = sequence
        .map((t, i) => (t === 'Edit' || t === 'Write' ? i : -1))
        .filter((i) => i !== -1)
      const readIndices = sequence.map((t, i) => (t === 'Read' ? i : -1)).filter((i) => i !== -1)
      for (const editIdx of editIndices) {
        const readBefore = readIndices.some((ri) => ri < editIdx)
        if (!readBefore) return { violated: true, message: '在 Edit 之前没有先 Read 了解现状' }
      }
      return { violated: false }
    },
  },
  {
    name: '验证后执行',
    check: (sequence: string[]) => {
      const modifyCount = sequence.filter((t) => ['Edit', 'Write', 'Delete'].includes(t)).length
      const verifyCount = sequence.filter((_t) =>
        ['Bash'].some((b) => b.includes('test') || b.includes('verify')),
      ).length
      if (modifyCount > 2 && verifyCount === 0) {
        return { violated: true, message: '多次修改但没有执行验证，建议添加测试/构建验证' }
      }
      return { violated: false }
    },
  },
  {
    name: '避免重复Read',
    check: (sequence: string[]) => {
      const readIndices = sequence.map((t, i) => (t === 'Read' ? i : -1)).filter((i) => i !== -1)
      for (let i = 0; i < readIndices.length - 1; i++) {
        const diff = readIndices[i + 1] - readIndices[i]
        if (diff <= 2) {
          const toolsBetween = sequence.slice(readIndices[i] + 1, readIndices[i + 1])
          const hasModify = toolsBetween.some((t) => ['Edit', 'Write'].includes(t))
          if (!hasModify)
            return {
              violated: true,
              message: `连续的 Read 调用，中间无修改，可能重复读取了相同文件`,
            }
        }
      }
      return { violated: false }
    },
  },
]

/**
 * Check if input contains task-done trigger patterns
 */
export function isTaskDoneTrigger(input: string): boolean {
  const lower = input.toLowerCase().trim()
  return TRIGGER_PATTERNS.some(
    (pattern) => lower === pattern || lower === `${pattern}。` || lower === `${pattern}!`,
  )
}

/**
 * Identify task type from description
 */
function identifyTaskType(description: string): string {
  for (const [type, patterns] of Object.entries(TASK_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(description)) return type
    }
  }
  return '其他'
}

/**
 * Get task description from session
 */
function getTaskDescription(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.type === 'user')
  if (firstUserMsg && 'content' in firstUserMsg) {
    const content = firstUserMsg.content
    if (typeof content === 'string') {
      return content.slice(0, 200)
    }
  }
  return '未识别到任务描述'
}

/**
 * Extract tool usage with counts and sequence
 */
function extractToolUsage(messages: Message[]): { stats: ToolCall[]; sequence: string[] } {
  const toolCounts = new Map<string, number>()
  const sequence: string[] = []

  for (const msg of messages) {
    if (msg.type === 'assistant' && 'content' in msg) {
      const content = msg.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            const name = block.name
            toolCounts.set(name, (toolCounts.get(name) || 0) + 1)
            sequence.push(name)
          }
        }
      }
    }
  }

  const stats: ToolCall[] = Array.from(toolCounts.entries()).map(([name, count]) => ({
    name,
    count,
    purpose: getToolPurpose(name),
  }))

  return { stats, sequence }
}

/**
 * Get tool purpose description
 */
function getToolPurpose(tool: string): string {
  const purposes: Record<string, string> = {
    Read: '读取文件内容',
    Edit: '修改代码',
    Write: '创建/重写文件',
    Bash: '执行命令',
    Grep: '搜索代码内容',
    Glob: '搜索文件',
    WebFetch: '获取网页内容',
    WebSearch: '网络搜索',
    WriteCreate: '创建新文件',
    NotebookEdit: '编辑notebook',
  }
  return purposes[tool] || '其他'
}

/**
 * Get conversation summary
 */
function getConversationSummary(messages: Message[]): { rounds: number; userMsgs: number } {
  const userMsgs = messages.filter((m) => m.type === 'user')
  const assistantMsgs = messages.filter((m) => m.type === 'assistant')
  return { rounds: assistantMsgs.length, userMsgs: userMsgs.length }
}

/**
 * Analyze tool usage comprehensively
 */
function analyzeToolUsage(
  stats: ToolCall[],
  _sequence: string[],
): {
  shouldHaveUsed: ReviewResult['toolUsage']['shouldHaveUsed']
  misused: ReviewResult['toolUsage']['misused']
  redundant: ReviewResult['toolUsage']['redundant']
} {
  const shouldHaveUsed: ReviewResult['toolUsage']['shouldHaveUsed'] = []
  const misused: ReviewResult['toolUsage']['misused'] = []
  const redundant: ReviewResult['toolUsage']['redundant'] = []

  const toolNames = stats.map((s) => s.name)

  // 检查漏用
  if (!toolNames.includes('Read') && stats.length > 0) {
    shouldHaveUsed.push({
      tool: 'Read',
      reason: '任务涉及代码修改但未先阅读现有代码',
      suggestion: '先 Read 了解文件结构和现状，再进行修改',
    })
  }

  // 检查错用 Bash 命令
  const bashStat = stats.find((s) => s.name === 'Bash')
  if (bashStat) {
    // 这里简化处理，实际应该解析 Bash 命令内容
    if (bashStat.count > 5) {
      shouldHaveUsed.push({
        tool: '批量操作建议',
        reason: 'Bash 调用次数过多，可能存在替代工具',
        suggestion: '考虑使用 Glob + 循环处理替代多次 Bash',
      })
    }
  }

  // 检查 Edit vs Write 的选择
  const editStat = stats.find((s) => s.name === 'Edit')
  const writeStat = stats.find((s) => s.name === 'Write')

  if (writeStat && (editStat ? writeStat.count > editStat.count : true)) {
    misused.push({
      tool: 'Write',
      reason: 'Write 使用多于 Edit，可能存在过度覆盖',
      betterAlternative: '小幅度修改优先使用 Edit',
    })
  }

  // 检查重复 Read
  const readStat = stats.find((s) => s.name === 'Read')
  if (readStat && readStat.count > 10) {
    redundant.push({
      tool: 'Read',
      reason: `Read 调用 ${readStat.count} 次，可能存在重复读取`,
    })
  }

  return { shouldHaveUsed, misused, redundant }
}

/**
 * Analyze tool sequence
 */
function analyzeToolSequence(sequence: string[]): {
  reasonable: ReviewResult['flow']['reasonable']
  optimizable: ReviewResult['flow']['optimizable']
} {
  const reasonable: ReviewResult['flow']['reasonable'] = []
  const optimizable: ReviewResult['flow']['optimizable'] = []

  // 检查顺序规则
  for (const rule of TOOL_SEQUENCE_RULES) {
    const result = rule.check(sequence)
    if (result.violated) {
      optimizable.push({
        pattern: rule.name,
        issue: result.message || '',
        suggestion: '调整工具使用顺序',
      })
    } else {
      reasonable.push({
        pattern: rule.name,
        description: '符合最佳实践',
      })
    }
  }

  return { reasonable, optimizable }
}

/**
 * Detect errors
 */
function detectErrors(stats: ToolCall[], sequence: string[]): ReviewResult['errors'] {
  const errors: ReviewResult['errors'] = []

  // 检查是否缺少验证
  const modifyCount = stats
    .filter((s) => ['Edit', 'Write', 'Delete'].some((t) => t === s.name))
    .reduce((sum, s) => sum + s.count, 0)
  const hasBuild = stats.some((s) => s.name === 'Bash') && sequence.join('').includes('build')

  if (modifyCount >= 3 && !hasBuild) {
    errors.push({
      severity: 'medium',
      description: '多次修改后未执行构建验证',
      fix: '建议运行 build 命令验证修改正确性',
    })
  }

  return errors
}

/**
 * Identify good practices
 */
function identifyGoodPractices(
  stats: ToolCall[],
  sequence: string[],
): ReviewResult['goodPractices'] {
  const goodPractices: ReviewResult['goodPractices'] = []

  const toolNames = stats.map((s) => s.name)

  // 有工具使用
  if (stats.length > 0) {
    goodPractices.push({
      pattern: '使用工具完成任务',
      example: `使用了 ${stats.length} 种工具：${toolNames.join(', ')}`,
    })
  }

  // Read 在 Edit 前
  const readIdx = sequence.indexOf('Read')
  const editIdx = sequence.indexOf('Edit')
  if (readIdx !== -1 && editIdx !== -1 && readIdx < editIdx) {
    goodPractices.push({
      pattern: '先读后改',
      example: '先 Read 了解现状，再 Edit 进行修改',
    })
  }

  // 有验证步骤
  if (sequence.some((t) => t.includes('test') || t.includes('build'))) {
    goodPractices.push({
      pattern: '包含验证',
      example: '包含测试或构建验证步骤',
    })
  }

  // 无错误
  if (stats.length > 0 && stats.every((s) => s.count < 20)) {
    goodPractices.push({
      pattern: '工具使用适度',
      example: '工具调用次数合理，无异常重复',
    })
  }

  return goodPractices
}

/**
 * Generate iteration suggestions
 */
function generateIteration(
  stats: ToolCall[],
  errors: ReviewResult['errors'],
  optimizable: ReviewResult['flow']['optimizable'],
): {
  immediate: string[]
  longTerm: string[]
} {
  const immediate: string[] = []
  const longTerm: string[] = []

  // 基于错误的建议
  for (const err of errors) {
    immediate.push(err.fix)
  }

  // 基于可优化的建议
  for (const opt of optimizable) {
    immediate.push(opt.suggestion)
  }

  // 长期建议
  if (stats.length > 5) {
    longTerm.push('考虑使用更高级的工具或自动化脚本减少重复操作')
  }

  if (errors.length > 0) {
    longTerm.push('建立错误处理清单，减少同类错误发生')
  }

  return { immediate, longTerm }
}

/**
 * Calculate rating
 */
function calculateRating(review: Omit<ReviewResult, 'rating' | 'summary'>): ReviewResult['rating'] {
  let score = 10

  // 工具漏用/错用扣分
  score -= review.toolUsage.shouldHaveUsed.length * 0.5
  score -= review.toolUsage.misused.length * 0.5
  score -= review.toolUsage.redundant.length * 0.3

  // 流程问题扣分
  score -= review.flow.optimizable.length * 0.3

  // 错误扣分
  for (const err of review.errors) {
    if (err.severity === 'critical') score -= 2
    else if (err.severity === 'high') score -= 1
    else score -= 0.5
  }

  // 做得好加分
  score += Math.min(review.goodPractices.length * 0.2, 1)

  if (score >= 9) return 'excellent'
  if (score >= 7) return 'good'
  if (score >= 5) return 'needs-improvement'
  return 'poor'
}

/**
 * Generate summary
 */
function generateSummary(review: Omit<ReviewResult, 'summary' | 'rating'>): string {
  const issues =
    review.toolUsage.shouldHaveUsed.length +
    review.toolUsage.misused.length +
    review.errors.filter((e) => e.severity !== 'medium').length

  if (issues === 0 && review.goodPractices.length >= 2) {
    return `本次任务工具使用合理，流程规范，发现 ${review.goodPractices.length} 项良好实践。建议继续保持。`
  } else if (issues <= 2) {
    return `本次任务整体良好，发现 ${issues} 处可改进之处：${review.flow.optimizable[0]?.suggestion || ''}。建议针对性优化。`
  } else {
    return `本次任务发现 ${issues} 处问题需要改进，主要涉及 ${review.toolUsage.shouldHaveUsed[0]?.tool || '工具使用'} 方面。建议参考迭代建议进行改进。`
  }
}

/**
 * Main review generation function
 */
export async function generateTaskReview(
  messages: Message[],
  taskDescription?: string,
): Promise<ReviewResult> {
  const desc = taskDescription || getTaskDescription(messages)
  const { stats, sequence } = extractToolUsage(messages)
  const { rounds, userMsgs } = getConversationSummary(messages)

  const taskType = identifyTaskType(desc)

  // 分析各维度
  const { shouldHaveUsed, misused, redundant } = analyzeToolUsage(stats, sequence)
  const { reasonable, optimizable } = analyzeToolSequence(sequence)
  const errors = detectErrors(stats, sequence)
  const goodPractices = identifyGoodPractices(stats, sequence)
  const { immediate, longTerm } = generateIteration(stats, errors, optimizable)

  // 构建结果
  const review: Omit<ReviewResult, 'summary' | 'rating'> = {
    basic: {
      reviewTime: new Date().toLocaleString('zh-CN'),
      taskType,
      totalToolCalls: stats.reduce((sum, s) => sum + s.count, 0),
      conversationRounds: rounds,
    },
    toolUsage: {
      stats,
      shouldHaveUsed,
      misused,
      redundant,
    },
    flow: {
      reasonable,
      optimizable,
    },
    errors,
    goodPractices,
    iteration: {
      immediate,
      longTerm,
    },
  }

  const rating = calculateRating(review)
  const summary = generateSummary(review)

  return {
    ...review,
    summary,
    rating,
  }
}

/**
 * Save review to session
 */
export function saveReviewToSession(review: ReviewResult, taskDescription?: string): void {
  const sessionManager = getSessionManager()
  sessionManager.addReview({
    taskDescription: taskDescription || getTaskDescription([]),
    toolUsage: review.toolUsage,
    flow: review.flow,
    errors: review.errors,
    goodPractices: review.goodPractices,
  })
}

/**
 * Format review as markdown report
 */
export function formatReviewForDisplay(review: ReviewResult): string {
  const ratingEmoji: Record<string, string> = {
    excellent: '🟢',
    good: '🟡',
    'needs-improvement': '🟠',
    poor: '🔴',
  }

  const ratingText: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    'needs-improvement': '需改进',
    poor: '较差',
  }

  const lines: string[] = [
    '# 任务复盘报告\n',
    `## 基本信息`,
    `- 复盘时间：${review.basic.reviewTime}`,
    `- 任务类型：${review.basic.taskType}`,
    `- 工具调用总数：${review.basic.totalToolCalls} 次`,
    `- 对话轮次：${review.basic.conversationRounds} 轮\n`,
    `## 工具使用统计`,
    '| 工具类型 | 调用次数 | 主要用途 |',
    '|---------|---------|---------|',
    ...review.toolUsage.stats.map((s) => `| ${s.name} | ${s.count} | ${s.purpose} |`),
    '\n',
    `## 合理性评估\n`,
    `### ✅ 做得好的地方`,
    ...(review.goodPractices.length > 0
      ? review.goodPractices.map((g) => `- **${g.pattern}**：${g.example}`)
      : ['（无）']),
    '\n',
    `### ⚠️ 需要改进的地方`,
    ...(review.flow.optimizable.length > 0
      ? review.flow.optimizable.map((o) => `- **${o.pattern}**：${o.issue} → ${o.suggestion}`)
      : ['（无）']),
    '\n',
    `### ❌ 漏用/错用工具`,
  ]

  if (review.toolUsage.shouldHaveUsed.length > 0) {
    lines.push('**漏用：**')
    review.toolUsage.shouldHaveUsed.forEach((m) => {
      lines.push(`- ${m.tool}：${m.reason} → ${m.suggestion}`)
    })
  }

  if (review.toolUsage.misused.length > 0) {
    lines.push('**错用：**')
    review.toolUsage.misused.forEach((m) => {
      lines.push(`- ${m.tool}：${m.reason} → 建议使用 ${m.betterAlternative}`)
    })
  }

  if (review.toolUsage.redundant.length > 0) {
    lines.push('**冗余：**')
    review.toolUsage.redundant.forEach((r) => {
      lines.push(`- ${r.tool}：${r.reason}`)
    })
  }

  if (
    review.toolUsage.shouldHaveUsed.length === 0 &&
    review.toolUsage.misused.length === 0 &&
    review.toolUsage.redundant.length === 0
  ) {
    lines.push('（无）')
  }

  lines.push('\n', `### 🔴 错误检测`)
  if (review.errors.length > 0) {
    review.errors.forEach((e) => {
      lines.push(`- **[${e.severity.toUpperCase()}]** ${e.description}`)
      lines.push(`  → 修复：${e.fix}`)
    })
  } else {
    lines.push('（无）')
  }

  lines.push('\n', `## 迭代建议\n`)
  lines.push(`### 短期改进（本次任务后立即应用）`)
  if (review.iteration.immediate.length > 0) {
    review.iteration.immediate.forEach((item, i) => {
      lines.push(`${i + 1}. ${item}`)
    })
  } else {
    lines.push('（无）')
  }

  lines.push('\n', `### 长期改进（流程优化）`)
  if (review.iteration.longTerm.length > 0) {
    review.iteration.longTerm.forEach((item, i) => {
      lines.push(`${i + 1}. ${item}`)
    })
  } else {
    lines.push('（无）')
  }

  lines.push('\n', `## 总结`)
  lines.push(review.summary)
  lines.push(`\n---\n`)
  lines.push(`**评分：${ratingEmoji[review.rating]} ${ratingText[review.rating]}**\n`)
  lines.push(`复盘完成 ✅`)

  return lines.join('\n')
}

/**
 * Command execution
 */
export async function taskDoneCommand(
  args: string,
  context: {
    messages: Message[]
  },
): Promise<string> {
  const { messages } = context
  const taskDescription = args || undefined

  // Generate review
  const review = await generateTaskReview(messages, taskDescription)

  // Save to session
  saveReviewToSession(review, taskDescription)

  // Format for display
  return formatReviewForDisplay(review)
}
