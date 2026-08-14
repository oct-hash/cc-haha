// Extracted from REPL.tsx — the messages state hub. useREPLMessages owns the
// messages array plus the eager messagesRef-syncing setMessages wrapper, the
// idle-hint flag, and the input-on-processing placeholder baseline setter.

import type * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import type { Message as MessageType } from '../types/message.js'
import { isHumanTurn } from '../utils/messagePredicates.js'

export interface UseREPLMessagesParams {
  initialMessages?: MessageType[]
  userInputBaselineRef: React.MutableRefObject<number>
  userMessagePendingRef: React.MutableRefObject<boolean>
  setUserInputOnProcessingRaw: React.Dispatch<React.SetStateAction<string | undefined>>
}

export function useREPLMessages(params: UseREPLMessagesParams) {
  const {
    initialMessages,
    userInputBaselineRef,
    userMessagePendingRef,
    setUserInputOnProcessingRaw,
  } = params
  const [messages, rawSetMessages] = useState<MessageType[]>(initialMessages ?? [])
  const messagesRef = useRef(messages)
  // Stores the willowMode variant that was shown (or false if no hint shown).
  // Captured at hint_shown time so hint_converted telemetry reports the same
  // variant — the GrowthBook value shouldn't change mid-session, but reading
  // it once guarantees consistency between the paired events.
  const idleHintShownRef = useRef<string | false>(false)
  // Wrap setMessages so messagesRef is always current the instant the
  // call returns — not when React later processes the batch.  Apply the
  // updater eagerly against the ref, then hand React the computed value
  // (not the function).  rawSetMessages batching becomes last-write-wins,
  // and the last write is correct because each call composes against the
  // already-updated ref.  This is the Zustand pattern: ref is source of
  // truth, React state is the render projection.  Without this, paths
  // that queue functional updaters then synchronously read the ref
  // (e.g. handleSpeculationAccept → onQuery) see stale data.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  const setMessages = useCallback((action: React.SetStateAction<MessageType[]>) => {
    const prev = messagesRef.current
    const next = typeof action === 'function' ? action(messagesRef.current) : action
    messagesRef.current = next
    if (next.length < userInputBaselineRef.current) {
      // Shrank (compact/rewind/clear) — clamp so placeholderText's length
      // check can't go stale.
      userInputBaselineRef.current = 0
    } else if (next.length > prev.length && userMessagePendingRef.current) {
      // Grew while the submitted user message hasn't landed yet. If the
      // added messages don't include it (bridge status, hook results,
      // scheduled tasks landing async during processUserInputBase), bump
      // baseline so the placeholder stays visible. Once the user message
      // lands, stop tracking — later additions (assistant stream) should
      // not re-show the placeholder.
      const delta = next.length - prev.length
      const added =
        prev.length === 0 || next[0] === prev[0] ? next.slice(-delta) : next.slice(0, delta)
      if (added.some(isHumanTurn)) {
        userMessagePendingRef.current = false
      } else {
        userInputBaselineRef.current = next.length
      }
    }
    rawSetMessages(next)
  }, [])
  // Capture the baseline message count alongside the placeholder text so
  // the render can hide it once displayedMessages grows past the baseline.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  const setUserInputOnProcessing = useCallback((input: string | undefined) => {
    if (input !== undefined) {
      userInputBaselineRef.current = messagesRef.current.length
      userMessagePendingRef.current = true
    } else {
      userMessagePendingRef.current = false
    }
    setUserInputOnProcessingRaw(input)
  }, [])

  return {
    messages,
    messagesRef,
    setMessages,
    idleHintShownRef,
    setUserInputOnProcessing,
  }
}
