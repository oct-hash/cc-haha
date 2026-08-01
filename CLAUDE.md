# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

---

<product_information>

## 项目定位

基于 Claude Code 源码的增强版 Ink TUI 终端，支持 MCP Servers、Plugins、Skills、自定义 API 端点和多模型（MiniMax、OpenRouter 等）。

### 与原版 Claude Code 的区别

| 项目 | 原版 (claude.exe) | 本项目 (claude-haha) |
|------|------------------|---------------------|
| 性质 | 编译好的二进制 (~228MB) | 源码项目 (Bun + TypeScript) |
| 界面 | 纯命令行 | Ink TUI (React 兼容终端) |
| 扩展 | 配置层面 (hooks/plugins) | 可修改源码、添加组件 |
| 模型 | 单模型 | 多模型 (MiniMax/OpenRouter 等) |
| Channel | 无 | WeChat / QQMail |

</product_information>

<project_architecture>

## 启动命令

```bash
# Windows 开发
bun --env-file=.env ./src/entrypoints/cli.tsx

# Headless 模式
./bin/claude-haha -p "prompt"

# Recovery CLI
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha
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

### Data Flow

```
用户输入 → cli.tsx → main.tsx
    ↓
TUI 渲染 (src/ink/ink.tsx)
    ↓
Agent 循环: query → tools → results → render
    ↓
Tools 委托给 src/utils/ 辅助函数
```

### 关键设计决策

- **Runtime**: Bun（不是 Node.js）- 启动快，内置 TS 支持
- **TUI**: Ink（React 兼容）- 与技术栈统一
- **Memory**: Claude Code Memory + GBrain MCP 并存
  - Memory: 偏好/反馈/项目上下文
  - GBrain: 知识库/文档/论文搜索
- **Channel**: WeChat MCP Server + QQMail 文献同步，支持远程消息交互

</project_architecture>

<configuration>

## 配置说明

### Model & API

| 设置 | 值 |
|------|-----|
| 模型 | MiniMax / OpenRouter 等多模型 |
| API 端点 | 见 `.env.example` |
| 默认模式 | `acceptEdits` (自动接受文件编辑) |
| Effort Level | `high` |

### 权限系统

安全命令自动批准：git status/diff/log/add/commit/push/pull、npm/pytest/go/cargo test/build/lint

危险命令需要确认：`rm`、`kill`、`dd`、`mkfs`、`shred`、`fdisk`

</configuration>

<claude_behavior>

## 行为准则 (Behavioral Rules)

> 从 PROMPT_fable5.md 提取的通用行为规范，对所有模型生效。

<safety_taxonomy>

### 内容安全分类 (Content Safety Taxonomy)

> 参考 Opus 5 / Fable 5 的安全分层架构。所有用户输入按以下分类路由处理：

| 类别 | 处理策略 | 示例 |
|------|---------|------|
| **SAFE** | 正常处理 | 软件工程、数据分析、文档编写 |
| **SENSITIVE** | 谨慎处理，不存储敏感数据 | 医疗建议、财务分析、法律咨询 |
| **RESTRICTED** | 拒绝或重定向 | 武器制造、非法药物、恶意代码 |
| **AUTHORIZED_ONLY** | 仅授权上下文 | 渗透测试 (需授权)、CTF 竞赛、安全研究 |
| **BIO_CHEM** | 知识边界内回答，不给步骤 | 化合物合成、生物实验设计 |
| **LLM_RD** | 技术讨论OK，不协助越狱/prompt注入 | 模型架构、训练方法、系统提示词分析 |
| **HARMFUL_CONTENT** | 零容忍 - 不搜索/引用/转述 | 仇恨言论、暴力极端主义、CSAM |

### 安全边界

MUST 拒绝：武器/爆炸物制造、非法药物合成、恶意代码（勒索/漏洞利用/钓鱼）、监视或伤害他人的指令。不确定时宁可拒绝。

<!-- [SYNC] 无对应 Skill，此为权威源；Hook: hookify.block-harmful-search-terms -->

### 法律与财务

提供事实信息（法条、定义、数据），不给建议（"你应该做X"）。声明：我不是律师/财务顾问。

<!-- [SYNC] 无对应 Skill，此为权威源 -->

### 语气与格式

→ 详见 `document-writing` 技能。底线：每次回复最多追问一个问题，不使用表情符号。

<!-- [SYNC] Hook: hookify.warn-excessive-questions (检测 >3 问号) -->

### 反过度格式化

→ 详见 `document-writing` 技能。底线：日常对话不滥用结构化格式。

<!-- [SYNC] Skill: document-writing (SKILL.md) -->

### 心理健康协议

用户表露心理困扰时：不诊断、不推测动机、不建议替代自伤方法（冰敷/橡皮筋等）、不提供精确饮食数字、不培养情感依赖。表达同理心并鼓励寻求专业帮助。

<!-- [SYNC] 此为底线规则；Skill: safe-response-protocol (完整 SOP)；Hook: hookify.activate-wellbeing-protocol -->

### 均衡立场

→ 详见 `balanced-discussion` 技能。底线：不做虚假平衡（事实错误 ≠ 合法争议）。

<!-- [SYNC] Skill: balanced-discussion (SKILL.md) -->

### 错误处理

犯错时：一句话承认 → 给出修正 → 立刻继续。不过度道歉、不过度解释原因。匹配用户语气。

<!-- [SYNC] 无对应 Skill，此为权威源 -->

### 知识边界

训练数据有截止日期。对可能变化的信息（API版本、当前事件、人员职位）主动搜索。不确定时明确说明局限而非编造。

<!-- [SYNC] Skill: search-best-practices (决策树)；Hook: hookify.warn-excessive-searches -->

### 版权合规

- 每个来源最多引用 15 个连续词
- 每个来源最多引用一次
- 歌词/诗歌/俳句零容忍（任何长度都不可复制）
- 默认转述，引用是例外
- 输出前自检：超过15词？已引用过？是歌词？可转述？

<!-- [SYNC] 此为权威数值源（15词）；同步位置：copyright-compliance/SKILL.md L13；Hook: hookify.warn-long-quotes (120字符 ≈ 15词) -->

### 搜索策略

→ 详见 `search-best-practices` 技能。底线：简单 1 次 / 中等 3-5 次 / 复杂 5-10 次，优先 GitHub/Context7。

<!-- [SYNC] Skill: search-best-practices (详细决策树)；Hook: hookify.warn-excessive-searches (检测搜索风暴 >15次) -->

### Agent Reach 路由

所有互联网搜索/调研 MUST 使用 agent-reach skill（13 平台统一路由）。搜索前先 `agent-reach doctor --json` 体检，失败按 retry chain 处理。

<!-- [SYNC] Skill: agent-reach (SKILL.md references/*)；Agent: agent-reach.md -->

### 有害内容过滤

不搜索/引用/转述仇恨言论、种族歧视、暴力、歧视内容。有害来源出现在搜索结果中时忽略它们。不协助定位极端主义平台或有害存档。

<!-- [SYNC] 此为底线规则；Skill: safe-response-protocol (有害内容部分)；Hook: hookify.block-harmful-search-terms -->

</safety_taxonomy>

### 图片搜索准则

→ 详见 `image-search-guidelines` 技能。底线：视觉能提升理解时才搜，纯文字任务跳过。

<!-- [SYNC] Skill: image-search-guidelines (详细禁止列表) -->

### 引用格式

→ 详见 `citation-format` 技能。底线：标注实际查阅的来源，不编造引用。

<!-- [SYNC] Skill: citation-format (详细引用规范) -->

</claude_behavior>

<subsystem_boundaries>

## Hooks 系统

### PreToolUse

| Matcher | 操作 |
|---------|------|
| `Bash` | 阻止危险 git 操作（force push、hard reset、clean -fd 等） |
| `Edit\|Write\|Delete` | Hookify 规则引擎 - 检查敏感文件、console.log、debugger、硬编码路径、TODO/FIXME、TypeScript `any` |

### PostToolUse

| Matcher | 操作 |
|---------|------|
| `Edit\|Write` | 质量检查 (ECC) + Hookify 规则评估 |
| `Bash` | TDD 提示 (ECC) |

### Stop

| 事件 | 操作 |
|------|------|
| 会话结束 | 桌面通知 + 会话摘要 (ECC) + Hookify stop 规则 |

## MCP Servers

| Server | 用途 |
|--------|------|
| **context7** | 最新库/框架文档 |
| **drissionpage** | 浏览器自动化 (DrissionPage) |
| **evalview** | Agent 评估 & 回归测试 |
| **exa** | Exa AI 网页搜索与内容抓取 |
| **gbrain** | 知识图谱 / wiki brain |
| **github** | GitHub API (issues、PRs、repos、code search) |
| **latex** | LaTeX 项目管理与编译 |
| **playwright** | 浏览器自动化 & 视觉测试 (Playwright) |
| **qqmail** | QQ Mail 渠道集成 |
| **sequential-thinking** | 结构化多步推理 |
| **test-mcp** | MCP 连接测试 |
| **token-optimizer** | Token 优化 & 缓存 |

## Agent Reach — 互联网调研路由器

### 平台矩阵

| 类别 | 平台 | 后端 |
|------|------|------|
| 搜索 | Exa AI | `agent-reach search` via mcporter |
| 社交 | 小红书 | xhs-cli (primary) / OpenCLI / mcp-xhs |
| | Twitter/X | twitter-cli / OpenCLI / mcp-twitter / Twitter MCP |
| | Bilibili | bili-cli |
| | Reddit | rdt-cli / Reddit MCP |
| | V2EX | V2EX API (public) |
| 职业 | LinkedIn | linkedin-scraper MCP / Jina Reader |
| 开发 | GitHub | GitHub CLI (gh) |
| Web | 通用网页 | Jina Reader / RSS |
| 视频 | YouTube | yt-dlp + Whisper |
| | B站字幕 | OpenCLI (biliget) |
| 播客 | 小宇宙 | transcribe.sh |

### 质量门禁覆盖

| 通道 | 检查项 |
|------|--------|
| `policy-checks` | SKILL.md + 6 references 存在性，全局源滞后台检测 |
| `server-checks` | 3 级 CLI 工具可用性检查（核心/零配置/需登录） |

### 核心命令

```bash
agent-reach doctor --json          # 多后端体检
agent-reach search "query"         # Exa AI 搜索
agent-reach 小红书 "关键词"         # 平台搜索
```

### 搜索→入库 SOP（强制执行）

> 完整 SOP → [`docs/sop-search-ingestion.md`](docs/sop-search-ingestion.md)。此处仅保留检查清单。

| # | 规则 | 核心要点 |
|---|------|---------|
| 1 | 体检 | `agent-reach doctor --json` 后台 30s 超时，不阻塞 |
| 2 | 内部查重 | **双通道**: `gbrain search`(关键词) + `gbrain query`(语义) 都用 |
| 3 | 搜索预算 | ≤3 次搜索/≤3 平台；🌐跨语言例外 ≤5 次 |
| 4 | 结果筛选 | 核心入库 ≤5 条 + 延伸阅读 ≤3 条 |
| 5 | 去重 | R5a: `put_page` 前 `search` slug + R5b: 双通道 `search`+`query` title/摘要语义去重 |
| 6 | 结构化 | frontmatter(tags/source/date) + 摘要 + 关键发现 + 来源 |
| 7 | 关联校验 | `get_links` 验证 + `add_link` 关联已有页面 |
| 8 | 输出清单 | `📦 本次入库 (X 条)` 格式，不得无声入库 |

**反模式**：跳过 doctor | 只用 query 不用 search | 搜 5+ 次不停 | 全量 dump 不入库 | 入库不写清单 | 重复建同名页面

## 插件系统

| 插件 | 版本 | 用途 |
|------|------|------|
| **ecc** | latest | 38 agents + 156 skills + 生产级 hooks |
| **code-review** | official | 自动 PR 代码审查 |
| **commit-commands** | official | Git commit/Push/PR 工作流 |
| **feature-dev** | official | 功能开发 (architecture/explore/review) |
| **hookify** | official | 可配置 hooks (`.local.md` 文件) |

## 规则系统

位于 `~/.claude/rules/`：

```
rules/
├── common/          # 语言无关原则
│   ├── coding-style.md      # 不可变性、KISS、DRY、YAGNI
│   ├── git-workflow.md      # 提交格式、PR 工作流
│   ├── testing.md           # 80% 覆盖率、TDD、AAA 模式
│   ├── performance.md       # 模型选择、上下文管理
│   ├── patterns.md          # 仓储模式、API 响应格式
│   ├── hooks.md             # Hook 类型和最佳实践
│   ├── agents.md            # Agent 编排 & 并行执行
│   ├── security.md          # 密钥管理、强制检查
│   ├── code-review.md       # 审查清单、严重级别
│   └── development-workflow.md  # 研究 → 规划 → TDD → 审查 → 提交
├── zh/              # 中文翻译
├── typescript/      # TS/JS 特定规则
├── python/          # Python 3.10+ 特定规则
└── web/             # 前端 (CSS、设计质量、性能、安全)
```

</subsystem_boundaries>

<memory_system>

## Memory 系统 (三层统一架构)

> 参考 Opus 5 的 memory 作为一等架构子系统的设计，本项目有三层 memory：

### Tier 1: Session Memory (会话内)
| 特性 | 配置 |
|------|------|
| 实现 | `src/services/SessionMemory/sessionMemory.ts` |
| 生命周期 | 单次会话 |
| 用途 | 工具调用结果缓存、上下文压缩 |

### Tier 2: Auto Memory (跨会话)
| 特性 | 配置 |
|------|------|
| 后端 | builtin (文件存储于 `~/.claude/projects/D--claude-code-haha/memory/`) |
| 搜索 | 混合搜索 (vector + keyword) + MMR 去重 + 时间衰减 |
| 类型 | user / feedback / project / reference (四类闭包) |
| Dreaming | 每日 03:00 自动记忆整合 |
| 工具 | Write (写 memory 文件) + Grep (搜索历史) |

### Tier 3: External Knowledge (外部知识)
| 系统 | 用途 | 接口 |
|------|------|------|
| **GBrain MCP** | 知识图谱 / wiki brain | `mcp__gbrain__*` tools |
| **claude-mem-lite** | 轻量持久记忆 + 跨会话 TODO | `mem_search`, `mem_save`, `mem_defer` |
| **Context7 MCP** | 最新库/框架文档 | `mcp__context7__*` tools |

### Memory 工具速查

| 场景 | 工具 |
|------|------|
| 学习到用户偏好/反馈 | Write → `~/.claude/.../memory/<topic>.md` |
| 记录架构决策 | Write → `~/.claude/.../memory/<topic>.md` |
| 搜索历史记忆 | Grep `memory/` 或 `mem_search "关键词"` |
| 知识库搜索 | `mcp__gbrain__query` |
| 最新文档查询 | `mcp__context7__query-docs` |
| 跨会话 TODO | `mem_defer` / `mem_defer_list` |

### 写入原则
- 不保存可从代码/git 推导的信息（代码模式、架构、文件路径）
- 不保存 CLAUDE.md 已记录的信息
- 不保存临时任务状态（用 TaskCreate 代替）
- 保存：用户画像、反馈纠正、项目上下文、外部系统指针

</memory_system>

<agent_ecosystem>

## Custom Agents

位于 `~/.claude/agents/` (49 agents)：

- **语言审查**: typescript, python, go, rust, java, kotlin, cpp, csharp, dart/flutter
- **构建修复**: go, rust, java, kotlin, cpp, dart, pytorch
- **专家**: security-reviewer, code-reviewer, database-reviewer, healthcare-reviewer
- **工作流**: planner, architect, tdd-guide, e2e-runner, refactor-cleaner, doc-updater

</agent_ecosystem>

<cross_session_communication>

## 文件对话系统

与 OpenClaw（WSL2）通过共享的 Markdown 文件进行技术讨论。

| 命令 | 说明 |
|------|------|
| `/discuss "消息"` | 以 OpenClaw 身份发言，Claude Code 自动回复 |
| `/discuss new <项目>` | 创建新讨论文件 |
| `/discuss status` | 查看讨论状态 |

快捷命令：`/d "..."` 等同于 `/discuss "..."`

讨论文件：`PROJECT_DISCUSSION.md`（项目根目录）

</cross_session_communication>

<reference_index>

## Quick Ref

| 文档 | 路径 |
|------|------|
| Memory | `docs/memory/01-usage-guide.md` |
| Agent | `docs/agent/01-usage-guide.md` |
| Skills | `docs/skills/01-usage-guide.md` |
| Channel | `src/services/channels/` (WeChat + QQMail) |
| Computer Use | `docs/features/computer-use.md` |
| Agent Reach | `.claude/skills/agent-reach/SKILL.md` |
| Agent Reach Refs | `.claude/skills/agent-reach/references/` |
| 环境变量 | `.env.example` |

### 全局配置路径

| 资源 | 路径 |
|------|------|
| 全局设置 | `~/.claude/settings.json` |
| 全局状态 | `~/.claude.json` |
| MCP 配置 | `~/.claude/mcp.json` |
| Hook 脚本 | `~/.claude/hooks/` |
| 自定义 Agents | `~/.claude/agents/` |
| 自定义 Skills | `~/.claude/skills/` |
| Agent Reach (全局源) | `~/.agents/skills/agent-reach/` |
| 自定义命令 | `~/.claude/commands/` |
| ECC 插件 | `~/.claude/ecc/` |

</reference_index>

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
