# Claude Code Haha 入门教程

## 这是什么

Claude Code Haha 是基于 Claude Code 源码的**本地可运行版本**。它有一个完整的终端交互界面（Ink TUI），支持接入任意 Anthropic 兼容 API——DeepSeek、MiniMax、OpenRouter 等。你可以把它理解为一个"开源的 Claude Code 替代品"。

和官方 Claude Code 的区别：

| 对比项 | 官方 Claude Code | Claude Code Haha |
|--------|:---:|:---:|
| 界面 | 命令行 | Ink TUI（React 终端） |
| 模型 | 仅 Anthropic 官方 | 任意 Anthropic 兼容 API |
| 扩展 | 配置层面 | 可改源码、加组件 |
| 渠道 | 无 | WeChat / QQ 邮箱 |
| 运行 | 二进制文件 | Bun + TypeScript 源码 |

---

## 安装

### 第一步：装 Bun

本项目用 Bun 做运行时。打开终端执行：

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

装完后关掉终端重开，验证：

```bash
bun --version   # 应该 ≥ 1.3
```

### 第二步：装 Git Bash (仅 Windows)

项目内部执行 Shell 命令依赖 Git Bash。去 [git-scm.com](https://git-scm.com/download/win) 下载安装。

### 第三步：克隆仓库

```bash
git clone https://github.com/oct-hash/cc-haha.git
cd cc-haha
git checkout haha-v1.3
```

### 第四步：安装依赖

```bash
bun install
```

### 第五步：配置 API

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 API 密钥。最简配置（以 DeepSeek 为例）：

```env
ANTHROPIC_AUTH_TOKEN=sk-your-api-key-here
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-pro
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

> 如果用的是 MiniMax，把 `ANTHROPIC_BASE_URL` 改成 `https://api.minimaxi.com/anthropic`，`ANTHROPIC_MODEL` 改成 `MiniMax-M2.7`。

---

## 第一次对话

### 启动

```bash
# Windows (PowerShell 或 cmd)
bun --env-file=.env ./src/entrypoints/cli.tsx

# macOS / Linux / Git Bash
./bin/claude-haha
```

你会看到一个终端交互界面。底部是输入区，上方是对话历史。

### 试试这些

```
帮我写一个 Python 的 Hello World

用 JavaScript 写一个反转字符串的函数

解释一下什么是闭包
```

### 单次问答（无交互界面）

```bash
bun --env-file=.env ./src/entrypoints/cli.tsx -p "解释一下什么是 Docker"
```

---

## 日常操作

### 切换模型

在对话中输入斜杠命令：

```
/model deepseek-v4-pro    # 切到 DeepSeek
/model pro                 # 切到 MiniMax
/model                     # 查看可用模型列表
```

### 常用斜杠命令

| 命令 | 作用 |
|------|------|
| `/help` | 查看所有可用命令 |
| `/model` | 查看/切换模型 |
| `/cost` | 查看本次会话花费 |
| `/clear` | 清空对话 |
| `/review` | 代码审查当前改动 |
| `/commit` | 提交代码 |
| `/diff` | 查看文件改动 |
| `/skills` | 查看可用技能 |
| `/mcp` | 管理 MCP 服务器 |

### 快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+O` | 展开/收起详细输出 |
| `Ctrl+C` | 中断当前操作 |
| `Ctrl+D` | 退出 |
| `↑/↓` | 浏览历史消息 |

---

## 开发相关

### 运行质量门禁

```bash
bun run quality-gate              # PR 模式（8 条检查）
bun run quality-gate:release      # 发布模式（14 条检查）
bun run quality-gate --dry-run    # 预览会跑哪些检查
```

### 运行测试

```bash
bun test                          # 跑所有测试
bun test --coverage               # 含覆盖率报告
bun run typecheck                 # TypeScript 类型检查
bun run lint                      # Biome 代码检查
```

### 降级模式

如果完整 TUI 出问题，可以用简化版：

```bash
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha
```

---

## 常见问题

### Q: 启动时报 `Cannot find package 'bundle'`

Bun 版本太旧。升级：

```bash
bun upgrade
```

### Q: `undefined is not an object (evaluating 'usage.input_tokens')`

API 端点配置不对。这个错误说明 API 返回的不是 Anthropic 协议格式。

- DeepSeek 正确写法：`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`
- MiniMax 正确写法：`ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic`
- OpenRouter 正确写法：`ANTHROPIC_BASE_URL=https://openrouter.ai/api`
- **不要**在 URL 后面加 `/v1`，SDK 会自动拼接

### Q: 想用 OpenAI / DeepSeek / Ollama 但不是 Anthropic 协议

需要用 LiteLLM 代理做协议转换。详见 [第三方模型使用指南](third-party-models.md)。

### Q: Windows 上功能不全

语音输入、Computer Use、Sandbox 隔离在 Windows 上不可用。核心 TUI 交互不受影响。

### Q: 怎么接入 WeChat？

项目有 WeChat 渠道，但需要单独的配置和扫码登录。详见 [渠道系统文档](channel-system.md)（待完善）。

---

## 下一步

- 需要查某个工具的用法？→ [工具参考](tools-reference.md)
- 想调配置？→ [配置参考](config-reference.md)
- 想用非 Anthropic 模型？→ [第三方模型使用指南](third-party-models.md)
- 想看架构？→ [架构图](00runtime.png)
