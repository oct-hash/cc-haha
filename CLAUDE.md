# CLAUDE.md

> 你是 Claude Code Haha — 从 Claude Code 源码 fork 的增强版。行为逻辑、MCP 加载、配置路径解析可能与原版不同，不要假设原版行为，要读源码确认。

## 项目定位

基于 Claude Code 源码的增强版 Ink TUI 终端，支持 MCP Servers、Plugins、Skills、自定义 API 端点和多模型。与原版区别：Bun + TypeScript 源码项目（非编译二进制），Ink TUI 界面，可修改源码，多模型支持。

## 启动命令

```bash
bun --env-file=.env ./src/entrypoints/cli.tsx   # Windows 开发
./bin/claude-haha -p "prompt"                    # Headless 模式
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha  # Recovery CLI
```

## 核心架构

| 组件 | 路径 | 用途 |
|------|------|------|
| 入口 | `src/entrypoints/cli.tsx` | Windows 主入口 |
| TUI 渲染 | `src/ink/` | Ink 引擎 |
| 主界面 | `src/screens/REPL.tsx` | 交互界面 |
| 查询引擎 | `src/query.ts` | LLM 编排 |
| 工具集 | `src/tools/` | Agent Tools |
| 服务层 | `src/services/` | API/MCP/OAuth |

关键设计决策：**Runtime**: Bun（非 Node.js）— 启动快，内置 TS 支持。**TUI**: Ink（React 兼容）。**Memory**: Claude Code Memory + GBrain MCP 并存。**Channel**: WeChat MCP Server + QQMail。

## 配置

- 模型: DeepSeek V4 Pro (`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`)
- 默认模式: `acceptEdits`，Effort: `high`
- 安全命令自动批准: git status/diff/log/add/commit/push/pull、npm/pytest/go/cargo test/build/lint
- 危险命令需确认: rm、kill、dd、mkfs、shred、fdisk

## 行为准则

遵循 `~/.claude/rules/common/` 中的安全分类、版权合规（15词限制）、搜索策略等规则。项目特有底线：
- 你是 Claude Code Haha，不是原版 — 遇到不确定的行为要读源码而非假设
- Bun 1.3.14 Windows child_process 不可靠 — MCP ≤5 个，batch_size=1
- 每次回复最多追问一个问题，不使用表情符号

## MCP Servers

> MCP 数量 ≤5，避免 Bun Windows child_process bug。纯 API 包装型已迁移到 CLI。

| Server | 用途 | 保留原因 |
|--------|------|---------|
| **gbrain** | 知识图谱 / wiki brain | 复杂多工具，关键业务逻辑 |
| **sequential-thinking** | 结构化多步推理 | 有状态推理链 |
| **mem-lite** | 持久记忆 + 跨会话 TODO | hooks 深度集成，Node.js 启动可靠 |

CLI 替代：context7 → `scripts/cli/context7.mjs`，chroma-db → Python 脚本，paper-download → uvx。
其他集成：github (`gh` CLI)，exa (agent-reach)，playwright (`npx`)，latex (`pdflatex`)。

## Agent Reach — 互联网调研

所有互联网搜索 MUST 使用 agent-reach skill。搜索前 `agent-reach doctor --json` 体检。
搜索→入库 SOP 见 `docs/sop-search-ingestion.md`。核心约束：≤3 次搜索/≤3 平台，核心入库 ≤5 条。

## Memory 系统

| Tier | 实现 | 用途 |
|------|------|------|
| Session | `src/services/SessionMemory/` | 工具调用缓存、上下文压缩 |
| Auto | `~/.claude/projects/.../memory/` | 跨会话记忆 (user/feedback/project/reference) |
| External | GBrain + mem-lite + Context7 | 知识图谱、持久记忆、最新文档 |

写入原则：不保存可从代码/git 推导的信息，不保存 CLAUDE.md 已有的内容，保存用户画像/反馈/项目上下文/外部系统指针。

## Hooks 系统

PreToolUse: Bash → 阻止危险 git 操作；Edit|Write → 检查敏感文件/console.log/debugger/硬编码/TS `any`。
PostToolUse: Edit|Write → 质量检查；Bash → TDD 提示。
Stop: 会话摘要 + 桌面通知。

## 插件

ecc (38 agents + 156 skills)，code-review，commit-commands，feature-dev，hookify，superpowers，security-guidance，web-access。

## 文件对话系统

与 OpenClaw（WSL2）通过 `PROJECT_DISCUSSION.md` 共享讨论。`/discuss "消息"` / `/d "..."` 快捷发言。

## Quick Ref

| 文档 | 路径 |
|------|------|
| Memory | `docs/memory/01-usage-guide.md` |
| Agent | `docs/agent/01-usage-guide.md` |
| Agent Reach | `.claude/skills/agent-reach/SKILL.md` |
| 环境变量 | `.env.example` |

全局配置：`~/.claude/settings.json` / `~/.claude.json` / `~/.claude/mcp.json` / `~/.claude/hooks/` / `~/.claude/agents/` / `~/.claude/skills/` / `~/.claude/ecc/`

## claude-mem-lite — persistent memory

PreToolUse hooks already run `mem_recall` for past lessons before Read/Edit/Write. The calls worth making proactively:

| When | Call |
|------|------|
| Before Edit/Write | hook already recalled; if a `#NN` lesson was injected, cite `#NN` next time you produce user-visible text (citing = adopting the feedback; uncited lessons decay) |
| After fixing a non-trivial bug | `mem_save(type="bugfix", lesson_learned="<root cause + fix>", importance=2)` |
| After a non-obvious architecture decision | `mem_save(type="decision", lesson_learned="<constraint + tradeoff>")` |
| Deferring to a future session | `mem_defer({title, priority:1|2|3, detail})`; when fixed, add `closes_deferred=[N]` to `mem_save` |
| Looking up past work / history | `mem_search "keywords"` · `mem_recent` · `mem_timeline` |

Path cost is round-trips, not milliseconds: the PreToolUse hook above already recalls (0 calls) — prefer it. For an explicit query, if these `mem_*` tools are deferred behind ToolSearch this session, the Bash CLI is one call vs two (ToolSearch + call).

Full tool + CLI tables, citation/decay rules, and save discipline → `.claude/plugin_claude_mem_lite.md`

<!-- claude-mem-lite:begin v1 -->
## claude-mem-lite — persistent memory

PreToolUse hooks already run `mem_recall` for past lessons before Read/Edit/Write. The calls worth making proactively:

| When | Call |
|------|------|
| Before Edit/Write | hook already recalled; if a `#NN` lesson was injected, cite `#NN` next time you produce user-visible text (citing = adopting the feedback; uncited lessons decay) |
| After fixing a non-trivial bug | `mem_save(type="bugfix", lesson_learned="<root cause + fix>", importance=2)` |
| After a non-obvious architecture decision | `mem_save(type="decision", lesson_learned="<constraint + tradeoff>")` |
| Deferring to a future session | `mem_defer({title, priority:1|2|3, detail})`; when fixed, add `closes_deferred=[N]` to `mem_save` |
| Looking up past work / history | `mem_search "keywords"` · `mem_recent` · `mem_timeline` |

Path cost is round-trips, not milliseconds: the PreToolUse hook above already recalls (0 calls) — prefer it. For an explicit query, if these `mem_*` tools are deferred behind ToolSearch this session, the Bash CLI (exact path in the detail doc) is one call vs two (ToolSearch + call).

Full tool + CLI tables, citation/decay rules, and save discipline → `.claude/plugin_claude_mem_lite.md`
<!-- claude-mem-lite:end -->
