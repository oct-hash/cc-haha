// TypeScript type checking lane with per-file ratcheted baseline.
// Each file's error count can only go down — never up.
// New files (not in baseline) are warned but don't block.

import { join } from 'node:path';
import { readJSON, writeJSON } from '../utils/helpers';
import type { DetailItem, LaneExecutionContext, LaneResult, TypeCheckBaseline } from './types';

const BASELINE_PATH = 'scripts/quality-gate/data/typecheck-baseline.json';

// ── tsc output parsing ────────────────────────────────────────────

interface TscError {
  file: string;
  line: number;
  level: 'error' | 'warning';
  code: string;
  message: string;
}

function parseTscAll(output: string): TscError[] {
  const errors: TscError[] = [];
  const tscPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/;
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(tscPattern);
    if (!m) continue;
    errors.push({
      file: normalizePath(m[1]!),
      line: Number.parseInt(m[2]!, 10),
      level: m[4] === 'error' ? 'error' : 'warning',
      code: `TS${m[5]}`,
      message: m[6]!,
    });
  }
  return errors;
}

/** Normalize absolute paths to project-relative: src/foo.ts */
function normalizePath(path: string): string {
  return path
    .replace(/^.*[\\/]src[\\/]/, 'src/')
    .replace(/^.*[\\/]scripts[\\/]/, 'scripts/')
    .replace(/^.*[\\/]\.claude[\\/]/, '.claude/')
    .replace(/\\/g, '/');
}

// ── Per-file counting ─────────────────────────────────────────────

function countByFile(errors: TscError[]): { perFile: Record<string, number>; total: number } {
  const perFile: Record<string, number> = {};
  let total = 0;
  for (const e of errors) {
    if (e.level !== 'error') continue;
    perFile[e.file] = (perFile[e.file] || 0) + 1;
    total++;
  }
  return { perFile, total };
}

// ── Ratchet comparison ────────────────────────────────────────────

function compareRatchet(
  current: Record<string, number>,
  baseline: Record<string, number>,
): { details: DetailItem[]; regressions: number; improvements: number; newFiles: number } {
  const details: DetailItem[] = [];
  let regressions = 0;
  let improvements = 0;
  let newFiles = 0;
  const allFiles = new Set([...Object.keys(current), ...Object.keys(baseline)]);

  for (const file of [...allFiles].sort()) {
    const cur = current[file] || 0;
    const base = baseline[file] || 0;
    const delta = cur - base;

    if (base === 0 && cur > 0) {
      // New file not in baseline
      newFiles++;
      if (cur > 5) {
        details.push({
          label: `${file} (NEW)`,
          status: 'warn',
          message: `${cur} errors — new file, consider fixing before baseline update`,
        });
      }
    } else if (delta > 0) {
      regressions++;
      details.push({
        label: `${file}: +${delta} errors (was ${base}, now ${cur})`,
        status: 'error',
        message: 'Type error regression — ratchet violation',
      });
    } else if (delta < 0) {
      improvements++;
      if (delta <= -5 || cur === 0) {
        details.push({
          label: `${file}: ${delta} errors (was ${base}, now ${cur})`,
          status: 'ok',
          message: 'Improved',
        });
      }
    }
  }

  return { details, regressions, improvements, newFiles };
}

// ── Detail formatting (capped) ────────────────────────────────────

function formatErrorDetails(errors: TscError[], maxFiles = 20): DetailItem[] {
  const byFile = new Map<string, TscError[]>();
  for (const e of errors) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file)!.push(e);
  }

  const details: DetailItem[] = [];
  const entries = [...byFile.entries()].slice(0, maxFiles);
  for (const [file, errs] of entries) {
    details.push({
      label: `${file} (${errs.length} errors)`,
      status: 'error',
      message: errs
        .slice(0, 3)
        .map((e) => `${e.line}: ${e.code}: ${e.message}`)
        .join('; '),
    });
  }
  if (byFile.size > maxFiles) {
    details.push({
      label: `... and ${byFile.size - maxFiles} more files with errors`,
      status: 'error',
      message: 'Run "bun run typecheck" for full output',
    });
  }
  return details;
}

// ── Main lane runner ──────────────────────────────────────────────

export async function runTypeCheck(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();
  const rootDir = ctx.rootDir;
  const baselinePath = join(rootDir, BASELINE_PATH);

  // 1. Run tsc
  let allErrors: TscError[] = [];
  let tscExitCode = 0;

  try {
    const proc = Bun.spawn(['bun', 'run', 'typecheck'], {
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    tscExitCode = await proc.exited;
    allErrors = parseTscAll(stdout + '\n' + stderr);
  } catch (err) {
    return {
      id: 'typecheck',
      title: 'TypeScript Type Check',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { perFile, total: errorCount } = countByFile(allErrors);

  // 2. Load or create baseline
  let baseline = readJSON<TypeCheckBaseline>(baselinePath);
  if (!baseline) {
    baseline = {
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      totalErrors: errorCount,
      totalWarnings: 0,
      perFile: {},
    };
    writeJSON(baselinePath, baseline);
  }

  // 3. Ratchet comparison (only if baseline has perFile data)
  const hasBaselineData = Object.keys(baseline.perFile).length > 0;
  let ratchetResult: ReturnType<typeof compareRatchet> | null = null;

  if (hasBaselineData) {
    ratchetResult = compareRatchet(perFile, baseline.perFile);
  }

  // 4. In baseline mode: update baseline
  if (ctx.options.mode === 'baseline') {
    baseline.totalErrors = errorCount;
    baseline.perFile = perFile;
    baseline.updated_at = new Date().toISOString();
    writeJSON(baselinePath, baseline);
  }

  // 5. Build result
  const hasRegressions = ratchetResult && ratchetResult.regressions > 0;
  const status =
    errorCount === 0 ? 'passed' : hasRegressions ? 'failed' : tscExitCode !== 0 ? 'warn' : 'passed';

  // Build details
  const details: DetailItem[] = [];

  details.push({
    label: 'Summary',
    status: errorCount === 0 ? 'ok' : hasRegressions ? 'error' : 'warn',
    message: `${errorCount} errors across ${Object.keys(perFile).length} files`,
  });

  if (hasBaselineData && ratchetResult) {
    const prevTotal = baseline.totalErrors;
    const delta = errorCount - prevTotal;
    const sign = delta <= 0 ? '' : '+';
    details.push({
      label: 'vs baseline',
      status: delta > 0 ? 'error' : delta < 0 ? 'ok' : 'ok',
      message: `${sign}${delta} (was ${prevTotal}), ${ratchetResult.regressions} regressions, ${ratchetResult.improvements} improved, ${ratchetResult.newFiles} new files`,
    });

    // Show regression details (max 15)
    details.push(...ratchetResult.details.slice(0, 15));

    // Show improvements summary
    if (ratchetResult.improvements > 0 && ratchetResult.improvements <= 10) {
      const improved = ratchetResult.details.filter((d) => d.status === 'ok');
      details.push(...improved.slice(0, 5));
    }

    // In baseline mode, confirm update
    if (ctx.options.mode === 'baseline') {
      details.push({
        label: 'Baseline updated',
        status: 'ok',
        message: `Stored ${errorCount} errors across ${Object.keys(perFile).length} files`,
      });
    }
  } else {
    // No baseline yet — show sample errors
    details.push(...formatErrorDetails(allErrors, 15));
  }

  return {
    id: 'typecheck',
    title: 'TypeScript Type Check',
    status,
    durationMs: Date.now() - started,
    category: 'unit',
    description: ratchetResult
      ? `${errorCount} errors — ${ratchetResult.regressions} regressions, ${ratchetResult.improvements} improved`
      : `${errorCount} errors (no baseline)`,
    details,
    exitCode: tscExitCode,
  };
}
