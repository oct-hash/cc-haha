# 工具参考

Claude Code Haha 有 45 个内置工具。本文档列出主要工具的用途和参数。

---

## 文件操作

### Read — 读取文件

读取本地文件。支持文本文件、图片(PNG/JPG)、PDF、Jupyter Notebook。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_path` | string | 文件绝对路径 |
| `offset` | number | 从第几行开始读 |
| `limit` | number | 最多读多少行 |
| `pages` | string | PDF 页码范围（如 "1-5"）|

### Write — 写入文件

创建新文件或完全覆盖已有文件。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_path` | string | 文件绝对路径 |
| `content` | string | 文件内容 |

### Edit — 精确编辑

在文件中做精确的字符串替换。不会改到其他部分。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_path` | string | 文件绝对路径 |
| `old_string` | string | 要被替换的文本（必须精确匹配）|
| `new_string` | string | 替换后的文本 |
| `replace_all` | boolean | 是否替换所有出现（默认只替换第一个）|

### NotebookEdit — 编辑 Notebook

编辑 Jupyter Notebook (.ipynb) 中的单个单元格。

| 参数 | 类型 | 说明 |
|------|------|------|
| `notebook_path` | string | notebook 文件路径 |
| `cell_id` | string | 单元格 ID |
| `new_source` | string | 新的单元格源代码 |
| `edit_mode` | string | replace / insert / delete |

---

## 搜索

### Glob — 文件模式匹配

用 glob 模式查找文件。支持 `**/*.ts`、`src/**/*.tsx` 等。

| 参数 | 类型 | 说明 |
|------|------|------|
| `pattern` | string | glob 模式 |
| `path` | string | 搜索目录（默认当前目录）|

### Grep — 内容搜索

基于 ripgrep 的内容搜索，支持完整正则。

| 参数 | 类型 | 说明 |
|------|------|------|
| `pattern` | string | 正则表达式 |
| `path` | string | 搜索路径 |
| `glob` | string | 文件过滤（如 `"*.ts"`）|
| `output_mode` | string | content / files_with_matches / count |
| `-i` | boolean | 忽略大小写 |
| `multiline` | boolean | 多行模式 |

### WebSearch — 网页搜索

搜索互联网内容。

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词 |
| `allowed_domains` | string[] | 限定域名 |
| `blocked_domains` | string[] | 排除域名 |

### WebFetch — 抓取网页

抓取 URL 内容并转换为 Markdown。

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string | 网页 URL |
| `prompt` | string | 对抓取内容执行的分析 prompt |

---

## 命令执行

### Bash — 执行 Shell 命令

在 bash 中执行命令。

| 参数 | 类型 | 说明 |
|------|------|------|
| `command` | string | 要执行的命令 |
| `description` | string | 命令用途描述（显示给用户）|
| `timeout` | number | 超时毫秒（默认 120000）|
| `run_in_background` | boolean | 后台运行 |
| `dangerouslyDisableSandbox` | boolean | 禁用沙箱（危险）|

### PowerShell — 执行 PowerShell 命令

在 PowerShell 中执行命令（Windows）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `command` | string | PowerShell 命令 |
| `description` | string | 命令用途描述 |
| `timeout` | number | 超时毫秒 |

---

## Agent 系统

### Agent — 启动子 Agent

启动一个专门的子 Agent 执行复杂任务。每个 Agent 类型有不同的能力和工具集。

**可用 Agent 类型**：

| Agent | 用途 |
|-------|------|
| `architect` | 系统架构设计 |
| `build-error-resolver` | 修复构建/类型错误 |
| `code-reviewer` | 代码审查 |
| `code-explorer` | 深入分析代码库 |
| `explore` | 只读搜索（快速扫代码）|
| `general-purpose` | 通用任务 |
| `plan` | 设计实施方案 |
| `security-reviewer` | 安全漏洞分析 |
| `tdd-guide` | 测试驱动开发 |
| `typescript-reviewer` | TypeScript 专项审查 |
| `python-reviewer` | Python 专项审查 |
| `go-reviewer` | Go 专项审查 |
| `rust-reviewer` | Rust 专项审查 |
| 等 30+ 种 | |

| 参数 | 类型 | 说明 |
|------|------|------|
| `description` | string | 任务简述（3-5 词）|
| `prompt` | string | 详细任务描述 |
| `subagent_type` | string | Agent 类型 |
| `run_in_background` | boolean | 后台异步运行 |

### Task — 任务管理

创建和跟踪结构化任务列表。

| 工具 | 作用 |
|------|------|
| TaskCreate | 创建任务（含 subject/description/activeForm）|
| TaskGet | 查看任务详情 |
| TaskList | 列出所有任务 |
| TaskUpdate | 更新任务状态（pending → in_progress → completed）|
| TaskOutput | 获取后台任务输出 |
| TaskStop | 停止后台任务 |

### Skill — 调用技能

调用一个已安装的技能（Skill）。技能提供专业领域知识和操作流程。

---

## 终端交互

### AskUserQuestion — 询问用户

在终端中向用户提问，获取选择。

| 参数 | 类型 | 说明 |
|------|------|------|
| `questions` | array | 问题列表（1-4 个）|
| `questions[].question` | string | 问题文本 |
| `questions[].header` | string | 简短标签（≤12 字符）|
| `questions[].options` | array | 选项列表（2-4 个）|

### EnterPlanMode / ExitPlanMode

进入/退出计划模式。计划模式下先设计方案再写代码。

---

## MCP（模型上下文协议）

### MCP Tool — 调用 MCP 工具

调用已连接的 MCP 服务器提供的工具。

### ListMcpResourcesTool — 列出 MCP 资源

列出 MCP 服务器提供的资源（文件、数据等）。

### ReadMcpResourceTool — 读取 MCP 资源

读取指定的 MCP 资源内容。

---

## 版本控制

### EnterWorktree / ExitWorktree

创建/退出 Git worktree 隔离工作环境。

---

## 通知与定时

### CronCreate — 定时任务

创建定时提醒或重复任务。

| 参数 | 类型 | 说明 |
|------|------|------|
| `cron` | string | 5 字段 cron 表达式 |
| `prompt` | string | 触发时执行的 prompt |
| `recurring` | boolean | 是否重复（默认 true）|

### PushNotification

发送桌面通知。支持远程控制时推送到手机。

---

## 其他工具

| 工具 | 作用 |
|------|------|
| ConfigTool | 查看和修改 Claude Code 配置 |
| LSPTool | 语言服务器协议集成（诊断/格式化/符号跳转）|
| TodoWriteTool | 写入待办列表 |
| BriefTool | 上传文件到 Brief 分享 |
| BrowserTool | 通过 Puppeteer 控制浏览器 |
| WebFetchTool | 抓取网页内容 |
| ScheduleCronTool | Cron 任务管理（创建/删除/列出）|
| SendMessageTool | 向已存在的 Agent 发送消息 |
| ToolSearchTool | 搜索可用工具 |
| NotebookEditTool | 编辑 Jupyter Notebook |

---

## 内部工具（通常不直接调用）

| 工具 | 作用 |
|------|------|
| SyntheticOutputTool | 生成合成输出（非交互模式）|
| RemoteTriggerTool | 远程触发操作 |
| REPLTool | 基础 REPL 原语 |
| WorkflowTool | 多 Agent 工作流编排（**当前为 stub，勿用**）|
| SleepTool | 延迟执行 |
| TungstenTool | 实时监控 UI |
| McpAuthTool | MCP OAuth 认证 |
| TeamCreateTool / TeamDeleteTool | 团队管理 |
