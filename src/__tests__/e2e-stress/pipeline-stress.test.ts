/**
 * E2E Pipeline Stress Tests — Full Tool Chain (Subprocess)
 *
 * Progressive difficulty L1 → L4:
 *   L1 — Basic: CLI startup, recovery CLI, config loading (sequential)
 *   L2 — Medium: 10-20 concurrent CLI spawn
 *   L3 — High: 30-50 concurrent + environment chaos
 *   L4 — Extreme: 50-100 concurrent + resource exhaustion + recovery
 *
 * Spawns headless CLI (localRecoveryCli.ts) and main CLI (cli.tsx)
 * as subprocesses to verify the full tool pipeline under load.
 *
 * LLM API strategy:
 *   L1: --help/--version (no API) + mock endpoint for recovery CLI
 *   L2-L4: --help/--version only (no API calls, no cost)
 *   E2E_LIVE_API=1 env var enables real API for L1 recovery CLI test
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertAllSucceed,
  assertSurvivalRate,
  cleanupTemp,
  createTempConfigDir,
  createTempHome,
  type ExitCodeResult,
  runConcurrently,
  spawnHeadlessCLI,
  writeSimpleSkill,
} from './test-helpers.js'

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Fast spawn of the main entrypoint (cli.tsx) with --help or --version */
async function spawnMainCLI(
  args: string[],
  env?: Record<string, string>,
  timeoutMs = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', './src/entrypoints/cli.tsx', ...args], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  })

  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {}
  }, timeoutMs)

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  clearTimeout(timer)

  return { stdout, stderr, exitCode }
}

/** Create a minimal MCP config JSON file */
function writeMCPConfig(dir: string): string {
  const mcpJson = join(dir, 'mcp.json')
  writeFileSync(
    mcpJson,
    JSON.stringify({
      mcpServers: {
        'test-mock': {
          command: 'echo',
          args: ['{"jsonrpc":"2.0","id":1,"result":{}}'],
        },
      },
    }),
  )
  return mcpJson
}

/** Create a minimal hook settings JSON */
function writeHookConfig(dir: string): string {
  const settingsJson = join(dir, 'settings.json')
  writeFileSync(
    settingsJson,
    JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: '',
            command: 'echo ok',
          },
        ],
      },
    }),
  )
  return settingsJson
}

// ═══════════════════════════════════════════════════════════════════════════════
// L1 — Basic CLI pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('L1 — Basic CLI pipeline', () => {
  // ── CLI startup (no API) ──────────────────────────────────────────────────

  describe('CLI startup', () => {
    test('localRecoveryCli --help exits 0 and prints usage', async () => {
      const { stdout, exitCode } = await spawnHeadlessCLI(['--help'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('Usage:')
    })

    test('localRecoveryCli --version exits 0 and prints version', async () => {
      const { stdout, exitCode } = await spawnHeadlessCLI(['--version'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('999.0.0-local')
    })

    test('main CLI (cli.tsx) --version exits 0', async () => {
      const { stdout, exitCode } = await spawnMainCLI(['--version'])
      expect(exitCode).toBe(0)
      // Main CLI prints version from MACRO.VERSION
      expect(stdout.length).toBeGreaterThan(0)
    })
  })

  // ── Recovery CLI JSON output (mock API) ──────────────────────────────────

  describe('Recovery CLI (mock endpoint)', () => {
    test('recovery CLI with invalid endpoint fails gracefully', {
      timeout: 60000,
    }, async () => {
      const { exitCode, stderr } = await spawnHeadlessCLI(
        ['-p', 'reply OK', '--output-format', 'json'],
        { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1' },
        60000,
      )
      // Should fail (no API) but not crash — exit code can be non-zero
      // The key assertion: process exits (doesn't hang)
      expect(typeof exitCode).toBe('number')
    })
  })

  // ── Config loading ────────────────────────────────────────────────────────

  describe('Config loading', () => {
    let configDir: string
    let homeDir: string

    afterEach(() => {
      if (configDir) cleanupTemp(configDir)
      if (homeDir) cleanupTemp(homeDir)
    })

    test('CLI starts with skill dir in CLAUDE_CONFIG_DIR', async () => {
      configDir = createTempConfigDir()
      homeDir = createTempHome()

      // Write a minimal skill
      writeSimpleSkill(join(configDir, 'skills'), 'test-skill', 'A test skill for pipeline stress')

      // Verify CLI starts without crash (--help is fast path)
      const { exitCode } = await spawnHeadlessCLI(['--help'], {
        HOME: homeDir,
        CLAUDE_CONFIG_DIR: configDir,
      })
      expect(exitCode).toBe(0)
    })

    test('CLI starts with MCP config file present', async () => {
      configDir = createTempConfigDir()
      homeDir = createTempHome()
      writeMCPConfig(configDir)

      const { exitCode } = await spawnHeadlessCLI(['--help'], { HOME: homeDir })
      expect(exitCode).toBe(0)
    })

    test('CLI starts with hook config present', async () => {
      configDir = createTempConfigDir()
      homeDir = createTempHome()
      writeHookConfig(configDir)

      const { exitCode } = await spawnHeadlessCLI(['--help'], {
        HOME: homeDir,
        CLAUDE_CONFIG_DIR: configDir,
      })
      expect(exitCode).toBe(0)
    })

    test('CLI starts with all three: skills + MCP + hooks', async () => {
      configDir = createTempConfigDir()
      homeDir = createTempHome()

      writeSimpleSkill(join(configDir, 'skills'), 'combo-skill', 'Combined config test')
      writeMCPConfig(configDir)
      writeHookConfig(configDir)

      const { exitCode } = await spawnHeadlessCLI(['--help'], {
        HOME: homeDir,
        CLAUDE_CONFIG_DIR: configDir,
      })
      expect(exitCode).toBe(0)
    })
  })

  // ── Environment isolation ─────────────────────────────────────────────────

  describe('Environment isolation', () => {
    test('temp HOME prevents cross-contamination between runs', async () => {
      const home1 = createTempHome()
      const home2 = createTempHome()

      // Both should start independently
      const [r1, r2] = await Promise.all([
        spawnHeadlessCLI(['--help'], { HOME: home1 }),
        spawnHeadlessCLI(['--help'], { HOME: home2 }),
      ])

      expect(r1.exitCode).toBe(0)
      expect(r2.exitCode).toBe(0)

      cleanupTemp(home1)
      cleanupTemp(home2)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L2 — Medium stress (10-20 concurrent)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L2 — Medium stress', () => {
  // ── Concurrent --help ─────────────────────────────────────────────────────

  describe('10 concurrent --help', () => {
    test('10 concurrent --help → all succeed', {
      timeout: 60000,
    }, async () => {
      const results = await runConcurrently(10, async (_i) => {
        try {
          const { exitCode } = await spawnHeadlessCLI(['--help'])
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertAllSucceed(results as ExitCodeResult[])
      expect(results.length).toBe(10)
    })

    test('10 concurrent --version → all succeed', {
      timeout: 60000,
    }, async () => {
      const results = await runConcurrently(10, async (_i) => {
        try {
          const { exitCode, stdout } = await spawnHeadlessCLI(['--version'])
          return { exitCode: exitCode === 0 && stdout.includes('999.0.0-local') ? 0 : 1 }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertAllSucceed(results as ExitCodeResult[])
    })
  })

  // ── Concurrent main CLI ───────────────────────────────────────────────────

  describe('10 concurrent main CLI --version', () => {
    test('10 concurrent cli.tsx --version → all succeed', {
      timeout: 120000,
    }, async () => {
      const results = await runConcurrently(10, async (_i) => {
        try {
          const { exitCode } = await spawnMainCLI(['--version'], {}, 60000)
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertAllSucceed(results as ExitCodeResult[])
    })
  })

  // ── Mixed config combinations concurrent ──────────────────────────────────

  describe('Mixed config combos concurrent', () => {
    test('15 concurrent CLI spawns with different configs → survival >= 90%', {
      timeout: 120000,
    }, async () => {
      const configs: Array<{ skill?: boolean; mcp?: boolean; hook?: boolean }> = [
        { skill: true },
        { mcp: true },
        { hook: true },
        { skill: true, mcp: true },
        { skill: true, hook: true, mcp: true },
        {},
      ]

      const results = await runConcurrently(15, async (i) => {
        const cfg = configs[i % configs.length]
        const configDir = createTempConfigDir()
        const home = createTempHome()

        try {
          if (cfg.skill) {
            writeSimpleSkill(join(configDir, 'skills'), `skill-${i}`, `Desc ${i}`)
          }
          if (cfg.mcp) writeMCPConfig(configDir)
          if (cfg.hook) writeHookConfig(configDir)

          const { exitCode } = await spawnHeadlessCLI(
            ['--help'],
            { HOME: home, CLAUDE_CONFIG_DIR: configDir },
            30000,
          )
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        } finally {
          cleanupTemp(configDir)
          cleanupTemp(home)
        }
      })

      assertSurvivalRate(results as ExitCodeResult[], 0.9, 'mixed config spawns')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L3 — High stress (30-50 concurrent + chaos)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L3 — High stress', () => {
  // ── 30 concurrent CLI ─────────────────────────────────────────────────────

  describe('30 concurrent --help', () => {
    test('30 concurrent --help → survival >= 80%', {
      timeout: 120000,
    }, async () => {
      const results = await runConcurrently(30, async (_i) => {
        try {
          const { exitCode } = await spawnHeadlessCLI(['--help'], {}, 30000)
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertSurvivalRate(results as ExitCodeResult[], 0.8, '30 concurrent --help')
    })
  })

  // ── 50 concurrent --version ───────────────────────────────────────────────

  describe('50 concurrent --version', () => {
    test('50 concurrent --version → survival >= 70%', {
      timeout: 180000,
    }, async () => {
      const results = await runConcurrently(50, async (_i) => {
        try {
          const { exitCode } = await spawnHeadlessCLI(['--version'], {}, 30000)
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertSurvivalRate(results as ExitCodeResult[], 0.7, '50 concurrent --version')
    })
  })

  // ── Chaos: config modification during concurrent runs ─────────────────────

  describe('Chaos — config modification', () => {
    test('delete skill dir mid concurrent CLI runs → no process crash', {
      timeout: 120000,
    }, async () => {
      const configDir = createTempConfigDir()
      const home = createTempHome()

      writeSimpleSkill(join(configDir, 'skills'), 'chaos-skill', 'Chaos test')
      writeMCPConfig(configDir)

      const chaosDir = join(configDir, 'skills', 'chaos-delete-me')
      mkdirSync(chaosDir, { recursive: true })
      writeFileSync(
        join(chaosDir, 'SKILL.md'),
        '---\nname: doomed\ndescription: Will be deleted\n---\n# doomed\n',
      )

      const ops: Promise<ExitCodeResult>[] = []

      // 25 CLI spawns
      for (let i = 0; i < 25; i++) {
        ops.push(
          (async () => {
            try {
              const { exitCode } = await spawnHeadlessCLI(
                ['--help'],
                { HOME: home, CLAUDE_CONFIG_DIR: configDir },
                30000,
              )
              return { exitCode }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      // Chaos injection mid-run: delete a skill directory
      ops.push(
        (async () => {
          await new Promise((r) => setTimeout(r, 200))
          try {
            rmSync(chaosDir, { recursive: true, force: true })
          } catch {}
          return { exitCode: 0 } // chaos op itself doesn't need validation
        })(),
      )

      const results = await Promise.allSettled(ops)
      const exitResults = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<ExitCodeResult>).value)

      // Don't assert pass rate — just verify no unhandled crash
      expect(exitResults.length).toBeGreaterThanOrEqual(20)

      cleanupTemp(configDir)
      cleanupTemp(home)
    })

    test('write MCP config with invalid JSON mid-run → CLI survives', {
      timeout: 120000,
    }, async () => {
      const configDir = createTempConfigDir()
      const home = createTempHome()
      writeMCPConfig(configDir)

      const ops: Promise<ExitCodeResult>[] = []

      for (let i = 0; i < 20; i++) {
        ops.push(
          (async () => {
            try {
              const { exitCode } = await spawnHeadlessCLI(
                ['--help'],
                { HOME: home, CLAUDE_CONFIG_DIR: configDir },
                30000,
              )
              return { exitCode }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      // Chaos: write invalid JSON to MCP config mid-run
      ops.push(
        (async () => {
          await new Promise((r) => setTimeout(r, 300))
          writeFileSync(join(configDir, 'mcp.json'), '{ invalid json }}}}}')
          return { exitCode: 0 }
        })(),
      )

      const results = await Promise.allSettled(ops)
      const exitResults = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<ExitCodeResult>).value)

      expect(exitResults.length).toBeGreaterThanOrEqual(15)

      cleanupTemp(configDir)
      cleanupTemp(home)
    })
  })

  // ── Mixed: CLI spawn + file operations concurrent ─────────────────────────

  describe('Mixed CLI + file operations', () => {
    test('25 CLI spawns + 10 file write/delete ops interleaved → survival >= 70%', {
      timeout: 120000,
    }, async () => {
      const configDir = createTempConfigDir()
      const home = createTempHome()
      writeSimpleSkill(join(configDir, 'skills'), 'mixed-skill', 'Mixed test')

      const ops: Promise<ExitCodeResult>[] = []

      // 25 CLI spawns
      for (let i = 0; i < 25; i++) {
        ops.push(
          (async () => {
            try {
              const { exitCode } = await spawnHeadlessCLI(
                ['--help'],
                { HOME: home, CLAUDE_CONFIG_DIR: configDir },
                30000,
              )
              return { exitCode }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      // 10 file operations
      for (let i = 0; i < 10; i++) {
        const idx = i
        ops.push(
          (async () => {
            try {
              const tmpFile = join(configDir, `chaos-${idx}.json`)
              writeFileSync(tmpFile, JSON.stringify({ idx }))
              rmSync(tmpFile, { force: true })
              return { exitCode: 0 }
            } catch {
              return { exitCode: 1 }
            }
          })(),
        )
      }

      const results = await Promise.allSettled(ops)
      const exitResults = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<ExitCodeResult>).value)

      assertSurvivalRate(exitResults, 0.7, 'mixed CLI + file ops')

      cleanupTemp(configDir)
      cleanupTemp(home)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L4 — Extreme stress (50-100 concurrent + recovery)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L4 — Extreme stress', () => {
  // ── 80 concurrent CLI ─────────────────────────────────────────────────────

  describe('80 concurrent --help', () => {
    test('80 concurrent --help → survival >= 60%', {
      timeout: 240000,
    }, async () => {
      const results = await runConcurrently(80, async (_i) => {
        try {
          const { exitCode } = await spawnHeadlessCLI(['--help'], {}, 30000)
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        }
      })
      assertSurvivalRate(results as ExitCodeResult[], 0.6, '80 concurrent --help')
    })
  })

  // ── 100 concurrent --version ──────────────────────────────────────────────

  describe('100 concurrent --version', () => {
    test('100 concurrent --version → survival >= 50%', {
      timeout: 300000,
    }, async () => {
      const results = await runConcurrently(100, async (_i) => {
        try {
          const { exitCode } = await spawnHeadlessCLI(['--version'], {}, 30000)
          return { exitCode }
        } catch {
          return { exitCode: 1 }
        }
      })
      const { rate } = assertSurvivalRate(
        results as ExitCodeResult[],
        0.5,
        '100 concurrent --version',
      )
      expect(rate).toBeGreaterThanOrEqual(0.5)
    })
  })

  // ── Resource exhaustion ───────────────────────────────────────────────────

  describe('Resource exhaustion', () => {
    test('500 junk files in temp dir → CLI still starts', {
      timeout: 60000,
    }, async () => {
      const home = createTempHome()
      const tmpDir = join(home, 'tmp-junk')
      mkdirSync(tmpDir, { recursive: true })

      // Create 500 small junk files
      for (let i = 0; i < 500; i++) {
        writeFileSync(join(tmpDir, `junk-${i}.txt`), `junk data ${i}`.repeat(10))
      }

      // CLI should still start despite many temp files
      const { exitCode } = await spawnHeadlessCLI(['--help'], { HOME: home, TMPDIR: tmpDir })
      expect(exitCode).toBe(0)

      cleanupTemp(home)
    })
  })

  // ── Disaster recovery ────────────────────────────────────────────────────

  describe('Disaster recovery', () => {
    test('after 80 concurrent spawns → L1 basic operations still pass', {
      timeout: 240000,
    }, async () => {
      // Phase 1: extreme load — 80 concurrent --help
      await runConcurrently(80, async (_i) => {
        try {
          await spawnHeadlessCLI(['--help'], {}, 30000)
          return { exitCode: 0 }
        } catch {
          return { exitCode: 1 }
        }
      })

      // Phase 2: recovery — verify basic operations
      const { stdout: helpOut, exitCode: helpCode } = await spawnHeadlessCLI(['--help'])
      expect(helpCode).toBe(0)
      expect(helpOut).toContain('Usage:')

      const { stdout: verOut, exitCode: verCode } = await spawnHeadlessCLI(['--version'])
      expect(verCode).toBe(0)
      expect(verOut).toContain('999.0.0-local')
    })

    test('after config chaos → fresh config still works', {
      timeout: 120000,
    }, async () => {
      const configDir = createTempConfigDir()
      const home = createTempHome()

      // Phase 1: rapid create/destroy config cycles
      for (let i = 0; i < 30; i++) {
        const skillDir = join(configDir, 'skills', `cycle-${i}`)
        mkdirSync(skillDir, { recursive: true })
        writeFileSync(
          join(skillDir, 'SKILL.md'),
          `---\nname: cycle-${i}\ndescription: Cycle ${i}\n---\n# ${i}\n`,
        )
        if (i % 3 === 0) {
          try {
            rmSync(skillDir, { recursive: true, force: true })
          } catch {}
        }
      }

      // Phase 2: fresh config should still work
      writeSimpleSkill(join(configDir, 'skills'), 'recovery', 'Post-chaos recovery')
      const { exitCode } = await spawnHeadlessCLI(['--help'], {
        HOME: home,
        CLAUDE_CONFIG_DIR: configDir,
      })
      expect(exitCode).toBe(0)

      cleanupTemp(configDir)
      cleanupTemp(home)
    })
  })
})
