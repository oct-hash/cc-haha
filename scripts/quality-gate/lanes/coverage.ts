// Coverage check with ratcheted baseline

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileExists, readJSON, writeJSON } from '../utils/helpers';
import type {
  CoverageBaseline,
  CoverageSuiteSummary,
  DetailItem,
  LaneExecutionContext,
  LaneResult,
} from './types';

const BASELINE_PATH_RELATIVE = 'scripts/quality-gate/data/coverage-baseline.json';

/**
 * Parse bun test --coverage text output.
 * Bun outputs a table like:
 * -----------------------------------------------------|---------|---------|-------------------
 * File                                                  | % Funcs | % Lines | Uncovered Line #s
 * -----------------------------------------------------|---------|---------|-------------------
 * All files                                             |   34.07 |   44.97 |
 */
function parseCoverageTable(text: string): CoverageBaseline['metrics'] | null {
  const lines = text.split(/\r?\n/);
  const allFilesLine = lines.find((l) => /^All files\b/i.test(l.trim()));

  if (!allFilesLine) return null;

  const parts = allFilesLine
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const parsePct = (s: string) => {
    const num = Number.parseFloat(s);
    return Number.isNaN(num) ? 0 : num;
  };

  // Bun coverage only reports % Funcs and % Lines (no statements/branches)
  return {
    statements: { pct: 0, covered: 0, total: 0 },
    branches: { pct: 0, covered: 0, total: 0 },
    functions: { pct: parsePct(parts[1]), covered: 0, total: 0 },
    lines: { pct: parsePct(parts[2]), covered: 0, total: 0 },
  };
}

function compareMetrics(
  current: CoverageBaseline['metrics'],
  baseline: CoverageBaseline['metrics'],
): DetailItem[] {
  const details: DetailItem[] = [];
  // Bun only reports functions and lines; skip statements/branches (always 0)
  const keys: (keyof CoverageBaseline['metrics'])[] = ['functions', 'lines'];

  for (const key of keys) {
    const cur = current[key];
    const base = baseline[key];
    const diff = cur.pct - base.pct;
    const diffStr = diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;

    if (cur.pct < base.pct) {
      details.push({
        label: `${key}: ${cur.pct.toFixed(1)}% (baseline: ${base.pct.toFixed(1)}%, ${diffStr})`,
        status: 'error',
        message: 'Coverage dropped below baseline — ratchet violation',
      });
    } else if (cur.pct > base.pct) {
      details.push({
        label: `${key}: ${cur.pct.toFixed(1)}% (baseline: ${base.pct.toFixed(1)}%, ${diffStr})`,
        status: 'ok',
        message: 'Coverage improved',
      });
    } else {
      details.push({
        label: `${key}: ${cur.pct.toFixed(1)}% (unchanged)`,
        status: 'ok',
      });
    }
  }

  return details;
}

export async function runCoverage(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();
  const rootDir = ctx.rootDir;
  const baselinePath = join(rootDir, BASELINE_PATH_RELATIVE);

  // Load baseline
  let baseline = readJSON<CoverageBaseline>(baselinePath);
  if (!baseline) {
    // Create fresh baseline at 0%
    baseline = {
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metrics: {
        statements: { pct: 0, covered: 0, total: 0 },
        branches: { pct: 0, covered: 0, total: 0 },
        functions: { pct: 0, covered: 0, total: 0 },
        lines: { pct: 0, covered: 0, total: 0 },
      },
    };
    writeJSON(baselinePath, baseline);
  }

  // Check if any test files exist
  const hasTests = existsSync(join(rootDir, 'src'));
  if (!hasTests) {
    return {
      id: 'coverage',
      title: 'Coverage Gate',
      status: 'passed',
      durationMs: Date.now() - started,
      category: 'coverage',
      description: 'No source directory found — skipping coverage',
      details: [
        {
          label: 'Coverage',
          status: 'ok',
          message: 'No test files found, baseline at 0%',
        },
      ],
    };
  }

  // Run bun test --coverage
  try {
    const proc = Bun.spawn(['bun', 'test', '--coverage', '--coverage-reporter=text'], {
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    // Parse coverage table from combined output
    // bun test --coverage outputs coverage even when tests fail
    const currentMetrics = parseCoverageTable(stdout + stderr);

    if (!currentMetrics) {
      if (exitCode !== 0) {
        return {
          id: 'coverage',
          title: 'Coverage Gate',
          status: 'failed',
          durationMs: Date.now() - started,
          category: 'coverage',
          error: `bun test failed with exit code ${exitCode}`,
          details: [
            {
              label: 'Test execution',
              status: 'error',
              message: stderr.slice(0, 300) || stdout.slice(0, 300),
            },
          ],
        };
      }

      return {
        id: 'coverage',
        title: 'Coverage Gate',
        status: 'passed',
        durationMs: Date.now() - started,
        category: 'coverage',
        description: 'No coverage data (0 tests) — baseline at 0%',
        details: [
          {
            label: 'Coverage',
            status: 'ok',
            message: 'No tests found, baseline maintained at 0%',
          },
        ],
      };
    }

    const details = compareMetrics(currentMetrics, baseline.metrics);
    const hasErrors = details.some((d) => d.status === 'error');

    // Note test failures but don't block on them (coverage ratchet is the gate)
    if (exitCode !== 0) {
      details.push({
        label: 'Test suite',
        status: 'warn',
        message: `bun test exited with code ${exitCode} — some tests may be failing`,
      });
    }

    // In baseline mode, update the baseline if coverage improved or stayed same
    if (ctx.options.mode === 'baseline' && !hasErrors) {
      baseline.metrics = currentMetrics;
      baseline.updated_at = new Date().toISOString();
      writeJSON(baselinePath, baseline);
      details.push({
        label: 'Baseline updated',
        status: 'ok',
        message: new Date().toISOString(),
      });
    }

    // In release mode, also check 80% threshold
    if (ctx.options.mode === 'release') {
      for (const key of ['functions', 'lines'] as const) {
        if (currentMetrics[key].pct < 80) {
          details.push({
            label: `${key}: ${currentMetrics[key].pct.toFixed(1)}% below 80% threshold`,
            status: 'warn',
          });
        }
      }
    }

    return {
      id: 'coverage',
      title: 'Coverage Gate',
      status: hasErrors ? 'failed' : 'passed',
      durationMs: Date.now() - started,
      category: 'coverage',
      description: `Coverage ratchet check against baseline`,
      details,
    };
  } catch (err) {
    return {
      id: 'coverage',
      title: 'Coverage Gate',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'coverage',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
