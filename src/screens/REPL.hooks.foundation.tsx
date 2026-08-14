// Extracted from REPL.tsx — foundation state (env gates, app state, tools, commands, screen, IDE, notifications)

import { feature } from 'bun:bundle'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldShowDesktopUpsellStartup } from 'src/components/DesktopUpsell/DesktopUpsellStartup.js'
import { useNotificationLayer } from 'src/hooks/useNotificationLayer.js'
import { usePromptsFromClaudeInChrome } from 'src/hooks/usePromptsFromClaudeInChrome.js'
import {
  useKickOffCheckAndDisableAutoModeIfNeeded,
  useKickOffCheckAndDisableBypassPermissionsIfNeeded,
} from 'src/utils/permissions/bypassPermissionsKillswitch.js'
import { performStartupChecks } from 'src/utils/plugins/performStartupChecks.js'
import { getProjectRoot } from '../bootstrap/state.js'
import type { Command } from '../commands.js'
import { shouldShowEffortCallout } from '../components/EffortCallout.js'
import { useNotifications } from '../context/notifications.js'
import { useCommandQueue } from '../hooks/useCommandQueue.js'
import { useIdeLogging } from '../hooks/useIdeLogging.js'
import { type IDESelection, useIdeSelection } from '../hooks/useIdeSelection.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { useManagePlugins } from '../hooks/useManagePlugins.js'
import { useMergedClients } from '../hooks/useMergedClients.js'
import { useMergedCommands } from '../hooks/useMergedCommands.js'
import { useMergedTools } from '../hooks/useMergedTools.js'
import { useSkillsChange } from '../hooks/useSkillsChange.js'
import { useSwarmInitialization } from '../hooks/useSwarmInitialization.js'
import { useTasksV2WithCollapseEffect } from '../hooks/useTasksV2.js'
import { useTerminalNotification } from '../ink/useTerminalNotification.js'
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js'
import type { MCPServerConnection, ScopedMcpServerConfig } from '../services/mcp/types.js'
import { useAppState, useAppStateStore, useSetAppState } from '../state/AppState.js'
import type { Tool } from '../Tool.js'
import { isLocalAgentTask } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { resolveAgentTools } from '../tools/AgentTool/agentToolUtils.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { getTools } from '../tools.js'
import { asAgentId } from '../types/ids.js'
import type { Message as MessageType } from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import type { IDEExtensionInstallationStatus, IdeType } from '../utils/ide.js'
import { getAgentTranscript } from '../utils/sessionStorage.js'
import type { Screen } from './REPL.types.js'
import { EMPTY_MCP_CLIENTS } from './REPL.utils.js'

// Dead code elimination: conditional requires (same pattern as REPL.tsx).
// feature() is a build-time constant — dead code elimination removes the
// require entirely in external builds.
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS') ? require('../proactive/index.js') : null
const PROACTIVE_NO_OP_SUBSCRIBE = (_cb: () => void) => () => {}
const PROACTIVE_FALSE = () => false
const SUGGEST_BG_PR_NOOP = (_p: string, _n: string): boolean => false
const shouldShowAntModelSwitch =
  process.env.USER_TYPE === 'ant'
    ? require('../components/AntModelSwitchCallout.js').shouldShowModelSwitchCallout
    : (): boolean => false
/* eslint-enable @typescript-eslint/no-require-imports */

export interface UseREPLFoundationParams {
  initialCommands: Command[]
  initialTools: Tool[]
  initialMessages?: MessageType[]
  initialMcpClients?: MCPServerConnection[]
  initialDynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  disabled: boolean
  initialMainThreadAgentDefinition?: AgentDefinition
  disableSlashCommands: boolean
  remoteSessionConfig?: RemoteSessionConfig
}

export function useREPLFoundation(params: UseREPLFoundationParams) {
  const {
    initialCommands,
    initialTools,
    initialMessages,
    initialMcpClients,
    initialDynamicMcpConfig,
    disabled,
    initialMainThreadAgentDefinition,
    disableSlashCommands,
    remoteSessionConfig,
  } = params

  const isRemoteSession = !!remoteSessionConfig

  // Env-var gates hoisted to mount-time — isEnvTruthy does toLowerCase+trim+
  // includes, and these were on the render path (hot during PageUp spam).
  const titleDisabled = useMemo(
    () => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE),
    [],
  )
  const moreRightEnabled = useMemo(
    () => process.env.USER_TYPE === 'ant' && isEnvTruthy(process.env.CLAUDE_MORERIGHT),
    [],
  )
  const disableVirtualScroll = useMemo(
    () => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL),
    [],
  )
  const disableMessageActions = feature('MESSAGE_ACTIONS')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
      useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS), [])
    : false

  // Log REPL mount/unmount lifecycle
  useEffect(() => {
    logForDebugging(`[REPL:mount] REPL mounted, disabled=${disabled}`)
    return () => logForDebugging(`[REPL:unmount] REPL unmounting`)
  }, [disabled])

  // Agent definition is state so /resume can update it mid-session
  const [mainThreadAgentDefinition, setMainThreadAgentDefinition] = useState(
    initialMainThreadAgentDefinition,
  )
  const toolPermissionContext = useAppState((s) => s.toolPermissionContext)
  const verbose = useAppState((s) => s.verbose)
  const mcp = useAppState((s) => s.mcp)
  const plugins = useAppState((s) => s.plugins)
  const agentDefinitions = useAppState((s) => s.agentDefinitions)
  const fileHistory = useAppState((s) => s.fileHistory)
  const initialMessage = useAppState((s) => s.initialMessage)
  const queuedCommands = useCommandQueue()
  // feature() is a build-time constant — dead code elimination removes the hook
  // call entirely in external builds, so this is safe despite looking conditional.
  // These fields contain excluded strings that must not appear in external builds.
  const spinnerTip = useAppState((s) => s.spinnerTip)
  const showExpandedTodos = useAppState((s) => s.expandedView) === 'tasks'
  const pendingWorkerRequest = useAppState((s) => s.pendingWorkerRequest)
  const pendingSandboxRequest = useAppState((s) => s.pendingSandboxRequest)
  const teamContext = useAppState((s) => s.teamContext)
  const tasks = useAppState((s) => s.tasks)
  const workerSandboxPermissions = useAppState((s) => s.workerSandboxPermissions)
  const elicitation = useAppState((s) => s.elicitation)
  const ultraplanPendingChoice = useAppState((s) => s.ultraplanPendingChoice)
  const ultraplanLaunchPending = useAppState((s) => s.ultraplanLaunchPending)
  const viewingAgentTaskId = useAppState((s) => s.viewingAgentTaskId)
  const setAppState = useSetAppState()

  // Bootstrap: retained local_agent that hasn't loaded disk yet → read
  // sidechain JSONL and UUID-merge with whatever stream has appended so far.
  // Stream appends immediately on retain (no defer); bootstrap fills the
  // prefix. Disk-write-before-yield means live is always a suffix of disk.
  const viewedLocalAgent = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined
  const needsBootstrap =
    isLocalAgentTask(viewedLocalAgent) && viewedLocalAgent.retain && !viewedLocalAgent.diskLoaded
  useEffect(() => {
    if (!viewingAgentTaskId || !needsBootstrap) return
    const taskId = viewingAgentTaskId
    void getAgentTranscript(asAgentId(taskId)).then((result) => {
      setAppState((prev) => {
        const t = prev.tasks[taskId]
        if (!isLocalAgentTask(t) || t.diskLoaded || !t.retain) return prev
        const live = t.messages ?? []
        const liveUuids = new Set(live.map((m) => m.uuid))
        const diskOnly = result ? result.messages.filter((m) => !liveUuids.has(m.uuid)) : []
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [taskId]: {
              ...t,
              messages: [...diskOnly, ...live],
              diskLoaded: true,
            },
          },
        }
      })
    })
  }, [viewingAgentTaskId, needsBootstrap, setAppState])
  const store = useAppStateStore()
  const terminal = useTerminalNotification()
  const mainLoopModel = useMainLoopModel()

  // Note: standaloneAgentContext is initialized in main.tsx (via initialState) or
  // ResumeConversation.tsx (via setAppState before rendering REPL) to avoid
  // useEffect-based state initialization on mount (per CLAUDE.md guidelines)

  // Local state for commands (hot-reloadable when skill files change)
  const [localCommands, setLocalCommands] = useState(initialCommands)

  // Watch for skill file changes and reload all commands
  useSkillsChange(isRemoteSession ? undefined : getProjectRoot(), setLocalCommands)

  // Track proactive mode for tools dependency - SleepTool filters by proactive state
  const proactiveActive = React.useSyncExternalStore(
    proactiveModule?.subscribeToProactiveChanges ?? PROACTIVE_NO_OP_SUBSCRIBE,
    proactiveModule?.isProactiveActive ?? PROACTIVE_FALSE,
  )

  // BriefTool.isEnabled() reads getUserMsgOptIn() from bootstrap state, which
  // /brief flips mid-session alongside isBriefOnly. The memo below needs a
  // React-visible dep to re-run getTools() when that happens; isBriefOnly is
  // the AppState mirror that triggers the re-render. Without this, toggling
  // /brief mid-session leaves the stale tool list (no SendUserMessage) and
  // the model emits plain text the brief filter hides.
  const isBriefOnly = useAppState((s) => s.isBriefOnly)
  // biome-ignore lint/correctness/useExhaustiveDependencies: proactiveActive/isBriefOnly are triggers to re-run getTools() (which reads global proactive/brief state), not read in the memo body
  const localTools = useMemo(
    () => getTools(toolPermissionContext),
    [toolPermissionContext, proactiveActive, isBriefOnly],
  )
  useKickOffCheckAndDisableBypassPermissionsIfNeeded()
  useKickOffCheckAndDisableAutoModeIfNeeded()
  const [dynamicMcpConfig, setDynamicMcpConfig] = useState<
    Record<string, ScopedMcpServerConfig> | undefined
  >(initialDynamicMcpConfig)
  const onChangeDynamicMcpConfig = useCallback(
    (config: Record<string, ScopedMcpServerConfig>) => {
      setDynamicMcpConfig(config)
    },
    [],
  )
  const [screen, setScreen] = useState<Screen>('prompt')
  const [showAllInTranscript, setShowAllInTranscript] = useState(false)
  // [ forces the dump-to-scrollback path inside transcript mode. Separate
  // from CLAUDE_CODE_NO_FLICKER=0 (which is process-lifetime) — this is
  // ephemeral, reset on transcript exit. Diagnostic escape hatch so
  // terminal/tmux native cmd-F can search the full flat render.
  const [dumpMode, setDumpMode] = useState(false)
  // v-for-editor render progress. Inline in the footer — notifications
  // render inside PromptInput which isn't mounted in transcript.
  const [editorStatus, setEditorStatus] = useState('')
  // Incremented on transcript exit. Async v-render captures this at start;
  // each status write no-ops if stale (user left transcript mid-render —
  // the stable setState would otherwise stamp a ghost toast into the next
  // session). Also clears any pending 4s auto-clear.
  const editorGenRef = useRef(0)
  const editorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRenderingRef = useRef(false)
  const { addNotification, removeNotification } = useNotifications()

  // eslint-disable-next-line prefer-const
  const trySuggestBgPRIntercept = SUGGEST_BG_PR_NOOP
  const mcpClients = useMergedClients(initialMcpClients, mcp.clients)

  // IDE integration
  const [ideSelection, setIDESelection] = useState<IDESelection | undefined>(undefined)
  const [ideToInstallExtension, setIDEToInstallExtension] = useState<IdeType | null>(null)
  const [ideInstallationStatus, setIDEInstallationStatus] =
    useState<IDEExtensionInstallationStatus | null>(null)
  const [showIdeOnboarding, setShowIdeOnboarding] = useState(false)
  // Dead code elimination: model switch callout state (ant-only)
  const [showModelSwitchCallout, setShowModelSwitchCallout] = useState(() => {
    if (process.env.USER_TYPE === 'ant') {
      return shouldShowAntModelSwitch()
    }
    return false
  })
  const [showEffortCallout, setShowEffortCallout] = useState(() =>
    shouldShowEffortCallout(mainLoopModel),
  )
  const showRemoteCallout = useAppState((s) => s.showRemoteCallout)
  const [showDesktopUpsellStartup, setShowDesktopUpsellStartup] = useState(() =>
    shouldShowDesktopUpsellStartup(),
  )
  // notifications
  const { lspRecommendation, handleLspResponse, hintRecommendation, handleHintResponse } =
    useNotificationLayer({ mcpClients, mainLoopModel, ideSelection, ideInstallationStatus })

  // Memoize the combined initial tools array to prevent reference changes
  const combinedInitialTools = useMemo(() => {
    return [...localTools, ...initialTools]
  }, [localTools, initialTools])

  // Initialize plugin management
  useManagePlugins({
    enabled: !isRemoteSession,
  })
  const tasksV2 = useTasksV2WithCollapseEffect()

  // Start background plugin installations

  // SECURITY: This code is guaranteed to run ONLY after the "trust this folder" dialog
  // has been confirmed by the user. The trust dialog is shown in cli.tsx (line ~387)
  // before the REPL component is rendered. The dialog blocks execution until the user
  // accepts, and only then is the REPL component mounted and this effect runs.
  // This ensures that plugin installations from repository and user settings only
  // happen after explicit user consent to trust the current working directory.
  useEffect(() => {
    if (isRemoteSession) return
    void performStartupChecks(setAppState)
  }, [setAppState, isRemoteSession])

  // Allow Claude in Chrome MCP to send prompts through MCP notifications
  // and sync permission mode changes to the Chrome extension
  usePromptsFromClaudeInChrome(
    isRemoteSession ? EMPTY_MCP_CLIENTS : mcpClients,
    toolPermissionContext.mode,
  )

  // Initialize swarm features: teammate hooks and context
  // Handles both fresh spawns and resumed teammate sessions
  useSwarmInitialization(setAppState, initialMessages, {
    enabled: !isRemoteSession,
  })
  const mergedTools = useMergedTools(combinedInitialTools, mcp.tools, toolPermissionContext)

  // Apply agent tool restrictions if mainThreadAgentDefinition is set
  const { tools, allowedAgentTypes } = useMemo(() => {
    if (!mainThreadAgentDefinition) {
      return {
        tools: mergedTools,
        allowedAgentTypes: undefined as string[] | undefined,
      }
    }
    const resolved = resolveAgentTools(mainThreadAgentDefinition, mergedTools, false, true)
    return {
      tools: resolved.resolvedTools,
      allowedAgentTypes: resolved.allowedAgentTypes,
    }
  }, [mainThreadAgentDefinition, mergedTools])

  // Merge commands from local state, plugins, and MCP
  const commandsWithPlugins = useMergedCommands(localCommands, plugins.commands as Command[])
  const mergedCommands = useMergedCommands(commandsWithPlugins, mcp.commands as Command[])
  // Filter out all commands if disableSlashCommands is true
  const commands = useMemo(
    () => (disableSlashCommands ? [] : mergedCommands),
    [disableSlashCommands, mergedCommands],
  )
  useIdeLogging(isRemoteSession ? EMPTY_MCP_CLIENTS : mcp.clients)
  useIdeSelection(isRemoteSession ? EMPTY_MCP_CLIENTS : mcp.clients, setIDESelection)
  return {
    isRemoteSession,
    titleDisabled,
    moreRightEnabled,
    disableVirtualScroll,
    disableMessageActions,
    mainThreadAgentDefinition,
    setMainThreadAgentDefinition,
    toolPermissionContext,
    verbose,
    agentDefinitions,
    fileHistory,
    initialMessage,
    queuedCommands,
    spinnerTip,
    showExpandedTodos,
    pendingWorkerRequest,
    pendingSandboxRequest,
    teamContext,
    tasks,
    workerSandboxPermissions,
    elicitation,
    ultraplanPendingChoice,
    ultraplanLaunchPending,
    viewingAgentTaskId,
    setAppState,
    store,
    terminal,
    mainLoopModel,
    localCommands,
    setLocalCommands,
    proactiveActive,
    isBriefOnly,
    dynamicMcpConfig,
    setDynamicMcpConfig,
    onChangeDynamicMcpConfig,
    screen,
    setScreen,
    showAllInTranscript,
    setShowAllInTranscript,
    dumpMode,
    setDumpMode,
    editorStatus,
    setEditorStatus,
    editorGenRef,
    editorTimerRef,
    editorRenderingRef,
    addNotification,
    removeNotification,
    trySuggestBgPRIntercept,
    mcpClients,
    ideSelection,
    setIDESelection,
    ideToInstallExtension,
    setIDEToInstallExtension,
    ideInstallationStatus,
    setIDEInstallationStatus,
    showIdeOnboarding,
    setShowIdeOnboarding,
    showModelSwitchCallout,
    setShowModelSwitchCallout,
    showEffortCallout,
    setShowEffortCallout,
    showRemoteCallout,
    showDesktopUpsellStartup,
    setShowDesktopUpsellStartup,
    lspRecommendation,
    handleLspResponse,
    hintRecommendation,
    handleHintResponse,
    combinedInitialTools,
    tasksV2,
    tools,
    allowedAgentTypes,
    commands,
  }
}
