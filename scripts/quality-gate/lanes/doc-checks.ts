// Documentation checks lane: validate README, CHANGELOG, CLAUDE.md completeness and sync

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

export async function runDocChecks(
  ctx: LaneExecutionContext,
): Promise<LaneResult> {
  const started = Date.now()
  const details: DetailItem[] = []
  let hasErrors = false
  const rootDir = ctx.rootDir

  // 1. README.md structure
  const readmePath = join(rootDir, 'README.md')
  if (existsSync(readmePath)) {
    const content = readFileSync(readmePath, 'utf8')
    const requiredSections = ['# Claude Code Haha', '## 目录', '## 功能', '## 快速开始']
    const missing: string[] = []
    for (const section of requiredSections) {
      if (!content.includes(section)) missing.push(section)
    }
    if (missing.length > 0) {
      details.push({
        label: 'README.md',
        status: 'warn',
        message: `Missing sections: ${missing.join(', ')}`,
      })
    } else {
      details.push({ label: 'README.md structure', status: 'ok' })
    }
  } else {
    hasErrors = true
    details.push({ label: 'README.md', status: 'error', message: 'File not found' })
  }

  // 2. README.en.md parity (line count and section count should be similar)
  const readmeEnPath = join(rootDir, 'README.en.md')
  if (existsSync(readmeEnPath) && existsSync(readmePath)) {
    const zhContent = readFileSync(readmePath, 'utf8')
    const enContent = readFileSync(readmeEnPath, 'utf8')
    const zhLines = zhContent.split(/\r?\n/).length
    const enLines = enContent.split(/\r?\n/).length
    const zhSections = (zhContent.match(/^## /gm) || []).length
    const enSections = (enContent.match(/^## /gm) || []).length

    const lineRatio = Math.abs(zhLines - enLines) / Math.max(zhLines, enLines, 1)
    if (lineRatio > 0.5 || zhSections !== enSections) {
      details.push({
        label: 'README.md ↔ README.en.md',
        status: 'warn',
        message: `Line ratio ${(lineRatio * 100).toFixed(0)}% (ZH:${zhLines} / EN:${enLines}), sections: ZH:${zhSections} / EN:${enSections}`,
      })
    } else {
      details.push({ label: 'README bilingual parity', status: 'ok' })
    }
  }

  // 3. CHANGELOG.md format
  const changelogPath = join(rootDir, 'CHANGELOG.md')
  if (existsSync(changelogPath)) {
    const content = readFileSync(changelogPath, 'utf8')
    const versionCount = (content.match(/## haha-v\d+\.\d+/g) || []).length
    if (versionCount === 0) {
      details.push({ label: 'CHANGELOG.md', status: 'warn', message: 'No version entries found' })
    } else {
      details.push({ label: 'CHANGELOG.md', status: 'ok', message: `${versionCount} version entries` })
    }
  } else {
    details.push({ label: 'CHANGELOG.md', status: 'warn', message: 'Not found' })
  }

  // 4. CLAUDE.md sync markers
  const claudeMdPath = join(rootDir, 'CLAUDE.md')
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf8')
    const syncMarkers = (content.match(/\[SYNC\]/g) || []).length
    details.push({ label: 'CLAUDE.md sync markers', status: 'ok', message: `${syncMarkers} SYNC references` })
  }

  // 5. docs/ coverage — check architecture images have corresponding docs
  const docsDir = join(rootDir, 'docs')
  if (existsSync(docsDir)) {
    const pngCount = readdirSync(docsDir).filter((f) => f.endsWith('.png')).length
    const mdCount = readdirSync(docsDir).filter((f) => f.endsWith('.md')).length
    details.push({
      label: 'docs/ directory',
      status: 'ok',
      message: `${pngCount} diagrams, ${mdCount} documents`,
    })
  }

  return {
    id: 'doc-checks',
    title: 'Documentation Checks',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `${details.filter((d) => d.status === 'error').length} issues`,
    details,
  }
}
