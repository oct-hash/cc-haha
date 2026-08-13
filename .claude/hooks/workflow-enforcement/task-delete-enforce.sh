#!/usr/bin/env bash
# PreToolUse hook: blocks TaskUpdate with status="completed"
# Forces models to use status="deleted" instead per user feedback rule.
set -euo pipefail

# Read the hook input from stdin
INPUT=$(cat)

# Extract tool_name and status from the JSON input
TOOL_NAME=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_name||'')}catch(e){console.log('')}})")
TOOL_STATUS=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_input?.status||'')}catch(e){console.log('')}})")

if [ "$TOOL_NAME" = "TaskUpdate" ] && [ "$TOOL_STATUS" = "completed" ]; then
  echo '[Hook] ⛔ TaskUpdate status="completed" 被拦截 — 请改用 status="deleted"' >&2
  echo '[Hook] 规则: Task完成后直接删，不要留 completed 状态' >&2
  exit 2
fi

exit 0
