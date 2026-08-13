/**
 * Task Complexity Detector
 * Analyzes task input to determine if multi-agent team mode should be activated
 */

export type ComplexityLevel = 'low' | 'medium' | 'high'

interface ComplexitySignal {
  level: ComplexityLevel
  confidence: number
  reasons: string[]
}

interface ComplexityConfig {
  fileCountThreshold: number
  keywordWeights: Record<string, number>
  taskTypeWeights: Record<string, number>
}

/**
 * Default complexity detection configuration
 */
const DEFAULT_CONFIG: ComplexityConfig = {
  fileCountThreshold: 5,
  keywordWeights: {
    // High complexity keywords
    重构: 3,
    refactor: 3,
    redesign: 3,
    重新设计: 3,
    迁移: 3,
    migration: 3,
    架构: 3,
    architecture: 3,
    设计模式: 3,
    design_pattern: 3,

    // Medium complexity keywords
    实现: 2,
    implement: 2,
    新功能: 2,
    new_feature: 2,
    集成: 2,
    integration: 2,
    优化: 2,
    optimize: 2,
    performance: 2,

    // Task type keywords
    修复: 1,
    bug_fix: 1,
    fix: 1,
  },
  taskTypeWeights: {
    implement: 2,
    redesign: 3,
    refactor: 3,
    migration: 3,
    integration: 2,
    breakdown: 2,
  },
}

/**
 * Calculate complexity score for a task
 */
export function calculateComplexityScore(
  task: string,
  config: ComplexityConfig = DEFAULT_CONFIG,
): number {
  let score = 0

  // Keyword-based scoring
  const taskLower = task.toLowerCase()
  for (const [keyword, weight] of Object.entries(config.keywordWeights)) {
    if (taskLower.includes(keyword.toLowerCase())) {
      score += weight
    }
  }

  // Task type detection
  for (const [taskType, weight] of Object.entries(config.taskTypeWeights)) {
    if (taskLower.includes(taskType.toLowerCase())) {
      score += weight
    }
  }

  return score
}

/**
 * Detect if task mentions multiple files
 */
export function detectFileCount(task: string): number {
  // Match patterns like "5 files", "10+ files", "multiple files"
  const patterns = [
    /(\d+)\s*(?:个|files?|files)/i,
    /(\d+)\+/,
    /multiple\s+(?:files?|个)/i,
    /many\s+(?:files?|个)/i,
  ]

  for (const pattern of patterns) {
    const match = task.match(pattern)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }
  }

  return 0
}

/**
 * Detect task type from input
 */
export function detectTaskType(task: string): string | null {
  const taskLower = task.toLowerCase()

  const taskTypes = [
    { pattern: /rebuild|re-create|重新构建/i, type: 'redesign' },
    { pattern: /refactor|重构/i, type: 'refactor' },
    { pattern: /migrate|迁移/i, type: 'migration' },
    { pattern: /implement|实现/i, type: 'implement' },
    { pattern: /integrate|集成/i, type: 'integration' },
    { pattern: /break\s*down|分解/i, type: 'breakdown' },
    { pattern: /fix|bug|修复/i, type: 'bug_fix' },
    { pattern: /test|测试/i, type: 'testing' },
    { pattern: /review|审查/i, type: 'review' },
  ]

  for (const { pattern, type } of taskTypes) {
    if (pattern.test(taskLower)) {
      return type
    }
  }

  return null
}

/**
 * Main complexity detection function
 */
export function detectComplexity(task: string, fileCount?: number): ComplexitySignal {
  const reasons: string[] = []
  let baseScore = calculateComplexityScore(task)

  // Add file count contribution
  const detectedFileCount = fileCount ?? detectFileCount(task)
  if (detectedFileCount >= 10) {
    baseScore += 3
    reasons.push(`涉及 ${detectedFileCount} 个文件`)
  } else if (detectedFileCount >= 5) {
    baseScore += 2
    reasons.push(`涉及多个文件 (${detectedFileCount})`)
  }

  // Task type contribution
  const taskType = detectTaskType(task)
  if (taskType) {
    reasons.push(`任务类型: ${taskType}`)
    if (['redesign', 'refactor', 'migration'].includes(taskType)) {
      baseScore += 2
    }
  }

  // Determine level and confidence
  let level: ComplexityLevel
  let confidence: number

  if (baseScore >= 6) {
    level = 'high'
    confidence = Math.min(0.95, baseScore / 10)
  } else if (baseScore >= 3) {
    level = 'medium'
    confidence = Math.min(0.85, baseScore / 7)
  } else {
    level = 'low'
    confidence = 0.6
  }

  // Add reasoning
  if (baseScore >= 3) {
    reasons.unshift(`复杂度评分: ${baseScore}`)
  }

  return { level, confidence, reasons }
}

/**
 * Check if auto-activation should be suggested
 */
export function shouldSuggestAutoActivation(
  task: string,
  fileCount?: number,
): { should: boolean; reason: string } {
  const signal = detectComplexity(task, fileCount)

  if (signal.level === 'high' && signal.confidence >= 0.7) {
    return {
      should: true,
      reason: `检测到复杂任务 (${signal.reasons.join(', ')})`,
    }
  }

  if (signal.level === 'medium' && signal.confidence >= 0.75) {
    return {
      should: true,
      reason: `可能需要多角色协作 (${signal.reasons.join(', ')})`,
    }
  }

  return { should: false, reason: '' }
}

/**
 * Get recommended roles for a task
 */
export function getRecommendedRoles(task: string): Array<{ id: string; priority: number }> {
  const roles: Array<{ id: string; priority: number }> = [
    { id: 'planner', priority: 1 },
    { id: 'executor', priority: 2 },
    { id: 'reviewer', priority: 3 },
  ]

  const taskLower = task.toLowerCase()

  // Increase planner priority for design/refactor tasks
  if (/design|架构|设计|refactor|重构/i.test(taskLower)) {
    roles[0].priority = 3
    roles[1].priority = 1
  }

  // Increase reviewer priority for bug fix tasks
  if (/fix|bug|修复/i.test(taskLower)) {
    roles[2].priority = 3
  }

  // Sort by priority (lower = more important first)
  return roles.sort((a, b) => a.priority - b.priority)
}

/**
 * Format complexity report as string
 */
export function formatComplexityReport(signal: ComplexitySignal): string {
  const lines = [
    `复杂度: ${signal.level}`,
    `置信度: ${Math.round(signal.confidence * 100)}%`,
    `原因: ${signal.reasons.join(' | ')}`,
  ]
  return lines.join('\n')
}
