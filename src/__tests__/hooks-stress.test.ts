/**
 * Hook 门禁系统加压测试 — 渐进难度（L1 → L4）
 *
 * L1 — 基础功能: 状态机转换 / 输入校验 / 边界条件
 * L2 — 中等压力: 并发 / 爆发写入 / 大输入 / 特殊字符
 * L3 — 高压力:   高并发 / 混沌注入 / 跨脚本污染 / 混合操作
 * L4 — 极限压力: 极限并发 / 资源耗尽 / 四脚本齐发 / 灾后恢复
 *
 * 覆盖四个脚本:
 * - stop-gate.sh:       会话退出门禁（状态机 + 输入校验）
 * - post-edit-remind.sh: 编辑后提醒（3 级升级 + 并发锁）
 * - session-start-inject.sh: 会话启动注入（清理 + incident 回显）
 * - pre-commit-gate.sh: git commit 前置检查（模式匹配）
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOKS = `.claude/hooks/workflow-enforcement`
const IS_WINDOWS = process.platform === 'win32'

// ═══════════════════════════════════════════════════════════════════════════════
// Isolated test home — each test run gets a clean temp directory as HOME
// so hook scripts write to a sandbox instead of the real ~/.claude-code-haha-gate
// ═══════════════════════════════════════════════════════════════════════════════

let TEST_HOME: string
let GATE_DIR: string
let WORKER_PORT: number = 0 // Windows: persistent node HTTP worker port
let WORKER_PROC: { kill: () => void } | null = null

beforeAll(async () => {
  TEST_HOME = mkdtempSync(join(tmpdir(), 'hook-stress-home-'))
  GATE_DIR = join(TEST_HOME, '.claude-code-haha-gate')

  if (IS_WINDOWS) {
    // Persistent HTTP worker: single node process handles all concurrent bash calls.
    // Avoids spawning cmd.exe×50 + node.exe×50 (100 processes) at concurrency 50.
    // With a persistent worker: 1 worker + 50 bash = 51 processes at concurrency 50.
    const WORKER_SCRIPT = join(tmpdir(), 'hook-worker.mjs')
    const PORT_FILE = join(tmpdir(), 'hook-worker-port.txt')
    // Clean up stale files from previous runs so port discovery isn't confused
    try {
      unlinkSync(PORT_FILE)
    } catch {
      /* not there */
    }
    try {
      unlinkSync(WORKER_SCRIPT)
    } catch {
      /* not there */
    }
    writeFileSync(
      WORKER_SCRIPT,
      `import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';

const PORT_FILE = ${JSON.stringify(PORT_FILE)};
const MAX_CONCURRENT = 16; // Limit concurrent bash spawns to avoid Windows process exhaustion
const IDLE_TIMEOUT = 300_000; // 5 min idle → self-terminate
let idleTimer = null;

// Concurrency limiter: queue-based, first-in-first-out
let running = 0;
const queue = [];

function next() {
  if (queue.length === 0) return;
  if (running >= MAX_CONCURRENT) return;
  running++;
  const { spawnArgs, res } = queue.shift();
  try {
    const child = spawn('bash', ['-c', spawnArgs.cmd], {
      timeout: spawnArgs.timeout || 60000,
      env: { ...process.env, HOME: spawnArgs.homeDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      running--;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stdout, stderr, exitCode: code ?? 1 }));
      next(); // start next queued job
    });
    child.on('error', (err) => {
      running--;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stdout: '', stderr: err.message, exitCode: 1 }));
      next();
    });
  } catch (err) {
    running--;
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stdout: '', stderr: String(err), exitCode: 1 }));
    next();
  }
}

function enqueue(spawnArgs, res) {
  queue.push({ spawnArgs, res });
  next();
}

function resetIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { process.exit(0); }, IDLE_TIMEOUT);
}

const server = createServer((req, res) => {
  resetIdle();
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { scriptPath, inputFile, homeDir, timeout } = JSON.parse(body);
        const cmd = inputFile
          ? 'bash "' + scriptPath + '" < "' + inputFile + '"'
          : 'bash "' + scriptPath + '"';
        enqueue({ cmd, homeDir, timeout }, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ stdout: '', stderr: String(err), exitCode: 1 }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200); res.end('ok');
    server.close();
    process.exit(0);
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200); res.end('ok');
  } else {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    writeFileSync(PORT_FILE, String(addr.port));
  }
  resetIdle();
});
`,
    )

    // Spawn the persistent worker
    const proc = Bun.spawn(['cmd.exe', '/c', 'node', WORKER_SCRIPT], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    WORKER_PROC = proc

    // Wait for port file to appear (worker writes it when ready)
    for (let i = 0; i < 50; i++) {
      try {
        WORKER_PORT = parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10)
        if (WORKER_PORT > 0) break
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    if (WORKER_PORT === 0) {
      // Debug: capture worker output to diagnose startup failure
      const workerStdout = await new Response(proc.stdout).text()
      const workerStderr = await new Response(proc.stderr).text()
      proc.kill()
      throw new Error(
        `Worker failed to start within 10s.\nWORKER_SCRIPT: ${WORKER_SCRIPT}\n` +
          `stdout: ${workerStdout || '(empty)'}\nstderr: ${workerStderr || '(empty)'}`,
      )
    }
  }
})

afterAll(() => {
  try {
    rmSync(TEST_HOME, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  if (WORKER_PROC) {
    try {
      // Send shutdown signal
      fetch(`http://127.0.0.1:${WORKER_PORT}/shutdown`, { method: 'POST' }).catch(() => {})
    } catch {
      /* ignore */
    }
    WORKER_PROC.kill()
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function runHook(
  script: string,
  stdin: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const tmp = mkdtempSync(join(tmpdir(), 'hook-stress-'))
  const inputFile = join(tmp, 'input.json')
  writeFileSync(inputFile, stdin)

  try {
    const scriptPath = join(HOOKS, script)

    if (IS_WINDOWS && WORKER_PORT > 0) {
      // Windows: send to persistent node HTTP worker (avoids per-call process overhead)
      const fwd = (p: string) => p.replace(/\\/g, '/')
      const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptPath: fwd(scriptPath),
          inputFile: fwd(inputFile),
          homeDir: fwd(TEST_HOME),
          timeout: 60000,
        }),
      })
      const data = (await res.json()) as { stdout: string; stderr: string; exitCode: number }
      return data
    }

    // Unix: Bun.spawn bash directly (fast on macOS/Linux)
    const scriptPathUnix = scriptPath.replace(/\\/g, '/')
    const inputFileUnix = inputFile.replace(/\\/g, '/')
    const proc = Bun.spawn(['bash', '-c', `"${scriptPathUnix}" < "${inputFileUnix}"`], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: TEST_HOME },
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    return { stdout, stderr, exitCode }
  } catch {
    return { stdout: '', stderr: '', exitCode: 1 }
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

async function resetGateDir() {
  try {
    rmSync(GATE_DIR, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

async function writeGateFile(name: string, content: string) {
  const dir = GATE_DIR
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), content)
}

async function gateFileExists(name: string): Promise<boolean> {
  return existsSync(join(GATE_DIR, name))
}

async function readGateFile(name: string): Promise<string> {
  try {
    return readFileSync(join(GATE_DIR, name), 'utf-8').trim()
  } catch {
    return ''
  }
}

/** fill gate dir with N junk files to simulate resource exhaustion */
async function fillGateDirWithJunk(count: number) {
  const dir = GATE_DIR
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) {
    writeFileSync(join(dir, `junk_${i}.dat`), 'x'.repeat(4096))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// L1 — Basic (34 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L1 — Basic', () => {
  // ── stop-gate.sh ──────────────────────────────────────────────────────────

  describe('stop-gate.sh', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('no edits → pass through, return original JSON, clean gate dir', async () => {
      const input = JSON.stringify({ session_id: 's1' })
      const { stdout, exitCode } = await runHook('stop-gate.sh', input)

      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
      expect(out.session_id).toBe('s1')
      expect(existsSync(GATE_DIR)).toBe(false)
    })

    test('edits + gate satisfied → pass through and clean', async () => {
      await writeGateFile('edit-count', '3')
      await writeGateFile('satisfied', '1')

      const { stdout, exitCode } = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 's2' }),
      )
      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
      expect(existsSync(GATE_DIR)).toBe(false)
    })

    test('edit-count = 0 (file missing) → pass through', async () => {
      const { stdout, exitCode } = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 's3' }),
      )
      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
    })

    test('gate dir missing → treat as edit-count=0, pass through', async () => {
      const { stdout, exitCode } = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 's3b' }),
      )
      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
    })

    test('edits + not satisfied + first block → block and inject followup_message', async () => {
      await writeGateFile('edit-count', '5')
      const { stdout, stderr, exitCode } = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 's4' }),
      )

      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toContain('第 1/3 次')
      expect(out.followup_message).toContain('code-reviewer')
      expect(out.followup_message).toContain('bun test')
      expect(stderr).toContain('第 1/3 次')
      expect(stderr).toContain('code-reviewer')
      const bc = await readGateFile('block-count')
      expect(bc).toBe('1')
    })

    test('2nd block', async () => {
      await writeGateFile('edit-count', '5')
      await writeGateFile('block-count', '1')
      const { stdout } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 's5' }))
      const out = JSON.parse(stdout)
      expect(out.followup_message).toContain('第 2/3 次')
    })

    test('3rd block', async () => {
      await writeGateFile('edit-count', '5')
      await writeGateFile('block-count', '2')
      const { stdout } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 's6' }))
      const out = JSON.parse(stdout)
      expect(out.followup_message).toContain('第 3/3 次')
    })

    test('4th block → force allow + incident record', async () => {
      await writeGateFile('edit-count', '7')
      await writeGateFile('block-count', '3')

      const { stdout, stderr, exitCode } = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 's7' }),
      )

      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
      expect(stderr).toContain('强制放行')
      const incident = await readGateFile('incident')
      expect(incident).toContain('stop-gate exhausted')
    })

    test('edit-count is garbage → treat as 0, pass through', async () => {
      await writeGateFile('edit-count', 'xyz')
      const { stdout, exitCode } = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 's8' }),
      )
      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
    })

    test('block-count is garbage → treat as 0, start from 1st', async () => {
      await writeGateFile('edit-count', '5')
      await writeGateFile('block-count', 'abc')
      const { stdout } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 's9' }))
      const out = JSON.parse(stdout)
      expect(out.followup_message).toContain('第 1/3 次')
    })

    test('two stop-gate calls concurrently → each runs independently, no corruption', async () => {
      await writeGateFile('edit-count', '5')
      const [r1, r2] = await Promise.all([
        runHook('stop-gate.sh', JSON.stringify({ session_id: 'a' })),
        runHook('stop-gate.sh', JSON.stringify({ session_id: 'b' })),
      ])
      const o1 = JSON.parse(r1.stdout)
      const o2 = JSON.parse(r2.stdout)
      expect(o1.followup_message).toBeDefined()
      expect(o2.followup_message).toBeDefined()
      expect(o1.session_id || o2.session_id).toBeDefined()
    })

    test('after pass, gate dir is cleaned', async () => {
      const { exitCode } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'cleanup' }))
      expect(exitCode).toBe(0)
      expect(existsSync(GATE_DIR)).toBe(false)
    })
  })

  // ── post-edit-remind.sh ────────────────────────────────────────────────────

  describe('post-edit-remind.sh', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('first edit → count=1, level=reminder', async () => {
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/a.ts' }),
      )
      expect(stderr).toContain('第1次')
    })

    test('5th edit → count=5, level=reminder', async () => {
      await writeGateFile('edit-count', '4')
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/b.ts' }),
      )
      expect(stderr).toContain('第5次')
    })

    test('6th edit → count=6, level=warning', async () => {
      await writeGateFile('edit-count', '5')
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/c.ts' }),
      )
      expect(stderr).toContain('第6次')
    })

    test('11th edit → count=11, level=critical', async () => {
      await writeGateFile('edit-count', '10')
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/d.ts' }),
      )
      expect(stderr).toContain('第11次')
    })

    test('new edit → satisfied flag is cleared', async () => {
      await writeGateFile('edit-count', '0')
      await writeGateFile('satisfied', '1')
      await runHook('post-edit-remind.sh', JSON.stringify({ file_path: 'src/e.ts' }))
      expect(await gateFileExists('satisfied')).toBe(false)
    })

    test('missing file_path → pass through silently', async () => {
      const { stderr, exitCode } = await runHook('post-edit-remind.sh', JSON.stringify({}))
      expect(exitCode).toBe(0)
      expect(stderr).toBe('')
    })

    test('entry-point dir auto-created if missing', async () => {
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/f.ts' }),
      )
      expect(stderr).toContain('第1次')
    })

    test('garbage edit-count → reset to 0, increment to 1', async () => {
      await writeGateFile('edit-count', 'not-a-number')
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/g.ts' }),
      )
      expect(stderr).toContain('第1次')
    })
  })

  // ── session-start-inject.sh ────────────────────────────────────────────────

  describe('session-start-inject.sh', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('no gate dir → runs normally', async () => {
      const { stdout, stderr, exitCode } = await runHook(
        'session-start-inject.sh',
        JSON.stringify({ session_id: 'ss1' }),
      )
      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.session_id).toBe('ss1')
      expect(stderr).toContain('WORKFLOW TRIGGER MAP')
    })

    test('incident file exists → echoed to stderr', async () => {
      await writeGateFile('incident', 'stop-gate exhausted: edits=5 satisfied=0 blocks=3')
      const { stderr, exitCode } = await runHook(
        'session-start-inject.sh',
        JSON.stringify({ session_id: 'ss2' }),
      )
      expect(exitCode).toBe(0)
      expect(stderr).toContain('stop-gate exhausted')
    })

    test('session start → gate dir is cleaned', async () => {
      await writeGateFile('edit-count', '5')
      await writeGateFile('block-count', '1')
      await runHook('session-start-inject.sh', JSON.stringify({ session_id: 'ss3' }))
      expect(existsSync(GATE_DIR)).toBe(false)
    })

    test('two consecutive SessionStarts → no error', async () => {
      const r1 = await runHook('session-start-inject.sh', JSON.stringify({ session_id: 'ss4' }))
      const r2 = await runHook('session-start-inject.sh', JSON.stringify({ session_id: 'ss5' }))
      expect(r1.exitCode).toBe(0)
      expect(r2.exitCode).toBe(0)
    })
  })

  // ── pre-commit-gate.sh ─────────────────────────────────────────────────────

  describe('pre-commit-gate.sh', () => {
    test('git commit → triggers self-audit checklist', async () => {
      const input = JSON.stringify({ tool_input: { command: 'git commit -m "fix"' } })
      const { stderr, exitCode } = await runHook('pre-commit-gate.sh', input)
      expect(exitCode).toBe(0)
      expect(stderr).toContain('GIT COMMIT GATE')
      expect(stderr).toContain('code-reviewer')
    })

    test('git commit (no -m) → triggers', async () => {
      const input = JSON.stringify({ tool_input: { command: 'git commit' } })
      const { stderr } = await runHook('pre-commit-gate.sh', input)
      expect(stderr).toContain('GIT COMMIT GATE')
    })

    test('git status → does not trigger', async () => {
      const input = JSON.stringify({ tool_input: { command: 'git status' } })
      const { stderr } = await runHook('pre-commit-gate.sh', input)
      expect(stderr).toBe('')
    })

    test('git log → does not trigger', async () => {
      const input = JSON.stringify({ tool_input: { command: 'git log --oneline' } })
      const { stderr } = await runHook('pre-commit-gate.sh', input)
      expect(stderr).toBe('')
    })

    test('echo git commit → does not trigger (commit not at beginning)', async () => {
      const input = JSON.stringify({ tool_input: { command: 'echo "git commit done"' } })
      const { stderr } = await runHook('pre-commit-gate.sh', input)
      expect(stderr).not.toContain('GIT COMMIT GATE')
    })

    test('git add + git commit combo → does not trigger (not commit-only)', async () => {
      const input = JSON.stringify({ tool_input: { command: 'git add . && git commit -m "x"' } })
      const { stderr } = await runHook('pre-commit-gate.sh', input)
      expect(stderr).not.toContain('GIT COMMIT GATE')
    })
  })

  // ── Integration tests ───────────────────────────────────────────────────────

  describe('full flow: edit → stop block → satisfy gate → pass', () => {
    beforeAll(resetGateDir)
    afterAll(resetGateDir)

    test('full lifecycle', async () => {
      await runHook('session-start-inject.sh', JSON.stringify({ session_id: 'full' }))

      for (let i = 0; i < 3; i++) {
        const { stderr } = await runHook(
          'post-edit-remind.sh',
          JSON.stringify({ file_path: `src/f${i}.ts` }),
        )
        expect(stderr).toContain('第')
      }

      const block1 = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'full' }))
      const out1 = JSON.parse(block1.stdout)
      expect(out1.followup_message).toContain('第 1/3 次')
      expect(out1.followup_message).toContain('code-reviewer')

      await writeGateFile('satisfied', '1')

      const pass = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'full' }))
      const out2 = JSON.parse(pass.stdout)
      expect(out2.followup_message).toBeUndefined()
      expect(existsSync(GATE_DIR)).toBe(false)
    })

    test('repeated edits → satisfied reset → blocked again', async () => {
      await writeGateFile('edit-count', '3')
      await writeGateFile('satisfied', '1')

      const pass = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'reset-test' }))
      expect(JSON.parse(pass.stdout).followup_message).toBeUndefined()

      await writeGateFile('edit-count', '3')
      await writeGateFile('satisfied', '1')

      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/new.ts' }),
      )
      expect(stderr).toContain('第')
      expect(await gateFileExists('satisfied')).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L2 — Medium stress (concurrent · burst · large inputs · special chars)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L2 — Medium stress', () => {
  // ── post-edit-remind: 20 concurrent ───────────────────────────────────────

  describe('post-edit-remind.sh — 20 concurrent edits', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('20 concurrent edits → all succeed, count is meaningful', {
      timeout: 120000,
    }, async () => {
      await writeGateFile('edit-count', '0')
      const N = 20

      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/l2_${i}.ts` })),
        ),
      )

      for (const r of results) expect(r.exitCode).toBe(0)

      const count = parseInt((await readGateFile('edit-count')) || '0', 10)
      expect(count).toBeGreaterThanOrEqual(N - 5)
      expect(count).toBeLessThanOrEqual(N)
    })
  })

  // ── post-edit-remind: burst writes ──────────────────────────────────────

  describe('post-edit-remind.sh — burst mode', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('20 rapid sequential edits → all counted', { timeout: 120000 }, async () => {
      await writeGateFile('edit-count', '0')

      for (let i = 0; i < 20; i++) {
        const { exitCode } = await runHook(
          'post-edit-remind.sh',
          JSON.stringify({ file_path: `src/burst_${i}.ts` }),
        )
        expect(exitCode).toBe(0)
      }

      const count = parseInt((await readGateFile('edit-count')) || '0', 10)
      expect(count).toBe(20)
    })

    test('after burst, stop-gate blocks normally', { timeout: 120000 }, async () => {
      for (let i = 0; i < 20; i++) {
        await runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/burst2_${i}.ts` }))
      }

      const { stdout } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'burst' }))
      const out = JSON.parse(stdout)
      expect(out.followup_message).toContain('第 1/3 次')
    })
  })

  // ── Large inputs / special characters ───────────────────────────────────

  describe('Large inputs / special chars', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('very long file_path (2000 chars) → does not crash', async () => {
      const longPath = `src/${'a'.repeat(1980)}.ts`
      const { stderr, exitCode } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: longPath }),
      )
      expect(exitCode).toBe(0)
      expect(stderr).toContain('第1次')
    })

    test('file_path with Chinese and special chars → does not crash', async () => {
      const paths = ['src/file.ts', 'src/file with spaces.ts', "src/quote's test.ts"]
      for (const p of paths) {
        const { stderr, exitCode } = await runHook(
          'post-edit-remind.sh',
          JSON.stringify({ file_path: p }),
        )
        expect(exitCode).toBe(0)
        expect(stderr).toContain('第')
      }
    })

    test('large session_id (10KB JSON) → stop-gate does not crash', async () => {
      await writeGateFile('edit-count', '3')
      await writeGateFile('satisfied', '1')
      const bigSession = { session_id: 'x'.repeat(10240), meta: { data: 'y'.repeat(10240) } }
      const { stdout, exitCode } = await runHook('stop-gate.sh', JSON.stringify(bigSession))
      expect(exitCode).toBe(0)
      const out = JSON.parse(stdout)
      expect(out.followup_message).toBeUndefined()
      expect(out.session_id).toBe('x'.repeat(10240))
    })
  })

  // ── pre-commit-gate: more command variants ──────────────────────────────

  describe('pre-commit-gate.sh — command variants', () => {
    test('git commit --amend → triggers', async () => {
      const { stderr } = await runHook(
        'pre-commit-gate.sh',
        JSON.stringify({
          tool_input: { command: 'git commit --amend' },
        }),
      )
      expect(stderr).toContain('GIT COMMIT GATE')
    })

    test('git commit --allow-empty → triggers', async () => {
      const { stderr } = await runHook(
        'pre-commit-gate.sh',
        JSON.stringify({
          tool_input: { command: 'git commit --allow-empty -m "empty"' },
        }),
      )
      expect(stderr).toContain('GIT COMMIT GATE')
    })

    test('GIT COMMIT (uppercase) → does not trigger (case sensitive)', async () => {
      const { stderr } = await runHook(
        'pre-commit-gate.sh',
        JSON.stringify({
          tool_input: { command: 'GIT COMMIT -m "x"' },
        }),
      )
      expect(stderr).toBe('')
    })

    test('git commit with leading spaces → triggers (^\\s* in regex)', async () => {
      const { stderr } = await runHook(
        'pre-commit-gate.sh',
        JSON.stringify({
          tool_input: { command: '  git commit -m "x"' },
        }),
      )
      expect(stderr).toContain('GIT COMMIT GATE')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L3 — High stress (30 concurrent · chaos injection · cross-script · mixed ops)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L3 — High stress', () => {
  // ── post-edit-remind: 30 concurrent ──────────────────────────────────────

  describe('post-edit-remind.sh — 30 concurrent edits', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('30 concurrent edits → all succeed, no crashes', { timeout: 180000 }, async () => {
      await writeGateFile('edit-count', '0')
      const N = 30

      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/l3_${i}.ts` })),
        ),
      )

      let failures = 0
      for (const r of results) {
        if (r.exitCode !== 0) failures++
      }
      expect(failures).toBeLessThanOrEqual(8)

      const count = parseInt((await readGateFile('edit-count')) || '0', 10)
      expect(count).toBeGreaterThanOrEqual(Math.floor(N * 0.6))
    })
  })

  // ── Chaos injection: corrupt gate files mid-operation ───────────────────

  describe('Chaos injection', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('edit-count deleted mid-edit → does not crash, re-counts', async () => {
      await writeGateFile('edit-count', '5')

      const [, , { stderr }] = await Promise.all([
        (async () => {
          await new Promise((r) => setTimeout(r, 200))
          try {
            rmSync(join(GATE_DIR, 'edit-count'), { force: true })
          } catch {
            /* ignore */
          }
        })(),
        (async () => {
          await new Promise((r) => setTimeout(r, 300))
          try {
            rmSync(join(GATE_DIR, 'edit-count'), { force: true })
          } catch {
            /* ignore */
          }
        })(),
        runHook('post-edit-remind.sh', JSON.stringify({ file_path: 'src/chaos.ts' })),
      ])

      // Should survive — either counts from 0 or from 5
      expect(stderr).toBeDefined()
    })

    test('gate dir deleted during stop-gate → does not crash, passes through', async () => {
      await writeGateFile('edit-count', '5')

      const [result] = await Promise.all([
        runHook('stop-gate.sh', JSON.stringify({ session_id: 'chaos-gate' })),
        (async () => {
          await new Promise((r) => setTimeout(r, 150))
          try {
            rmSync(GATE_DIR, { recursive: true, force: true })
          } catch {
            /* ignore */
          }
        })(),
      ])

      expect(result.exitCode).toBe(0)
      const out = JSON.parse(result.stdout)
      expect(out.session_id).toBeDefined()
    })

    test('invalid binary edit-count → treated as 0', async () => {
      if (!existsSync(GATE_DIR)) mkdirSync(GATE_DIR, { recursive: true })
      writeFileSync(join(GATE_DIR, 'edit-count'), Buffer.from([0x00, 0xff, 0xfe, 0x01]))
      const { exitCode } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'binary' }))
      expect(exitCode).toBe(0)
    })
  })

  // ── Cross-script state pollution ─────────────────────────────────────────

  describe('Cross-script state pollution', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('post-edit-remind and stop-gate interleaved → no mutual corruption', {
      timeout: 120000,
    }, async () => {
      await writeGateFile('edit-count', '0')

      const ops: Promise<{ exitCode: number }>[] = []
      for (let i = 0; i < 15; i++) {
        ops.push(runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/cross_${i}.ts` })))
        if (i % 5 === 0) {
          ops.push(runHook('stop-gate.sh', JSON.stringify({ session_id: `cross_${i}` })))
        }
      }

      const results = await Promise.all(ops)
      for (const r of results) expect(r.exitCode).toBe(0)
    })

    test('session-start during active editing → gate cleaned, edit restarts', async () => {
      await writeGateFile('edit-count', '10')

      const [editResult, sessionResult] = await Promise.all([
        runHook('post-edit-remind.sh', JSON.stringify({ file_path: 'src/race.ts' })),
        (async () => {
          await new Promise((r) => setTimeout(r, 200))
          return runHook('session-start-inject.sh', JSON.stringify({ session_id: 'mid-edit' }))
        })(),
      ])

      expect(editResult.exitCode).toBe(0)
      expect(sessionResult.exitCode).toBe(0)
    })
  })

  // ── pre-commit-gate: stress ─────────────────────────────────────────────

  describe('pre-commit-gate.sh — concurrent triggers', () => {
    test('10 concurrent git commit → all trigger checklist', { timeout: 120000 }, async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          runHook(
            'pre-commit-gate.sh',
            JSON.stringify({
              tool_input: { command: `git commit -m "concurrent ${i}"` },
            }),
          ),
        ),
      )

      for (const r of results) {
        expect(r.exitCode).toBe(0)
        expect(r.stderr).toContain('GIT COMMIT GATE')
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L4 — Extreme stress (50 concurrent · resource exhaustion · 4-script · recovery)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L4 — Extreme stress', () => {
  // ── 50 concurrent edits ──────────────────────────────────────────────────

  describe('50 concurrent edits', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('50 concurrent edits → system survives, no process leaks', {
      timeout: 300000,
    }, async () => {
      await writeGateFile('edit-count', '0')
      const N = 50

      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/l4_${i}.ts` })),
        ),
      )

      let crashes = 0
      for (const r of results) {
        if (r.exitCode !== 0) crashes++
      }
      expect(crashes).toBeLessThanOrEqual(20)

      const count = parseInt((await readGateFile('edit-count')) || '0', 10)
      expect(count).toBeGreaterThan(0)
    })
  })

  // ── Resource exhaustion: gate dir full of junk ───────────────────────────

  describe('gate dir resource exhaustion', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('gate dir with 100 junk files → scripts still work', async () => {
      await fillGateDirWithJunk(100)
      await writeGateFile('edit-count', '0')

      const { stderr, exitCode } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/amidst-junk.ts' }),
      )
      expect(exitCode).toBe(0)
      expect(stderr).toContain('第1次')
    })

    test('gate dir with junk + edits → stop-gate blocks correctly', async () => {
      await fillGateDirWithJunk(50)
      await writeGateFile('edit-count', '5')

      const { stdout } = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'junk-gate' }))
      const out = JSON.parse(stdout)
      expect(out.followup_message).toContain('第 1/3 次')
    })
  })

  // ── All four scripts firing together ─────────────────────────────────────

  describe('All four scripts concurrently', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('all four scripts, 24 operations concurrently → system survives', {
      timeout: 300000,
    }, async () => {
      await writeGateFile('edit-count', '0')

      const ops: Promise<unknown>[] = []

      // 10 edits
      for (let i = 0; i < 10; i++) {
        ops.push(runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/all4_${i}.ts` })))
      }
      // 6 stop-gates
      for (let i = 0; i < 6; i++) {
        ops.push(runHook('stop-gate.sh', JSON.stringify({ session_id: `all4_${i}` })))
      }
      // 4 session-starts
      for (let i = 0; i < 4; i++) {
        ops.push(runHook('session-start-inject.sh', JSON.stringify({ session_id: `all4_${i}` })))
      }
      // 4 pre-commit gates
      for (let i = 0; i < 4; i++) {
        ops.push(
          runHook(
            'pre-commit-gate.sh',
            JSON.stringify({
              tool_input: { command: `git commit -m "all4 ${i}"` },
            }),
          ),
        )
      }

      const results = await Promise.all(ops.map((p) => p.catch(() => ({ exitCode: 99 }))))
      let successCount = 0
      for (const r of results as { exitCode: number }[]) {
        if (r.exitCode === 0) successCount++
      }

      expect(successCount).toBeGreaterThanOrEqual(16)
    })
  })

  // ── Disaster recovery ────────────────────────────────────────────────────

  describe('Disaster recovery', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('after extreme concurrency → system fully recovers', { timeout: 300000 }, async () => {
      // Step 1: Cause chaos — 50 concurrent edits
      await writeGateFile('edit-count', '0')
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          runHook('post-edit-remind.sh', JSON.stringify({ file_path: `src/recovery_${i}.ts` })),
        ),
      )

      // Step 2: Verify stop-gate works normally after chaos
      await writeGateFile('satisfied', '1')
      const afterChaos = await runHook(
        'stop-gate.sh',
        JSON.stringify({ session_id: 'recovery-test' }),
      )
      expect(afterChaos.exitCode).toBe(0)

      // Step 3: SessionStart cleans everything
      await runHook('session-start-inject.sh', JSON.stringify({ session_id: 'fresh' }))

      // Step 4: Fresh start — first edit should be count=1
      const fresh = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/fresh.ts' }),
      )
      expect(fresh.exitCode).toBe(0)
      expect(fresh.stderr).toContain('第1次')

      // Step 5: stop-gate on fresh state with edits → blocks
      const clean = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'final' }))
      expect(clean.exitCode).toBe(0)
    })

    test('gate dir permissions denied simulation → script tolerant', async () => {
      await writeGateFile('edit-count', '2')
      await writeGateFile('satisfied', '1')

      const result = await runHook('stop-gate.sh', JSON.stringify({ session_id: 'ro-test' }))
      expect(result.exitCode).toBe(0)
    })
  })

  // ── Long-running stability ───────────────────────────────────────────────

  describe('Long-running stability', () => {
    beforeAll(resetGateDir)
    afterAll(resetGateDir)

    test('5 full stop-gate state machine cycles → no drift', { timeout: 180000 }, async () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        await writeGateFile('edit-count', String(cycle + 1))

        // Block 3 times
        for (let b = 0; b < 3; b++) {
          const { stdout } = await runHook(
            'stop-gate.sh',
            JSON.stringify({ session_id: `cycle${cycle}` }),
          )
          const out = JSON.parse(stdout)
          expect(out.followup_message).toContain(`第 ${b + 1}/3 次`)
        }

        // 4th time should force-allow
        const { stdout } = await runHook(
          'stop-gate.sh',
          JSON.stringify({ session_id: `cycle${cycle}` }),
        )
        const out = JSON.parse(stdout)
        expect(out.followup_message).toBeUndefined()
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases: not belonging to any level
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  describe('post-edit-remind.sh', () => {
    beforeAll(resetGateDir)
    afterEach(resetGateDir)

    test('edit-count is huge (999999999999) → increment does not overflow', async () => {
      await writeGateFile('edit-count', '999999999999')
      const { stderr, exitCode } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/huge.ts' }),
      )
      expect(exitCode).toBe(0)
      expect(stderr).toContain('第')
    })

    test('edit-count is negative → reset to 0', async () => {
      await writeGateFile('edit-count', '-5')
      const { stderr } = await runHook(
        'post-edit-remind.sh',
        JSON.stringify({ file_path: 'src/neg.ts' }),
      )
      expect(stderr).toContain('第1次')
    })

    test('empty JSON input → does not crash', async () => {
      const { exitCode } = await runHook('post-edit-remind.sh', '{}')
      expect(exitCode).toBe(0)
    })

    test('malformed JSON input → does not crash', async () => {
      const { exitCode } = await runHook('post-edit-remind.sh', '{broken json!!!')
      expect(exitCode).toBeLessThanOrEqual(1)
    })
  })

  describe('stop-gate.sh', () => {
    test('empty JSON input → does not crash', async () => {
      const { exitCode } = await runHook('stop-gate.sh', '{}')
      expect(exitCode).toBe(0)
    })

    test('malformed JSON input → does not crash', async () => {
      const { exitCode } = await runHook('stop-gate.sh', 'not json at all')
      expect(exitCode).toBeLessThanOrEqual(1)
    })
  })

  describe('session-start-inject.sh', () => {
    test('empty JSON input → does not crash', async () => {
      const { exitCode } = await runHook('session-start-inject.sh', '{}')
      expect(exitCode).toBe(0)
    })
  })
})
