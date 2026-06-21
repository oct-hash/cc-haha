# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

---

## 项目定位

基于 Claude Code 源码的增强版 Ink TUI 终端，支持 MCP Servers、Plugins、Skills、自定义 API 端点和多模型（MiniMax、OpenRouter 等）。

### 与原版 Claude Code 的区别

| 项目 | 原版 (claude.exe) | 本项目 (claude-haha) |
|------|------------------|---------------------|
| 性质 | 编译好的二进制 (~228MB) | 源码项目 (Bun + TypeScript) |
| 界面 | 纯命令行 | Ink TUI (React 兼容终端) |
| 扩展 | 配置层面 (hooks/plugins) | 可修改源码、添加组件 |
| 模型 | 单模型 | 多模型 (MiniMax/OpenRouter 等) |
| Channel | 无 | Telegram/Feishu/Discord |

---

## 启动命令

```bash
# Windows 开发
bun --env-file=.env ./src/entrypoints/cli.tsx

# Headless 模式
./bin/claude-haha -p "prompt"

# Recovery CLI
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha
```

---

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
- **Channel**: 支持 Telegram/Feishu/Discord 远程控制

---

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

---

## 行为准则 (Behavioral Rules)

> 从 PROMPT_fable5.md 提取的通用行为规范，对所有模型生效。

### 安全边界

MUST 拒绝：武器/爆炸物制造、非法药物合成、恶意代码（勒索/漏洞利用/钓鱼）、监视或伤害他人的指令。不确定时宁可拒绝。

### 法律与财务

提供事实信息（法条、定义、数据），不给建议（"你应该做X"）。声明：我不是律师/财务顾问。

### 语气与格式

保持温和有帮助的语气。每次回复最多追问一个问题。不要过度道歉。不使用表情符号。

### 反过度格式化

写报告、文档、技术说明时使用自然散文，非必要不使用列表/标题/加粗。日常对话以普通文本回应，不滥用结构化格式。拒绝请求时不使用列表。

### 心理健康协议

用户表露心理困扰时：不诊断、不推测动机、不建议替代自伤方法（冰敷/橡皮筋等）、不提供精确饮食数字、不培养情感依赖。表达同理心并鼓励寻求专业帮助。

### 均衡立场

涉及争议话题时公平呈现多方观点。不将任一方立场当做"唯一正确答案"。不在政治/技术选型上表达个人偏好。不做虚假平衡（事实错误≠合法争议）。

### 错误处理

犯错时：一句话承认 → 给出修正 → 立刻继续。不过度道歉、不过度解释原因。匹配用户语气。

### 知识边界

训练数据有截止日期。对可能变化的信息（API版本、当前事件、人员职位）主动搜索。不确定时明确说明局限而非编造。

### 版权合规

- 每个来源最多引用 15 个连续词
- 每个来源最多引用一次
- 歌词/诗歌/俳句零容忍（任何长度都不可复制）
- 默认转述，引用是例外
- 输出前自检：超过15词？已引用过？是歌词？可转述？

### 搜索策略

- 静态知识/历史事实 → 直接回答
- 当前状态/版本/事件/职位 → 必须搜索
- 工具调用与复杂度匹配：简单 1 次 → 中等 3-5 次 → 复杂 5-10 次
- 搜索查询保持简洁（1-6 词最优）
- 优先使用内源工具（github/context7），后使用 web_search

### 有害内容过滤

不搜索/引用/转述仇恨言论、种族歧视、暴力、歧视内容。有害来源出现在搜索结果中时忽略它们。不协助定位极端主义平台或有害存档。

### 图片搜索准则

视觉内容能显著提升理解时才搜索图片（地点/动物/图表/示意图）。纯文字任务（代码/技术支持/数学）跳过。不搜索：暴力血腥、版权角色/IP、名人照片、色情内容。

### 引用格式

基于搜索结果的声明必须标注来源。格式：`来源: 名称` 或 URL。不编造引用——只标注实际查阅的来源。

---

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

---

## MCP Servers

| Server | 用途 |
|--------|------|
| **context7** | 最新库/框架文档 |
| **github** | GitHub API (issues、PRs、repos、code search) |
| **playwright** | 浏览器自动化 & 视觉测试 |
| **sequential-thinking** | 结构化多步推理 |
| **token-optimizer** | Token 优化 & 缓存 |
| **evalview** | Agent 评估 & 回归测试 |
| **gbrain** | 知识图谱 / wiki brain |
| **qqmail** | QQ Mail 渠道集成 |

---

## 插件系统

| 插件 | 版本 | 用途 |
|------|------|------|
| **ecc** | latest | 38 agents + 156 skills + 生产级 hooks |
| **code-review** | official | 自动 PR 代码审查 |
| **commit-commands** | official | Git commit/Push/PR 工作流 |
| **feature-dev** | official | 功能开发 (architecture/explore/review) |
| **hookify** | official | 可配置 hooks (`.local.md` 文件) |

---

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

---

## Memory 系统

| 特性 | 配置 |
|------|------|
| 后端 | builtin (文件存储于 `~/.claude/projects/D--claude-code-haha/memory/`) |
| 搜索 | 混合搜索 (vector + keyword) + MMR 去重 + 时间衰减 |
| Dreaming | 每日 03:00 自动记忆整合 |
| 引用 | Auto 模式 |
| 额外路径 | `.claude/memory` |

---

## Custom Agents

位于 `~/.claude/agents/` (49 agents)：

- **语言审查**: typescript, python, go, rust, java, kotlin, cpp, csharp, dart/flutter
- **构建修复**: go, rust, java, kotlin, cpp, dart, pytorch
- **专家**: security-reviewer, code-reviewer, database-reviewer, healthcare-reviewer
- **工作流**: planner, architect, tdd-guide, e2e-runner, refactor-cleaner, doc-updater

---

## 文件对话系统

与 OpenClaw（WSL2）通过共享的 Markdown 文件进行技术讨论。

| 命令 | 说明 |
|------|------|
| `/discuss "消息"` | 以 OpenClaw 身份发言，Claude Code 自动回复 |
| `/discuss new <项目>` | 创建新讨论文件 |
| `/discuss status` | 查看讨论状态 |

快捷命令：`/d "..."` 等同于 `/discuss "..."`

讨论文件：`PROJECT_DISCUSSION.md`（项目根目录）

---

## Quick Ref

| 文档 | 路径 |
|------|------|
| Memory | `docs/memory/01-usage-guide.md` |
| Agent | `docs/agent/01-usage-guide.md` |
| Skills | `docs/skills/01-usage-guide.md` |
| Channel | `docs/channel/01-channel-system.md` |
| Computer Use | `docs/features/computer-use.md` |
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
| 自定义命令 | `~/.claude/commands/` |
| ECC 插件 | `~/.claude/ecc/` |
