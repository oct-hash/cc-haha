# noConstantCondition 审计清单（72 条）

> 生成日期 2026-08-13。来源：`biome check --only=noConstantCondition`。
> 本质：fork 时把运行时环境变量 / feature flag 固化成字面量（构建期常量折叠），非手写 bug。


## A：环境变量固化（USER_TYPE）（49 条）

- 原版对应：原版 `process.env.USER_TYPE === 'ant'`
- 是否影响行为：影响行为：是 —— ANT 专属功能被硬禁用

| # | 文件:行 | 代码 |
|---|---|---|
| 1 | `src/buddy/useBuddyNotification.tsx:17` | `if ('external' === 'ant') return true` |
| 2 | `src/buddy/useBuddyNotification.tsx:12` | `if ('external' === 'ant') return true` |
| 3 | `src/commands/mcp/mcp.tsx:106` | `if ('external' === 'ant') {` |
| 4 | `src/commands/terminalSetup/terminalSetup.tsx:142` | `if ('external' === 'ant') {` |
| 5 | `src/commands/thinkback/thinkback.tsx:37` | `return 'external' === 'ant' ? INTERNAL_MARKETPLACE_NAME : OFFICIAL_MARKETPLACE_NAME` |
| 6 | `src/commands/thinkback/thinkback.tsx:40` | `return 'external' === 'ant' ? INTERNAL_MARKETPLACE_REPO : OFFICIAL_MARKETPLACE_REPO` |
| 7 | `src/components/Feedback.tsx:44` | `'external' === 'ant'` |
| 8 | `src/components/FeedbackSurvey/useMemorySurvey.tsx:99` | `if ('external' !== 'ant') {` |
| 9 | `src/components/LogoV2/feedConfigs.tsx:43` | `'external' === 'ant'` |
| 10 | `src/components/LogoV2/feedConfigs.tsx:47` | `title: 'external' === 'ant' ? "What's new [ANT-ONLY: Latest CC commits]" : "What's new",` |
| 11 | `src/components/LogoV2/feedConfigs.tsx:29` | `if ('external' === 'ant') {` |
| 12 | `src/components/MemoryUsageIndicator.tsx:10` | `if ('external' !== 'ant') {` |
| 13 | `src/components/MessageSelector.tsx:181` | `if ('external' === 'ant') {` |
| 14 | `src/components/PromptInput/PromptInput.tsx:2151` | `if ('external' === 'ant') {` |
| 15 | `src/components/Settings/Config.tsx:470` | `...('external' === 'ant'` |
| 16 | `src/components/agents/ToolSelector.tsx:75` | `[BashTool.name, 'external' === 'ant' ? TungstenTool.name : undefined].filter(` |
| 17 | `src/hooks/useNotificationLayer.ts:22` | `'external' === 'ant'` |
| 18 | `src/main.tsx:545` | `if ('external' === 'ant') {` |
| 19 | `src/main.tsx:645` | `if ('external' === 'ant') {` |
| 20 | `src/main.tsx:3058` | `if ('external' === 'ant') {` |
| 21 | `src/main.tsx:3722` | `if ('external' === 'ant') {` |
| 22 | `src/main.tsx:3995` | `'external' === 'ant' ? import('./utils/sessionDataUploader.js') : null` |
| 23 | `src/main.tsx:4631` | `if ('external' === 'ant') {` |
| 24 | `src/main.tsx:4944` | `if ('external' === 'ant') {` |
| 25 | `src/main.tsx:5785` | `if ('external' === 'ant') {` |
| 26 | `src/main.tsx:5799` | `if ('external' === 'ant') {` |
| 27 | `src/main.tsx:5846` | `if ('external' === 'ant') {` |
| 28 | `src/main.tsx:5901` | `if ('external' === 'ant') {` |
| 29 | `src/main.tsx:6103` | `...('external' === 'ant'` |
| 30 | `src/screens/REPL.hooks.agent-handlers.tsx:178` | `const command = 'external' === 'ant' ? '/issue' : '/feedback'` |
| 31 | `src/screens/REPL.hooks.foundation.tsx:57` | `'external' === 'ant'` |
| 32 | `src/screens/REPL.hooks.foundation.tsx:246` | `if ('external' === 'ant') {` |
| 33 | `src/screens/REPL.hooks.interaction.tsx:183` | `if ('external' === 'ant') {` |
| 34 | `src/screens/REPL.hooks.interaction.tsx:310` | `if ('external' === 'ant') {` |
| 35 | `src/screens/REPL.hooks.misc.tsx:68` | `'external' === 'ant'` |
| 36 | `src/screens/REPL.hooks.stream.tsx:242` | `if ('external' === 'ant') {` |
| 37 | `src/screens/REPL.hooks.tool-context.tsx:502` | `'external' === 'ant'` |
| 38 | `src/screens/REPL.render.tsx:97` | `'external' === 'ant'` |
| 39 | `src/screens/REPL.render.tsx:101` | `'external' === 'ant'` |
| 40 | `src/screens/REPL.tsx:229` | `'external' === 'ant'` |
| 41 | `src/screens/REPL.tsx:233` | `'external' === 'ant'` |
| 42 | `src/screens/REPL.tsx:237` | `'external' === 'ant'` |
| 43 | `src/tools/AgentTool/AgentTool.tsx:199` | `isolation: ('external' === 'ant' ? z.enum(['worktree', 'remote']) : z.enum(['worktree']))` |
| 44 | `src/tools/AgentTool/AgentTool.tsx:202` | `'external' === 'ant'` |
| 45 | `src/tools/AgentTool/UI.tsx:124` | `if ('external' !== 'ant') {` |
| 46 | `src/tools/TaskStopTool/UI.tsx:32` | `if ('external' === 'ant') {` |
| 47 | `src/utils/autoRunIssue.tsx:99` | `if ('external' !== 'ant') {` |
| 48 | `src/utils/processUserInput/processSlashCommand.tsx:327` | `if ('external' === 'ant') {` |
| 49 | `src/utils/status.tsx:41` | `if ('external' !== 'ant') {` |

## B：环境变量固化（NODE_ENV）（4 条）

- 原版对应：原版 `process.env.NODE_ENV` 判断
- 是否影响行为：影响行为：几乎否 —— 仅 test/dev 分支失效

| # | 文件:行 | 代码 |
|---|---|---|
| 1 | `src/components/AutoUpdater.tsx:63` | `if ('production' === 'test' \|\| 'production' === 'development') {` |
| 2 | `src/components/NativeAutoUpdater.tsx:81` | `if ('production' === 'test' \|\| 'production' === 'development') {` |
| 3 | `src/hooks/useTypeahead.tsx:564` | `if ('production' !== 'test') {` |
| 4 | `src/ink/ink.tsx:357` | `if ('production' === 'development') {` |

## C：环境变量固化（DCE，有注释）（1 条）

- 原版对应：原版 `process.env.CLAUDE_CODE_VERIFY_PLAN === 'true'`
- 是否影响行为：影响行为：是 —— 但有注释说明是有意 DCE

| # | 文件:行 | 代码 |
|---|---|---|
| 1 | `src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx:458` | `undefined === 'true'` |

## D：feature flag 固化（编译产物）（18 条）

- 原版对应：原版 flag 名不可考（React Compiler 产物）
- 是否影响行为：影响行为：是 —— 相关功能被禁用

| # | 文件:行 | 代码 |
|---|---|---|
| 1 | `src/components/AutoModeOptInDialog.tsx:79` | `t4 = true` |
| 2 | `src/components/FeedbackSurvey/FeedbackSurvey.tsx:193` | `const feedbackCommand = false ? '/issue' : '/feedback'` |
| 3 | `src/components/HelpV2/HelpV2.tsx:150` | `if (false && antOnlyCommands.length > 0) {` |
| 4 | `src/components/HelpV2/HelpV2.tsx:194` | `title={false ? '/help' : `Claude Code v${MACRO.VERSION}`}` |
| 5 | `src/components/InterruptedByUser.tsx:11` | `{false ? (` |
| 6 | `src/components/LogSelector.tsx:854` | `if (!searchQuery.trim() \|\| !onAgenticSearch \|\| true) {` |
| 7 | `src/components/LogSelector.tsx:488` | `if (true \|\| !debouncedDeepSearchQuery \|\| true) {` |
| 8 | `src/components/LogSelector.tsx:1155` | `searchQuery.trim() &&` |
| 9 | `src/components/LogSelector.tsx:1772` | `<Text>{isSearching && false ? 'Searching\u2026' : 'Type to Search'}</Text>` |
| 10 | `src/components/LogSelector.tsx:470` | `if (false && deferredSearchQuery && deferredSearchQuery !== debouncedDeepSearchQuery) {` |
| 11 | `src/components/PromptInput/PromptInputHelpMenu.tsx:248` | `{cycleModeShortcut} {false ? 'to cycle modes' : 'to auto-accept edits'}` |
| 12 | `src/components/PromptInput/PromptInputModeIndicator.tsx:53` | `const color = teammateColor ?? (false ? 'subtle' : undefined)` |
| 13 | `src/components/messages/AttachmentMessage.tsx:430` | `if (false && attachment.status === 'killed') {` |
| 14 | `src/components/messages/SystemTextMessage.tsx:330` | `if (true \|\| totalDurationMs < HOOK_TIMING_DISPLAY_THRESHOLD_MS) {` |
| 15 | `src/components/messages/SystemTextMessage.tsx:336` | `t2 = false && totalDurationMs > 0 ? ` (${formatSecondsShort(totalDurationMs)})` : ''` |
| 16 | `src/components/messages/SystemTextMessage.tsx:518` | `false && info_0.durationMs !== undefined ? ` (${formatSecondsShort(info_0.durationMs)})` : ''` |
| 17 | `src/components/messages/SystemTextMessage.tsx:528` | `false && info.durationMs !== undefined ? ` (${formatSecondsShort(info.durationMs)})` : ''` |
| 18 | `src/state/AppState.tsx:167` | `if (false && state === selected) {` |
