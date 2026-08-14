// Extracted from REPL.tsx — spinner-tip selection plus loading-state reset.
// useREPLIdleReset owns the once-per-turn tip guard (tipPickedThisTurnRef)
// and the resetLoadingState callback that clears streaming/spinner UI state.

import * as React from 'react'
import { useCallback, } from 'react'
import { getTipToShowOnSpinner, recordShownTip } from 'src/services/tips/tipScheduler.js'
import type { Theme, ThemeName } from 'src/utils/theme.js'
import { clearSpeculativeChecks } from '../tools/BashTool/bashPermissions.js'
import type { Message as MessageType } from '../types/message.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import type { StreamingToolUse } from '../utils/messages.js'
import { extractBashToolsFromMessages } from '../utils/queryHelpers.js'
import { endInteractionSpan } from '../utils/telemetry/sessionTracing.js'

export interface UseREPLIdleResetParams {
  setAppState: SetAppState
  theme: ThemeName
  readFileState: React.MutableRefObject<FileStateCache>
  bashTools: React.MutableRefObject<Set<string>>
  bashToolsProcessedIdx: React.MutableRefObject<number>
  messagesRef: React.MutableRefObject<MessageType[]>
  setIsExternalLoading: (value: boolean) => void
  setUserInputOnProcessing: (input: string | undefined) => void
  responseLengthRef: React.MutableRefObject<number>
  apiMetricsRef: React.MutableRefObject<
    Array<{
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }>
  >
  setStreamingText: React.Dispatch<React.SetStateAction<string | null>>
  setStreamingToolUses: React.Dispatch<React.SetStateAction<StreamingToolUse[]>>
  setSpinnerMessage: React.Dispatch<React.SetStateAction<string | null>>
  setSpinnerColor: React.Dispatch<React.SetStateAction<keyof Theme | null>>
  setSpinnerShimmerColor: React.Dispatch<React.SetStateAction<keyof Theme | null>>
}

export function useREPLIdleReset(params: UseREPLIdleResetParams) {
  const {
    setAppState,
    theme,
    readFileState,
    bashTools,
    bashToolsProcessedIdx,
    messagesRef,
    setIsExternalLoading,
    setUserInputOnProcessing,
    responseLengthRef,
    apiMetricsRef,
    setStreamingText,
    setStreamingToolUses,
    setSpinnerMessage,
    setSpinnerColor,
    setSpinnerShimmerColor,
  } = params

  // resetLoadingState runs twice per turn (onQueryImpl tail + onQuery finally).
  // Without this guard, both calls pick a tip → two recordShownTip → two
  // saveGlobalConfig writes back-to-back. Reset at submit in onSubmit.
  const tipPickedThisTurnRef = React.useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reads stable refs and setters only
  const pickNewSpinnerTip = useCallback(() => {
    if (tipPickedThisTurnRef.current) return
    tipPickedThisTurnRef.current = true
    const newMessages = messagesRef.current.slice(bashToolsProcessedIdx.current)
    for (const tool of extractBashToolsFromMessages(newMessages)) {
      bashTools.current.add(tool)
    }
    bashToolsProcessedIdx.current = messagesRef.current.length
    void getTipToShowOnSpinner({
      theme,
      readFileState: readFileState.current,
      bashTools: bashTools.current,
    }).then(async (tip) => {
      if (tip) {
        const content = await tip.content({
          theme,
        })
        setAppState((prev) => ({
          ...prev,
          spinnerTip: content,
        }))
        recordShownTip(tip)
      } else {
        setAppState((prev) => {
          if (prev.spinnerTip === undefined) return prev
          return {
            ...prev,
            spinnerTip: undefined,
          }
        })
      }
    })
  }, [setAppState, theme])

  // Resets UI loading state. Does NOT call onTurnComplete - that should be
  // called explicitly only when a query turn actually completes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets stable refs and setters only
  const resetLoadingState = useCallback(() => {
    // isLoading is now derived from queryGuard — no setter call needed.
    // queryGuard.end() (onQuery finally) or cancelReservation() (executeUserInput
    // finally) have already transitioned the guard to idle by the time this runs.
    // External loading (remote/backgrounding) is reset separately by those hooks.
    setIsExternalLoading(false)
    setUserInputOnProcessing(undefined)
    responseLengthRef.current = 0
    apiMetricsRef.current = []
    setStreamingText(null)
    setStreamingToolUses([])
    setSpinnerMessage(null)
    setSpinnerColor(null)
    setSpinnerShimmerColor(null)
    pickNewSpinnerTip()
    endInteractionSpan()
    // Speculative bash classifier checks are only valid for the current
    // turn's commands — clear after each turn to avoid accumulating
    // Promise chains for unconsumed checks (denied/aborted paths).
    clearSpeculativeChecks()
  }, [pickNewSpinnerTip])

  return {
    resetLoadingState,
    tipPickedThisTurnRef,
  }
}
