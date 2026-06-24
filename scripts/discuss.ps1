# discuss.ps1 - 文件对话系统脚本
# 用法: .\discuss.ps1 "消息"  或  .\discuss.ps1 new <项目名>  或  .\discuss.ps1 status

param(
    [Parameter(Mandatory=$false)]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$ProjectName
)

$ErrorActionPreference = "Stop"
$PROJECT_ROOT = "D:\claude-code-haha"
$DISCUSSION_FILE = Join-Path $PROJECT_ROOT "PROJECT_DISCUSSION.md"
$BRIDGE_DIR = Join-Path $PROJECT_ROOT "bridge"
$TRIGGER_DIR = Join-Path $BRIDGE_DIR "trigger"
$TRIGGER_FILE = Join-Path $TRIGGER_DIR "openclaw.trigger"
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Get-Timestamp {
    return Get-Date -Format "[yyyy-MM-dd HH:mm:ss]"
}

function Initialize-Discussion-File {
    param([string]$ProjectName)
    $header = "# 项目：$ProjectName · 技术讨论`n`n"
    $header += "## 目标`n"
    $header += "请在此描述项目目标...`n`n"
    $header += "## 当前状态`n"
    $header += "进行中`n`n"
    $header += "---`n`n"
    $header += "| 时间 | 角色 | 内容 |`n"
    $header += "|------|------|------|`n"
    return $header
}

function Add-OpenClaw-Message {
    param([string]$Message)
    $entry = "`n$(Get-Timestamp) **OpenClaw**:`n$Message`n"
    Add-Content -Path $DISCUSSION_FILE -Value $entry -Encoding UTF8
    Write-Host "[OpenClaw] 已追加消息" -ForegroundColor Cyan
    # P3: 写入 trigger 文件激活即时扫描
    $triggerContent = @"
action=discuss
timestamp=$(Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
source=claude-code
message=$Message
"@
    if (-not (Test-Path $TRIGGER_DIR)) { New-Item -ItemType Directory -Path $TRIGGER_DIR -Force | Out-Null }
    Set-Content -Path $TRIGGER_FILE -Value $triggerContent -Encoding UTF8
    Write-Host "[Trigger] 已写入 $TRIGGER_FILE（OpenClaw 将立即扫描）" -ForegroundColor Magenta
}

function Add-ClaudeCode-Message {
    param([string]$Message)
    $entry = "`n$(Get-Timestamp) **Claude Code**:`n$Message`n"
    Add-Content -Path $DISCUSSION_FILE -Value $entry -Encoding UTF8
    Write-Host "[Claude Code] 已追加回复" -ForegroundColor Green
}

function Get-Discussion-Status {
    if (-not (Test-Path $DISCUSSION_FILE)) {
        Write-Host "讨论文件不存在，请先运行: discuss.ps1 new <项目名>" -ForegroundColor Yellow
        return
    }
    $content = Get-Content $DISCUSSION_FILE -Raw
    $openclawCount = ([regex]::Matches($content, '\*\*OpenClaw\*\*')).Count
    $claudeCodeCount = ([regex]::Matches($content, '\*\*Claude Code\*\*')).Count
    Write-Host "=== 讨论状态 ===" -ForegroundColor Yellow
    Write-Host "文件: $DISCUSSION_FILE"
    Write-Host "OpenClaw 发言: $openclawCount 条" -ForegroundColor Cyan
    Write-Host "Claude Code 发言: $claudeCodeCount 条" -ForegroundColor Green
    $lastLine = Get-Content $DISCUSSION_FILE -Tail 5
    Write-Host "`n最近发言:" -ForegroundColor Yellow
    $lastLine | ForEach-Object { Write-Host $_ }
}

function Invoke-ClaudeCode-Reply {
    # 读取文件最后一条 OpenClaw 发言
    $lines = Get-Content $DISCUSSION_FILE
    $lastOpenClawIndex = -1
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        if ($lines[$i] -match '\*\*OpenClaw\*\*') {
            $lastOpenClawIndex = $i
            break
        }
    }

    if ($lastOpenClawIndex -eq -1) {
        Write-Host "未找到 OpenClaw 发言" -ForegroundColor Red
        return
    }

    # 获取上下文（最近 20 条发言）
    $contextLines = $lines | Select-Object -Last 40
    $context = $contextLines -join "`n"

    # 生成回复提示
    $prompt = @"
你正在参与一个技术讨论。以下是最近的对话上下文：

$context

请针对最后一条 OpenClaw 的发言，以 Claude Code 技术专家的身份给出回复。
只输出你的回复正文（Markdown 格式），不要包含时间戳和角色标记。
"@

    Write-Host "正在生成 Claude Code 回复..." -ForegroundColor Yellow

    # 调用 Claude Code CLI（通过 bun 运行）
    $replyFile = Join-Path $env:TEMP "claude_reply_$([guid]::NewGuid().ToString('N')).txt"
    try {
        $env:ANTHROPIC_API_KEY = $env:ANTHROPIC_API_KEY  # 确保环境变量存在
        $result = & bun --env-file=.env ./src/entrypoints/cli.tsx --prompt $prompt 2>&1
        if ($LASTEXITCODE -eq 0) {
            $reply = $result.Trim()
            Add-ClaudeCode-Message $reply
            Write-Host "Claude Code 回复已追加" -ForegroundColor Green
        } else {
            Write-Host "Claude Code 调用失败: $result" -ForegroundColor Red
        }
    } catch {
        Write-Host "调用出错: $_" -ForegroundColor Red
    }
}

# 主逻辑
switch ($Action.ToLower()) {
    "new" {
        if ([string]::IsNullOrEmpty($ProjectName)) {
            Write-Host "请提供项目名称: discuss.ps1 new <项目名>" -ForegroundColor Yellow
            exit 1
        }
        if (Test-Path $DISCUSSION_FILE) {
            Write-Host "讨论文件已存在: $DISCUSSION_FILE" -ForegroundColor Yellow
            Write-Host "如需重新创建，请先删除现有文件" -ForegroundColor Yellow
            exit 1
        }
        $content = Initialize-Discussion-File $ProjectName
        Set-Content -Path $DISCUSSION_FILE -Value $content -Encoding UTF8
        Write-Host "已创建讨论文件: $DISCUSSION_FILE" -ForegroundColor Green
        Write-Host "项目: $ProjectName" -ForegroundColor Cyan
    }
    "status" {
        Get-Discussion-Status
    }
    "cc" {
        if ([string]::IsNullOrEmpty($ProjectName)) {
            Write-Host "请提供消息内容: discuss.ps1 cc `"消息`"" -ForegroundColor Yellow
            exit 1
        }
        Add-ClaudeCode-Message $ProjectName
        Write-Host "Claude Code 发言已追加" -ForegroundColor Green
    }
    default {
        # 默认作为 OpenClaw 消息处理
        if ([string]::IsNullOrEmpty($Action)) {
            Write-Host "用法:" -ForegroundColor Yellow
            Write-Host "  discuss.ps1 `"消息`"           - 以 OpenClaw 身份发言" -ForegroundColor White
            Write-Host "  discuss.ps1 new <项目名>       - 创建新讨论" -ForegroundColor White
            Write-Host "  discuss.ps1 status             - 查看状态" -ForegroundColor White
            Write-Host "  discuss.ps1 cc `"消息`"        - 以 Claude Code 身份发言" -ForegroundColor White
            exit 1
        }
        # 检查讨论文件是否存在
        if (-not (Test-Path $DISCUSSION_FILE)) {
            Write-Host "讨论文件不存在，请先运行: discuss.ps1 new <项目名>" -ForegroundColor Yellow
            exit 1
        }
        Add-OpenClaw-Message $Action
        # 自动调用 Claude Code 生成回复
        Invoke-ClaudeCode-Reply
    }
}