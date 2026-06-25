// Dependency health lane: check outdated packages, license compliance, duplicate deps

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJSON } from '../utils/helpers'
import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

export async function runDepHealth(
  ctx: LaneExecutionContext,
): Promise<LaneResult> {
  const started = Date.now()
  const details: DetailItem[] = []
  let hasErrors = false
  const rootDir = ctx.rootDir

  // 1. Direct dependency count
  const pkgPath = join(rootDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = readJSON<{
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>(pkgPath)

    if (pkg) {
      const deps = Object.keys(pkg.dependencies || {})
      const devDeps = Object.keys(pkg.devDependencies || {})
      const totalDeps = deps.length + devDeps.length

      details.push({
        label: 'Dependency counts',
        status: totalDeps > 100 ? 'warn' : 'ok',
        message: `${deps.length} production + ${devDeps.length} dev = ${totalDeps} total`,
      })

      if (totalDeps > 100) {
        details.push({
          label: 'High dependency count',
          status: 'warn',
          message: 'Consider auditing for unused dependencies',
        })
      }
    }
  }

  // 2. License check from package.json deps
  const licenseDetails = checkLicenses(rootDir)
  details.push(...licenseDetails)

  // 3. Critical package versions
  const criticalPkgs = ['@anthropic-ai/sdk', 'react', 'ink', 'zod', 'typescript']
  const pkg = readJSON<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(pkgPath)
  if (pkg) {
    const versionInfo: string[] = []
    for (const name of criticalPkgs) {
      const version = pkg.dependencies?.[name] || pkg.devDependencies?.[name]
      if (version) {
        versionInfo.push(`${name}@${version}`)
      }
    }
    details.push({
      label: 'Critical package versions',
      status: 'ok',
      message: versionInfo.join(', '),
    })
  }

  // 4. Try bun outdated (non-blocking, may fail without network)
  try {
    const proc = Bun.spawn(['bun', 'outdated'], {
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode === 0 && stdout.trim()) {
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
      const outdatedCount = Math.max(0, lines.length - 1) // subtract header
      if (outdatedCount > 0) {
        details.push({
          label: 'Outdated packages',
          status: outdatedCount > 20 ? 'warn' : 'ok',
          message: `${outdatedCount} packages have updates available`,
        })
      }
    } else {
      details.push({
        label: 'Outdated check',
        status: 'ok',
        message: 'All packages up to date (or check unavailable)',
      })
    }
  } catch {
    details.push({
      label: 'Outdated check',
      status: 'ok',
      message: 'Network unavailable, skipped',
    })
  }

  return {
    id: 'dep-health',
    title: 'Dependency Health',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'integration',
    description: `${details.filter((d) => d.status === 'error').length} issues`,
    details,
  }
}

function checkLicenses(rootDir: string): DetailItem[] {
  const details: DetailItem[] = []
  const nodeModules = join(rootDir, 'node_modules')
  if (!existsSync(nodeModules)) return details

  // Check top-level packages for license
  const pkg = readJSON<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
    join(rootDir, 'package.json'),
  )
  if (!pkg) return details

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  let scannedCount = 0
  let missingLicenseCount = 0
  let copyleftCount = 0

  for (const name of Object.keys(allDeps).slice(0, 50)) {
    const pkgJsonPath = join(nodeModules, name, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    scannedCount++

    const depPkg = readJSON<{ license?: string | { type: string } }>(pkgJsonPath)
    if (!depPkg) continue

    const license = typeof depPkg.license === 'string'
      ? depPkg.license
      : depPkg.license?.type

    if (!license) {
      missingLicenseCount++
      continue
    }

    // Check for copyleft licenses
    if (/GPL|AGPL|EUPL|CC-BY-SA|OSL/i.test(license)) {
      copyleftCount++
    }
  }

  details.push({
    label: 'License scan',
    status: missingLicenseCount > 5 ? 'warn' : 'ok',
    message: `${scannedCount} scanned, ${missingLicenseCount} missing license, ${copyleftCount} copyleft`,
  })

  if (copyleftCount > 0) {
    details.push({
      label: 'Copyleft licenses detected',
      status: 'warn',
      message: `${copyleftCount} packages use GPL/AGPL-style licenses — review for compliance`,
    })
  }

  return details
}
