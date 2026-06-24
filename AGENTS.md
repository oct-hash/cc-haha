# 多 Agent 架构

OpenClaw 支持单 agent 和多 agent 模式。多 agent 下，每个 agent 是完全隔离的"大脑"，拥有独立人格。

## 核心概念

| 概念 | 说明 |
|-----|------|
| `agentId` | Agent 唯一标识，决定人格、记忆、认证 |
| `workspace` | Agent 工作目录，含 AGENTS.md / SOUL.md |
| `agentDir` | 认证 profiles、模型注册、表级配置 |
| `sessions` | 会话历史存储 |

## 单 Agent 模式（默认）

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace-main",
      "model": { "primary": "anthropic/claude-sonnet-4-6" }
    }
  }
}
```

## 多 Agent 模式

```json
{
  "agents": {
    "list": [
      { "id": "main", "workspace": "~/.openclaw/workspace-main" },
      { "id": "coding", "workspace": "~/.openclaw/workspace-coding" },
      { "id": "research", "workspace": "~/.openclaw/workspace-research" }
    ]
  },
  "bindings": [
    { "agentId": "main", "match": { "channel": "discord", "accountId": "main-bot" } },
    { "agentId": "coding", "match": { "channel": "discord", "accountId": "coding-bot" } },
    { "agentId": "research", "match": { "keywords": ["research", "paper"] } }
  ]
}
```

## 路由优先级（bindings）

1. `peer` — 精确 DM/group/channel ID
2. `parentPeer` — 线程继承
3. `guildId + roles` — Discord 角色路由
4. `guildId` — Discord 服务器级
5. `teamId` — Slack workspace 级

同层匹配按配置顺序优先。

## 跨 Agent 协作

默认隔离。可通过配置开启跨查：

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/workspaces/main",
      "memorySearch": {
        "qmd": { "allowExternalAgents": ["coding", "research"] }
      }
    }
  }
}
```

## Per-Agent Skill Override

```json
{
  "agents": {
    "list": [
      {
        "id": "coding",
        "workspace": "~/.openclaw/workspace-coding",
        "skills": {
          "allowed": ["code-review", "terminal-ops"],
          "denied": ["email-ops"]
        }
      }
    ]
  }
}
```

## 关键约束

1. **隔离原则**：不同 agent 的 sessions 不交叉，除非显式配置
2. **人格载体**：每个 agent 的 SOUL.md / AGENTS.md 定义其行为模式
3. **Channel 绑定**：WhatsApp 多账号通过 `accountId` 绑定不同 agent
4. **Skill 白名单**：per-agent skill allowlist 限制可用技能范围
