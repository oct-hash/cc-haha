/**
 * Claude Code Voice Hook Handler
 *
 * Plays sounds for different hook events.
 * Supports all 27 Claude Code hooks.
 *
 * Usage:
 *   node hooks.js                    # Main session hooks
 *   node hooks.js --agent=<name>     # Agent-specific hooks
 */

import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'

// ===== HOOK EVENT TO SOUND FOLDER MAPPING =====
const HOOK_SOUND_MAP = {
  PreToolUse: 'pretooluse',
  PermissionRequest: 'permissionrequest',
  PostToolUse: 'posttooluse',
  PostToolUseFailure: 'posttoolusefailure',
  UserPromptSubmit: 'userpromptsubmit',
  Notification: 'notification',
  Stop: 'stop',
  SubagentStart: 'subagentstart',
  SubagentStop: 'subagentstop',
  PreCompact: 'precompact',
  PostCompact: 'postcompact',
  SessionStart: 'sessionstart',
  SessionEnd: 'sessionend',
  Setup: 'setup',
  TeammateIdle: 'teammateidle',
  TaskCreated: 'taskcreated',
  TaskCompleted: 'taskcompleted',
  ConfigChange: 'configchange',
  WorktreeCreate: 'worktreecreate',
  WorktreeRemove: 'worktreeremove',
  InstructionsLoaded: 'instructionsloaded',
  Elicitation: 'elicitation',
  ElicitationResult: 'elicitationresult',
  StopFailure: 'stopfailure',
  CwdChanged: 'cwdchanged',
  FileChanged: 'filechanged',
  PermissionDenied: 'permissiondenied',
}

// ===== AGENT HOOK EVENT TO SOUND FOLDER MAPPING =====
const AGENT_HOOK_SOUND_MAP = {
  PreToolUse: 'agent_pretooluse',
  PostToolUse: 'agent_posttooluse',
  PermissionRequest: 'agent_permissionrequest',
  PostToolUseFailure: 'agent_posttoolusefailure',
  Stop: 'agent_stop',
  SubagentStop: 'agent_subagentstop',
}

// ===== BASH COMMAND PATTERNS FOR SPECIAL SOUNDS =====
const BASH_PATTERNS = [
  { pattern: /git commit/i, sound: 'pretooluse-git-committing' },
  { pattern: /git push/i, sound: 'pretooluse-git-pushing' },
  { pattern: /git pull/i, sound: 'pretooluse-git-pulling' },
  { pattern: /npm install/i, sound: 'pretooluse-installing' },
  { pattern: /pnpm install/i, sound: 'pretooluse-installing' },
  { pattern: /yarn install/i, sound: 'pretooluse-installing' },
  { pattern: /bun install/i, sound: 'pretooluse-installing' },
]

// ===== CONFIGURATION =====
const CONFIG_PATH = join(dirname(new URL(import.meta.url).fileURLToPath(import.meta.url)), 'config', 'hooks-config.json')
const CONFIG_LOCAL_PATH = join(dirname(new URL(import.meta.url).fileURLToPath(import.meta.url)), 'config', 'hooks-config.local.json')

/**
 * Load hook configuration (local overrides shared).
 */
function loadConfig() {
  const config = {}
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = Bun.file(CONFIG_PATH).text()
      Object.assign(config, JSON.parse(content))
    }
  } catch (e) {
    console.error(`Error loading config: ${e.message}`)
  }

  try {
    if (existsSync(CONFIG_LOCAL_PATH)) {
      const content = Bun.file(CONFIG_LOCAL_PATH).text()
      Object.assign(config, JSON.parse(content))
    }
  } catch (e) {
    // Local config is optional
  }

  return config
}

/**
 * Check if a specific hook is disabled.
 */
function isHookDisabled(eventName, config) {
  const disableKey = `disable${eventName.charAt(0).toUpperCase() + eventName.slice(1)}Hook`
  return config[disableKey] === true
}

/**
 * Get the audio player command for the current platform.
 */
function getAudioPlayer() {
  const platform = process.platform

  if (platform === 'win32') {
    return { type: 'windows' }
  } else if (platform === 'darwin') {
    return { type: 'afplay', cmd: ['afplay'] }
  } else {
    // Linux - try to find available player
    const players = ['paplay', 'aplay', 'ffplay', 'mpg123']
    for (const player of players) {
      try {
        execSync(`which ${player}`, { stdio: 'ignore' })
        return { type: player, cmd: [player] }
      } catch {
        // Player not found, try next
      }
    }
  }
  return null
}

/**
 * Play a sound file.
 */
function playSound(soundName, audioPlayer) {
  if (!audioPlayer) {
    return false
  }

  const scriptDir = dirname(new URL(import.meta.url).fileURLToPath(import.meta.url))
  const soundsDir = join(scriptDir, '..', 'sounds')

  // Try different formats
  const formats = ['.mp3', '.wav']
  let soundPath = null

  for (const format of formats) {
    const testPath = join(soundsDir, soundName + format)
    if (existsSync(testPath)) {
      soundPath = testPath
      break
    }
  }

  // Also try the folder-based structure
  if (!soundPath) {
    for (const format of formats) {
      const testPath = join(soundsDir, soundName.replace(/-/g, ''), soundName + format)
      if (existsSync(testPath)) {
        soundPath = testPath
        break
      }
    }
  }

  // Special sounds (like pretooluse-git-committing) are in pretooluse folder
  if (!soundPath && soundName.startsWith('pretooluse-')) {
    const specialPath = join(soundsDir, 'pretooluse', soundName + format)
    if (existsSync(specialPath)) {
      soundPath = specialPath
    }
  }

  if (!soundPath) {
    // Try looking in subdirectory
    const subdirPath = join(soundsDir, soundName)
    if (existsSync(subdirPath)) {
      for (const format of formats) {
        const testPath = join(subdirPath, soundName + format)
        if (existsSync(testPath)) {
          soundPath = testPath
          break
        }
      }
    }
  }

  if (!soundPath) {
    console.error(`Sound not found: ${soundName}`)
    return false
  }

  try {
    if (audioPlayer.type === 'windows') {
      // Windows: use PowerShell for MP3, winsound for WAV
      if (soundPath.endsWith('.wav')) {
        execSync(`powershell -c "Add-Type -TypeDefinition 'using System.Media; [System.Media.SoundPlayer]::new('${soundPath.replace(/'/g, "''")}').PlaySync();"`, { stdio: 'ignore' })
      } else {
        // For MP3 on Windows, use a simple approach
        execSync(`powershell -c "[System.Media.SoundPlayer]::new('${soundPath.replace(/'/g, "''")}').PlaySync()"`, { stdio: 'ignore' })
      }
    } else {
      execSync([...audioPlayer.cmd, soundPath].join(' '), { stdio: 'ignore' })
    }
    return true
  } catch (e) {
    console.error(`Error playing sound: ${e.message}`)
    return false
  }
}

/**
 * Detect special bash commands and return corresponding sound name.
 */
function detectBashCommandSound(command) {
  if (!command) return null

  for (const { pattern, sound } of BASH_PATTERNS) {
    if (pattern.test(command)) {
      return sound
    }
  }
  return null
}

/**
 * Get the sound name based on hook event and context.
 */
function getSoundName(hookData, agentName) {
  const eventName = hookData.hook_event_name || ''
  const toolName = hookData.tool_name || ''

  // Agent-specific sounds
  if (agentName) {
    return AGENT_HOOK_SOUND_MAP[eventName] || null
  }

  // Special bash command detection
  if (eventName === 'PreToolUse' && toolName === 'Bash') {
    const command = hookData.tool_input?.command || ''
    const specialSound = detectBashCommandSound(command)
    if (specialSound) {
      return specialSound
    }
  }

  return HOOK_SOUND_MAP[eventName] || null
}

/**
 * Log hook data to hooks-log.jsonl
 */
function logHookData(hookData, agentName) {
  try {
    const scriptDir = dirname(new URL(import.meta.url).fileURLToPath(import.meta.url))
    const logsDir = join(scriptDir, '..', 'logs')
    const logPath = join(logsDir, 'hooks-log.jsonl')

    const logEntry = { ...hookData }
    delete logEntry.transcript_path
    delete logEntry.cwd

    if (agentName) {
      logEntry.invoked_by_agent = agentName
    }

    // Ensure logs directory exists
    try {
      const { mkdirSync } = require('fs')
      mkdirSync(logsDir, { recursive: true })
    } catch {}

    Bun.write(logPath, JSON.stringify(logEntry) + '\n', { append: true })
  } catch (e) {
    // Fail silently for logging
  }
}

/**
 * Parse command line arguments.
 */
function parseArgs() {
  const args = { agent: null }
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--agent=')) {
      args.agent = arg.slice('--agent='.length)
    }
  }
  return args
}

/**
 * Main entry point.
 */
function main() {
  try {
    const args = parseArgs()

    // Read stdin
    const stdinContent = process.stdin.read()
    if (!stdinContent || !stdinContent.trim()) {
      process.exit(0)
    }

    const inputData = JSON.parse(stdinContent.trim())

    // Log hook data
    logHookData(inputData, args.agent)

    // Check if hook is disabled
    const config = loadConfig()
    const eventName = inputData.hook_event_name || ''
    if (!args.agent && isHookDisabled(eventName, config)) {
      process.exit(0)
    }

    // Get sound name
    const soundName = getSoundName(inputData, args.agent)
    if (!soundName) {
      process.exit(0)
    }

    // Get audio player
    const audioPlayer = getAudioPlayer()
    if (!audioPlayer) {
      process.exit(0)
    }

    // Play the sound
    playSound(soundName, audioPlayer)

    process.exit(0)
  } catch (e) {
    console.error(`Error: ${e.message}`)
    process.exit(0)
  }
}

main()