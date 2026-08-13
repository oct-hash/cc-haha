/**
 * Review Summary Implementation
 * Aggregates all session reviews and generates improvement suggestions.
 */
import { getSessionManager } from '../../utils/sessionContext.js'

interface ReviewSummary {
  totalReviews: number
  commonErrors: string[]
  commonMissedTools: string[]
  improvementSuggestions: string[]
  goodPatterns: string[]
}

/**
 * Aggregate all reviews from session
 */
export function aggregateReviews(): ReviewSummary {
  const sessionManager = getSessionManager()
  const session = sessionManager.getSession()

  if (!session || session.context.reviews.length === 0) {
    return {
      totalReviews: 0,
      commonErrors: [],
      commonMissedTools: [],
      improvementSuggestions: [],
      goodPatterns: [],
    }
  }

  const reviews = session.context.reviews
  const summary: ReviewSummary = {
    totalReviews: reviews.length,
    commonErrors: [],
    commonMissedTools: [],
    improvementSuggestions: [],
    goodPatterns: [],
  }

  // Aggregate errors
  const errorCounts = new Map<string, number>()
  for (const review of reviews) {
    for (const err of review.errors) {
      const key = `[${err.severity}] ${err.description}`
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1)
    }
  }
  summary.commonErrors = Array.from(errorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error]) => error)

  // Aggregate missed tools
  const missedToolCounts = new Map<string, number>()
  for (const review of reviews) {
    for (const item of review.toolUsage.shouldHaveUsed) {
      missedToolCounts.set(item.tool, (missedToolCounts.get(item.tool) || 0) + 1)
    }
    for (const item of review.toolUsage.misused) {
      missedToolCounts.set(item.tool, (missedToolCounts.get(item.tool) || 0) + 1)
    }
  }
  summary.commonMissedTools = Array.from(missedToolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool]) => tool)

  // Generate improvement suggestions
  if (summary.commonErrors.length > 0) {
    summary.improvementSuggestions.push('注意避免以下错误模式')
  }
  if (summary.commonMissedTools.length > 0) {
    summary.improvementSuggestions.push('下次可考虑使用这些工具')
  }

  // Aggregate good patterns
  const goodCounts = new Map<string, number>()
  for (const review of reviews) {
    for (const good of review.goodPractices) {
      goodCounts.set(good.pattern, (goodCounts.get(good.pattern) || 0) + 1)
    }
  }
  summary.goodPatterns = Array.from(goodCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern]) => pattern)

  return summary
}

/**
 * Format summary for display
 */
export function formatSummaryForDisplay(summary: ReviewSummary): string {
  if (summary.totalReviews === 0) {
    return '暂无复盘数据。请先完成任务后输入"任务完成"触发复盘。'
  }

  const lines: string[] = [`📊 复盘汇总（共 ${summary.totalReviews} 次任务）\n`]

  if (summary.commonErrors.length > 0) {
    lines.push('--- 常见错误 ---')
    summary.commonErrors.forEach((e, i) => { lines.push(`${i + 1}. ${e}`) })
    lines.push('')
  }

  if (summary.commonMissedTools.length > 0) {
    lines.push('--- 常遗漏工具 ---')
    summary.commonMissedTools.forEach((t, i) => { lines.push(`${i + 1}. ${t}`) })
    lines.push('')
  }

  if (summary.improvementSuggestions.length > 0) {
    lines.push('--- 改进建议 ---')
    summary.improvementSuggestions.forEach((s, i) => { lines.push(`${i + 1}. ${s}`) })
    lines.push('')
  }

  if (summary.goodPatterns.length > 0) {
    lines.push('--- 好的实践 ---')
    summary.goodPatterns.forEach((p, i) => { lines.push(`${i + 1}. ${p}`) })
  }

  return lines.join('\n')
}

/**
 * Command execution
 */
export async function reviewSummaryCommand(): Promise<string> {
  const summary = aggregateReviews()
  return formatSummaryForDisplay(summary)
}
