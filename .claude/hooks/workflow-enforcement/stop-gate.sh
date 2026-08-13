#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Stop hook: Harmonist-style session gate
# Validates that code-reviewer and tests were run before allowing session end.
# Blocks up to 3 times with followup_message, then force-allows with incident.
#
# Based on: Harmonist stop-hook gate pattern
# Reference: docs/research/agent-instruction-following-solutions.md §3.2 Layer 3
# ═══════════════════════════════════════════════════════════════════════════════

INPUT=$(cat)
GATE_DIR="${HOME}/.claude-code-haha-gate"

# ── Parse current state (with integer validation) ─────────────────────────────
_read_int() {
  local file="$1"
  local default="${2:-0}"
  local val
  val=$(cat "$file" 2>/dev/null || echo "$default")
  [[ "$val" =~ ^[0-9]+$ ]] && echo "$val" || echo "$default"
}

EDIT_COUNT=$(_read_int "$GATE_DIR/edit-count" 0)
SATISFIED=$([ -f "$GATE_DIR/satisfied" ] && echo 1 || echo 0)
BLOCK_COUNT=$(_read_int "$GATE_DIR/block-count" 0)

# ── Guard: prevent rm -rf on empty/unset directory ────────────────────────────
_cleanup() {
  [ -n "${GATE_DIR:-}" ] && [ -d "$GATE_DIR" ] && rm -rf "$GATE_DIR"
}

# ── No edits this session → nothing to check, allow end ──────────────────────
if [ "$EDIT_COUNT" -eq 0 ]; then
  _cleanup
  echo "$INPUT"
  exit 0
fi

# ── Gate already satisfied → allow end ───────────────────────────────────────
if [ "$SATISFIED" -eq 1 ]; then
  _cleanup
  echo "$INPUT"
  exit 0
fi

# ── Retry limit exhausted → force-allow with incident ────────────────────────
if [ "$BLOCK_COUNT" -ge 3 ]; then
  cat >&2 <<'EOF'
[Hook] ╔══════════════════════════════════════════════════════════════╗
[Hook] ║  STOP GATE — 已阻止 3 次，强制放行                          ║
[Hook] ║  未完成项将记录 incident 带入下一会话                       ║
[Hook] ╚══════════════════════════════════════════════════════════════╝
EOF
  echo "stop-gate exhausted: edits=$EDIT_COUNT satisfied=$SATISFIED blocks=$BLOCK_COUNT" > "$GATE_DIR/incident"
  rm -f "$GATE_DIR/block-count"
  echo "$INPUT"
  exit 0
fi

# ── Block: gate not satisfied ────────────────────────────────────────────────
BLOCK_COUNT=$((BLOCK_COUNT + 1))
echo "$BLOCK_COUNT" > "$GATE_DIR/block-count"

cat >&2 <<EOF
[Hook] ╔══════════════════════════════════════════════════════════════╗
[Hook] ║  STOP GATE — 会话结束前强制检查 (第 ${BLOCK_COUNT}/3 次)    ║
[Hook] ╠══════════════════════════════════════════════════════════════╣
[Hook] ║  □ code-reviewer agent 是否已审查所有变更？                 ║
[Hook] ║  □ bun test 是否全部通过？                                  ║
[Hook] ║  □ 无 console.log / debugger / 硬编码密钥？                 ║
[Hook] ╠══════════════════════════════════════════════════════════════╣
[Hook] ║  完成后运行以下命令标记门禁通过:                            ║
[Hook] ║  mkdir -p ${HOME}/.claude-code-haha-gate && echo 1 >        ║
[Hook] ║    ${HOME}/.claude-code-haha-gate/satisfied                 ║
[Hook] ╚══════════════════════════════════════════════════════════════╝
EOF

FOLLOWUP="Stop Gate 第 ${BLOCK_COUNT}/3 次 — 会话已编辑 ${EDIT_COUNT} 个文件但未通过门禁检查。请：1) 运行 code-reviewer agent 审查所有变更文件；2) 运行 bun test 确认全部通过；3) 完成后执行: mkdir -p ${HOME}/.claude-code-haha-gate && echo 1 > ${HOME}/.claude-code-haha-gate/satisfied"

# Pass FOLLOWUP via env to avoid shell→JS code injection
# Must pipe INPUT back in — stdin was consumed by INPUT=$(cat) above
echo "$INPUT" | FOLLOWUP_MSG="$FOLLOWUP" node -e "
  process.stdin.on('data', d => {
    const j = JSON.parse(d);
    j.followup_message = process.env.FOLLOWUP_MSG;
    console.log(JSON.stringify(j));
  })
"
exit 0
