#!/bin/bash
# discuss.sh - 文件对话系统脚本 (Unix/Linux/macOS)
# 用法: ./discuss.sh "消息"  或  ./discuss.sh new <项目名>  或  ./discuss.sh status

PROJECT_ROOT="/mnt/d/claude-code-haha"
DISCUSSION_FILE="$PROJECT_ROOT/PROJECT_DISCUSSION.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

cd "$PROJECT_ROOT" || exit 1

add_openclaw_message() {
    local msg="$1"
    echo -e "\n\`[$TIMESTAMP]\` **OpenClaw**:\n$msg\n" >> "$DISCUSSION_FILE"
    echo "[OpenClaw] 已追加消息"
}

add_claude_code_message() {
    local msg="$1"
    echo -e "\n\`[$TIMESTAMP]\` **Claude Code**:\n$msg\n" >> "$DISCUSSION_FILE"
    echo "[Claude Code] 已追加回复"
}

get_status() {
    if [ ! -f "$DISCUSSION_FILE" ]; then
        echo "讨论文件不存在，请先运行: ./discuss.sh new <项目名>"
        return
    fi
    local openclaw_count=$(grep -c '\*\*OpenClaw\*\*' "$DISCUSSION_FILE" 2>/dev/null || echo 0)
    local claude_count=$(grep -c '\*\*Claude Code\*\*' "$DISCUSSION_FILE" 2>/dev/null || echo 0)
    echo "=== 讨论状态 ==="
    echo "文件: $DISCUSSION_FILE"
    echo "OpenClaw 发言: $openclaw_count 条"
    echo "Claude Code 发言: $claude_count 条"
    echo ""
    echo "最近发言:"
    tail -5 "$DISCUSSION_FILE"
}

initialize_file() {
    local project_name="$1"
    cat > "$DISCUSSION_FILE" << EOF
# 项目：$project_name · 技术讨论

## 目标
请在此描述项目目标...

## 当前状态
进行中

---

## 对话记录

格式说明：
- \`[时间]\` **OpenClaw**: 发言内容
- \`[时间]\` **Claude Code**: 回复内容

---
EOF
    echo "已创建讨论文件: $DISCUSSION_FILE"
    echo "项目: $project_name"
}

# 主逻辑
case "$1" in
    "new")
        if [ -z "$2" ]; then
            echo "请提供项目名称: ./discuss.sh new <项目名>"
            exit 1
        fi
        if [ -f "$DISCUSSION_FILE" ]; then
            echo "讨论文件已存在: $DISCUSSION_FILE"
            echo "如需重新创建，请先删除现有文件"
            exit 1
        fi
        initialize_file "$2"
        ;;
    "status")
        get_status
        ;;
    "cc")
        if [ -z "$2" ]; then
            echo "请提供消息内容: ./discuss.sh cc \"消息\""
            exit 1
        fi
        add_claude_code_message "$2"
        ;;
    "")
        echo "用法:"
        echo "  ./discuss.sh \"消息\"           - 以 OpenClaw 身份发言"
        echo "  ./discuss.sh new <项目名>     - 创建新讨论"
        echo "  ./discuss.sh status          - 查看状态"
        echo "  ./discuss.sh cc \"消息\"        - 以 Claude Code 身份发言"
        ;;
    *)
        # 默认作为 OpenClaw 消息处理
        if [ ! -f "$DISCUSSION_FILE" ]; then
            echo "讨论文件不存在，请先运行: ./discuss.sh new <项目名>"
            exit 1
        fi
        add_openclaw_message "$1"
        echo "[提示] Claude Code 会在下次响应时自动读取并回复"
        ;;
esac