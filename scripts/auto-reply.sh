#!/bin/bash
# auto-reply.sh - Claude Code 自动检查并回复讨论文件
# 由 Windows Task Scheduler 每 2 分钟触发一次

PROJECT_ROOT="D:/claude-code-haha"
DISCUSSION_FILE="$PROJECT_ROOT/PROJECT_DISCUSSION.md"
STATE_FILE="$PROJECT_ROOT/bridge/openclaw_discuss_state.json"
TRIGGER_FILE="$PROJECT_ROOT/bridge/trigger/openclaw.trigger"
LOG_FILE="$PROJECT_ROOT/bridge/logs/auto-reply.log"
ACK_DIR="$PROJECT_ROOT/bridge/ack"
FAILED_DIR="$PROJECT_ROOT/bridge/failed"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

write_ack() {
    local recipient="$1"
    local entry_type="$2"
    mkdir -p "$ACK_DIR"
    local ack_file="$ACK_DIR/${recipient}_${entry_type}.ack"
    echo "{\"timestamp\": \"$(date '+%Y-%m-%dT%H:%M:%S+08:00')\", \"recipient\": \"$recipient\", \"type\": \"$entry_type\"}" > "$ack_file"
    log "ACK written: $ack_file"
}

write_failed() {
    local entry_type="$1"
    local error_msg="$2"
    local payload="$3"
    mkdir -p "$FAILED_DIR"
    local failed_file="$FAILED_DIR/${entry_type}_$(date '+%Y%m%d%H%M%S').json"
    echo "{\"timestamp\": \"$(date '+%Y-%m-%dT%H:%M:%S+08:00')\", \"type\": \"$entry_type\", \"error\": \"$error_msg\", \"payload\": $payload, \"retry_count\": 0}" > "$failed_file"
    log "Failed entry written: $failed_file"
}

check_ack() {
    local from="$1"
    local ack_file="$ACK_DIR/${from}_claude_message.ack"
    if [ -f "$ack_file" ]; then
        log "ACK received from $from"
        rm -f "$ack_file"
        return 0
    fi
    return 1
}

log "=== Auto-Reply 触发 ==="

# 检查讨论文件是否存在
if [ ! -f "$DISCUSSION_FILE" ]; then
    log "讨论文件不存在，跳过"
    exit 0
fi

# 获取当前文件的 Claude Code 发言数
claude_count=$(grep -c '\*\*Claude Code\*\*' "$DISCUSSION_FILE" 2>/dev/null || echo 0)
openclaw_count=$(grep -c '\*\*OpenClaw\*\*' "$DISCUSSION_FILE" 2>/dev/null || echo 0)

log "当前发言统计 - Claude Code: $claude_count, OpenClaw: $openclaw_count"

# 获取上次处理的状态
last_openclaw_index=0
if [ -f "$STATE_FILE" ]; then
    last_openclaw_index=$(grep -o '"last_openclaw_index": [0-9]*' "$STATE_FILE" 2>/dev/null | grep -o '[0-9]*' || echo 0)
fi

log "上次处理的 OpenClaw 发言索引: $last_openclaw_index"

# 检查是否有 OpenClaw 的 ACK
if check_ack "openclaw"; then
    log "OpenClaw has read our previous message"
fi

# 检查是否有新的 OpenClaw 发言
if [ "$openclaw_count" -le "$last_openclaw_index" ]; then
    log "无新 OpenClaw 发言，跳过"
    exit 0
fi

new_entries=$((openclaw_count - last_openclaw_index))
log "检测到 $new_entries 条新 OpenClaw 发言，准备回复..."

# 获取最近 20 条发言作为上下文
recent_entries=$(tail -40 "$DISCUSSION_FILE")
context_count=$(echo "$recent_entries" | grep -c '\*\*OpenClaw\*\*\|Claude Code' || echo 0)

log "获取到 $context_count 条发言作为上下文"

# 生成回复提示
PROMPT="你正在参与一个技术讨论。请阅读以下对话上下文，针对最后一条 OpenClaw 的发言给出技术回复。

对话上下文：
$recent_entries

要求：
1. 以 Claude Code 技术专家的身份回复
2. 技术性、有深度、挑战方案可行性
3. 输出纯文本（Markdown 格式），不要包含时间戳和角色前缀
4. 1-3 句话即可，不要太长"

log "调用 Claude Code 生成回复..."

# 调用 Claude Code CLI
cd "$PROJECT_ROOT" || exit 1

RESULT=$(bun --env-file=.env ./src/entrypoints/cli.tsx -p "$PROMPT" 2>&1)

if [ $? -eq 0 ]; then
    # 记录写入前的文件大小
    size_before=$(wc -c < "$DISCUSSION_FILE" 2>/dev/null || echo 0)

    # 追加回复到讨论文件
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "\n\`[$TIMESTAMP]\` **Claude Code**:\n$RESULT\n" >> "$DISCUSSION_FILE"
    log "回复已追加到讨论文件"

    # 自我验证：检查文件大小是否增加
    size_after=$(wc -c < "$DISCUSSION_FILE" 2>/dev/null || echo 0)
    if [ "$size_after" -gt "$size_before" ]; then
        log "Write verification: size grew by $((size_after - size_before)) bytes"
    else
        log "ERROR: File not growing after write"
        write_failed "claude_write" "File size verification failed" "{\"expected_growth\": true, \"size_before\": $size_before, \"size_after\": $size_after}"
    fi

    # 写入 ACK 通知 OpenClaw
    write_ack "openclaw" "claude_message"

    # 写入 trigger 激活 OpenClaw 立即扫描
    echo "action=auto-reply" > "$TRIGGER_FILE"
    echo "timestamp=$(date '+%Y-%m-%dT%H:%M:%S+08:00')" >> "$TRIGGER_FILE"
    echo "source=claude-code" >> "$TRIGGER_FILE"
    log "已写入 trigger 激活 OpenClaw"

    # 更新状态
    python3 -c "
import json
state = {}
try:
    with open('$STATE_FILE', 'r') as f:
        state = json.load(f)
except: pass
state['last_openclaw_index'] = $openclaw_count
state['last_auto_reply'] = '$(date '+%Y-%m-%dT%H:%M:%S+08:00')'
state['last_write_verified'] = True
with open('$STATE_FILE', 'w') as f:
    json.dump(state, f, ensure_ascii=False, indent=2)
" 2>/dev/null || log "状态更新失败（不影响主要流程）"

    log "=== Auto-Reply 完成 ==="
else
    log "Claude Code 调用失败: $RESULT"
    write_failed "claude_error" "Claude Code CLI failed" "{\"exit_code\": $?}"
fi