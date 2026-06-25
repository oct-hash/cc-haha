// Impact report: analyze git diff to determine which lanes should run

import { getChangedFiles, globMatch } from '../utils/helpers';
import {
  type ImpactSummary,
  LANE_TRIGGERS,
  type LaneExecutionContext,
  type LaneResult,
} from './types';

export async function runImpactReport(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();
  const cwd = ctx.rootDir;

  try {
    const changedFiles = await getChangedFiles(cwd);
    const checks: string[] = [];
    const areas: string[] = [];
    const details: LaneResult['details'] = [];

    // Analyze each changed file against lane triggers
    for (const [laneId, patterns] of Object.entries(LANE_TRIGGERS)) {
      const matching = changedFiles.filter((file) =>
        patterns.some((pattern) => globMatch(pattern, file)),
      );
      if (matching.length > 0) {
        checks.push(laneId);
        areas.push(laneId);
        details.push({
          label: `${laneId}`,
          status: 'ok',
          message: `${matching.length} file(s) matched: ${matching.slice(0, 3).join(', ')}${matching.length > 3 ? '...' : ''}`,
        });
      }
    }

    // Self-test: if quality-gate scripts themselves changed, run everything
    const selfChanged = changedFiles.some((f) => f.startsWith('scripts/quality-gate/'));
    if (selfChanged) {
      for (const laneId of Object.keys(LANE_TRIGGERS)) {
        if (!checks.includes(laneId)) checks.push(laneId);
      }
      details.push({
        label: 'self-test',
        status: 'ok',
        message: 'Quality gate scripts changed — running all lanes',
      });
    }

    // Detect changed file categories
    const allMd = changedFiles.length > 0 && changedFiles.every((f) => f.endsWith('.md'));
    const srcChanged = changedFiles.some(
      (f) => f.startsWith('src/') && (f.endsWith('.ts') || f.endsWith('.tsx')),
    );

    const impact: ImpactSummary = {
      changedFiles: changedFiles.length,
      areas,
      labels: srcChanged ? ['source-changed'] : [],
      requiredChecks: checks,
    };

    return {
      id: 'impact-report',
      title: 'Impact Report',
      status: 'passed',
      durationMs: Date.now() - started,
      description: `Analyzed ${changedFiles.length} changed file(s) → ${checks.length} lane(s) required${allMd && !selfChanged ? ' (docs only)' : ''}`,
      category: 'scope',
      details: [
        {
          label: 'Changed files',
          status: 'ok',
          message: `${changedFiles.length} file(s)`,
        },
        ...(checks.length > 0
          ? [
              {
                label: 'Required lanes',
                status: 'ok' as const,
                message: checks.join(', '),
              },
            ]
          : [
              {
                label: 'Required lanes',
                status: 'ok' as const,
                message: 'none (docs-only change)',
              },
            ]),
        ...details,
      ],
    };
  } catch (err) {
    return {
      id: 'impact-report',
      title: 'Impact Report',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'scope',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
