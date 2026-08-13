/**
 * Task Done Command
 * Triggered when user says "任务完成", "完成", "done" etc.
 * Analyzes the task execution and generates comprehensive review report.
 */
import type { Command, LocalCommandModule, LocalCommandResult } from '../../commands.js'
import type { LocalJSXCommandContext } from '../../types/command.js'
import type { Message } from '../../types/message.js'

const taskDone = {
  type: 'local',
  name: 'task-done',
  description: '任务完成后自动复盘 - 检查工具使用、评估合理性、总结迭代建议',
  aliases: ['done', '任务完成', '完成任务', '复盘', 'review'],
  supportsNonInteractive: true,
  load: async (): Promise<LocalCommandModule> => {
    const { taskDoneCommand } = await import('./taskDone.js')

    // Adapter to match LocalCommandCall signature
    const call = async (
      args: string,
      context: LocalJSXCommandContext,
    ): Promise<LocalCommandResult> => {
      const messages = context.messages as Message[]
      const result = await taskDoneCommand(args, { messages })
      return { type: 'text', value: result }
    }

    return { call }
  },
} satisfies Command

export default taskDone
