# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

You are my super versatile assistant. This repository provides a complete Ink-based terminal TUI with support for MCP servers, tools, skills, and custom API endpoints. Based on Claude Code leaked source code with fixes and enhancements.

**Key Features:**
- Complete Ink TUI interaction interface
- `--print` headless mode for scripts/CI
- MCP Servers, Plugins, Skills support
- Custom API endpoints and model support (MiniMax, OpenRouter, etc.)
- **Memory System** (cross-session persistent memory)
- **Multi-Agent System** (parallel tasks, Teams collaboration)
- **Skills System** (extensible capability plugins)
- **Channel System** (remote control via Telegram/Feishu/Discord)
- **Computer Use** (desktop control)
- **Desktop Client** (Tauri 2 + React)
- Recovery CLI fallback mode

## Commands

```bash
# Full TUI mode (macOS/Linux)
./bin/claude-haha

# Headless mode (single prompt)
./bin/claude-haha -p "your prompt here"

# Pipe input mode
echo "explain this code" | ./bin/claude-haha -p

# Recovery CLI mode (simple readline, no TUI)
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha

# Windows - direct Bun execution (PowerShell/cmd)
bun --env-file=.env ./src/entrypoints/cli.tsx
bun --env-file=.env ./src/localRecoveryCli.ts
```

## Architecture

### Entry Points
- `bin/claude-haha` - Shell wrapper that routes to either full TUI or recovery CLI
- `src/entrypoints/cli.tsx` - Full CLI with Ink TUI (main entry)
- `src/localRecoveryCli.ts` - Fallback readline-based REPL
- `preload.ts` - Sets MACRO global variables (version, package info)

### Core Systems
- **TUI Engine**: `src/ink/` - Custom Ink renderer for terminal output
- **Main Screen**: `src/screens/REPL.tsx` - Interactive terminal interface
- **Tools**: `src/tools/` - Agent tools (BashTool, FileEditTool, GrepTool, WebSearchTool, etc.)
- **Services**: `src/services/` - API, MCP, OAuth, analytics, voice services
- **Query Engine**: `src/query.ts` - Handles LLM query orchestration
- **Memory**: `~/.claude/projects/{hash}/memory/` - Cross-session persistent memory
- **Agents**: `src/buddy/` - Multi-agent orchestration system
- **Skills**: Extensible plugin system in `.claude/skills/`

### Data Flow
1. User input → `cli.tsx` → `main.tsx` (TUI)
2. TUI renders via Ink (`src/ink/ink.tsx`)
3. Agent loop: query engine → tools → results → render
4. Tools in `src/tools/` delegate to `src/utils/` helpers

### Key Utilities
- `src/utils/Cursor.ts` - Cursor position tracking
- `src/utils/Shell.ts` - Shell command execution
- `src/utils/api.ts` - Anthropic API client
- `src/utils/attachments.ts` - File attachment handling

## Configuration

Environment variables (see `.env.example`):
- `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` - API authentication
- `ANTHROPIC_BASE_URL` - Custom endpoint (default: Anthropic official)
- `ANTHROPIC_MODEL` - Default model
- `DISABLE_TELEMETRY=1` - Disable telemetry
- `CLAUDE_CODE_FORCE_RECOVERY_CLI=1` - Force fallback CLI mode

### Third-party API Support

Supports OpenAI, DeepSeek, Ollama and other OpenAI-compatible providers:
- Set `OPENAI_API_KEY` and `OPENAI_BASE_URL` for external providers
- Set `OLLAMA_EMBED_MODEL` for local embedding (default: nomic-embed-text)

## Memory System

Claude Code has a file-based persistent knowledge system across sessions.

### Four Memory Types

| Type | Description | Storage |
|------|-------------|---------|
| **User** | Your role, goals, skills, preferences | `memory/user_*.md` |
| **Feedback** | Corrections and confirmations of Claude's behavior | `memory/feedback_*.md` |
| **Project** | Project context: who's doing what, why, deadlines | `memory/project_*.md` |
| **Reference** | Pointers to external systems (dashboards, issues) | `memory/reference_*.md` |

### Storage Location

```
~/.claude/projects/{project-hash}/memory/
├── MEMORY.md      # Index file (always loaded)
├── user_role.md
├── feedback_*.md
├── project_*.md
└── reference_*.md
```

### Quick Commands

| Action | Command |
|--------|---------|
| Remember something | "记住这个..." |
| Forget | "忘记关于...的记忆" |
| Edit memory | `/memory` |
| Review/cleanup | `/remember` |
| Ignore memory | "忽略记忆" |

## Multi-Agent System

Claude Code can spawn multiple specialized sub-agents for parallel task execution.

### Six Built-in Agent Types

| Agent | Type | Tools | Model | Use Case |
|-------|------|-------|-------|----------|
| **general-purpose** | read/write | All | inherit | Universal tasks |
| **Explore** | read-only | Glob, Grep, Read, Bash | Haiku | Fast exploration |
| **Plan** | read-only | Glob, Grep, Read, Bash | inherit | Architecture planning |
| **verification** | read-only | Glob, Grep, Read, Bash | inherit | Independent verification |
| **claude-code-guide** | read-only | Bash, Read, WebFetch, WebSearch | Haiku | Documentation lookup |
| **statusline-setup** | read/write | Read, Edit | Sonnet | Status bar config |

### Agent Usage

```javascript
// Spawn a sub-agent
Agent({
  description: "explore frontend",    // 3-5 word task summary
  prompt: "Analyze src/auth/ modules...",
  subagent_type: "Explore",
  run_in_background: true              // optional: async execution
})

// Worktree isolation (doesn't affect main workspace)
Agent({
  description: "experimental refactor",
  prompt: "Try重构...",
  isolation: "worktree"
})
```

### Agent Teams

Multiple agents can collaborate as a team:

```javascript
TeamCreate({ team_name: "feature-team" })
Agent({ name: "frontend-dev", team_name: "feature-team", ... })
Agent({ name: "backend-dev", team_name: "feature-team", ... })
SendMessage({ to: "frontend-dev", message: "API ready at..." })
```

## Skills System

Skills are extensible capability plugins defined in Markdown files.

### Six Skill Sources (priority order)

1. **Bundled** - Built-in to CLI binary
2. **Managed** - Organization policy controlled
3. **User** - `~/.claude/skills/`
4. **Project** - `.claude/skills/`
5. **Plugin** - From installed plugins
6. **MCP** - From connected MCP servers

### Skill Definition

```yaml
---
name: my-skill
description: What this skill does
user-invocable: true          # Can call via /skill-name
context: inline               # or: fork (isolated sub-agent)
agent: general-purpose        # for fork context
model: sonnet                 # Haiku/Sonnet/Opus/inherit
allowed-tools: "Bash, Read"  # Tool whitelist
paths: "src/**/*.ts"         # Activate only when these files modified
---

# Skill content in Markdown
```

### Skill Invocation

| Method | How |
|--------|-----|
| Slash command | `/skill-name` in terminal |
| Model auto-call | Claude calls when context matches |
| Nested | One skill triggers another |

## MCP Servers

Current MCP configuration (see `.mcp.json`):

| Server | Command | Purpose |
|--------|---------|---------|
| **gbrain** | bun run /tmp/gbrain2/src/cli.ts serve | Local knowledge brain |
| **qqmail** | bun run src/services/channels/qqmail/index.ts | QQ email adapter |

### MCP Usage

MCP servers provide tools that Claude can call directly. After connecting, Claude can use `gbrain query`, `gbrain get_page`, etc. without explicit tool definitions.

## Memory System vs GBrain — Two Complementary Memory Layers

This project has **two distinct memory systems** that serve different purposes:

| Aspect | Claude Code Memory | GBrain (MCP) |
|--------|-------------------|--------------|
| **Nature** | Built-in session memory | External knowledge base |
| **Storage** | `~/.claude/projects/{hash}/memory/` | `~/.gbrain/brain.pglite` |
| **Capacity** | Small (preferences, feedback, project context) | Large (documents, papers, notes) |
| **Trigger** | Auto-extracted + explicit save | Manual import + embedding |
| **Interface** | Direct file read/write | MCP tool calls |
| **Use Case** | Remember "who you are, your preferences" | Remember "what you know" |

### Synergy

Both systems can work together:

- **Claude Code Memory** → remembers "You are a medical researcher focusing on oncology"
- **GBrain** → stores your papers, meeting notes, and can answer "What did we discuss about immunotherapy last month?"

### When to Use Which

| Situation | Use |
|----------|-----|
| User provides feedback on Claude's behavior | Claude Code Memory (auto-captured) |
| "Remember this project uses bun not npm" | Claude Code Memory |
| Import meeting notes for semantic search | GBrain (`gbrain import`) |
| Ask "what papers do we have about X?" | GBrain (`gbrain query`) |
| Store permanent knowledge with citations | GBrain (with source tracking) |

GBrain is configured via `.mcp.json` and connects as a standard MCP server.

## Computer Use

Desktop control via screenshots, mouse, and keyboard input. See `docs/features/computer-use.md` for details.

## Desktop Client

Tauri 2 + React graphical client with multi-tab sessions. See `docs/desktop/` for installation and setup.

## Documentation

Full documentation at `docs/`:
- `docs/memory/01-usage-guide.md` - Memory system
- `docs/agent/01-usage-guide.md` - Multi-agent system
- `docs/skills/01-usage-guide.md` - Skills system
- `docs/channel/01-channel-system.md` - IM remote control
- `docs/features/computer-use.md` - Desktop control
- `docs/desktop/` - Desktop client
- `docs/guide/env-vars.md` - Environment variables
- `docs/guide/third-party-models.md` - Third-party API setup

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Terminal UI | React + Ink |
| CLI Parsing | Commander.js |
| API | Anthropic SDK |
| Protocols | MCP, LSP |

---

For more details, see the full documentation in `docs/` directory.
