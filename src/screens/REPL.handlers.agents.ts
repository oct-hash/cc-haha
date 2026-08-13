// Extracted from REPL.handlers.ts — agents domain

import type { ContentBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { randomUUID } from 'crypto'
import type { RefObject } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import { getSystemPrompt } from '../constants/prompts.js'
import { getSystemContext, getUserContext } from '../context.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { getSessionManager } from '../services/agents/session-manager.js'
import type { AgentKind } from '../services/agents/types.js'
import { resetMicrocompactState } from '../services/compact/microCompact.js'
import { injectUserMessageToTeammate } from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { InProcessTeammateTaskState } from '../tasks/InProcessTeammateTask/types.js'
import {
  appendMessageToLocalAgent,
  isLocalAgentTask,
  type LocalAgentTaskState,
  queuePendingMessage,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { startBackgroundSession } from '../tasks/LocalMainSessionTask.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { resumeAgentBackground } from '../tools/AgentTool/resumeAgent.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import { createAbortController } from '../utils/abortController.js'
import { createAttachmentMessage, getQueuedCommandAttachments } from '../utils/attachments.js'
import type { PastedContent } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import {
  enqueuePendingNotification,
  removeByFilter,
  type SetAppState,
} from '../utils/messageQueueManager.js'
import { createUserMessage, textForResubmit } from '../utils/messages.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { getQuerySourceForREPL } from '../utils/promptCategory.js'
import { buildEffectiveSystemPrompt } from '../utils/systemPrompt.js'

export interface HandleAgentSubmitParams {
  input: string
  task: InProcessTeammateTaskState | LocalAgentTaskState
  helpers: PromptInputHelpers
  setAppState: SetAppState
  setInputValue: (value: string) => void
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    model: string,
  ) => ProcessUserInputContext
  canUseTool: CanUseToolFn
  mainLoopModel: string
  messagesRef: RefObject<MessageType[]>
  onResumeFailed: (agentId: string, errorMessage: string) => void
}

export async function handleAgentSubmit(params: HandleAgentSubmitParams): Promise<void> {
  const {
    input,
    task,
    helpers,
    setAppState,
    setInputValue,
    getToolUseContext,
    canUseTool,
    mainLoopModel,
    messagesRef,
    onResumeFailed,
  } = params

  if (isLocalAgentTask(task)) {
    appendMessageToLocalAgent(task.id, createUserMessage({ content: input }), setAppState)
    if (task.status === 'running') {
      queuePendingMessage(task.id, input, setAppState)
    } else {
      void resumeAgentBackground({
        agentId: task.id,
        prompt: input,
        toolUseContext: getToolUseContext(
          messagesRef.current,
          [],
          new AbortController(),
          mainLoopModel,
        ),
        canUseTool,
      }).catch((err) => {
        logForDebugging(`resumeAgentBackground failed: ${errorMessage(err)}`)
        onResumeFailed(task.id, errorMessage(err))
      })
    }
  } else {
    injectUserMessageToTeammate(task.id, input, setAppState)
  }
  setInputValue('')
  helpers.setCursorOffset(0)
  helpers.clearBuffer()
}

export interface HandleRewindConversationToParams {
  message: UserMessage
  messagesRef: RefObject<MessageType[]>
  setMessages: (updater: MessageType[] | ((prev: MessageType[]) => MessageType[])) => void
  setConversationId: (id: string) => void
  setAppState: SetAppState
  onRewind?: () => void
}

export function handleRewindConversationTo(params: HandleRewindConversationToParams): void {
  const { message, messagesRef, setMessages, setConversationId, setAppState, onRewind } = params
  const prev = messagesRef.current
  const messageIndex = prev.lastIndexOf(message)
  if (messageIndex === -1) return

  logEvent('tengu_conversation_rewind', {
    preRewindMessageCount: prev.length,
    postRewindMessageCount: messageIndex,
    messagesRemoved: prev.length - messageIndex,
    rewindToMessageIndex: messageIndex,
  })

  setMessages(prev.slice(0, messageIndex))
  // Careful, this has to happen after setMessages
  setConversationId(randomUUID())
  // Reset cached microcompact state so stale pinned cache edits
  // don't reference tool_use_ids from truncated messages
  resetMicrocompactState()

  onRewind?.()

  // Restore state from the message we're rewinding to
  setAppState((prev) => ({
    ...prev,
    // Restore permission mode from the message
    toolPermissionContext:
      message.permissionMode && prev.toolPermissionContext.mode !== message.permissionMode
        ? {
            ...prev.toolPermissionContext,
            mode: message.permissionMode,
          }
        : prev.toolPermissionContext,
    // Clear stale prompt suggestion from previous conversation state
    promptSuggestion: {
      text: null,
      promptId: null,
      shownAt: 0,
      acceptedAt: 0,
      generationRequestId: null,
    },
  }))
}

export interface HandleRestoreMessageInputParams {
  message: UserMessage
  setInputValue: (value: string) => void
  setInputMode: (mode: string) => void
  setPastedContents: (contents: Record<number, PastedContent>) => void
}

export function handleRestoreMessageInput(params: HandleRestoreMessageInputParams): void {
  const { message, setInputValue, setInputMode, setPastedContents } = params
  const r = textForResubmit(message)
  if (r) {
    setInputValue(r.text)
    setInputMode(r.mode)
  }

  // Restore pasted images
  if (
    Array.isArray(message.message.content) &&
    message.message.content.some((block: ContentBlockParam) => block.type === 'image')
  ) {
    const imageBlocks: Array<ImageBlockParam> = message.message.content.filter(
      (block: ContentBlockParam) => block.type === 'image',
    )
    if (imageBlocks.length > 0) {
      const newPastedContents: Record<number, PastedContent> = {}
      imageBlocks.forEach((block, index) => {
        if (block.source.type === 'base64') {
          const id = message.imagePasteIds?.[index] ?? index + 1
          newPastedContents[id] = {
            id,
            type: 'image',
            content: block.source.data,
            mediaType: block.source.media_type,
          }
        }
      })
      setPastedContents(newPastedContents)
    }
  }
}

export interface HandleBackgroundQueryParams {
  abortController: AbortController | null
  messagesRef: RefObject<MessageType[]>
  mainLoopModel: string
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  additionalWorkingDirectories: string[]
  mainThreadAgentDefinition: AgentDefinition | undefined
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  canUseTool: CanUseToolFn
  setAppState: SetAppState
  terminalTitle: string
}

export async function handleBackgroundQuery(params: HandleBackgroundQueryParams): Promise<void> {
  const {
    abortController,
    messagesRef,
    mainLoopModel,
    getToolUseContext,
    additionalWorkingDirectories,
    mainThreadAgentDefinition,
    customSystemPrompt,
    appendSystemPrompt,
    canUseTool,
    setAppState,
    terminalTitle,
  } = params

  const agentKind = getSessionManager().getActiveKind()

  // Non-haha agents: delegate to SessionManager bridge stream
  if (agentKind !== 'claude-haha') {
    abortController?.abort('background')
    startBackgroundBridgeStream({
      kind: agentKind,
      userText: terminalTitle,
      messagesRef,
    })
    return
  }

  abortController?.abort('background')
  const removedNotifications = removeByFilter((cmd) => cmd.mode === 'task-notification')

  const toolUseContext = getToolUseContext(
    messagesRef.current,
    [],
    new AbortController(),
    mainLoopModel,
  )
  const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
    getSystemPrompt(
      toolUseContext.options.tools,
      mainLoopModel,
      additionalWorkingDirectories,
      toolUseContext.options.mcpClients,
    ),
    getUserContext(),
    getSystemContext(),
  ])
  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition,
    toolUseContext,
    customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt,
  })
  toolUseContext.renderedSystemPrompt = systemPrompt
  const notificationAttachments = await getQueuedCommandAttachments(removedNotifications).catch(
    (err) => {
      logForDebugging(`[agents] getQueuedCommandAttachments failed: ${errorMessage(err)}`)
      return []
    },
  )
  const notificationMessages = notificationAttachments.map(createAttachmentMessage)

  const existingPrompts = new Set<string>()
  for (const m of messagesRef.current) {
    if (
      m.type === 'attachment' &&
      m.attachment.type === 'queued_command' &&
      m.attachment.commandMode === 'task-notification' &&
      typeof m.attachment.prompt === 'string'
    ) {
      existingPrompts.add(m.attachment.prompt)
    }
  }
  const uniqueNotifications = notificationMessages.filter(
    (m) =>
      m.attachment.type === 'queued_command' &&
      (typeof m.attachment.prompt !== 'string' || !existingPrompts.has(m.attachment.prompt)),
  )
  startBackgroundSession({
    messages: [...messagesRef.current, ...uniqueNotifications],
    queryParams: {
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext,
      querySource: getQuerySourceForREPL(),
    },
    description: terminalTitle,
    setAppState,
    agentDefinition: mainThreadAgentDefinition,
  })
}

// -- Background bridge for Ctrl+B with non-haha agents -----------------------

async function startBackgroundBridgeStream({
  kind,
  userText,
  messagesRef,
}: {
  kind: AgentKind
  userText: string
  messagesRef: RefObject<MessageType[]>
}): Promise<void> {
  const sm = getSessionManager()
  const handle = sm.createSession(kind, {
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  })
  await sm.save()

  const abortController = createAbortController()

  // Fire-and-forget: stream in background, notify on completion
  void (async () => {
    let output = ''
    try {
      for await (const ev of handle.chatStream(userText, abortController)) {
        switch (ev.type) {
          case 'text_chunk':
            output += ev.content
            break
          case 'tool_call_start':
            output += `\n${ev.name}(${ev.inputPreview})\n`
            break
          case 'tool_call_end':
            if (ev.isError) {
              output += `\n${ev.outputPreview || '(no output)'}\n`
            }
            break
          case 'error':
            output += `\n${ev.message}\n`
            break
          case 'done':
          case 'session':
            break
        }
      }

      if (output.trim()) {
        enqueuePendingNotification({
          value: output.trim(),
          mode: 'task-notification',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      enqueuePendingNotification({
        value: `[${kind}] ${msg}`,
        mode: 'task-notification',
      })
    } finally {
      handle.destroy()
      sm.save().catch((err) => {
        logForDebugging(
          `[agents] SessionManager save() failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }
  })()
}
