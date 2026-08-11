// Extracted from REPL.handlers.ts — stream domain

import { randomUUID } from 'crypto'
import type { RefObject } from 'react'
import type { SpinnerMode } from '../components/Spinner.js'
import { getSessionManager } from '../services/agents/session-manager.js'
import type { AgentKind } from '../services/agents/types.js'
import type { Message as MessageType } from '../types/message.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { getMessagesAfterCompactBoundary, handleMessageFromStream, isCompactBoundaryMessage, type StreamingThinking, type StreamingToolUse } from '../utils/messages.js'
import { isEphemeralToolProgress, removeTranscriptMessage } from '../utils/sessionStorage.js'

// -- Agent adapter bridge: converts NormalizedEvent → stream_event for onQueryEvent ---

export type QueryEvent = Parameters<typeof handleMessageFromStream>[0]

function makeTextEvent(text: string): QueryEvent {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
      index: 0,
    },
  }
}

export async function bridgeAdapterStream(
  kind: AgentKind,
  userMessage: string,
  abortController: AbortController,
  onQueryEvent: (event: QueryEvent) => void,
): Promise<void> {
  const sm = getSessionManager()

  // Reuse existing session for this agent kind, or create one
  const existing = sm.listSessions().find((s) => s.agentKind === kind)
  const handle =
    existing ??
    sm.createSession(kind, {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })
  if (!existing) await sm.save()

  for await (const ev of handle.chatStream(userMessage, abortController)) {
    switch (ev.type) {
      case 'session':
        onQueryEvent(makeTextEvent(`\n🆔 Session: ${ev.sessionId}\n`))
        break
      case 'text_chunk':
        onQueryEvent(makeTextEvent(ev.content))
        break
      case 'tool_call_start':
        onQueryEvent(makeTextEvent(`\n🔧 ${ev.name}(${ev.inputPreview})\n`))
        break
      case 'tool_call_end':
        onQueryEvent(
          makeTextEvent(
            ev.isError
              ? `\n❌ ${ev.outputPreview || '(no output)'}\n`
              : `\n📋 ${ev.outputPreview || '(no output)'}\n`,
          ),
        )
        break
      case 'error':
        onQueryEvent(makeTextEvent(`\n⚠️ ${ev.message}\n`))
        break
      case 'done':
        break
    }
  }

  // Persist updated metadata (tokens, tool calls, errors)
  await sm.save()
}

export interface HandleQueryEventParams {
  event: QueryEvent
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setResponseLength: (updater: (length: number) => number) => void
  setStreamMode: (mode: SpinnerMode) => void
  setStreamingToolUses: (uses: StreamingToolUse[]) => void
  setStreamingThinking: (thinking: StreamingThinking | null) => void
  onStreamingText: (f: (current: string | null) => string | null) => void
  setConversationId: (value: string | ((prev: string) => string)) => void
  responseLengthRef: RefObject<number>
  apiMetricsRef: RefObject<
    {
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }[]
  >
  setContextBlocked?: (blocked: boolean) => void
}

export function handleQueryEvent(params: HandleQueryEventParams): void {
  const {
    event,
    setMessages,
    setResponseLength,
    setStreamMode,
    setStreamingToolUses,
    setStreamingThinking,
    onStreamingText,
    setConversationId,
    responseLengthRef,
    apiMetricsRef,
    setContextBlocked,
  } = params

  handleMessageFromStream(
    event,
    (newMessage) => {
      if (isCompactBoundaryMessage(newMessage)) {
        if (isFullscreenEnvEnabled()) {
          setMessages((old) => [
            ...getMessagesAfterCompactBoundary(old, {
              includeSnipped: true,
            }),
            newMessage,
          ])
        } else {
          setMessages(() => [newMessage])
        }
        setConversationId(randomUUID())
        setContextBlocked?.(false)
      } else if (newMessage.type === 'progress' && isEphemeralToolProgress(newMessage.data.type)) {
        setMessages((oldMessages) => {
          const last = oldMessages.at(-1)
          if (
            last?.type === 'progress' &&
            last.parentToolUseID === newMessage.parentToolUseID &&
            last.data.type === newMessage.data.type
          ) {
            const copy = oldMessages.slice()
            copy[copy.length - 1] = newMessage
            return copy
          }
          return [...oldMessages, newMessage]
        })
      } else {
        setMessages((oldMessages) => [...oldMessages, newMessage])
      }
      if (setContextBlocked) {
        if (
          newMessage.type === 'assistant' &&
          'isApiErrorMessage' in newMessage &&
          newMessage.isApiErrorMessage
        ) {
          setContextBlocked(true)
        } else if (newMessage.type === 'assistant') {
          setContextBlocked(false)
        }
      }
    },
    (newContent) => {
      setResponseLength((length) => length + newContent.length)
    },
    setStreamMode,
    setStreamingToolUses,
    (tombstonedMessage) => {
      setMessages((oldMessages) => oldMessages.filter((m) => m !== tombstonedMessage))
      void removeTranscriptMessage(tombstonedMessage.uuid)
    },
    setStreamingThinking,
    (metrics) => {
      const now = Date.now()
      const baseline = responseLengthRef.current
      apiMetricsRef.current.push({
        ...metrics,
        firstTokenTime: now,
        lastTokenTime: now,
        responseLengthBaseline: baseline,
        endResponseLength: baseline,
      })
    },
    onStreamingText,
  )
}
