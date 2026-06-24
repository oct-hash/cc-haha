/**
 * Review Summary Command
 * Aggregates all session reviews and generates improvement suggestions.
 */
import type { Command, LocalCommandModule, LocalCommandResult } from '../../commands.js'

const reviewSummary = {
  type: 'local',
  name: 'review-summary',
  description: 'Aggregate all session reviews and generate improvement suggestions',
  aliases: ['reviews', '复盘总结'],
  supportsNonInteractive: true,
  load: async (): Promise<LocalCommandModule> => {
    const { reviewSummaryCommand } = await import('./reviewSummary.js')

    const call = async (): Promise<LocalCommandResult> => {
      const result = await reviewSummaryCommand()
      return { type: 'text', value: result }
    }

    return { call }
  },
} satisfies Command

export default reviewSummary
