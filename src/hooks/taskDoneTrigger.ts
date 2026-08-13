/**
 * Task Done Trigger Hook
 * Automatically detects "任务完成" type phrases in user input
 * and triggers the review analysis.
 */

import {
  formatReviewForDisplay,
  generateTaskReview,
  isTaskDoneTrigger,
  saveReviewToSession,
} from '../commands/task-done/taskDone.js'
import type { Message } from '../types/message.js'
import { getSessionManager } from '../utils/sessionContext.js'

interface TaskDoneTriggerOptions {
  messages: Message[]
  input: string
  onReviewReady?: (reviewText: string) => void
}

/**
 * Check if input should trigger automatic task review
 */
export function checkTaskDoneTrigger(input: string): boolean {
  return isTaskDoneTrigger(input)
}

/**
 * Process task done trigger - generates and saves review
 */
export async function processTaskDoneTrigger(
  options: TaskDoneTriggerOptions,
): Promise<string | null> {
  const { messages, input, onReviewReady } = options

  if (!checkTaskDoneTrigger(input)) {
    return null
  }

  try {
    // Generate review based on current session messages
    const review = await generateTaskReview(messages)

    // Save to session for periodic aggregation
    saveReviewToSession(review)

    // Format for display
    const reviewText = formatReviewForDisplay(review)

    // Notify via callback if provided
    onReviewReady?.(reviewText)

    return reviewText
  } catch (error) {
    console.error('[TaskDoneTrigger] Failed to process review:', error)
    return null
  }
}

/**
 * Get all reviews from current session
 */
export function getSessionReviews(): ReturnType<typeof getSessionManager> extends {
  getSession(): { context: { reviews: infer R } } | null
}
  ? R
  : never {
  const sessionManager = getSessionManager()
  const session = sessionManager.getSession()
  return session?.context.reviews ?? []
}
