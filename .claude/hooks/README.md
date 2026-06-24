# Hooks Directory

Guardrail scripts and voice notification system for Claude Code.

## Voice Hooks Plugin

Claude Code voice notification system based on 27 hook events.

### Features

- **27 Hook Events** - Sound notifications for all Claude Code hook events
- **Agent Support** - Agent-specific sounds via frontmatter hooks
- **Special Detection** - Auto-detect git commit/push/install commands
- **Platform Support** - Windows, macOS, Linux

### Hook Events

| # | Hook | Description |
|:-:|------|-------------|
| 1 | `PreToolUse` | Before tool calls |
| 2 | `PermissionRequest` | Before permission prompt |
| 3 | `PostToolUse` | After tool completes |
| 4 | `PostToolUseFailure` | After tool fails |
| 5 | `UserPromptSubmit` | When user submits prompt |
| 6 | `Notification` | When notification sent |
| 7 | `Stop` | When Claude finishes |
| 8 | `SubagentStart` | When subagent starts |
| 9 | `SubagentStop` | When subagent stops |
| 10 | `PreCompact` | Before compaction |
| 11 | `PostCompact` | After compaction |
| 12 | `SessionStart` | When session starts |
| 13 | `SessionEnd` | When session ends |
| 14 | `Setup` | When /setup runs |
| 15 | `TeammateIdle` | When teammate idle* |
| 16 | `TaskCreated` | When task created* |
| 17 | `TaskCompleted` | When task completed* |
| 18 | `ConfigChange` | When config changes |
| 19 | `WorktreeCreate` | When worktree created |
| 20 | `WorktreeRemove` | When worktree removed |
| 21 | `InstructionsLoaded` | When instructions loaded |
| 22 | `Elicitation` | MCP elicitation |
| 23 | `ElicitationResult` | After elicitation response |
| 24 | `StopFailure` | On API error |
| 25 | `CwdChanged` | When cwd changes |
| 26 | `FileChanged` | When file changes |
| 27 | `PermissionDenied` | When tool denied |

*Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

### Installation

To enable voice hooks, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "type": "command",
      "command": "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/hooks.js",
      "timeout": 5000,
      "async": true
    }]
  }
}
```

Or use the `/hooks` command in Claude Code.

### Configuration

- `hooks-settings.json` - Hook definitions for all 27 events
- `config/hooks-config.json` - Enable/disable specific hooks
- `config/hooks-config.local.json` - Personal overrides (git-ignored)
- `sounds/` - Sound files by hook event
- `logs/hooks-log.jsonl` - Hook event log

### Special Sounds

| Command Pattern | Sound |
|----------------|-------|
| `git commit` | `pretooluse-git-committing.mp3` |
| `git push` | `pretooluse-git-pushing.mp3` |
| `npm/pnpm/yarn install` | `pretooluse-installing.mp3` |

### Reference

- [Official Hooks Docs](https://code.claude.com/docs/en/hooks)
- [oh-my-claudecode hooks](https://github.com/shanraisshan/claude-code-hooks)

---

## Legacy Hooks

| Hook | Runs | Purpose |
|------|------|---------|
| `pre-commit-check.sh` | Before `git commit` | Prevent committing调试代码 |

### Installing Legacy Hooks

```bash
# Link to .git/hooks/
ln -s ../../.claude/hooks/pre-commit-check.sh .git/hooks/pre-commit-check.sh

# Or copy
cp .claude/hooks/pre-commit-check.sh .git/hooks/
```

## Creating Hooks

Hooks are shell scripts that exit with:
- `0` = success (continue)
- `non-zero` = failure (abort)

```bash
#!/bin/bash
set -e  # Exit on error

# Your checks here
if [ some_condition ]; then
  echo "Error: condition failed"
  exit 1
fi
```

## Notes

- Hooks must be executable: `chmod +x *.sh`
- Keep hooks fast (< 5 seconds)
- Use clear error messages