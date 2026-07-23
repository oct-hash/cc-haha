// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import type * as React from 'react'
import type { Dispatch, MutableRefObject, ReactNode, RefObject, SetStateAction } from 'react'
import { Box } from '../ink.js'
import { Messages } from '../components/Messages.js'
import { useSearchHighlight } from '../ink/hooks/use-search-highlight.js'
import type { DOMElement } from '../ink/dom.js'
import type { MatchPosition } from '../ink/render-to-screen.js'
import type { JumpHandle } from '../components/VirtualMessageList.js'
import { CostThresholdDialog } from '../components/CostThresholdDialog.js'
import { IdleReturnDialog } from '../components/IdleReturnDialog.js'
import { FullscreenLayout, useUnseenDivider } from '../components/FullscreenLayout.js'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { GlobalKeybindingHandlers } from '../hooks/useGlobalKeybindings.js'
import { CommandKeybindingHandlers } from '../hooks/useCommandKeybindings.js'
import { CancelRequestHandler } from '../hooks/useCancelRequest.js'
import { ScrollKeybindingHandler } from '../components/ScrollKeybindingHandler.js'
import { AnimatedTerminalTitle } from './REPL.components.js'
import { TranscriptModeFooter } from './REPL.components.js'
import { TranscriptSearchBar } from './REPL.components.js'
import { isFullscreenEnvEnabled, isMouseTrackingEnabled } from '../utils/fullscreen.js'
import { AlternateScreen } from '../ink/components/AlternateScreen.js'
import { SandboxViolationExpandedView } from '../components/SandboxViolationExpandedView.js'
import { SandboxPermissionRequest } from '../components/permissions/SandboxPermissionRequest.js'
import { ElicitationDialog } from '../components/mcp/ElicitationDialog.js'
import { PromptDialog } from '../components/hooks/PromptDialog.js'
import PromptInput from '../components/PromptInput/PromptInput.js'
import { PromptInputQueuedCommands } from '../components/PromptInput/PromptInputQueuedCommands.js'
import { WorkerPendingPermission } from '../components/permissions/WorkerPendingPermission.js'
import { SpinnerWithVerb, BriefIdleStatus } from '../components/Spinner.js'
import type { SpinnerMode } from '../components/Spinner.js'
import { IdeOnboardingDialog } from '../components/IdeOnboardingDialog.js'
import { EffortCallout } from '../components/EffortCallout.js'
import { RemoteCallout } from '../components/RemoteCallout.js'
import { MessageActionsKeybindings } from '../components/messageActions.js'
import { MessageActionsBar } from '../components/messageActions.js'
import { WEB_FETCH_TOOL_NAME } from '../tools/WebFetchTool/prompt.js'
import { MCPConnectionManager } from 'src/services/mcp/MCPConnectionManager.js'
import { applyPermissionUpdate } from '../utils/permissions/PermissionUpdate.js'
import { persistPermissionUpdate } from '../utils/permissions/PermissionUpdate.js'
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js'
import type { NetworkHostPattern } from '../utils/sandbox/sandbox-adapter.js'
import { sendSandboxPermissionResponseViaMailbox } from '../utils/swarm/permissionSync.js'
import { CompanionSprite } from '../buddy/CompanionSprite.js'
import { CompanionFloatingBubble } from '../buddy/CompanionSprite.js'
import { TaskListV2 } from '../components/TaskListV2.js'
import { TeammateViewHeader } from '../components/TeammateViewHeader.js'
import { UserTextMessage } from '../components/messages/UserTextMessage.js'
import { AwsAuthStatusBox } from '../components/AwsAuthStatusBox.js'
import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js'
import { IssueFlagBanner } from '../components/PromptInput/IssueFlagBanner.js'
import { ExitFlow } from '../components/ExitFlow.js'
import { PluginHintMenu } from '../components/ClaudeCodeHint/PluginHintMenu.js'
import { LspRecommendationMenu } from '../components/LspRecommendation/LspRecommendationMenu.js'
import { DesktopUpsellStartup } from '../components/DesktopUpsell/DesktopUpsellStartup.js'
import { AutoRunIssueNotification, getAutoRunIssueReasonText } from '../utils/autoRunIssue.js'
import { FeedbackSurvey } from '../components/FeedbackSurvey/FeedbackSurvey.js'
import { SkillImprovementSurvey } from '../components/SkillImprovementSurvey.js'
import { MessageSelector } from '../components/MessageSelector.js'
import type { UserMessage } from '../types/message.js'
import type { Message as MessageType } from '../types/message.js'
import type { Command } from '../commands.js'
import type { Tool } from '../Tool.js'
import type { StreamingToolUse, StreamingThinking } from '../utils/messages.js'
import type { AgentDefinitionsResult } from '../tools/AgentTool/loadAgentsDir.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import type { PromptInputMode, VimMode } from '../types/textInputTypes.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { PastedContent } from '../utils/config.js'
import type { AutoUpdaterResult } from '../utils/autoUpdater.js'
import type { Screen } from './REPL.types.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import { DevBar } from '../components/DevBar.js'
import { TungstenLiveMonitor } from '../tools/TungstenTool/TungstenLiveMonitor.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { ToolPermissionContext } from '../Tool.js'
import type { TaskListV2Task } from '../components/TaskListV2.js'
import type {
  MessageActionsState,
  MessageActionsNav,
  MessageActionCaps,
} from '../components/messageActions.js'
import type { SandboxAskCallback } from '../utils/sandbox/sandbox-adapter.js'
import type { IDEExtensionInstallationStatus } from '../utils/ide.js'

// Dead code elimination: conditional imports
/* eslint-disable @typescript-eslint/no-require-imports */
const VoiceKeybindingHandler: typeof import('../hooks/useVoiceIntegration.js').VoiceKeybindingHandler =
  feature('VOICE_MODE')
    ? require('../hooks/useVoiceIntegration.js').VoiceKeybindingHandler
    : () => null
const AntModelSwitchCallout =
  'external' === 'ant'
    ? require('../components/AntModelSwitchCallout.js').AntModelSwitchCallout
    : null
const UndercoverAutoCallout =
  'external' === 'ant'
    ? require('../components/UndercoverAutoCallout.js').UndercoverAutoCallout
    : null
const WebBrowserPanelModule = feature('WEB_BROWSER_TOOL')
  ? (require('../tools/WebBrowserTool/WebBrowserPanel.js') as typeof import('../tools/WebBrowserTool/WebBrowserPanel.js'))
  : null
const UltraplanChoiceDialog = feature('ULTRAPLAN')
  ? require('../components/UltraplanChoiceDialog.js').UltraplanChoiceDialog
  : null
const UltraplanLaunchDialog = feature('ULTRAPLAN')
  ? require('../components/UltraplanLaunchDialog.js').UltraplanLaunchDialog
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ToolJSXValue = {
  jsx: React.ReactNode | null
  shouldHidePromptInput: boolean
  shouldContinueAnimation?: true
  showSpinner?: boolean
  isLocalJSXCommand?: boolean
  isImmediate?: boolean
}

export type VoiceIntegration = {
  handleKeyEvent: (fallbackMs?: number) => void
  stripTrailing: (maxStrip: number, opts?: { anchor?: boolean }) => number
  resetAnchor: () => void
  interimRange?: { start: number; end: number }
}

// ---------------------------------------------------------------------------
// TranscriptView
// ---------------------------------------------------------------------------

export interface TranscriptViewProps {
  screen: Screen
  disableVirtualScroll: boolean
  dumpMode: boolean
  scrollRef: RefObject<ScrollBoxHandle | null>
  transcriptMessages: MessageType[]
  tools: readonly Tool[]
  commands: Command[]
  inProgressToolUseIDs: Set<string>
  conversationId: string
  agentDefinitions: AgentDefinitionsResult
  transcriptStreamingToolUses: StreamingToolUse[]
  showAllInTranscript: boolean
  handleOpenRateLimitOptions: () => void
  isLoading: boolean
  streamingThinking: StreamingThinking | null
  jumpRef: MutableRefObject<JumpHandle | undefined>
  onSearchMatchesChange: (count: number) => void
  scanElement: (el: DOMElement) => MatchPosition[]
  setPositions: (
    state: {
      positions: MatchPosition[]
      rowOffset: number
      currentIdx: number
    } | null,
  ) => void
  toolJSX: ToolJSXValue | null
  titleIsAnimating: boolean
  terminalTitle: string
  titleDisabled: boolean
  showStatusInTerminalTab: boolean
  globalKeybindingProps: {
    screen: Screen
    setScreen: Dispatch<SetStateAction<Screen>>
    showAllInTranscript: boolean
    setShowAllInTranscript: Dispatch<SetStateAction<boolean>>
    messageCount: number
    onEnterTranscript?: () => void
    onExitTranscript?: () => void
    virtualScrollActive?: boolean
    searchBarOpen?: boolean
  }
  voice: VoiceIntegration
  onSubmit: (input: string, helpers: PromptInputHelpers) => void | Promise<void>
  focusedInputDialog: string | null
  searchOpen: boolean
  cancelRequestProps: {
    setToolUseConfirmQueue: (f: (queue: ToolUseConfirm[]) => ToolUseConfirm[]) => void
    onCancel: () => void
    onAgentsKilled: () => void
    isMessageSelectorVisible: boolean
    screen: Screen
    abortSignal?: AbortSignal
    popCommandFromQueue?: () => void
    vimMode?: VimMode
    isLocalJSXCommand?: boolean
    isSearchingHistory?: boolean
    isHelpOpen?: boolean
    inputMode?: PromptInputMode
    inputValue?: string
    streamMode?: SpinnerMode
  }
  searchCount: number
  searchCurrent: number
  setSearchQuery: Dispatch<SetStateAction<string>>
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  setSearchCount: Dispatch<SetStateAction<number>>
  setSearchCurrent: Dispatch<SetStateAction<number>>
  setHighlight: (query: string) => void
  searchQuery: string
  editorStatus: string | undefined
}

export function TranscriptView(props: TranscriptViewProps): ReactNode {
  const {
    screen,
    disableVirtualScroll,
    dumpMode,
    scrollRef,
    transcriptMessages,
    tools,
    commands,
    inProgressToolUseIDs,
    conversationId,
    agentDefinitions,
    transcriptStreamingToolUses,
    showAllInTranscript,
    handleOpenRateLimitOptions,
    isLoading,
    streamingThinking,
    jumpRef,
    onSearchMatchesChange,
    scanElement,
    setPositions,
    toolJSX,
    titleIsAnimating,
    terminalTitle,
    titleDisabled,
    showStatusInTerminalTab,
    globalKeybindingProps,
    voice,
    onSubmit,
    focusedInputDialog,
    searchOpen,
    cancelRequestProps,
    searchCount,
    searchCurrent,
    setSearchQuery,
    setSearchOpen,
    setSearchCount,
    setSearchCurrent,
    setHighlight,
    searchQuery,
    editorStatus,
  } = props

  // Virtual scroll replaces the 30-message cap: everything is scrollable
  // and memory is bounded by the viewport. Without it, wrapping transcript
  // in a ScrollBox would mount all messages (~250 MB on long sessions —
  // the exact problem), so the kill switch and non-fullscreen paths must
  // fall through to the legacy render: no alt screen, dump to terminal
  // scrollback, 30-cap + Ctrl+E. Reusing scrollRef is safe — normal-mode
  // and transcript-mode are mutually exclusive (this early return), so
  // only one ScrollBox is ever mounted at a time.
  const transcriptScrollRef =
    isFullscreenEnvEnabled() && !disableVirtualScroll && !dumpMode ? scrollRef : undefined
  const transcriptMessagesElement = (
    <Messages
      messages={transcriptMessages}
      tools={tools}
      commands={commands}
      verbose={true}
      toolJSX={null}
      toolUseConfirmQueue={[]}
      inProgressToolUseIDs={inProgressToolUseIDs}
      isMessageSelectorVisible={false}
      conversationId={conversationId}
      screen={screen}
      agentDefinitions={agentDefinitions}
      streamingToolUses={transcriptStreamingToolUses}
      showAllInTranscript={showAllInTranscript}
      onOpenRateLimitOptions={handleOpenRateLimitOptions}
      isLoading={isLoading}
      hidePastThinking={true}
      streamingThinking={streamingThinking}
      scrollRef={transcriptScrollRef}
      jumpRef={jumpRef}
      onSearchMatchesChange={onSearchMatchesChange}
      scanElement={scanElement}
      setPositions={setPositions}
      disableRenderCap={dumpMode}
    />
  )
  const transcriptToolJSX = toolJSX && (
    <Box flexDirection="column" width="100%">
      {toolJSX.jsx}
    </Box>
  )
  const transcriptReturn = (
    <KeybindingSetup>
      <AnimatedTerminalTitle
        isAnimating={titleIsAnimating}
        title={terminalTitle}
        disabled={titleDisabled}
        noPrefix={showStatusInTerminalTab}
      />
      <GlobalKeybindingHandlers {...globalKeybindingProps} />
      {feature('VOICE_MODE') ? (
        <VoiceKeybindingHandler
          voiceHandleKeyEvent={voice.handleKeyEvent}
          stripTrailing={voice.stripTrailing}
          resetAnchor={voice.resetAnchor}
          isActive={!toolJSX?.isLocalJSXCommand}
        />
      ) : null}
      <CommandKeybindingHandlers onSubmit={onSubmit} isActive={!toolJSX?.isLocalJSXCommand} />
      {transcriptScrollRef ? (
        // ScrollKeybindingHandler must mount before CancelRequestHandler so
        // ctrl+c-with-selection copies instead of cancelling the active task.
        // Its raw useInput handler only stops propagation when a selection
        // exists — without one, ctrl+c falls through to CancelRequestHandler.
        <ScrollKeybindingHandler
          scrollRef={scrollRef}
          // Yield wheel/ctrl+u/d to UltraplanChoiceDialog's own scroll
          // handler while the modal is showing.
          isActive={focusedInputDialog !== 'ultraplan-choice'}
          // g/G/j/k/ctrl+u/ctrl+d would eat keystrokes the search bar
          // wants. Off while searching.
          isModal={!searchOpen}
          // Manual scroll exits the search context — clear the yellow
          // current-match marker. Positions are (msg, rowOffset)-keyed;
          // j/k changes scrollTop so rowOffset is stale → wrong row
          // gets yellow. Next n/N re-establishes via step()→jump().
          onScroll={() => jumpRef.current?.disarmSearch()}
        />
      ) : null}
      <CancelRequestHandler {...cancelRequestProps} />
      {transcriptScrollRef ? (
        <FullscreenLayout
          scrollRef={scrollRef}
          scrollable={
            <>
              {transcriptMessagesElement}
              {transcriptToolJSX}
              <SandboxViolationExpandedView />
            </>
          }
          bottom={
            searchOpen ? (
              <TranscriptSearchBar
                jumpRef={jumpRef}
                // Seed was tried (c01578c8) — broke /hello muscle
                // memory (cursor lands after 'foo', /hello → foohello).
                // Cancel-restore handles the 'don't lose prior search'
                // concern differently (onCancel re-applies searchQuery).
                initialQuery=""
                count={searchCount}
                current={searchCurrent}
                onClose={(q) => {
                  // Enter — commit. 0-match guard: junk query shouldn't
                  // persist (badge hidden, n/N dead anyway).
                  setSearchQuery(searchCount > 0 ? q : '')
                  setSearchOpen(false)
                  // onCancel path: bar unmounts before its useEffect([query])
                  // can fire with ''. Without this, searchCount stays stale
                  // (n guard at :4956 passes) and VML's matches[] too
                  // (nextMatch walks the old array). Phantom nav, no
                  // highlight. onExit (Enter, q non-empty) still commits.
                  if (!q) {
                    setSearchCount(0)
                    setSearchCurrent(0)
                    jumpRef.current?.setSearchQuery('')
                  }
                }}
                onCancel={() => {
                  // Esc/ctrl+c/ctrl+g — undo. Bar's effect last fired
                  // with whatever was typed. searchQuery (REPL state)
                  // is unchanged since / (onClose = commit, didn't run).
                  // Two VML calls: '' restores anchor (0-match else-
                  // branch), then searchQuery re-scans from anchor's
                  // nearest. Both synchronous — one React batch.
                  // setHighlight explicit: REPL's sync-effect dep is
                  // searchQuery (unchanged), wouldn't re-fire.
                  setSearchOpen(false)
                  jumpRef.current?.setSearchQuery('')
                  jumpRef.current?.setSearchQuery(searchQuery)
                  setHighlight(searchQuery)
                }}
                setHighlight={setHighlight}
              />
            ) : (
              <TranscriptModeFooter
                showAllInTranscript={showAllInTranscript}
                virtualScroll={true}
                status={editorStatus || undefined}
                searchBadge={
                  searchQuery && searchCount > 0
                    ? {
                        current: searchCurrent,
                        count: searchCount,
                      }
                    : undefined
                }
              />
            )
          }
        />
      ) : (
        <>
          {transcriptMessagesElement}
          {transcriptToolJSX}
          <SandboxViolationExpandedView />
          <TranscriptModeFooter
            showAllInTranscript={showAllInTranscript}
            virtualScroll={false}
            suppressShowAll={dumpMode}
            status={editorStatus || undefined}
          />
        </>
      )}
    </KeybindingSetup>
  )
  // The virtual-scroll branch (FullscreenLayout above) needs
  // <AlternateScreen>'s <Box height={rows}> constraint — without it,
  // ScrollBox's flexGrow has no ceiling, viewport = content height,
  // scrollTop pins at 0, and Ink's screen buffer sizes to the full
  // spacer (200×5k+ rows on long sessions). Same root type + props as
  // normal mode's wrap below so React reconciles and the alt buffer
  // stays entered across toggle. The 30-cap dump branch stays
  // unwrapped — it wants native terminal scrollback.
  if (transcriptScrollRef) {
    return (
      <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{transcriptReturn}</AlternateScreen>
    )
  }
  return transcriptReturn
}

// ---------------------------------------------------------------------------
// MainRender
// ---------------------------------------------------------------------------

export interface MainRenderProps {
  screen: Screen
  scrollRef: RefObject<ScrollBoxHandle | null>
  toolJSX: ToolJSXValue | null
  toolPermissionOverlay: ReactNode
  viewedAgentTask: unknown
  disableMessageActions: boolean
  cursor: number | null
  messageActionHandlers: MessageActionsNav
  companionVisible: boolean
  companionNarrow: boolean
  modalScrollRef: RefObject<HTMLDivElement | null>
  dividerYRef: MutableRefObject<number | null>
  viewedTeammateTask: unknown
  unseenDivider:
    | {
        firstUnseenUuid: string
        count: number
      }
    | undefined
  setCursor: Dispatch<SetStateAction<number | null>>
  jumpToNew: (handle: ScrollBoxHandle | null | undefined) => void
  displayedMessages: MessageType[]
  tools: readonly Tool[]
  commands: Command[]
  verbose: boolean
  toolUseConfirmQueue: ToolUseConfirm[]
  inProgressToolUseIDs: Set<string>
  isMessageSelectorVisible: boolean
  conversationId: string
  streamingToolUses: StreamingToolUse[]
  showAllInTranscript: boolean
  agentDefinitions: AgentDefinitionsResult
  handleOpenRateLimitOptions: () => void
  isLoading: boolean
  streamingThinking: StreamingThinking | null
  visibleStreamingText: string | null
  isBriefOnly: boolean
  cursorNavRef: MutableRefObject<{
    up: () => void
    down: () => void
    jumpUp: () => void
    jumpDown: () => void
    reset: () => void
  } | null>
  disabled: boolean
  placeholderText: string | null
  showSpinner: boolean
  streamMode: SpinnerMode
  spinnerTip: string | null
  responseLengthRef: MutableRefObject<number>
  apiMetricsRef: MutableRefObject<{
    inputTokens: number
    outputTokens: number
    cacheWrites: number
    cacheReads: number
    cost: number
  }>
  spinnerMessage: string | undefined
  stopHookSpinnerSuffix: ReactNode
  loadingStartTimeRef: MutableRefObject<number>
  totalPausedMsRef: MutableRefObject<number>
  pauseStartTimeRef: MutableRefObject<number | undefined>
  spinnerColor: string | undefined
  spinnerShimmerColor: string | undefined
  hasRunningTeammates: boolean
  userInputOnProcessing: boolean
  composedOnScroll: ((sticky: boolean, handle: ScrollBoxHandle) => void) | undefined
  permissionStickyFooter: ReactNode
  showExpandedTodos: boolean
  tasksV2: TaskListV2Task[] | undefined
  sandboxPermissionRequestQueue: SandboxAskCallback[]
  setAppState: SetAppState
  setSandboxPermissionRequestQueue: Dispatch<SetStateAction<SandboxAskCallback[]>>
  sandboxBridgeCleanupRef: MutableRefObject<Map<string, Set<() => void>>>
  promptQueue: Array<{
    request: { prompt: string }
    title: string
    toolInputSummary: string
    resolve: (value: { prompt_response: string; selected?: string }) => void
    reject: (reason: Error) => void
  }>
  setPromptQueue: Dispatch<
    SetStateAction<
      Array<{
        request: { prompt: string }
        title: string
        toolInputSummary: string
        resolve: (value: { prompt_response: string; selected?: string }) => void
        reject: (reason: Error) => void
      }>
    >
  >
  pendingWorkerRequest: {
    toolName: string
    description: string
  } | null
  pendingSandboxRequest: {
    host: string
  } | null
  workerSandboxPermissions: {
    queue: Array<{
      requestId: string
      host: string
      workerName: string
    }>
  }
  teamContext:
    | {
        teamName: string
      }
    | undefined
  elicitation: {
    queue: Array<{
      serverName: string
      requestId: number
      params: { mode?: string }
      respond: (value: { action: string; content?: string }) => void
      onWaitingDismiss?: (action: string) => void
    }>
  }
  setShowCostDialog: Dispatch<SetStateAction<boolean>>
  setHaveShownCostDialog: Dispatch<SetStateAction<boolean>>
  idleReturnPending: {
    idleMinutes: number
    input: string
  } | null
  setIdleReturnPending: Dispatch<SetStateAction<unknown>>
  setInputValue: Dispatch<SetStateAction<string>>
  skipIdleCheckRef: MutableRefObject<boolean>
  onSubmitRef: MutableRefObject<
    (input: string, helpers: PromptInputHelpers, ...rest: unknown[]) => void | Promise<void>
  >
  messagesRef: MutableRefObject<MessageType[]>
  messages: MessageType[]
  setMessages: (updater: MessageType[] | ((prev: MessageType[]) => MessageType[])) => void
  haikuTitleAttemptedRef: MutableRefObject<boolean>
  haikuTitle: string | undefined
  setHaikuTitle: Dispatch<SetStateAction<string | undefined>>
  bashTools: MutableRefObject<Map<string, number>>
  bashToolsProcessedIdx: MutableRefObject<number>
  readFileState: MutableRefObject<{
    current: unknown
  }>
  discoveredSkillNamesRef: MutableRefObject<Set<string>>
  loadedNestedMemoryPathsRef: MutableRefObject<Set<string>>
  setConversationId: Dispatch<SetStateAction<string>>
  store: { getState: () => { ultraplanSessionUrl?: string } }
  setShowIdeOnboarding: Dispatch<SetStateAction<boolean>>
  showIdeOnboarding: boolean
  ideInstallationStatus: IDEExtensionInstallationStatus | null
  setShowModelSwitchCallout: Dispatch<SetStateAction<boolean>>
  showModelSwitchCallout: boolean
  setShowUndercoverCallout: Dispatch<SetStateAction<boolean>>
  showUndercoverCallout: boolean
  mainLoopModel: string
  setShowEffortCallout: Dispatch<SetStateAction<boolean>>
  showEffortCallout: boolean
  showRemoteCallout: boolean
  exitFlow: ReactNode
  hintRecommendation: {
    pluginName: string
    pluginDescription: string
    marketplaceName: string
    sourceCommand: string
  } | null
  handleHintResponse: (response: string) => void
  lspRecommendation: {
    pluginName: string
    pluginDescription: string
    fileExtension: string
  } | null
  handleLspResponse: (response: string) => void
  setShowDesktopUpsellStartup: Dispatch<SetStateAction<boolean>>
  showDesktopUpsellStartup: boolean
  ultraplanPendingChoice: unknown
  ultraplanLaunchPending: unknown
  launchUltraplan: (params: {
    blurb: string
    getAppState: () => { ultraplanSessionUrl?: string }
    setAppState: SetAppState
    signal: AbortSignal
    disconnectedBridge?: boolean
    onSessionReady?: (msg: string) => void
  }) => Promise<void>
  mrRender: () => ReactNode
  isExiting: boolean
  autoRunIssueReason: unknown
  handleAutoRunIssue: () => void
  handleCancelAutoRunIssue: () => void
  postCompactSurvey: {
    state: string
    lastResponse: unknown
    handleSelect: (value: string) => void
  }
  memorySurvey: {
    state: string
    lastResponse: unknown
    handleSelect: (value: string) => void
    handleTranscriptSelect: (value: string) => void
  }
  feedbackSurvey: {
    state: string
    lastResponse: unknown
    handleSelect: (value: string) => void
    handleTranscriptSelect: (value: string) => void
  }
  handleSurveyRequestFeedback: ((message: string) => void) | undefined
  didAutoRunIssueRef: MutableRefObject<boolean>
  frustrationDetection: {
    state: string
    lastResponse: unknown
    handleSelect: (value: string) => void
    handleTranscriptSelect: (value: string) => void
  }
  skillImprovementSurvey: {
    suggestion: { skillName: string; updates: string } | null
    isOpen: boolean
    handleSelect: (value: string) => void
  }
  showIssueFlagBanner: boolean
  debug: boolean
  ideSelection: IDESelection | null
  hasSuppressedDialogs: boolean
  isShowingLocalJSXCommand: boolean
  getToolUseContext: (
    messages: MessageType[],
    arg1: unknown[],
    controller: AbortController,
    model: string,
  ) => {
    options: {
      tools: Tool[]
      mainLoopModel: string
      additionalWorkingDirectories: Map<string, unknown>
      mcpClients: MCPServerConnection[]
      querySource: string
      customSystemPrompt?: string
      appendSystemPrompt?: string
    }
    getAppState: () => { ultraplanSessionUrl?: string }
  }
  toolPermissionContext: ToolPermissionContext
  setToolPermissionContext: Dispatch<SetStateAction<ToolPermissionContext>>
  apiKeyStatus: string | null
  inputValue: string
  mcpClients: MCPServerConnection[]
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig> | undefined
  strictMcpConfig: boolean | undefined
  remountKey: string | number
  pastedContents: Record<number, PastedContent>
  setPastedContents: Dispatch<SetStateAction<Record<number, PastedContent>>>
  vimMode: VimMode
  setVimMode: Dispatch<SetStateAction<VimMode>>
  showBashesDialog: boolean
  setShowBashesDialog: Dispatch<SetStateAction<boolean>>
  onSubmit: (input: string, helpers: PromptInputHelpers) => void | Promise<void>
  onAgentSubmit: (input: string) => void
  isSearchingHistory: boolean
  setIsSearchingHistory: Dispatch<SetStateAction<boolean>>
  isHelpOpen: boolean
  setIsHelpOpen: Dispatch<SetStateAction<boolean>>
  insertTextRef: MutableRefObject<((text: string) => void) | undefined> | undefined
  voice: VoiceIntegration
  handleBackgroundSession: () => void
  setAutoUpdaterResult: Dispatch<SetStateAction<AutoUpdaterResult | null>>
  autoUpdaterResult: AutoUpdaterResult | null
  inputMode: PromptInputMode
  setInputMode: Dispatch<SetStateAction<PromptInputMode>>
  stashedPrompt: string | null
  setStashedPrompt: Dispatch<SetStateAction<string | null>>
  submitCount: number
  handleShowMessageSelector: () => void
  enterMessageActions: () => void
  handleRestoreMessage: (message: UserMessage) => void
  messageSelectorPreselect: UserMessage | undefined
  setMessageSelectorPreselect: Dispatch<SetStateAction<UserMessage | undefined>>
  onCancel: () => void
  setIsMessageSelectorVisible: Dispatch<SetStateAction<boolean>>
  addNotification: (notification: {
    key: string
    text: string
    priority: string
    timeoutMs?: number
  }) => void
  queryGuard: { isActive: boolean; subscribe: (cb: () => void) => () => void }
  titleIsAnimating: boolean
  terminalTitle: string
  titleDisabled: boolean
  showStatusInTerminalTab: boolean
  globalKeybindingProps: TranscriptViewProps['globalKeybindingProps']
  cancelRequestProps: TranscriptViewProps['cancelRequestProps']
  focusedInputDialog: string | null
  searchOpen: boolean
  searchQuery: string
  searchCount: number
  searchCurrent: number
  setSearchQuery: Dispatch<SetStateAction<string>>
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  setSearchCount: Dispatch<SetStateAction<number>>
  setSearchCurrent: Dispatch<SetStateAction<number>>
  setHighlight: (query: string) => void
  editorStatus: string | undefined
}

export function MainRender(props: MainRenderProps): ReactNode {
  const {
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
  } = props

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
  const mainReturn = (
    <KeybindingSetup>
      <AnimatedTerminalTitle
        isAnimating={titleIsAnimating}
        title={terminalTitle}
        disabled={titleDisabled}
        noPrefix={showStatusInTerminalTab}
      />
      <GlobalKeybindingHandlers {...globalKeybindingProps} />
      {feature('VOICE_MODE') ? (
        <VoiceKeybindingHandler
          voiceHandleKeyEvent={voice.handleKeyEvent}
          stripTrailing={voice.stripTrailing}
          resetAnchor={voice.resetAnchor}
          isActive={!toolJSX?.isLocalJSXCommand}
        />
      ) : null}
      <CommandKeybindingHandlers onSubmit={onSubmit} isActive={!toolJSX?.isLocalJSXCommand} />
      {/* ScrollKeybindingHandler must mount before CancelRequestHandler so
          ctrl+c-with-selection copies instead of cancelling the active task.
          Its raw useInput handler only stops propagation when a selection
          exists — without one, ctrl+c falls through to CancelRequestHandler.
          PgUp/PgDn/wheel always scroll the transcript behind the modal —
          the modal's inner ScrollBox is not keyboard-driven. onScroll
          stays suppressed while a modal is showing so scroll doesn't
          stamp divider/pill state. */}
      <ScrollKeybindingHandler
        scrollRef={scrollRef}
        isActive={
          isFullscreenEnvEnabled() &&
          (centeredModal != null || !focusedInputDialog || focusedInputDialog === 'tool-permission')
        }
        onScroll={
          centeredModal || toolPermissionOverlay || viewedAgentTask ? undefined : composedOnScroll
        }
      />
      {feature('MESSAGE_ACTIONS') && isFullscreenEnvEnabled() && !disableMessageActions ? (
        <MessageActionsKeybindings handlers={messageActionHandlers} isActive={cursor !== null} />
      ) : null}
      <CancelRequestHandler {...cancelRequestProps} />
      <MCPConnectionManager
        key={remountKey}
        dynamicMcpConfig={dynamicMcpConfig}
        isStrictMcpConfig={strictMcpConfig}
      >
        <FullscreenLayout
          scrollRef={scrollRef}
          overlay={toolPermissionOverlay}
          bottomFloat={
            companionVisible && !companionNarrow ? <CompanionFloatingBubble /> : undefined
          }
          modal={centeredModal}
          modalScrollRef={modalScrollRef}
          dividerYRef={dividerYRef}
          hidePill={!!viewedAgentTask}
          hideSticky={!!viewedTeammateTask}
          newMessageCount={unseenDivider?.count ?? 0}
          onPillClick={() => {
            setCursor(null)
            jumpToNew(scrollRef.current)
          }}
          scrollable={
            <>
              <TeammateViewHeader />
              <Messages
                messages={displayedMessages}
                tools={tools}
                commands={commands}
                verbose={verbose}
                toolJSX={toolJSX}
                toolUseConfirmQueue={toolUseConfirmQueue}
                inProgressToolUseIDs={
                  viewedTeammateTask
                    ? ((viewedTeammateTask as { inProgressToolUseIDs?: Set<string> })
                        .inProgressToolUseIDs ?? new Set())
                    : inProgressToolUseIDs
                }
                isMessageSelectorVisible={isMessageSelectorVisible}
                conversationId={conversationId}
                screen={screen}
                streamingToolUses={streamingToolUses}
                showAllInTranscript={showAllInTranscript}
                agentDefinitions={agentDefinitions}
                onOpenRateLimitOptions={handleOpenRateLimitOptions}
                isLoading={isLoading}
                streamingText={isLoading && !viewedAgentTask ? visibleStreamingText : null}
                isBriefOnly={viewedAgentTask ? false : isBriefOnly}
                unseenDivider={viewedAgentTask ? undefined : unseenDivider}
                scrollRef={isFullscreenEnvEnabled() ? scrollRef : undefined}
                trackStickyPrompt={isFullscreenEnvEnabled() ? true : undefined}
                cursor={cursor}
                setCursor={setCursor}
                cursorNavRef={cursorNavRef}
              />
              <AwsAuthStatusBox />
              {/* Hide the processing placeholder while a modal is showing —
                  it would sit at the last visible transcript row right above
                  the ▔ divider, showing "❯ /config" as redundant clutter
                  (the modal IS the /config UI). Outside modals it stays so
                  the user sees their input echoed while Claude processes. */}
              {!disabled && placeholderText && !centeredModal && (
                <UserTextMessage
                  param={{
                    text: placeholderText,
                    type: 'text',
                  }}
                  addMargin={true}
                  verbose={verbose}
                />
              )}
              {toolJSX &&
                !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) &&
                !toolJsxCentered && (
                  <Box flexDirection="column" width="100%">
                    {toolJSX.jsx}
                  </Box>
                )}
              {'external' === 'ant' && <TungstenLiveMonitor />}
              {feature('WEB_BROWSER_TOOL')
                ? WebBrowserPanelModule && <WebBrowserPanelModule.WebBrowserPanel />
                : null}
              <Box flexGrow={1} />
              {showSpinner && (
                <SpinnerWithVerb
                  mode={streamMode}
                  spinnerTip={spinnerTip}
                  responseLengthRef={responseLengthRef}
                  apiMetricsRef={apiMetricsRef}
                  overrideMessage={spinnerMessage}
                  spinnerSuffix={stopHookSpinnerSuffix}
                  verbose={verbose}
                  loadingStartTimeRef={loadingStartTimeRef}
                  totalPausedMsRef={totalPausedMsRef}
                  pauseStartTimeRef={pauseStartTimeRef}
                  overrideColor={spinnerColor}
                  overrideShimmerColor={spinnerShimmerColor}
                  hasActiveTools={inProgressToolUseIDs.size > 0}
                  leaderIsIdle={!isLoading}
                />
              )}
              {!showSpinner &&
                !isLoading &&
                !userInputOnProcessing &&
                !hasRunningTeammates &&
                isBriefOnly &&
                !viewedAgentTask && <BriefIdleStatus />}
              {isFullscreenEnvEnabled() && <PromptInputQueuedCommands />}
            </>
          }
          bottom={
            <Box
              flexDirection={companionNarrow ? 'column' : 'row'}
              width="100%"
              alignItems={companionNarrow ? undefined : 'flex-end'}
            >
              {companionNarrow && isFullscreenEnvEnabled() && companionVisible ? (
                <CompanionSprite />
              ) : null}
              <Box flexDirection="column" flexGrow={1}>
                {permissionStickyFooter}
                {/* Immediate local-jsx commands (/btw, /sandbox, /assistant,
                  /issue) render here, NOT inside scrollable. They stay mounted
                  while the main conversation streams behind them, so ScrollBox
                  relayouts on each new message would drag them around. bottom
                  is flexShrink={0} outside the ScrollBox — it never moves.
                  Non-immediate local-jsx (/diff, /status, /theme, ~40 others)
                  stays in scrollable: the main loop is paused so no jiggle,
                  and their tall content (DiffDetailView renders up to 400
                  lines with no internal scroll) needs the outer ScrollBox. */}
                {toolJSX?.isLocalJSXCommand && toolJSX.isImmediate && !toolJsxCentered && (
                  <Box flexDirection="column" width="100%">
                    {toolJSX.jsx}
                  </Box>
                )}
                {!showSpinner &&
                  !toolJSX?.isLocalJSXCommand &&
                  showExpandedTodos &&
                  tasksV2 &&
                  tasksV2.length > 0 && (
                    <Box width="100%" flexDirection="column">
                      <TaskListV2 tasks={tasksV2} isStandalone={true} />
                    </Box>
                  )}
                {focusedInputDialog === 'sandbox-permission' && (
                  <SandboxPermissionRequest
                    key={sandboxPermissionRequestQueue[0]!.hostPattern.host}
                    hostPattern={sandboxPermissionRequestQueue[0]!.hostPattern}
                    onUserResponse={(response: { allow: boolean; persistToSettings: boolean }) => {
                      const { allow, persistToSettings } = response
                      const currentRequest = sandboxPermissionRequestQueue[0]
                      if (!currentRequest) return
                      const approvedHost = currentRequest.hostPattern.host
                      if (persistToSettings) {
                        const update = {
                          type: 'addRules' as const,
                          rules: [
                            {
                              toolName: WEB_FETCH_TOOL_NAME,
                              ruleContent: `domain:${approvedHost}`,
                            },
                          ],
                          behavior: (allow ? 'allow' : 'deny') as 'allow' | 'deny',
                          destination: 'localSettings' as const,
                        }
                        setAppState((prev) => ({
                          ...prev,
                          toolPermissionContext: applyPermissionUpdate(
                            prev.toolPermissionContext,
                            update,
                          ),
                        }))
                        persistPermissionUpdate(update)

                        // Immediately update sandbox in-memory config to prevent race conditions
                        // where pending requests slip through before settings change is detected
                        SandboxManager.refreshConfig()
                      }

                      // Resolve ALL pending requests for the same host (not just the first one)
                      // This handles the case where multiple parallel requests came in for the same domain
                      setSandboxPermissionRequestQueue((queue) => {
                        queue
                          .filter((item) => item.hostPattern.host === approvedHost)
                          .forEach((item) => item.resolvePromise(allow))
                        return queue.filter((item) => item.hostPattern.host !== approvedHost)
                      })

                      // Clean up bridge subscriptions and cancel remote prompts
                      // for this host since the local user already responded.
                      const cleanups = sandboxBridgeCleanupRef.current.get(approvedHost)
                      if (cleanups) {
                        for (const fn of cleanups) {
                          fn()
                        }
                        sandboxBridgeCleanupRef.current.delete(approvedHost)
                      }
                    }}
                  />
                )}
                {focusedInputDialog === 'prompt' && (
                  <PromptDialog
                    key={promptQueue[0]!.request.prompt}
                    title={promptQueue[0]!.title}
                    toolInputSummary={promptQueue[0]!.toolInputSummary}
                    request={promptQueue[0]!.request}
                    onRespond={(selectedKey) => {
                      const item = promptQueue[0]
                      if (!item) return
                      item.resolve({
                        prompt_response: item.request.prompt,
                        selected: selectedKey,
                      })
                      setPromptQueue(([, ...tail]) => tail)
                    }}
                    onAbort={() => {
                      const item = promptQueue[0]
                      if (!item) return
                      item.reject(new Error('Prompt cancelled by user'))
                      setPromptQueue(([, ...tail]) => tail)
                    }}
                  />
                )}
                {/* Show pending indicator on worker while waiting for leader approval */}
                {pendingWorkerRequest && (
                  <WorkerPendingPermission
                    toolName={pendingWorkerRequest.toolName}
                    description={pendingWorkerRequest.description}
                  />
                )}
                {/* Show pending indicator for sandbox permission on worker side */}
                {pendingSandboxRequest && (
                  <WorkerPendingPermission
                    toolName="Network Access"
                    description={`Waiting for leader to approve network access to ${pendingSandboxRequest.host}`}
                  />
                )}
                {/* Worker sandbox permission requests from swarm workers */}
                {focusedInputDialog === 'worker-sandbox-permission' && (
                  <SandboxPermissionRequest
                    key={workerSandboxPermissions.queue[0]!.requestId}
                    hostPattern={
                      {
                        host: workerSandboxPermissions.queue[0]!.host,
                        port: undefined,
                      } as NetworkHostPattern
                    }
                    onUserResponse={(response: { allow: boolean; persistToSettings: boolean }) => {
                      const { allow, persistToSettings } = response
                      const currentRequest = workerSandboxPermissions.queue[0]
                      if (!currentRequest) return
                      const approvedHost = currentRequest.host

                      // Send response via mailbox to the worker
                      void sendSandboxPermissionResponseViaMailbox(
                        currentRequest.workerName,
                        currentRequest.requestId,
                        approvedHost,
                        allow,
                        teamContext?.teamName,
                      )
                      if (persistToSettings && allow) {
                        const update = {
                          type: 'addRules' as const,
                          rules: [
                            {
                              toolName: WEB_FETCH_TOOL_NAME,
                              ruleContent: `domain:${approvedHost}`,
                            },
                          ],
                          behavior: 'allow' as const,
                          destination: 'localSettings' as const,
                        }
                        setAppState((prev) => ({
                          ...prev,
                          toolPermissionContext: applyPermissionUpdate(
                            prev.toolPermissionContext,
                            update,
                          ),
                        }))
                        persistPermissionUpdate(update)
                        SandboxManager.refreshConfig()
                      }

                      // Remove from queue
                      setAppState((prev) => ({
                        ...prev,
                        workerSandboxPermissions: {
                          ...prev.workerSandboxPermissions,
                          queue: prev.workerSandboxPermissions.queue.slice(1),
                        },
                      }))
                    }}
                  />
                )}
                {focusedInputDialog === 'elicitation' && (
                  <ElicitationDialog
                    key={
                      elicitation.queue[0]!.serverName +
                      ':' +
                      String(elicitation.queue[0]!.requestId)
                    }
                    event={elicitation.queue[0]!}
                    onResponse={(action: string, content?: string) => {
                      const currentRequest = elicitation.queue[0]
                      if (!currentRequest) return
                      // Call respond callback to resolve Promise
                      currentRequest.respond({
                        action,
                        content,
                      })
                      // For URL accept, keep in queue for phase 2
                      const isUrlAccept =
                        currentRequest.params.mode === 'url' && action === 'accept'
                      if (!isUrlAccept) {
                        setAppState((prev) => ({
                          ...prev,
                          elicitation: {
                            queue: prev.elicitation.queue.slice(1),
                          },
                        }))
                      }
                    }}
                    onWaitingDismiss={(action: string) => {
                      const currentRequest = elicitation.queue[0]
                      // Remove from queue
                      setAppState((prev) => ({
                        ...prev,
                        elicitation: {
                          queue: prev.elicitation.queue.slice(1),
                        },
                      }))
                      currentRequest?.onWaitingDismiss?.(action)
                    }}
                  />
                )}
                {focusedInputDialog === 'cost' && (
                  <CostThresholdDialog
                    onDone={() => {
                      setShowCostDialog(false)
                      setHaveShownCostDialog(true)
                    }}
                  />
                )}
                {focusedInputDialog === 'idle-return' && idleReturnPending && (
                  <IdleReturnDialog
                    idleMinutes={idleReturnPending.idleMinutes}
                    totalInputTokens={0}
                    onDone={async (action: string) => {
                      const pending = idleReturnPending
                      setIdleReturnPending(null)
                      if (action === 'dismiss') {
                        setInputValue(pending.input)
                        return
                      }
                      if (action === 'never') {
                        // no-op: REPL handles saveGlobalConfig
                      }
                      if (action === 'clear') {
                        const { clearConversation } = await import(
                          '../commands/clear/conversation.js'
                        )
                        await clearConversation({
                          setMessages,
                          readFileState: readFileState.current,
                          discoveredSkillNames: discoveredSkillNamesRef.current,
                          loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
                          getAppState: () => store.getState(),
                          setAppState,
                          setConversationId,
                        })
                        haikuTitleAttemptedRef.current = false
                        setHaikuTitle(undefined)
                        bashTools.current.clear()
                        bashToolsProcessedIdx.current = 0
                      }
                      skipIdleCheckRef.current = true
                      void onSubmitRef.current(pending.input, {
                        setCursorOffset: () => {},
                        clearBuffer: () => {},
                        resetHistory: () => {},
                      })
                    }}
                  />
                )}
                {focusedInputDialog === 'ide-onboarding' && (
                  <IdeOnboardingDialog
                    onDone={() => setShowIdeOnboarding(false)}
                    installationStatus={ideInstallationStatus}
                  />
                )}
                {'external' === 'ant' &&
                  focusedInputDialog === 'model-switch' &&
                  AntModelSwitchCallout && (
                    <AntModelSwitchCallout
                      onDone={(selection: string, modelAlias?: string) => {
                        setShowModelSwitchCallout(false)
                        if (selection === 'switch' && modelAlias) {
                          setAppState((prev) => ({
                            ...prev,
                            mainLoopModel: modelAlias,
                            mainLoopModelForSession: null,
                          }))
                        }
                      }}
                    />
                  )}
                {'external' === 'ant' &&
                  focusedInputDialog === 'undercover-callout' &&
                  UndercoverAutoCallout && (
                    <UndercoverAutoCallout onDone={() => setShowUndercoverCallout(false)} />
                  )}
                {focusedInputDialog === 'effort-callout' && (
                  <EffortCallout
                    model={mainLoopModel}
                    onDone={(selection: string) => {
                      setShowEffortCallout(false)
                      if (selection !== 'dismiss') {
                        setAppState((prev) => ({
                          ...prev,
                          effortValue: selection,
                        }))
                      }
                    }}
                  />
                )}
                {focusedInputDialog === 'remote-callout' && (
                  <RemoteCallout
                    onDone={(selection: string) => {
                      setAppState((prev) => {
                        if (!(prev as { showRemoteCallout?: boolean }).showRemoteCallout)
                          return prev
                        return {
                          ...prev,
                          showRemoteCallout: false,
                          ...(selection === 'enable' && {
                            replBridgeEnabled: true,
                            replBridgeExplicit: true,
                            replBridgeOutboundOnly: false,
                          }),
                        }
                      })
                    }}
                  />
                )}

                {exitFlow}

                {focusedInputDialog === 'plugin-hint' && hintRecommendation && (
                  <PluginHintMenu
                    pluginName={hintRecommendation.pluginName}
                    pluginDescription={hintRecommendation.pluginDescription}
                    marketplaceName={hintRecommendation.marketplaceName}
                    sourceCommand={hintRecommendation.sourceCommand}
                    onResponse={handleHintResponse}
                  />
                )}

                {focusedInputDialog === 'lsp-recommendation' && lspRecommendation && (
                  <LspRecommendationMenu
                    pluginName={lspRecommendation.pluginName}
                    pluginDescription={lspRecommendation.pluginDescription}
                    fileExtension={lspRecommendation.fileExtension}
                    onResponse={handleLspResponse}
                  />
                )}

                {focusedInputDialog === 'desktop-upsell' && (
                  <DesktopUpsellStartup onDone={() => setShowDesktopUpsellStartup(false)} />
                )}

                {feature('ULTRAPLAN')
                  ? focusedInputDialog === 'ultraplan-choice' &&
                    ultraplanPendingChoice && (
                      <UltraplanChoiceDialog
                        plan={(ultraplanPendingChoice as { plan: string }).plan}
                        sessionId={(ultraplanPendingChoice as { sessionId: string }).sessionId}
                        taskId={(ultraplanPendingChoice as { taskId: string }).taskId}
                        setMessages={setMessages}
                        readFileState={readFileState.current}
                        getAppState={() => store.getState()}
                        setConversationId={setConversationId}
                      />
                    )
                  : null}

                {feature('ULTRAPLAN')
                  ? focusedInputDialog === 'ultraplan-launch' &&
                    ultraplanLaunchPending && (
                      <UltraplanLaunchDialog
                        onChoice={(choice: string, opts?: { disconnectedBridge?: boolean }) => {
                          const blurb = (ultraplanLaunchPending as { blurb: string }).blurb
                          setAppState((prev) =>
                            (prev as { ultraplanLaunchPending?: unknown }).ultraplanLaunchPending
                              ? {
                                  ...prev,
                                  ultraplanLaunchPending: undefined,
                                }
                              : prev,
                          )
                          if (choice === 'cancel') return
                          // no-op: REPL handles echo messages, launchUltraplan, etc.
                          void launchUltraplan({
                            blurb,
                            getAppState: () => store.getState(),
                            setAppState,
                            signal: new AbortController().signal,
                            disconnectedBridge: opts?.disconnectedBridge,
                            onSessionReady: () => {},
                          })
                        }}
                      />
                    )
                  : null}

                {mrRender()}

                {!toolJSX?.shouldHidePromptInput &&
                  !focusedInputDialog &&
                  !isExiting &&
                  !disabled &&
                  !cursor && (
                    <>
                      {autoRunIssueReason && (
                        <AutoRunIssueNotification
                          onRun={handleAutoRunIssue}
                          onCancel={handleCancelAutoRunIssue}
                          reason={getAutoRunIssueReasonText(autoRunIssueReason as string)}
                        />
                      )}
                      {postCompactSurvey.state !== 'closed' ? (
                        <FeedbackSurvey
                          state={postCompactSurvey.state}
                          lastResponse={postCompactSurvey.lastResponse as string | null}
                          handleSelect={postCompactSurvey.handleSelect}
                          inputValue={inputValue}
                          setInputValue={setInputValue}
                          onRequestFeedback={handleSurveyRequestFeedback}
                        />
                      ) : memorySurvey.state !== 'closed' ? (
                        <FeedbackSurvey
                          state={memorySurvey.state}
                          lastResponse={memorySurvey.lastResponse as string | null}
                          handleSelect={memorySurvey.handleSelect}
                          handleTranscriptSelect={memorySurvey.handleTranscriptSelect}
                          inputValue={inputValue}
                          setInputValue={setInputValue}
                          onRequestFeedback={handleSurveyRequestFeedback}
                          message="How well did Claude use its memory? (optional)"
                        />
                      ) : (
                        <FeedbackSurvey
                          state={feedbackSurvey.state}
                          lastResponse={feedbackSurvey.lastResponse as string | null}
                          handleSelect={feedbackSurvey.handleSelect}
                          handleTranscriptSelect={feedbackSurvey.handleTranscriptSelect}
                          inputValue={inputValue}
                          setInputValue={setInputValue}
                          onRequestFeedback={
                            didAutoRunIssueRef.current ? undefined : handleSurveyRequestFeedback
                          }
                        />
                      )}
                      {/* Frustration-triggered transcript sharing prompt */}
                      {frustrationDetection.state !== 'closed' && (
                        <FeedbackSurvey
                          state={frustrationDetection.state}
                          lastResponse={null}
                          handleSelect={() => {}}
                          handleTranscriptSelect={frustrationDetection.handleTranscriptSelect}
                          inputValue={inputValue}
                          setInputValue={setInputValue}
                        />
                      )}
                      {/* Skill improvement survey - appears when improvements detected (ant-only) */}
                      {'external' === 'ant' && skillImprovementSurvey.suggestion && (
                        <SkillImprovementSurvey
                          isOpen={skillImprovementSurvey.isOpen}
                          skillName={skillImprovementSurvey.suggestion.skillName}
                          updates={skillImprovementSurvey.suggestion.updates}
                          handleSelect={skillImprovementSurvey.handleSelect}
                          inputValue={inputValue}
                          setInputValue={setInputValue}
                        />
                      )}
                      {showIssueFlagBanner && <IssueFlagBanner />}
                      {}
                      <PromptInput
                        debug={debug}
                        ideSelection={ideSelection}
                        hasSuppressedDialogs={!!hasSuppressedDialogs}
                        isLocalJSXCommandActive={isShowingLocalJSXCommand}
                        getToolUseContext={getToolUseContext as never}
                        toolPermissionContext={toolPermissionContext}
                        setToolPermissionContext={setToolPermissionContext}
                        apiKeyStatus={apiKeyStatus}
                        commands={commands}
                        agents={agentDefinitions.activeAgents}
                        isLoading={isLoading}
                        onExit={handleExit}
                        verbose={verbose}
                        messages={messages}
                        onAutoUpdaterResult={setAutoUpdaterResult}
                        autoUpdaterResult={autoUpdaterResult}
                        input={inputValue}
                        onInputChange={setInputValue}
                        mode={inputMode}
                        onModeChange={setInputMode}
                        stashedPrompt={stashedPrompt}
                        setStashedPrompt={setStashedPrompt}
                        submitCount={submitCount}
                        onShowMessageSelector={handleShowMessageSelector}
                        onMessageActionsEnter={
                          // Works during isLoading — edit cancels first; uuid selection survives appends.
                          feature('MESSAGE_ACTIONS') &&
                          isFullscreenEnvEnabled() &&
                          !disableMessageActions
                            ? enterMessageActions
                            : undefined
                        }
                        mcpClients={mcpClients}
                        pastedContents={pastedContents}
                        setPastedContents={setPastedContents}
                        vimMode={vimMode}
                        setVimMode={setVimMode}
                        showBashesDialog={showBashesDialog}
                        setShowBashesDialog={setShowBashesDialog}
                        onSubmit={onSubmit}
                        onAgentSubmit={onAgentSubmit}
                        isSearchingHistory={isSearchingHistory}
                        setIsSearchingHistory={setIsSearchingHistory}
                        helpOpen={isHelpOpen}
                        setHelpOpen={setIsHelpOpen}
                        insertTextRef={feature('VOICE_MODE') ? insertTextRef : undefined}
                        voiceInterimRange={voice.interimRange}
                      />
                      <SessionBackgroundHint
                        onBackgroundSession={handleBackgroundSession}
                        isLoading={isLoading}
                      />
                    </>
                  )}
                {cursor && (
                  // inputValue is REPL state; typed text survives the round-trip.
                  <MessageActionsBar cursor={cursor} />
                )}
                {focusedInputDialog === 'message-selector' && (
                  <MessageSelector
                    messages={messages}
                    preselectedMessage={messageSelectorPreselect}
                    onPreRestore={onCancel}
                    onRestoreCode={async (message: UserMessage) => {
                      // no-op: REPL handles fileHistoryRewind
                    }}
                    onSummarize={async (
                      message: UserMessage,
                      feedback?: string,
                      direction?: string,
                    ) => {
                      // no-op: REPL handles partialCompactConversation
                    }}
                    onRestoreMessage={handleRestoreMessage}
                    onClose={() => {
                      setIsMessageSelectorVisible(false)
                      setMessageSelectorPreselect(undefined)
                    }}
                  />
                )}
                {'external' === 'ant' && <DevBar />}
              </Box>
              {!(companionNarrow && isFullscreenEnvEnabled()) && companionVisible ? (
                <CompanionSprite />
              ) : null}
            </Box>
          }
        />
      </MCPConnectionManager>
    </KeybindingSetup>
  )
  if (isFullscreenEnvEnabled()) {
    return <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{mainReturn}</AlternateScreen>
  }
  return mainReturn
}

function handleExit(): void {
  // Placeholder — wired by REPL.tsx
}
