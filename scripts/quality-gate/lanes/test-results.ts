// Test results lane: check test pass/fail/skip counts (not just coverage)

import type { DetailItem, LaneExecutionContext, LaneResult } from './types';

export async function runTestResults(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();

  try {
    const proc = Bun.spawn(['bun', 'test'], {
      cwd: ctx.rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const details = parseTestOutput(stdout + '\n' + stderr);

    return {
      id: 'test-results',
      title: 'Test Results',
      status: exitCode === 0 ? 'passed' : 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      description: details.find((d) => d.label === 'summary')?.message || '',
      details,
      exitCode,
    };
  } catch (err) {
    return {
      id: 'test-results',
      title: 'Test Results',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      error: err instanceof Error ? err.message : String(err),
      details: [
        {
          label: 'Test execution',
          status: 'error',
          message: `Failed to run: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

function parseTestOutput(output: string): DetailItem[] {
  const details: DetailItem[] = [];
  const lines = output.split(/\r?\n/);

  // Bun test format:
  // "(fail) testName [time]" for failures
  // "N pass" / "M fail" / "N expect() calls"
  // "Ran N tests across M files. [time]"

  let passCount = 0;
  let failCount = 0;
  const failures: string[] = [];
  let filesCount = 0;
  let testsCount = 0;

  for (const line of lines) {
    // Capture failure lines
    if (line.trim().startsWith('(fail)')) {
      failures.push(line.trim());
      failCount++;
      continue;
    }

    // Capture summary
    const passMatch = line.match(/(\d+)\s+pass/);
    if (passMatch) passCount = Number.parseInt(passMatch[1]!, 10);

    const failMatch = line.match(/(\d+)\s+fail/);
    if (failMatch) failCount = Number.parseInt(failMatch[1]!, 10);

    const ranMatch = line.match(/Ran\s+(\d+)\s+tests?\s+across\s+(\d+)\s+files?/);
    if (ranMatch) {
      testsCount = Number.parseInt(ranMatch[1]!, 10);
      filesCount = Number.parseInt(ranMatch[2]!, 10);
    }
  }

  details.push({
    label: 'summary',
    status: failCount > 0 ? 'error' : 'ok',
    message: `${testsCount} tests across ${filesCount} files: ${passCount} passed, ${failCount} failed`,
  });

  // Show first 10 failures as details
  for (const failure of failures.slice(0, 10)) {
    details.push({
      label: failure.replace(/^\(fail\)\s+/, ''),
      status: 'error',
    });
  }

  if (failures.length > 10) {
    details.push({
      label: `... and ${failures.length - 10} more failures`,
      status: 'warn',
    });
  }

  return details;
}
