// Extracted from REPL.tsx — render preparation: transcript-mode computed
// values (inTranscript, frozen message slices, global keybinding props), the
// transcript early-return JSX, the viewed-agent task selectors, the visible
// message/placeholder/tool-permission/companion computations, the
// mainRenderProps object, and the final mainReturn JSX tree.
// useREPLRenderPrep owns the trailing render-prep block of REPL(). All
// externally captured values are passed via UseREPLRenderPrepParams; only
// module-scope handler/component imports are resolved here directly.

import type * as React from 'react'
import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react'
import { MIN_COLS_FOR_FULL_SPRITE } from '../buddy/CompanionSprite.js'
import {
  PermissionRequest,
  type ToolUseConfirm,
} from '../components/permissions/PermissionRequest.js'
import { useBackgroundTaskNavigation } from '../hooks/useBackgroundTaskNavigation.js'
import { useTeammateViewAutoExit } from '../hooks/useTeammateViewAutoExit.js'
import { AlternateScreen } from '../ink/components/AlternateScreen.js'
import { isInProcessTeammateTask } from '../tasks/InProcessTeammateTask/types.js'
import { isLocalAgentTask } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskState } from '../tasks/types.js'
import type { Message as MessageType } from '../types/message.js'
import { createAbortController } from '../utils/abortController.js'
import { isFullscreenEnvEnabled, isMouseTrackingEnabled } from '../utils/fullscreen.js'
import type { MainRenderProps, TranscriptViewProps } from './REPL.render.js'
import { MainRender, TranscriptView } from './REPL.render.js'
import type { Screen } from './REPL.types.js'

export type UseREPLRenderPrepParams = Omit<
  MainRenderProps,
  | 'toolPermissionOverlay'
  | 'viewedAgentTask'
  | 'companionVisible'
  | 'companionNarrow'
  | 'viewedTeammateTask'
  | 'displayedMessages'
  | 'placeholderText'
  | 'globalKeybindingProps'
  | 'userInputOnProcessing'
> & {
  // Transcript-mode search/highlight state (not part of MainRenderProps)
  virtualScrollActive: boolean
  setSearchQuery: Dispatch<SetStateAction<string>>
  setSearchCount: Dispatch<SetStateAction<number>>
  setSearchCurrent: Dispatch<SetStateAction<number>>
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  setHighlight: TranscriptViewProps['setHighlight']
  setPositions: TranscriptViewProps['setPositions']
  editorGenRef: MutableRefObject<number>
  editorTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined>
  setDumpMode: Dispatch<SetStateAction<boolean>>
  setEditorStatus: Dispatch<SetStateAction<string>>
  handleEnterTranscript: () => void
  handleExitTranscript: () => void
  frozenTranscriptState: {
    messagesLength: number
    streamingToolUsesLength: number
  } | null
  deferredMessages: MessageType[]
  viewingAgentTaskId: string | undefined
  tasks: { [taskId: string]: TaskState }
  userInputBaselineRef: MutableRefObject<number>
  setToolUseConfirmQueue: Dispatch<SetStateAction<ToolUseConfirm[]>>
  handleQueuedCommandOnCancel: () => void
  abortController: AbortController | null
  setPermissionStickyFooter: Dispatch<SetStateAction<React.ReactNode | null>>
  transcriptCols: number
  onSearchMatchesChange: TranscriptViewProps['onSearchMatchesChange']
  scanElement: TranscriptViewProps['scanElement']
  disableVirtualScroll: TranscriptViewProps['disableVirtualScroll']
  dumpMode: TranscriptViewProps['dumpMode']
  jumpRef: TranscriptViewProps['jumpRef']
  setScreen: Dispatch<SetStateAction<Screen>>
  setShowAllInTranscript: Dispatch<SetStateAction<boolean>>
  showStreamingText: boolean
  // Actual type is `string | undefined` (see REPL.hooks.stream.tsx), unlike
  // the boolean declared in MainRenderProps.
  userInputOnProcessing: string | undefined
}

export interface UseREPLRenderPrepResult {
  transcriptView: React.ReactNode
  mainReturn: React.ReactNode
  toolJsxCentered: boolean
  centeredModal: React.ReactNode
}

export function useREPLRenderPrep(params: UseREPLRenderPrepParams): UseREPLRenderPrepResult {
  const {
    screen,
    scrollRef,
    toolJSX,
    disableMessageActions,
    cursor,
    messageActionHandlers,
    modalScrollRef,
    dividerYRef,
    unseenDivider,
    setCursor,
    jumpToNew,
    tools,
    commands,
    verbose,
    toolUseConfirmQueue,
    inProgressToolUseIDs,
    isMessageSelectorVisible,
    conversationId,
    streamingToolUses,
    showAllInTranscript,
    agentDefinitions,
    handleOpenRateLimitOptions,
    isLoading,
    streamingThinking,
    visibleStreamingText,
    isBriefOnly,
    cursorNavRef,
    disabled,
    showSpinner,
    streamMode,
    spinnerTip,
    responseLengthRef,
    apiMetricsRef,
    spinnerMessage,
    stopHookSpinnerSuffix,
    loadingStartTimeRef,
    totalPausedMsRef,
    pauseStartTimeRef,
    spinnerColor,
    spinnerShimmerColor,
    hasRunningTeammates,
    userInputOnProcessing,
    composedOnScroll,
    permissionStickyFooter,
    showExpandedTodos,
    tasksV2,
    sandboxPermissionRequestQueue,
    setAppState,
    setSandboxPermissionRequestQueue,
    sandboxBridgeCleanupRef,
    promptQueue,
    setPromptQueue,
    pendingWorkerRequest,
    pendingSandboxRequest,
    workerSandboxPermissions,
    teamContext,
    elicitation,
    setShowCostDialog,
    setHaveShownCostDialog,
    idleReturnPending,
    setIdleReturnPending,
    setInputValue,
    skipIdleCheckRef,
    onSubmitRef,
    messagesRef,
    messages,
    setMessages,
    haikuTitleAttemptedRef,
    haikuTitle,
    setHaikuTitle,
    bashTools,
    bashToolsProcessedIdx,
    readFileState,
    discoveredSkillNamesRef,
    loadedNestedMemoryPathsRef,
    setConversationId,
    store,
    setShowIdeOnboarding,
    showIdeOnboarding,
    ideInstallationStatus,
    setShowModelSwitchCallout,
    showModelSwitchCallout,
    setShowUndercoverCallout,
    showUndercoverCallout,
    mainLoopModel,
    setShowEffortCallout,
    showEffortCallout,
    showRemoteCallout,
    exitFlow,
    hintRecommendation,
    handleHintResponse,
    lspRecommendation,
    handleLspResponse,
    setShowDesktopUpsellStartup,
    showDesktopUpsellStartup,
    ultraplanPendingChoice,
    ultraplanLaunchPending,
    launchUltraplan,
    mrRender,
    isExiting,
    autoRunIssueReason,
    handleAutoRunIssue,
    handleCancelAutoRunIssue,
    postCompactSurvey,
    memorySurvey,
    feedbackSurvey,
    handleSurveyRequestFeedback,
    didAutoRunIssueRef,
    frustrationDetection,
    skillImprovementSurvey,
    showIssueFlagBanner,
    debug,
    ideSelection,
    hasSuppressedDialogs,
    isShowingLocalJSXCommand,
    getToolUseContext,
    toolPermissionContext,
    setToolPermissionContext,
    apiKeyStatus,
    inputValue,
    mcpClients,
    dynamicMcpConfig,
    strictMcpConfig,
    remountKey,
    pastedContents,
    setPastedContents,
    vimMode,
    setVimMode,
    showBashesDialog,
    setShowBashesDialog,
    onSubmit,
    onAgentSubmit,
    isSearchingHistory,
    setIsSearchingHistory,
    isHelpOpen,
    setIsHelpOpen,
    insertTextRef,
    voice,
    handleBackgroundSession,
    setAutoUpdaterResult,
    autoUpdaterResult,
    inputMode,
    setInputMode,
    stashedPrompt,
    setStashedPrompt,
    submitCount,
    handleShowMessageSelector,
    enterMessageActions,
    handleRestoreMessage,
    messageSelectorPreselect,
    setMessageSelectorPreselect,
    onCancel,
    setIsMessageSelectorVisible,
    addNotification,
    queryGuard,
    titleIsAnimating,
    terminalTitle,
    titleDisabled,
    showStatusInTerminalTab,
    cancelRequestProps,
    focusedInputDialog,
    searchOpen,
    searchQuery,
    searchCount,
    searchCurrent,
    setSearchQuery,
    setSearchOpen,
    setSearchCount,
    setSearchCurrent,
    setHighlight,
    setPositions,
    editorStatus,
    virtualScrollActive,
    editorGenRef,
    editorTimerRef,
    setDumpMode,
    setEditorStatus,
    setScreen,
    setShowAllInTranscript,
    showStreamingText,
    handleEnterTranscript,
    handleExitTranscript,
    frozenTranscriptState,
    deferredMessages,
    viewingAgentTaskId,
    tasks,
    userInputBaselineRef,
    setToolUseConfirmQueue,
    handleQueuedCommandOnCancel,
    abortController,
    setPermissionStickyFooter,
    transcriptCols,
    onSearchMatchesChange,
    scanElement,
    disableVirtualScroll,
    dumpMode,
    jumpRef,
  } = params

  // Fresh `less` per transcript entry. Prevents stale highlights matching
  // unrelated normal-mode text (overlay is alt-screen-global) and avoids
  // surprise n/N on re-entry. Same exit resets [ dump mode — each ctrl+o
  // entry is a fresh instance.
  const inTranscript = screen === 'transcript' && virtualScrollActive
  useEffect(() => {
    if (!inTranscript) {
      setSearchQuery('')
      setSearchCount(0)
      setSearchCurrent(0)
      setSearchOpen(false)
      editorGenRef.current++
      clearTimeout(editorTimerRef.current)
      setDumpMode(false)
      setEditorStatus('')
    }
  }, [inTranscript])
  useEffect(() => {
    setHighlight(inTranscript ? searchQuery : '')
    // Clear the position-based CURRENT (yellow) overlay too. setHighlight
    // only clears the scan-based inverse. Without this, the yellow box
    // persists at its last screen coords after ctrl-c exits transcript.
    if (!inTranscript) setPositions(null)
  }, [inTranscript, searchQuery, setHighlight, setPositions])
  const globalKeybindingProps = {
    screen,
    setScreen,
    showAllInTranscript,
    setShowAllInTranscript,
    messageCount: messages.length,
    onEnterTranscript: handleEnterTranscript,
    onExitTranscript: handleExitTranscript,
    virtualScrollActive,
    // Bar-open is a mode (owns keystrokes — j/k type, Esc cancels).
    // Navigating (query set, bar closed) is NOT — Esc exits transcript,
    // same as less q with highlights still visible. useSearchInput
    // doesn't stopPropagation, so without this gate transcript:exit
    // would fire on the same Esc that cancels the bar (child registers
    // first, fires first, bubbles).
    searchBarOpen: searchOpen,
  }

  // Use frozen lengths to slice arrays, avoiding memory overhead of cloning
  const transcriptMessages = frozenTranscriptState
    ? deferredMessages.slice(0, frozenTranscriptState.messagesLength)
    : deferredMessages
  const transcriptStreamingToolUses = frozenTranscriptState
    ? streamingToolUses.slice(0, frozenTranscriptState.streamingToolUsesLength)
    : streamingToolUses

  // Handle shift+down for teammate navigation and background task management.
  // Guard onOpenBackgroundTasks when a local-jsx dialog (e.g. /mcp) is open —
  // otherwise Shift+Down stacks BackgroundTasksDialog on top and deadlocks input.
  useBackgroundTaskNavigation({
    onOpenBackgroundTasks: isShowingLocalJSXCommand ? undefined : () => setShowBashesDialog(true),
  })
  // Auto-exit viewing mode when teammate completes or errors
  useTeammateViewAutoExit()

  const transcriptView = (
    <TranscriptView
      screen={screen}
      disableVirtualScroll={disableVirtualScroll}
      dumpMode={dumpMode}
      scrollRef={scrollRef}
      transcriptMessages={transcriptMessages}
      tools={tools}
      commands={commands}
      inProgressToolUseIDs={inProgressToolUseIDs}
      conversationId={conversationId}
      agentDefinitions={agentDefinitions}
      transcriptStreamingToolUses={transcriptStreamingToolUses}
      showAllInTranscript={showAllInTranscript}
      handleOpenRateLimitOptions={handleOpenRateLimitOptions}
      isLoading={isLoading}
      streamingThinking={streamingThinking}
      jumpRef={jumpRef}
      onSearchMatchesChange={onSearchMatchesChange}
      scanElement={scanElement}
      setPositions={setPositions}
      toolJSX={toolJSX}
      titleIsAnimating={titleIsAnimating}
      terminalTitle={terminalTitle}
      titleDisabled={titleDisabled}
      showStatusInTerminalTab={showStatusInTerminalTab}
      globalKeybindingProps={globalKeybindingProps}
      voice={voice}
      onSubmit={onSubmit}
      focusedInputDialog={focusedInputDialog}
      searchOpen={searchOpen}
      cancelRequestProps={cancelRequestProps}
      searchCount={searchCount}
      searchCurrent={searchCurrent}
      setSearchQuery={setSearchQuery}
      setSearchOpen={setSearchOpen}
      setSearchCount={setSearchCount}
      setSearchCurrent={setSearchCurrent}
      setHighlight={setHighlight}
      searchQuery={searchQuery}
      editorStatus={editorStatus}
    />
  )

  // Get viewed agent task (inlined from selectors for explicit data flow).
  // viewedAgentTask: teammate OR local_agent — drives the boolean checks
  // below. viewedTeammateTask: teammate-only narrowed, for teammate-specific
  // field access (inProgressToolUseIDs).
  const viewedTask = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined
  const viewedTeammateTask =
    viewedTask && isInProcessTeammateTask(viewedTask) ? viewedTask : undefined
  const viewedAgentTask =
    viewedTeammateTask ?? (viewedTask && isLocalAgentTask(viewedTask) ? viewedTask : undefined)

  // Bypass useDeferredValue when streaming text is showing so Messages renders
  // the final message in the same frame streaming text clears. Also bypass when
  // not loading — deferredMessages only matters during streaming (keeps input
  // responsive); after the turn ends, showing messages immediately prevents a
  // jitter gap where the spinner is gone but the answer hasn't appeared yet.
  // Only reducedMotion users keep the deferred path during loading.
  const usesSyncMessages = showStreamingText || !isLoading
  // When viewing an agent, never fall through to leader — empty until
  // bootstrap/stream fills. Closes the see-leader-type-agent footgun.
  const displayedMessages = viewedAgentTask
    ? (viewedAgentTask.messages ?? [])
    : usesSyncMessages
      ? messages
      : deferredMessages
  // Show the placeholder until the real user message appears in
  // displayedMessages. userInputOnProcessing stays set for the whole turn
  // (cleared in resetLoadingState); this length check hides it once
  // displayedMessages grows past the baseline captured at submit time.
  // Covers both gaps: before setMessages is called (processUserInput), and
  // while deferredMessages lags behind messages. Suppressed when viewing an
  // agent — displayedMessages is a different array there, and onAgentSubmit
  // doesn't use the placeholder anyway.
  const placeholderText =
    userInputOnProcessing &&
    !viewedAgentTask &&
    displayedMessages.length <= userInputBaselineRef.current
      ? userInputOnProcessing
      : undefined
  const toolPermissionOverlay =
    focusedInputDialog === 'tool-permission' ? (
      <PermissionRequest
        key={toolUseConfirmQueue[0]?.toolUseID}
        onDone={() => setToolUseConfirmQueue(([_, ...tail]) => tail)}
        onReject={handleQueuedCommandOnCancel}
        toolUseConfirm={toolUseConfirmQueue[0]!}
        toolUseContext={getToolUseContext(
          messages,
          messages,
          abortController ?? createAbortController(),
          mainLoopModel,
        )}
        verbose={verbose}
        workerBadge={toolUseConfirmQueue[0]?.workerBadge}
        setStickyFooter={isFullscreenEnvEnabled() ? setPermissionStickyFooter : undefined}
      />
    ) : null

  // Narrow terminals: companion collapses to a one-liner that REPL stacks
  // on its own row (above input in fullscreen, below in scrollback) instead
  // of row-beside. Wide terminals keep the row layout with sprite on the right.
  const companionNarrow = transcriptCols < MIN_COLS_FOR_FULL_SPRITE
  // Hide the sprite when PromptInput early-returns BackgroundTasksDialog.
  // The sprite sits as a row sibling of PromptInput, so the dialog's Pane
  // divider draws at useTerminalSize() width but only gets terminalWidth -
  // spriteWidth — divider stops short and dialog text wraps early. Don't
  // check footerSelection: pill FOCUS (arrow-down to tasks pill) must keep
  // the sprite visible so arrow-right can navigate to it.
  const companionVisible =
    !toolJSX?.shouldHidePromptInput && !focusedInputDialog && !showBashesDialog

  // In fullscreen, ALL local-jsx slash commands float in the modal slot —
  // FullscreenLayout wraps them in an absolute-positioned bottom-anchored
  // pane (▔ divider, ModalContext). Pane/Dialog inside detect the context
  // and skip their own top-level frame. Non-fullscreen keeps the inline
  // render paths below. Commands that used to route through bottom
  // (immediate: /model, /mcp, /btw, ...) and scrollable (non-immediate:
  // /config, /theme, /diff, ...) both go here now.
  const toolJsxCentered = isFullscreenEnvEnabled() && toolJSX?.isLocalJSXCommand === true
  const centeredModal: React.ReactNode = toolJsxCentered ? toolJSX!.jsx : null

  // <AlternateScreen> at the root: everything below is inside its
  // <Box height={rows}>. Handlers/contexts are zero-height so ScrollBox's
  // flexGrow in FullscreenLayout resolves against this Box. The transcript
  // early return above wraps its virtual-scroll branch the same way; only
  // the 30-cap dump branch stays unwrapped for native terminal scrollback.
  const mainRenderProps: MainRenderProps = {
    screen,
    scrollRef,
    toolJSX,
    toolPermissionOverlay,
    viewedAgentTask,
    disableMessageActions,
    cursor,
    messageActionHandlers,
    companionVisible,
    companionNarrow,
    modalScrollRef,
    dividerYRef,
    viewedTeammateTask,
    unseenDivider,
    setCursor,
    jumpToNew,
    displayedMessages,
    tools,
    commands,
    verbose,
    toolUseConfirmQueue,
    inProgressToolUseIDs,
    isMessageSelectorVisible,
    conversationId,
    streamingToolUses,
    showAllInTranscript,
    agentDefinitions,
    handleOpenRateLimitOptions,
    isLoading,
    streamingThinking,
    visibleStreamingText,
    isBriefOnly,
    cursorNavRef,
    disabled,
    placeholderText,
    showSpinner,
    streamMode,
    spinnerTip,
    responseLengthRef,
    apiMetricsRef,
    spinnerMessage,
    stopHookSpinnerSuffix,
    loadingStartTimeRef,
    totalPausedMsRef,
    pauseStartTimeRef,
    spinnerColor,
    spinnerShimmerColor,
    hasRunningTeammates,
    userInputOnProcessing,
    composedOnScroll,
    permissionStickyFooter,
    showExpandedTodos,
    tasksV2,
    sandboxPermissionRequestQueue,
    setAppState,
    setSandboxPermissionRequestQueue,
    sandboxBridgeCleanupRef,
    promptQueue,
    setPromptQueue,
    pendingWorkerRequest,
    pendingSandboxRequest,
    workerSandboxPermissions,
    teamContext,
    elicitation,
    setShowCostDialog,
    setHaveShownCostDialog,
    idleReturnPending,
    setIdleReturnPending,
    setInputValue,
    skipIdleCheckRef,
    onSubmitRef,
    messagesRef,
    messages,
    setMessages,
    haikuTitleAttemptedRef,
    haikuTitle,
    setHaikuTitle,
    bashTools,
    bashToolsProcessedIdx,
    readFileState,
    discoveredSkillNamesRef,
    loadedNestedMemoryPathsRef,
    setConversationId,
    store,
    setShowIdeOnboarding,
    showIdeOnboarding,
    ideInstallationStatus,
    setShowModelSwitchCallout,
    showModelSwitchCallout,
    setShowUndercoverCallout,
    showUndercoverCallout,
    mainLoopModel,
    setShowEffortCallout,
    showEffortCallout,
    showRemoteCallout,
    exitFlow,
    hintRecommendation,
    handleHintResponse,
    lspRecommendation,
    handleLspResponse,
    setShowDesktopUpsellStartup,
    showDesktopUpsellStartup,
    ultraplanPendingChoice,
    ultraplanLaunchPending,
    launchUltraplan,
    mrRender,
    isExiting,
    autoRunIssueReason,
    handleAutoRunIssue,
    handleCancelAutoRunIssue,
    postCompactSurvey,
    memorySurvey,
    feedbackSurvey,
    handleSurveyRequestFeedback,
    didAutoRunIssueRef,
    frustrationDetection,
    skillImprovementSurvey,
    showIssueFlagBanner,
    debug,
    ideSelection,
    hasSuppressedDialogs,
    isShowingLocalJSXCommand,
    getToolUseContext,
    toolPermissionContext,
    setToolPermissionContext,
    apiKeyStatus,
    inputValue,
    mcpClients,
    dynamicMcpConfig,
    strictMcpConfig,
    remountKey,
    pastedContents,
    setPastedContents,
    vimMode,
    setVimMode,
    showBashesDialog,
    setShowBashesDialog,
    onSubmit,
    onAgentSubmit,
    isSearchingHistory,
    setIsSearchingHistory,
    isHelpOpen,
    setIsHelpOpen,
    insertTextRef,
    voice,
    handleBackgroundSession,
    setAutoUpdaterResult,
    autoUpdaterResult,
    inputMode,
    setInputMode,
    stashedPrompt,
    setStashedPrompt,
    submitCount,
    handleShowMessageSelector,
    enterMessageActions,
    handleRestoreMessage,
    messageSelectorPreselect,
    setMessageSelectorPreselect,
    onCancel,
    setIsMessageSelectorVisible,
    addNotification,
    queryGuard,
    titleIsAnimating,
    terminalTitle,
    titleDisabled,
    showStatusInTerminalTab,
    globalKeybindingProps,
    cancelRequestProps,
    focusedInputDialog,
    searchOpen,
    searchQuery,
    searchCount,
    searchCurrent,
    setSearchQuery,
    setSearchOpen,
    setSearchCount,
    setSearchCurrent,
    setHighlight,
    editorStatus,
  }
  const mainRender = <MainRender {...mainRenderProps} />
  const mainReturn = isFullscreenEnvEnabled() ? (
    <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{mainRender}</AlternateScreen>
  ) : (
    mainRender
  )

  return {
    transcriptView,
    mainReturn,
    toolJsxCentered,
    centeredModal,
  }
}
