#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# PostToolUse hook: code-reviewer reminder
# Fires after every Write/Edit. Injects a brief reminder that the changed file
# needs code review. The reminder intensity scales with session edit count.
#
# Based on: a-team PostToolUse reminder pattern
# Reference: docs/research/agent-instruction-following-solutions.md
# ═══════════════════════════════════════════════════════════════════════════════

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).file_path||'')}catch{console.log('')}})")

if [ -z "$FILE_PATH" ]; then
  echo "$INPUT"
  exit 0
fi

# Track edit count in shared gate directory (per-session)
# Also invalidates any prior gate satisfaction — new edits need new review
GATE_DIR="${HOME}/.claude-code-haha-gate"
mkdir -p "$GATE_DIR"
TRACK_FILE="$GATE_DIR/edit-count"

# Increment edit count (mkdir-based mutex for cross-platform atomicity)
LOCKDIR="$GATE_DIR/.edit-count.lock"
for _ in $(seq 1 50); do
  if mkdir "$LOCKDIR" 2>/dev/null; then
    COUNT=$(cat "$TRACK_FILE" 2>/dev/null || echo 0)
    [[ "$COUNT" =~ ^[0-9]+$ ]] || COUNT=0
    COUNT=$((COUNT + 1))
    echo "$COUNT" > "$TRACK_FILE"
    rmdir "$LOCKDIR"
    break
  fi
  sleep 0.02
done
# Re-read from file (subshell not used, but safe to keep this pattern)
COUNT=$(cat "$TRACK_FILE" 2>/dev/null || echo 0)
[[ "$COUNT" =~ ^[0-9]+$ ]] || COUNT=0

[ -f "$GATE_DIR/satisfied" ] && rm -f "$GATE_DIR/satisfied"

# Escalate reminder after 5 edits
if [ "$COUNT" -le 5 ]; then
  LEVEL="💡 提醒"
elif [ "$COUNT" -le 10 ]; then
  LEVEL="⚠️  建议"
else
  LEVEL="🚨 强烈建议"
fi

cat >&2 <<EOF
[Hook] ${LEVEL}: 文件已修改 (本次会话第${COUNT}次编辑)
[Hook] → 修改文件: ${FILE_PATH}
[Hook] → 累计编辑: ${COUNT} 个文件
[Hook] → 建议: 运行 code-reviewer agent 审查变更
EOF

echo "$INPUT"
exit 0
