# Voice Hooks Scripts

This directory contains the JavaScript hooks handler and sound generation tools.

## Files

- `hooks.js` - Main hook handler that plays sounds on Claude Code events
- `generate-sounds.ts` - Sound file generator using Web Audio API

## Usage

### Sound Generation

Generate WAV sound files for all 27 hooks:

```bash
bun .claude/hooks/scripts/generate-sounds.ts
```

This creates sound files in `../sounds/` directory with unique tones for each hook event.

### Sound File Format

Sound files are named after their hook events:
- `pretooluse/pretooluse.wav` - PreToolUse hook sound
- `posttooluse/posttooluse.wav` - PostToolUse hook sound
- etc.

Special sounds for detected commands:
- `pretooluse/pretooluse-git-committing.wav` - git commit
- `pretooluse/pretooluse-git-pushing.wav` - git push
- `pretooluse/pretooluse-git-pulling.wav` - git pull
- `pretooluse/pretooluse-installing.wav` - npm/pnpm/yarn install

Agent-specific sounds:
- `agent_pretooluse/agent_pretooluse.wav`
- `agent_posttooluse/agent_posttooluse.wav`
- etc.

## Sound Frequencies

| Hook | Frequency | Duration |
|------|-----------|----------|
| PreToolUse | 440 Hz (A4) | 0.15s |
| PostToolUse | 523 Hz (C5) | 0.15s |
| PermissionRequest | 659 Hz (E5) | 0.15s |
| Stop | 1047 Hz (C6) | 0.3s |
| SessionStart | 1760 Hz (A6) | 0.5s |
| SessionEnd | 1976 Hz (B6) | 0.5s |

See `generate-sounds.ts` for all 27 hook frequencies.

## Customization

To use custom sounds (e.g., ElevenLabs Samara X voice):

1. Generate MP3 files with your TTS service
2. Place MP3 files in the corresponding directories
3. The hook handler will prefer MP3 over WAV when available

## Configuration

Hook behavior can be configured via `hooks-config.json` or `hooks-config.local.json`:
```json
{
  "disablePostToolUseHook": false,
  "disableStopHook": false,
  "disableSessionStartHook": false
}
```