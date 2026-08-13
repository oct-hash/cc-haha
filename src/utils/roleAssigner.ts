/**
 * Role Assigner - Swarm Integration
 * Maps task characteristics to swarm teammate roles
 *
 * Uses existing teammate system:
 * - TeammateIdentity for agent identification
 * - agentType mapping to built-in agents (PLAN, GENERAL_PURPOSE, VERIFICATION)
 * - Task analysis for role recommendation
 */

import type { ComplexityLevel } from './taskComplexity.js'

export interface RoleAssignment {
  roleId: 'planner' | 'executor' | 'reviewer'
  roleName: string
  priority: number
  agentType: string
  taskScope: string[]
}

export interface TaskAnalysis {
  taskType: 'implement' | 'refactor' | 'fix' | 'design' | 'review' | 'unknown'
  complexity: ComplexityLevel
  requiresPlanning: boolean
  requiresReview: boolean
  requiresExecution: boolean
}

/**
 * Map task type to agent type in the existing system
 */
const TASK_TYPE_TO_AGENT_TYPE: Record<string, string> = {
  implement: 'GENERAL_PURPOSE',
  refactor: 'PLAN',
  design: 'PLAN',
  fix: 'GENERAL_PURPOSE',
  review: 'VERIFICATION',
  unknown: 'GENERAL_PURPOSE',
}

/**
 * Role scope definitions (shared with swarm teammate prompts)
 */
const ROLE_SCOPES = {
  planner: ['分析任务需求', '制定执行计划', '分解任务步骤', '识别依赖和风险', '协调团队协作'],
  executor: ['执行代码实现', '运行测试验证', '处理技术细节', '修复遇到的问题', '报告进度状态'],
  reviewer: ['检查代码质量', '验证测试覆盖', '确认需求满足', '提供改进建议', '最终验收签字'],
}

/**
 * Analyze task to determine required roles
 */
export function analyzeTask(task: string): TaskAnalysis {
  const taskLower = task.toLowerCase()

  // Determine task type
  let taskType: TaskAnalysis['taskType'] = 'unknown'
  if (/implement|实现|新功能|create|build/i.test(taskLower)) {
    taskType = 'implement'
  } else if (/refactor|重构|重写|rewrite/i.test(taskLower)) {
    taskType = 'refactor'
  } else if (/fix|bug|修复|repair/i.test(taskLower)) {
    taskType = 'fix'
  } else if (/design|架构|设计|plan/i.test(taskLower)) {
    taskType = 'design'
  } else if (/review|审查|检查|verify/i.test(taskLower)) {
    taskType = 'review'
  }

  // Get complexity from taskComplexity
  const complexitySignal = detectComplexityFromTask(task)
  const complexity = complexitySignal

  // Determine role requirements based on task characteristics
  const requiresPlanning =
    ['design', 'refactor', 'implement'].includes(taskType) || complexity === 'high'
  const requiresReview =
    ['fix', 'refactor', 'implement', 'design'].includes(taskType) || complexity !== 'low'
  const requiresExecution =
    ['implement', 'fix', 'refactor'].includes(taskType) || taskType === 'unknown'

  return {
    taskType,
    complexity,
    requiresPlanning,
    requiresReview,
    requiresExecution,
  }
}

/**
 * Simple complexity detection for role assignment
 */
function detectComplexityFromTask(task: string): ComplexityLevel {
  const taskLower = task.toLowerCase()

  // High complexity indicators
  const highComplexityPatterns = [
    /rebuild|re-create|重新构建/i,
    /refactor.*multiple|重构.*多个/i,
    /migrate|迁移/i,
    /architecture|架构/i,
    /design.*pattern|设计模式/i,
    /(\d+)\s*(?:个|files?|files)/i, // mentions multiple files
  ]

  // Medium complexity indicators
  const mediumComplexityPatterns = [
    /implement|实现/i,
    /new.*feature|新功能/i,
    /integration|集成/i,
    /optimize|优化/i,
    /refactor|重构/i,
  ]

  for (const pattern of highComplexityPatterns) {
    if (pattern.test(taskLower)) return 'high'
  }

  for (const pattern of mediumComplexityPatterns) {
    if (pattern.test(taskLower)) return 'medium'
  }

  return 'low'
}

/**
 * Get role assignments based on task analysis
 */
export function getRoleAssignments(task: string): RoleAssignment[] {
  const analysis = analyzeTask(task)
  const assignments: RoleAssignment[] = []

  // Planner role
  if (analysis.requiresPlanning) {
    assignments.push({
      roleId: 'planner',
      roleName: 'Planner',
      priority: 1,
      agentType: TASK_TYPE_TO_AGENT_TYPE[analysis.taskType] || 'PLAN',
      taskScope: ROLE_SCOPES.planner,
    })
  }

  // Executor role
  if (analysis.requiresExecution) {
    assignments.push({
      roleId: 'executor',
      roleName: 'Executor',
      priority: 2,
      agentType: 'GENERAL_PURPOSE',
      taskScope: ROLE_SCOPES.executor,
    })
  }

  // Reviewer role
  if (analysis.requiresReview) {
    assignments.push({
      roleId: 'reviewer',
      roleName: 'Reviewer',
      priority: 3,
      agentType: 'VERIFICATION',
      taskScope: ROLE_SCOPES.reviewer,
    })
  }

  return assignments
}

/**
 * Get workflow sequence based on task type
 * This determines the order of role activation
 */
export function getWorkflowSequence(task: string): string[] {
  const analysis = analyzeTask(task)

  switch (analysis.taskType) {
    case 'design':
      return ['planner', 'executor', 'reviewer']
    case 'implement':
      return analysis.complexity === 'high'
        ? ['planner', 'executor', 'reviewer']
        : ['executor', 'reviewer']
    case 'refactor':
      return ['planner', 'executor', 'reviewer']
    case 'fix':
      return ['executor', 'reviewer']
    case 'review':
      return ['reviewer']
    default:
      return analysis.complexity === 'high'
        ? ['planner', 'executor', 'reviewer']
        : ['executor', 'reviewer']
  }
}

/**
 * Get role prompts for swarm teammates
 */
export function getRolePrompt(role: 'planner' | 'executor' | 'reviewer', task: string): string {
  const prompts = {
    planner: `You are the Planner agent for this task.

Task: ${task}

Your responsibilities:
${ROLE_SCOPES.planner.map((s) => `- ${s}`).join('\n')}

Analyze the task, create a detailed plan, and be ready to hand off to the Executor.`,

    executor: `You are the Executor agent for this task.

Task: ${task}

Your responsibilities:
${ROLE_SCOPES.executor.map((s) => `- ${s}`).join('\n')}

Follow the plan (if provided by Planner), implement the solution, and verify your work.`,

    reviewer: `You are the Reviewer agent for this task.

Task: ${task}

Your responsibilities:
${ROLE_SCOPES.reviewer.map((s) => `- ${s}`).join('\n')}

Review the implementation thoroughly, check quality and coverage, and provide feedback.`,
  }

  return prompts[role]
}

/**
 * Format role assignment for display
 */
export function formatRoleAssignment(assignment: RoleAssignment): string {
  const scope = assignment.taskScope.join(', ')
  return `[${assignment.roleName}] ${scope}`
}

/**
 * Format workflow sequence as string
 */
export function formatWorkflow(sequence: string[]): string {
  return sequence.map((role) => `[${role}]`).join(' → ')
}

/**
 * Get recommended agent type for a role
 */
export function getAgentTypeForRole(role: string): string {
  switch (role) {
    case 'planner':
      return 'PLAN'
    case 'executor':
      return 'GENERAL_PURPOSE'
    case 'reviewer':
      return 'VERIFICATION'
    default:
      return 'GENERAL_PURPOSE'
  }
}

/**
 * Check if task requires planner role (needs upfront planning)
 */
export function requiresPlannerRole(task: string): boolean {
  const analysis = analyzeTask(task)
  return analysis.requiresPlanning
}

/**
 * Check if task requires review (needs quality verification)
 */
export function requiresReviewRole(task: string): boolean {
  const analysis = analyzeTask(task)
  return analysis.requiresReview
}
