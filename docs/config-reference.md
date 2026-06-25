# 配置参考

所有配置方式，按优先级从高到低：**环境变量 > `.env` 文件 > `~/.claude/settings.json`**。

---

## 一、环境变量

全部定义在 `.env.example` 中，复制为 `.env` 后修改。

### API 认证

| 变量 | 必填 | 说明 |
|------|:---:|------|
| `ANTHROPIC_AUTH_TOKEN` | 二选一 | Bearer Token，通过 `Authorization` 头发送 |
| `ANTHROPIC_API_KEY` | 二选一 | API Key，通过 `x-api-key` 头发送 |
| `ANTHROPIC_BASE_URL` | 否 | 自定义 API 端点，默认 Anthropic 官方 |

### 模型映射

Claude Code 内部用 Sonnet/Haiku/Opus 三个"角色"来选择模型。通过下面变量映射到实际模型 ID：

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_MODEL` | 默认模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet 角色映射 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku 角色映射 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus 角色映射 |

### 提供商配置示例

**DeepSeek**（直连 Anthropic 兼容接口）：
```env
ANTHROPIC_AUTH_TOKEN=sk-your-deepseek-key
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro
```

**MiniMax**：
```env
ANTHROPIC_AUTH_TOKEN=sk-your-minimax-key
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
ANTHROPIC_MODEL=MiniMax-M2.7
```

**OpenRouter**：
```env
ANTHROPIC_AUTH_TOKEN=sk-or-v1-xxx
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_MODEL=anthropic/claude-sonnet-4-20250514
```

**LiteLLM 代理**（用于 OpenAI/DeepSeek/Ollama 等非 Anthropic 协议模型）：
```env
ANTHROPIC_AUTH_TOKEN=sk-anything
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_MODEL=gpt-4o
```
需要先启动 LiteLLM：`litellm --config litellm_config.yaml --port 4000`

### 运行行为

| 变量 | 说明 |
|------|------|
| `API_TIMEOUT_MS` | API 请求超时毫秒（默认 600000 = 10min）|
| `DISABLE_TELEMETRY` | 设为 `1` 禁用遥测上报 |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | 设为 `1` 禁用非必要网络请求 |
| `CLAUDE_CODE_FORCE_RECOVERY_CLI` | 设为 `1` 启动降级 Recovery CLI |

### MCP Server 模式

项目可以作为 MCP Server 启动，供 OpenClaw 等外部工具调用：

| 变量 | 说明 |
|------|------|
| `MCP_SERVER_TOKEN` | MCP Server 认证 Token |
| `MCP_SERVER_PORT` | 监听端口（如 `3100`）|
| `MCP_SERVER_PATH` | 路径（如 `/mcp`）|
| `MCP_SERVER_TOOLS` | 暴露的工具（如 `Read,Write,Edit,Bash`）|
| `MCP_SERVER_CWD` | 工作目录 |

### 提供商特定变量

| 变量 | 说明 |
|------|------|
| `MINIMAX_API_KEY` | MiniMax API Key（备用）|
| `MINIMAX_BASE_URL` | MiniMax API 端点 |
| `MINIMAX_MODEL` | MiniMax 模型 ID |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（备用）|
| `DEEPSEEK_BASE_URL` | DeepSeek API 端点 |
| `DEEPSEEK_MODEL` | DeepSeek 模型 ID |

### QQ 邮箱

| 变量 | 说明 |
|------|------|
| `QQ_USER` | QQ 邮箱地址 |
| `QQ_AUTH_CODE` | QQ 邮箱授权码（非登录密码）|
| `PAPERS_PDF_DIR` | 下载的论文 PDF 存放目录 |
| `KB_INDEX_PATH` | 知识库索引文件路径 |
| `KB_GRAPH_PATH` | 知识库图谱文件路径 |

### 其他服务

| 变量 | 说明 |
|------|------|
| `EXA_API_KEY` | Exa AI 网页搜索 |
| `OLLAMA_API_KEY` | Ollama API Key（本地嵌入）|
| `OLLAMA_BASE_URL` | Ollama 端点 |
| `FAL_AI_API_KEY` | FAL AI 图像生成 |
| `SILICONFLOW_API_KEY` | SiliconFlow API（ChromaDB 嵌入）|
| `CLAUDE_CODE_GIT_BASH_PATH` | Git Bash 路径（Windows 必需）|

---

## 二、settings.json

位置：`~/.claude/settings.json` 或项目下 `.claude/settings.json`。

### 权限系统

```json
{
  "permissions": {
    "allow": [
      "Edit(*)",
      "Write(*)",
      "Bash(git *)",
      "Bash(bun *)",
      "WebSearch",
      "mcp__*"
    ],
    "ask": [
      "Bash(rm *)",
      "Bash(kill *)"
    ],
    "deny": []
  }
}
```

- `allow`：自动批准，不询问用户
- `ask`：每次询问用户确认
- `deny`：直接拒绝
- 支持通配符 `*`

### Hooks 系统

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Delete",
        "hooks": [
          {
            "type": "command",
            "command": "grep -iE '\.env|token|secret' \"$FILE_PATH\" && echo '⚠ 敏感文件' || true"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "grep -n 'console\\.log' \"$FILE_PATH\" && echo '⚠ console.log' || true"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '会话结束'"
          }
        ]
      }
    ]
  }
}
```

三种 Hook 类型：
- **PreToolUse**：工具执行前（可拦截）
- **PostToolUse**：工具执行后（检查/格式化）
- **Stop**：会话结束时

### 其他设置

```json
{
  "model": "deepseek-v4-pro",
  "theme": "dark",
  "effort": "high",
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_MODEL": "deepseek-v4-pro"
  }
}
```

---

## 三、MCP 服务器配置

位置：项目根目录 `.mcp.json` 和 `.claude/mcp.json`。

### 服务器定义

```json
{
  "mcpServers": {
    "server-name": {
      "command": "bun",
      "args": ["--env-file=.env", "run", "./src/services/xxx/index.ts"],
      "env": {
        "EXTRA_VAR": "value"
      }
    }
  }
}
```

`command` + `args` 是 stdio 传输方式。也可以用 `url` 字段指定 HTTP 端点。

### 内置 MCP 服务器列表

| 服务器 | 命令 | 用途 |
|--------|------|------|
| gbrain | bun | 知识图谱搜索 |
| qqmail | bun | QQ 邮箱文献同步 |
| github | npx | GitHub API |
| playwright | npx | 浏览器自动化 |
| context7 | npx | 库/框架文档查询 |
| sequential-thinking | npx | 结构化推理 |
| token-optimizer | npx | Token 优化缓存 |
| exa | npx | Exa AI 网页搜索 |
| windows-mcp | uvx | Windows 系统控制 |
| evalview | python | Agent 评估回归测试 |
| latex | python | LaTeX 项目管理 |

---

## 四、插件与市场

位置：`~/.claude/settings.json` 中的 `plugins` 字段，以及项目 `.claude/marketplace.json`。

### 启用插件

```json
{
  "plugins": [
    { "name": "code-review", "version": "official" },
    { "name": "commit-commands", "version": "official" },
    { "name": "hookify", "version": "official" },
    { "name": "ecc", "version": "latest" }
  ]
}
```

### 市场配置

`marketplace.json` 定义了可用插件的来源。支持三种来源：
- **local**：项目本地 `./plugins/` 目录
- **external**：`./external_plugins/` 目录
- **remote**：Git 仓库 URL

---

## 五、TypeScript 配置

位置：项目根目录 `tsconfig.json`。

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "scripts/**/*", "stubs/**/*"],
  "exclude": ["node_modules", "packages"]
}
```

---

## 六、Biome 配置

位置：项目根目录 `biome.json`。用于代码 Lint 和格式化。

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsoleLog": "warn",
        "noDebugger": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "files": {
    "include": ["src/**/*", "scripts/**/*"],
    "ignore": ["node_modules", "packages"]
  }
}
```

---

## 七、质量门禁

位置：`scripts/quality-gate/`。

### 三种模式

| 模式 | 触发时机 | Lanes |
|------|---------|-------|
| `pr` | 开发中 / PR | impact-report → policy-checks → typecheck → lint-check → test-results → file-hygiene → coverage → quarantine |
| `baseline` | 手动更新基线 | 同上，自动更新 coverage/typecheck/lint/hygiene 基线 |
| `release` | 发布前 | 全部 14 lanes + live API 冒烟 |

### 基线与棘轮

三个棘轮基线文件：

| 文件 | 锁定内容 | 粒度 |
|------|---------|------|
| `data/typecheck-baseline.json` | TypeScript 错误数 | per-file |
| `data/lint-baseline.json` | Biome lint 问题数 | per-file |
| `data/hygiene-baseline.json` | 大文件/console.log/路径 | per-metric |
| `data/coverage-baseline.json` | 测试覆盖率 % | per-metric |

棘轮规则：每个文件的错误数只能降不能升。老问题放过，新问题拦截。

### 常用命令

```bash
bun run quality-gate                     # PR 模式
bun run quality-gate:baseline            # 更新基线
bun run quality-gate:release             # 发布模式
bun run quality-gate --dry-run           # 预览
bun run quality-gate --only typecheck    # 仅跑类型检查
bun run quality-gate --only file-hygiene # 仅跑文件卫生
```
