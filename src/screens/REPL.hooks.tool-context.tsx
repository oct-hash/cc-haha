// Extracted from REPL.tsx — sandbox permission request callback + manager
// initialization, the tool-permission-context setter, the canUseTool gate,
// the interactive prompt requester, and the getToolUseContext factory
// (useREPLToolContext).

import { feature } from 'bun:bundle'
import { randomUUID, type UUID } from 'crypto'
import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import { SANDBOX_NETWORK_ACCESS_TOOL_NAME } from 'src/cli/structuredIO.js'
import type { NetworkHostPattern, SandboxAskCallback } from 'src/utils/sandbox/sandbox-adapter.js'
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js'
import type { Theme, ThemeName } from 'src/utils/theme.js'
import type { Command, ResumeEntrypoint } from '../commands.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { Notification } from '../context/notifications.js'
import useCanUseTool from '../hooks/useCanUseTool.js'
import { mergeClients } from '../hooks/useMergedClients.js'
import { registerSandboxPermissionCallback } from '../hooks/useSwarmPermissionPoller.js'
import type { TerminalNotification } from '../ink/useTerminalNotification.js'
import { Text } from '../ink.js'
import type { MCPServerConnection, ScopedMcpServerConfig } from '../services/mcp/types.js'
import { sendNotification } from '../services/notifier.js'
import type { AppStateStore } from '../state/AppState.js'
import type { Tool, ToolPermissionContext } from '../Tool.js'
import { resolveAgentTools } from '../tools/AgentTool/agentToolUtils.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { assembleToolPool } from '../tools.js'
import type { PromptRequest, PromptResponse } from '../types/hooks.js'
import type { LogOption } from '../types/logs.js'
import type { Message as MessageType } from '../types/message.js'
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js'
import type { AttributionState } from '../utils/commitAttribution.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import type { FileHistoryState } from '../utils/fileHistory.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'
import type { IDEExtensionInstallationStatus, IdeType } from '../utils/ide.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import {
  registerLeaderSetToolPermissionContext,
  unregisterLeaderSetToolPermissionContext,
} from '../utils/swarm/leaderPermissionBridge.js'
import {
  generateSandboxRequestId,
  isSwarmWorker,
  sendSandboxPermissionRequestViaMailbox,
} from '../utils/swarm/permissionSync.js'
import type { ThinkingConfig } from '../utils/thinking.js'
import { mergeAndFilterTools } from '../utils/toolPool.js'
import type { ContentReplacementState } from '../utils/toolResultStorage.js'

type SandboxPermissionRequestItem = {
  hostPattern: NetworkHostPattern
  resolvePromise: (allowConnection: boolean) => void
}

type PromptQueueItem = {
  request: PromptRequest
  title: string
  toolInputSummary?: string | null
  resolve: (response: PromptResponse) => void
  reject: (error: Error) => void
}

type ApiMetricsEntry = {
  ttftMs: number
  firstTokenTime: number
  lastTokenTime: number
  responseLengthBaseline: number
  endResponseLength: number
}

export interface UseREPLToolContextParams {
  setAppState: SetAppState
  store: AppStateStore
  setSandboxPermissionRequestQueue: React.Dispatch<
    React.SetStateAction<SandboxPermissionRequestItem[]>
  >
  sandboxBridgeCleanupRef: React.MutableRefObject<Map<string, Array<() => void>>>
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  setPromptQueue: React.Dispatch<React.SetStateAction<PromptQueueItem[]>>
  addNotification: (content: Notification) => void
  commands: Command[]
  combinedInitialTools: Tool[]
  mainThreadAgentDefinition: AgentDefinition | undefined
  debug: boolean
  initialMcpClients?: MCPServerConnection[]
  ideInstallationStatus: IDEExtensionInstallationStatus | null
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig> | undefined
  theme: ThemeName
  allowedAgentTypes: string[] | undefined
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  thinkingConfig: ThinkingConfig
  messages: MessageType[]
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  disabled: boolean
  setIsMessageSelectorVisible: React.Dispatch<React.SetStateAction<boolean>>
  reverify: () => Promise<void>
  readFileState: React.MutableRefObject<FileStateCache>
  setToolJSX: (
    args: {
      jsx: React.ReactNode | null
      shouldHidePromptInput: boolean
      shouldContinueAnimation?: true
      showSpinner?: boolean
      isLocalJSXCommand?: boolean
      clearLocalJSX?: boolean
    } | null,
  ) => void
  terminal: TerminalNotification
  onChangeDynamicMcpConfig: (config: Record<string, ScopedMcpServerConfig>) => void
  setIDEToInstallExtension: React.Dispatch<React.SetStateAction<IdeType | null>>
  loadedNestedMemoryPathsRef: React.MutableRefObject<Set<string>>
  discoveredSkillNamesRef: React.MutableRefObject<Set<string>>
  setResponseLength: (f: (prev: number) => number) => void
  responseLengthRef: React.MutableRefObject<number>
  apiMetricsRef: React.MutableRefObject<ApiMetricsEntry[]>
  setStreamMode: React.Dispatch<React.SetStateAction<SpinnerMode>>
  setSpinnerColor: React.Dispatch<React.SetStateAction<keyof Theme | null>>
  setSpinnerShimmerColor: React.Dispatch<React.SetStateAction<keyof Theme | null>>
  setSpinnerMessage: React.Dispatch<React.SetStateAction<string | null>>
  setInProgressToolUseIDs: React.Dispatch<React.SetStateAction<Set<string>>>
  hasInterruptibleToolInProgressRef: React.MutableRefObject<boolean>
  resume: (sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) => Promise<void>
  setConversationId: (id: UUID) => void
  contentReplacementStateRef: { current: ContentReplacementState | undefined }
}

export function useREPLToolContext(params: UseREPLToolContextParams) {
  const {
    setAppState,
    store,
    setSandboxPermissionRequestQueue,
    sandboxBridgeCleanupRef,
    setToolUseConfirmQueue,
    setPromptQueue,
    addNotification,
    commands,
    combinedInitialTools,
    mainThreadAgentDefinition,
    debug,
    initialMcpClients,
    ideInstallationStatus,
    dynamicMcpConfig,
    theme,
    allowedAgentTypes,
    customSystemPrompt,
    appendSystemPrompt,
    thinkingConfig,
    messages,
    setMessages,
    disabled,
    setIsMessageSelectorVisible,
    reverify,
    readFileState,
    setToolJSX,
    terminal,
    onChangeDynamicMcpConfig,
    setIDEToInstallExtension,
    loadedNestedMemoryPathsRef,
    discoveredSkillNamesRef,
    setResponseLength,
    responseLengthRef,
    apiMetricsRef,
    setStreamMode,
    setSpinnerColor,
    setSpinnerShimmerColor,
    setSpinnerMessage,
    setInProgressToolUseIDs,
    hasInterruptibleToolInProgressRef,
    resume,
    setConversationId,
    contentReplacementStateRef,
  } = params

  const sandboxAskCallback: SandboxAskCallback = useCallback(
    async (hostPattern: NetworkHostPattern) => {
      // If running as a swarm worker, forward the request to the leader via mailbox
      if (isAgentSwarmsEnabled() && isSwarmWorker()) {
        const requestId = generateSandboxRequestId()

        // Send the request to the leader via mailbox
        const sent = await sendSandboxPermissionRequestViaMailbox(hostPattern.host, requestId)
        return new Promise((resolveShouldAllowHost) => {
          if (!sent) {
            // If we couldn't send via mailbox, fall back to local handling
            setSandboxPermissionRequestQueue((prev) => [
              ...prev,
              {
                hostPattern,
                resolvePromise: resolveShouldAllowHost,
              },
            ])
            return
          }

          // Register the callback for when the leader responds
          registerSandboxPermissionCallback({
            requestId,
            host: hostPattern.host,
            resolve: resolveShouldAllowHost,
          })

          // Update AppState to show pending indicator
          setAppState((prev) => ({
            ...prev,
            pendingSandboxRequest: {
              requestId,
              host: hostPattern.host,
            },
          }))
        })
      }

      // Normal flow for non-workers: show local UI and optionally race
      // against the REPL bridge (Remote Control) if connected.
      return new Promise((resolveShouldAllowHost) => {
        let resolved = false
        function resolveOnce(allow: boolean): void {
          if (resolved) return
          resolved = true
          resolveShouldAllowHost(allow)
        }

        // Queue the local sandbox permission dialog
        setSandboxPermissionRequestQueue((prev) => [
          ...prev,
          {
            hostPattern,
            resolvePromise: resolveOnce,
          },
        ])

        // When the REPL bridge is connected, also forward the sandbox
        // permission request as a can_use_tool control_request so the
        // remote user (e.g. on claude.ai) can approve it too.
        if (feature('BRIDGE_MODE')) {
          const bridgeCallbacks = store.getState().replBridgePermissionCallbacks
          if (bridgeCallbacks) {
            const bridgeRequestId = randomUUID()
            bridgeCallbacks.sendRequest(
              bridgeRequestId,
              SANDBOX_NETWORK_ACCESS_TOOL_NAME,
              {
                host: hostPattern.host,
              },
              randomUUID(),
              `Allow network connection to ${hostPattern.host}?`,
            )
            const unsubscribe = bridgeCallbacks.onResponse(bridgeRequestId, (response) => {
              unsubscribe()
              const allow = response.behavior === 'allow'
              // Resolve ALL pending requests for the same host, not just
              // this one — mirrors the local dialog handler pattern.
              setSandboxPermissionRequestQueue((queue) => {
                queue
                  .filter((item) => item.hostPattern.host === hostPattern.host)
                  .forEach((item) => item.resolvePromise(allow))
                return queue.filter((item) => item.hostPattern.host !== hostPattern.host)
              })
              // Clean up all sibling bridge subscriptions for this host
              // (other concurrent same-host requests) before deleting.
              const siblingCleanups = sandboxBridgeCleanupRef.current.get(hostPattern.host)
              if (siblingCleanups) {
                for (const fn of siblingCleanups) {
                  fn()
                }
                sandboxBridgeCleanupRef.current.delete(hostPattern.host)
              }
            })

            // Register cleanup so the local dialog handler can cancel
            // the remote prompt and unsubscribe when the local user
            // responds first.
            const cleanup = () => {
              unsubscribe()
              bridgeCallbacks.cancelRequest(bridgeRequestId)
            }
            const existing = sandboxBridgeCleanupRef.current.get(hostPattern.host) ?? []
            existing.push(cleanup)
            sandboxBridgeCleanupRef.current.set(hostPattern.host, existing)
          }
        }
      })
    },
    [setAppState, store],
  )

  // #34044: if user explicitly set sandbox.enabled=true but deps are missing,
  // isSandboxingEnabled() returns false silently. Surface the reason once at
  // mount so users know their security config isn't being enforced. Full
  // reason goes to debug log; notification points to /sandbox for details.
  // addNotification is stable (useCallback) so the effect fires once.
  useEffect(() => {
    const reason = SandboxManager.getSandboxUnavailableReason()
    if (!reason) return
    if (SandboxManager.isSandboxRequired()) {
      process.stderr.write(
        `\nError: sandbox required but unavailable: ${reason}\n` +
          `  sandbox.failIfUnavailable is set — refusing to start without a working sandbox.\n\n`,
      )
      gracefulShutdownSync(1, 'other')
      return
    }
    logForDebugging(`sandbox disabled: ${reason}`, {
      level: 'warn',
    })
    addNotification({
      key: 'sandbox-unavailable',
      jsx: (
        <>
          <Text color="warning">sandbox disabled</Text>
          <Text dimColor> · /sandbox</Text>
        </>
      ),
      priority: 'medium',
    })
  }, [addNotification])
  if (SandboxManager.isSandboxingEnabled()) {
    // If sandboxing is enabled (setting.sandbox is defined, initialise the manager)
    SandboxManager.initialize(sandboxAskCallback).catch((err) => {
      // Initialization/validation failed - display error and exit
      process.stderr.write(`\n❌ Sandbox Error: ${errorMessage(err)}\n`)
      gracefulShutdownSync(1, 'other')
    })
  }
  const setToolPermissionContext = useCallback(
    (
      context: ToolPermissionContext,
      options?: {
        preserveMode?: boolean
      },
    ) => {
      setAppState((prev) => ({
        ...prev,
        toolPermissionContext: {
          ...context,
          // Preserve the coordinator's mode only when explicitly requested.
          // Workers' getAppState() returns a transformed context with mode
          // 'acceptEdits' that must not leak into the coordinator's actual
          // state via permission-rule updates — those call sites pass
          // { preserveMode: true }. User-initiated mode changes (e.g.,
          // selecting "allow all edits") must NOT be overridden.
          mode: options?.preserveMode ? prev.toolPermissionContext.mode : context.mode,
        },
      }))

      // When permission context changes, recheck all queued items
      // This handles the case where approving item1 with "don't ask again"
      // should auto-approve other queued items that now match the updated rules
      setImmediate((setToolUseConfirmQueue) => {
        // Use setToolUseConfirmQueue callback to get current queue state
        // instead of capturing it in the closure, to avoid stale closure issues
        setToolUseConfirmQueue((currentQueue) => {
          currentQueue.forEach((item) => {
            void item.recheckPermission()
          })
          return currentQueue
        })
      }, setToolUseConfirmQueue)
    },
    [setAppState, setToolUseConfirmQueue],
  )

  // Register the leader's setToolPermissionContext for in-process teammates
  useEffect(() => {
    registerLeaderSetToolPermissionContext(setToolPermissionContext)
    return () => unregisterLeaderSetToolPermissionContext()
  }, [setToolPermissionContext])
  const canUseTool = useCanUseTool(setToolUseConfirmQueue, setToolPermissionContext)
  const requestPrompt = useCallback(
    (title: string, toolInputSummary?: string | null) =>
      (request: PromptRequest): Promise<PromptResponse> =>
        new Promise<PromptResponse>((resolve, reject) => {
          setPromptQueue((prev) => [
            ...prev,
            {
              request,
              title,
              toolInputSummary,
              resolve,
              reject,
            },
          ])
        }),
    [],
  )
  const getToolUseContext = useCallback(
    (
      messages: MessageType[],
      newMessages: MessageType[],
      abortController: AbortController,
      mainLoopModel: string,
    ): ProcessUserInputContext => {
      // Read mutable values fresh from the store rather than closure-capturing
      // useAppState() snapshots. Same values today (closure is refreshed by the
      // render between turns); decouples freshness from React's render cycle for
      // a future headless conversation loop. Same pattern refreshTools() uses.
      const s = store.getState()

      // Compute tools fresh from store.getState() rather than the closure-
      // captured `tools`. useManageMCPConnections populates appState.mcp
      // async as servers connect — the store may have newer MCP state than
      // the closure captured at render time. Also doubles as refreshTools()
      // for mid-query tool list updates.
      const computeTools = () => {
        const state = store.getState()
        const assembled = assembleToolPool(state.toolPermissionContext, state.mcp.tools)
        const merged = mergeAndFilterTools(
          combinedInitialTools,
          assembled,
          state.toolPermissionContext.mode,
        )
        if (!mainThreadAgentDefinition) return merged
        return resolveAgentTools(mainThreadAgentDefinition, merged, false, true).resolvedTools
      }
      return {
        abortController,
        options: {
          commands,
          tools: computeTools(),
          debug,
          verbose: s.verbose,
          mainLoopModel,
          thinkingConfig:
            s.thinkingEnabled !== false
              ? thinkingConfig
              : {
                  type: 'disabled',
                },
          // Merge fresh from store rather than closing over useMergedClients'
          // memoized output. initialMcpClients is a prop (session-constant).
          mcpClients: mergeClients(initialMcpClients, s.mcp.clients),
          mcpResources: s.mcp.resources,
          ideInstallationStatus: ideInstallationStatus,
          isNonInteractiveSession: false,
          dynamicMcpConfig,
          theme,
          agentDefinitions: allowedAgentTypes
            ? {
                ...s.agentDefinitions,
                allowedAgentTypes,
              }
            : s.agentDefinitions,
          customSystemPrompt,
          appendSystemPrompt,
          refreshTools: computeTools,
        },
        getAppState: () => store.getState(),
        setAppState,
        messages,
        setMessages,
        updateFileHistoryState(updater: (prev: FileHistoryState) => FileHistoryState) {
          // Perf: skip the setState when the updater returns the same reference
          // (e.g. fileHistoryTrackEdit returns `state` when the file is already
          // tracked). Otherwise every no-op call would notify all store listeners.
          setAppState((prev) => {
            const updated = updater(prev.fileHistory)
            if (updated === prev.fileHistory) return prev
            return {
              ...prev,
              fileHistory: updated,
            }
          })
        },
        updateAttributionState(updater: (prev: AttributionState) => AttributionState) {
          setAppState((prev) => {
            const updated = updater(prev.attribution)
            if (updated === prev.attribution) return prev
            return {
              ...prev,
              attribution: updated,
            }
          })
        },
        openMessageSelector: () => {
          if (!disabled) {
            setIsMessageSelectorVisible(true)
          }
        },
        onChangeAPIKey: reverify,
        readFileState: readFileState.current,
        setToolJSX,
        addNotification,
        appendSystemMessage: (msg) => setMessages((prev) => [...prev, msg]),
        sendOSNotification: (opts) => {
          void sendNotification(opts, terminal)
        },
        onChangeDynamicMcpConfig,
        onInstallIDEExtension: setIDEToInstallExtension,
        nestedMemoryAttachmentTriggers: new Set<string>(),
        loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
        dynamicSkillDirTriggers: new Set<string>(),
        discoveredSkillNames: discoveredSkillNamesRef.current,
        setResponseLength,
        pushApiMetricsEntry:
          process.env.USER_TYPE === 'ant'
            ? (ttftMs: number) => {
                const now = Date.now()
                const baseline = responseLengthRef.current
                apiMetricsRef.current.push({
                  ttftMs,
                  firstTokenTime: now,
                  lastTokenTime: now,
                  responseLengthBaseline: baseline,
                  endResponseLength: baseline,
                })
              }
            : undefined,
        setStreamMode,
        onCompactProgress: (event) => {
          switch (event.type) {
            case 'hooks_start':
              setSpinnerColor('claudeBlue_FOR_SYSTEM_SPINNER')
              setSpinnerShimmerColor('claudeBlueShimmer_FOR_SYSTEM_SPINNER')
              setSpinnerMessage(
                event.hookType === 'pre_compact'
                  ? 'Running PreCompact hooks\u2026'
                  : event.hookType === 'post_compact'
                    ? 'Running PostCompact hooks\u2026'
                    : 'Running SessionStart hooks\u2026',
              )
              break
            case 'compact_start':
              setSpinnerMessage('Compacting conversation')
              break
            case 'compact_end':
              setSpinnerMessage(null)
              setSpinnerColor(null)
              setSpinnerShimmerColor(null)
              break
          }
        },
        setInProgressToolUseIDs,
        setHasInterruptibleToolInProgress: (v: boolean) => {
          hasInterruptibleToolInProgressRef.current = v
        },
        resume,
        setConversationId,
        requestPrompt: feature('HOOK_PROMPTS') ? requestPrompt : undefined,
        contentReplacementState: contentReplacementStateRef.current,
      }
    },
    [
      commands,
      combinedInitialTools,
      mainThreadAgentDefinition,
      debug,
      initialMcpClients,
      ideInstallationStatus,
      dynamicMcpConfig,
      theme,
      allowedAgentTypes,
      store,
      setAppState,
      reverify,
      addNotification,
      setMessages,
      onChangeDynamicMcpConfig,
      resume,
      requestPrompt,
      disabled,
      customSystemPrompt,
      appendSystemPrompt,
      setConversationId,
    ],
  )

  return {
    setToolPermissionContext,
    canUseTool,
    getToolUseContext,
  }
}
