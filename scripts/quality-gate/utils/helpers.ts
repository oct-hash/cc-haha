// Git, filesystem, and frontmatter utilities

import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const { spawn } = Bun

/** Run a git command and return its stdout, or null on failure */
export async function git(args: string[], cwd: string): Promise<string | null> {
  const proc = spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  return code === 0 ? stdout.trim() : null
}

/** Get list of files changed vs base ref */
export async function getChangedFiles(
  cwd: string,
  base: string = 'HEAD',
): Promise<string[]> {
  // Try diff against parent commit first
  const result = await git(
    ['diff', '--name-only', `${base}~1...${base}`],
    cwd,
  )
  if (result) return result.split('\n').filter(Boolean)

  // Fallback: diff against working tree
  const fallback = await git(['diff', '--name-only', 'HEAD'], cwd)
  if (fallback) return fallback.split('\n').filter(Boolean)

  // Last resort: list all tracked files
  const all = await git(['ls-files'], cwd)
  return all ? all.split('\n').filter(Boolean) : []
}

/** Get short git sha */
export async function getGitSha(cwd: string): Promise<string | null> {
  return git(['rev-parse', '--short', 'HEAD'], cwd)
}

/** Check if working tree is dirty */
export async function isGitDirty(cwd: string): Promise<boolean> {
  const status = await git(['status', '--short'], cwd)
  return status !== null && status.length > 0
}

/** Check if working directory is a git repo */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await git(['rev-parse', '--git-dir'], cwd)
  return result !== null
}

// --- Filesystem helpers ---

export function fileExists(path: string): boolean {
  return existsSync(path)
}

export function readJSON<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

export function writeJSON(path: string, data: unknown): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  Bun.write(path, JSON.stringify(data, null, 2) + '\n')
}

export function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

// --- Frontmatter parser ---

export interface FrontmatterResult {
  data: Record<string, unknown>
  body: string
}

/** Parse YAML frontmatter from markdown content */
export function parseFrontmatter(content: string): FrontmatterResult {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { data: {}, body: content }
  }

  const endIndex = lines.findIndex(
    (line, i) => i > 0 && line.trim() === '---',
  )
  if (endIndex === -1) {
    return { data: {}, body: content }
  }

  const frontmatterLines = lines.slice(1, endIndex)
  const body = lines.slice(endIndex + 1).join('\n')
  const data = parseSimpleYaml(frontmatterLines)

  return { data, body }
}

/** Minimal YAML parser for frontmatter (flat key: value only) */
function parseSimpleYaml(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()

    // Remove surrounding quotes
    if (
      (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // Boolean
    if (value === 'true') value = true
    else if (value === 'false') value = false
    // Number
    else if (/^-?\d+(\.\d+)?$/.test(value as string)) {
      value = Number(value)
    }

    result[key] = value
  }
  return result
}

/** Simple glob match (supports ** and * wildcards) */
export function globMatch(pattern: string, path: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*') +
      '$',
  )
  return regex.test(path)
}

/** Generate a timestamp-based run ID */
export function runId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Mask API keys in output */
export function maskKey(key: string): string {
  if (key.length <= 8) return '***'
  return key.slice(0, 4) + '...' + key.slice(-4)
}
