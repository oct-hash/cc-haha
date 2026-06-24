# Voice Hooks - Sound Files

This directory contains sound files for Claude Code hook events.

## Directory Structure

```
sounds/
├── README.md                    # This file
├── config/
│   ├── hooks-config.json        # Shared hook configuration
│   └── hooks-config.local.json   # Local overrides (git-ignored)
├── scripts/
│   └── hooks.js                 # Hook handler script
├── logs/
│   └── hooks-log.jsonl         # Hook event log
├── pretooluse/
│   ├── pretooluse.mp3           # Default pre-tool sound
│   └── pretooluse-git-committing.mp3  # Git commit special sound
├── posttooluse/
│   └── posttooluse.mp3
├── permissionrequest/
│   └── permissionrequest.mp3
├── stop/
│   └── stop.mp3
├── sessionstart/
│   └── sessionstart.mp3
├── sessionend/
│   └── sessionend.mp3
├── ... (other hook folders)
└── agent_pretooluse/            # Agent-specific sounds
├── agent_posttooluse/
├── agent_stop/
└── ... (other agent folders)
```

## Supported Hooks (27 Total)

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
| 15 | `TeammateIdle` | When teammate idle |
| 16 | `TaskCreated` | When task created |
| 17 | `TaskCompleted` | When task completed |
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

## Adding Sound Files

1. Create a folder for each hook event you want to hear
2. Add MP3 or WAV files with the same name as the folder
3. Optional: Add special sounds for specific commands (e.g., `pretooluse-git-committing.mp3`)

## Special Sound Patterns

The hook script detects these bash commands and plays special sounds:

| Command Pattern | Sound File |
|----------------|------------|
| `git commit` | `pretooluse-git-committing.mp3` |
| `git push` | `pretooluse-git-pushing.mp3` |
| `git pull` | `pretooluse-git-pulling.mp3` |
| `npm install` | `pretooluse-installing.mp3` |
| `pnpm install` | `pretooluse-installing.mp3` |
| `yarn install` | `pretooluse-installing.mp3` |

## Configuration

Edit `config/hooks-config.json` to enable/disable specific hooks:

```json
{
  "disableLogging": false,
  "disablePostToolUseHook": false,
  "disableStopHook": false
}
```

## Getting Sounds

Recommended TTS services:
- **ElevenLabs** - https://elevenlabs.io/ (voice: Samara X)
- **Azure TTS** - https://azure.microsoft.com/services/cognitive-services/text-to-speech/
- **Google Cloud TTS** - https://cloud.google.com/text-to-speech

## Agent-Specific Hooks

For agent frontmatter hooks, sounds go in `agent_*` folders:
- `agent_pretooluse/`
- `agent_posttooluse/`
- `agent_permissionrequest/`
- `agent_posttoolusefailure/`
- `agent_stop/`
- `agent_subagentstop/`

## Logs

Hook events are logged to `logs/hooks-log.jsonl`. Set `disableLogging: true` in config to disable.