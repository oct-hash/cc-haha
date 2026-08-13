#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# SessionStart hook: workflow trigger map injection
# Injects the agent/skill-to-task mapping at session start, so the model has
# clear decision rules for when to use which tool.
#
# Based on: a-team SessionStart injection pattern
# Reference: docs/research/agent-instruction-following-solutions.md
# ═══════════════════════════════════════════════════════════════════════════════

INPUT=$(cat)

# Clean up stale gate state from previous sessions
GATE_DIR="${HOME}/.claude-code-haha-gate"
if [ -d "$GATE_DIR" ]; then
  if [ -f "$GATE_DIR/incident" ]; then
    cat "$GATE_DIR/incident" >&2
  fi
  rm -rf "$GATE_DIR"
fi

cat >&2 <<'EOF'
[Hook] ╔══════════════════════════════════════════════════════════════════╗
[Hook] ║  WORKFLOW TRIGGER MAP — 本次会话强制执行规则                    ║
[Hook] ╠══════════════════════════════════════════════════════════════════╣
[Hook] ║                                                               ║
[Hook] ║  📋 MUST (Hook 强制执行，不可跳过):                            ║
[Hook] ║    • git commit 前 → PreToolUse gate 自检清单                  ║
[Hook] ║    • 危险命令 (rm -rf, force push) → 自动阻止                  ║
[Hook] ║                                                               ║
[Hook] ║  🧩 SHOULD (每次都应该，Hook 提醒):                            ║
[Hook] ║    • 每次 Write/Edit 后 → 累计提醒 code-reviewer               ║
[Hook] ║    • 多文件变更 → 使用 planner agent 先规划                     ║
[Hook] ║    • 新功能/bug 修复 → 使用 tdd-guide agent                    ║
[Hook] ║                                                               ║
[Hook] ║  🔧 AVAILABLE (本次会话可用工具):                              ║
[Hook] ║    • 49 custom agents (~/.claude/agents/)                      ║
[Hook] ║    • 14 MCP servers (context7, github, gbrain, exa...)        ║
[Hook] ║    • 156+ skills (ecc + superpowers)                          ║
[Hook] ║    • mem-lite: 222 observations available                     ║
[Hook] ║                                                               ║
[Hook] ║  📖 参考: docs/research/agent-instruction-following-solutions.md ║
[Hook] ╚══════════════════════════════════════════════════════════════════╝
EOF

echo "$INPUT"
exit 0
