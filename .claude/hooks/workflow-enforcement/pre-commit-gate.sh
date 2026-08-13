#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# PreToolUse hook: git commit gate
# Fires before every Bash call. If the command is "git commit", injects a
# mandatory self-audit checklist. The agent MUST confirm all checks pass before
# the commit proceeds.
#
# Based on: Harmonist stop-hook pattern + agent-pr-flow funnel trick
# Reference: docs/research/agent-instruction-following-solutions.md
# ═══════════════════════════════════════════════════════════════════════════════

INPUT=$(cat)
CMD=$(echo "$INPUT" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).tool_input?.command||'')}catch{console.log('')}})")

# Only fire for git commit (not git status/log/diff/add etc.)
if ! echo "$CMD" | grep -qE '^\s*git\s+commit\b'; then
  echo "$INPUT"
  exit 0
fi

cat >&2 <<'EOF'
[Hook] ╔══════════════════════════════════════════════════════════════╗
[Hook] ║  GIT COMMIT GATE — 提交前强制自检 (PreToolUse)              ║
[Hook] ╠══════════════════════════════════════════════════════════════╣
[Hook] ║  □ 1. code-reviewer agent 是否已审查所有变更文件？          ║
[Hook] ║  □ 2. 是否有 console.log / debugger / 硬编码密钥？          ║
[Hook] ║  □ 3. 测试是否全部通过？                                    ║
[Hook] ║  □ 4. 是否遵循 TDD 流程（测试先行）？                       ║
[Hook] ╠══════════════════════════════════════════════════════════════╣
[Hook] ║  如果任何一项为 NO → 请先中止提交，完成后再次提交           ║
[Hook] ╚══════════════════════════════════════════════════════════════╝
EOF

echo "$INPUT"
exit 0
