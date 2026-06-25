// Install git pre-push hook that runs quality gate in PR mode

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const HOOK_PATH = join(process.cwd(), '.git', 'hooks', 'pre-push');

const HOOK_SCRIPT = `#!/usr/bin/env bash
# ── Quality Gate pre-push hook ──
# Installed by: bun run quality-gate:setup-pre-push
# Uninstall:    bun run scripts/quality-gate/setup-pre-push.ts --uninstall

set -euo pipefail

echo ""
echo "═══ Quality Gate [pre-push] ═══"
echo ""

bun run scripts/quality-gate/index.ts --mode pr

exit_code=$?

if [ $exit_code -ne 0 ]; then
  echo ""
  echo "Quality gate failed. Push blocked."
  echo "Use 'bun run quality-gate quarantine add' to quarantine known issues."
  echo "Or push with --no-verify to bypass (not recommended)."
  echo ""
  exit 1
fi

echo ""
exit 0
`;

const MARKER = '# ── Quality Gate pre-push hook ──';

function install(): void {
  // Ensure hooks directory exists
  const hooksDir = dirname(HOOK_PATH);
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Check if already installed
  if (existsSync(HOOK_PATH)) {
    const existing = readFileSync(HOOK_PATH, 'utf8');
    if (existing.includes(MARKER)) {
      console.log('\n  Quality Gate pre-push hook is already installed.\n');
      console.log('  To reinstall: bun run scripts/quality-gate/setup-pre-push.ts --force');
      console.log('  To uninstall: bun run scripts/quality-gate/setup-pre-push.ts --uninstall\n');
      return;
    }

    // Existing hook from another source — append
    const combined = existing.replace(/\n*$/, '\n\n') + HOOK_SCRIPT;
    writeFileSync(HOOK_PATH, combined);
    console.log('\n  Quality Gate pre-push hook appended to existing hook.\n');
  } else {
    writeFileSync(HOOK_PATH, HOOK_SCRIPT);
    console.log('\n  Quality Gate pre-push hook installed.\n');
  }

  // Make executable on Unix
  try {
    chmodSync(HOOK_PATH, 0o755);
  } catch {
    // Windows may not support chmod — that's OK
  }

  console.log(`  Hook location: ${HOOK_PATH}`);
  console.log('  Mode: pr (runs on git push)');
  console.log('  Lanes: impact-report → policy-checks → coverage → quarantine\n');
}

function uninstall(): void {
  if (!existsSync(HOOK_PATH)) {
    console.log('\n  No pre-push hook found.\n');
    return;
  }

  const existing = readFileSync(HOOK_PATH, 'utf8');
  if (!existing.includes(MARKER)) {
    console.log('\n  Quality Gate pre-push hook not found in existing hook.\n');
    return;
  }

  // Remove the quality gate block (from marker to end of file, preserving anything before)
  const markerIndex = existing.indexOf(MARKER);
  const before = existing.slice(0, markerIndex).replace(/\n+$/, '');

  if (before.trim()) {
    writeFileSync(HOOK_PATH, before + '\n');
    console.log('\n  Quality Gate pre-push hook removed. Other hook content preserved.\n');
  } else {
    // Only our hook was there — remove the file
    const { unlinkSync } = require('node:fs');
    unlinkSync(HOOK_PATH);
    console.log('\n  Quality Gate pre-push hook removed (file deleted).\n');
  }
}

// ── CLI ──

const arg = Bun.argv[2];

if (arg === '--uninstall') {
  uninstall();
} else if (arg === '--force') {
  // Force reinstall: remove existing marker block first
  if (existsSync(HOOK_PATH)) {
    const existing = readFileSync(HOOK_PATH, 'utf8');
    if (existing.includes(MARKER)) {
      const markerIndex = existing.indexOf(MARKER);
      const before = existing.slice(0, markerIndex).replace(/\n+$/, '');
      writeFileSync(HOOK_PATH, before ? before + '\n' : '');
    }
  }
  install();
} else {
  install();
}
