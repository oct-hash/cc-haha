---
name: debug-tui
description: 调试终端 TUI 界面问题
---

# Debug TUI

Debug the terminal UI issues.

## Common Issues

### Git Bash Path Not Found

```
Claude Code on Windows requires git-bash
```

**Fix:**
```powershell
$env:CLAUDE_CODE_GIT_BASH_PATH="C:\Program Files\Git\bin\bash.exe"
# Or
$env:CLAUDE_CODE_GIT_BASH_PATH="D:\Program Files\Git\bin\bash.exe"
```

### TUI Not Rendering

```bash
# Try recovery CLI mode
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 bun --env-file=.env ./src/localRecoveryCli.ts
```

### Cursor/Display Issues

```bash
# Run with debug output
bun --env-file=.env ./src/entrypoints/cli.tsx --debug
```

## Debug Mode

```bash
# Full debug
./bin/claude-haha --debug

# Filter by category
./bin/claude-haha --debug api,hooks

# Exclude category
./bin/claude-haha --debug !file,!edit
```

## Check Logs

```bash
openclaw logs --follow
```

## Health Check

```bash
openclaw doctor
openclaw health
```

## Common Fixes

| Issue | Solution |
|-------|----------|
| Blank screen | Check terminal supports ANSI colors |
| Slow rendering | Disable animations in terminal |
| Input lag | Close other terminal apps |
| Crash on start | Run `openclaw doctor --fix` |
