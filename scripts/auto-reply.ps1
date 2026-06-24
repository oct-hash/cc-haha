$ErrorActionPreference = "Stop"

$PROJECT_ROOT = "D:\claude-code-haha"
$DISCUSSION_FILE = Join-Path $PROJECT_ROOT "PROJECT_DISCUSSION.md"
$STATE_FILE = Join-Path $PROJECT_ROOT "bridge\openclaw_discuss_state.json"
$TRIGGER_FILE = Join-Path $PROJECT_ROOT "bridge\trigger\openclaw.trigger"
$LOG_FILE = Join-Path $PROJECT_ROOT "bridge\logs\auto-reply.log"
$ACK_DIR = Join-Path $PROJECT_ROOT "bridge\ack"
$FAILED_DIR = Join-Path $PROJECT_ROOT "bridge\failed"

function log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

function Write-Ack {
    param([string]$Recipient, [string]$EntryType)
    $ackFile = Join-Path $ACK_DIR "${Recipient}_${EntryType}.ack"
    $ackData = @{
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
        recipient = $Recipient
        type = $EntryType
    } | ConvertTo-Json -Depth 3
    if (-not (Test-Path $ACK_DIR)) { New-Item -ItemType Directory -Path $ACK_DIR -Force | Out-Null }
    Set-Content -Path $ackFile -Value $ackData -Encoding UTF8
    log "ACK written: $ackFile"
}

function Write-FailedEntry {
    param([string]$EntryType, [string]$ErrorMsg, [hashtable]$Payload)
    $failedFile = Join-Path $FAILED_DIR "${EntryType}_$(Get-Date -Format 'yyyyMMddHHmmss').json"
    $failedData = @{
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
        type = $EntryType
        error = $ErrorMsg
        payload = $Payload
        retry_count = 0
    } | ConvertTo-Json -Depth 3
    if (-not (Test-Path $FAILED_DIR)) { New-Item -ItemType Directory -Path $FAILED_DIR -Force | Out-Null }
    Set-Content -Path $failedFile -Value $failedData -Encoding UTF8
    log "Failed entry written: $failedFile"
}

function Test-AckReceived {
    param([string]$From)
    $ackFile = Join-Path $ACK_DIR "${From}_claude_message.ack"
    if (Test-Path $ackFile) {
        log "ACK received from $From"
        Remove-Item -Path $ackFile -Force
        return $true
    }
    return $false
}

log "=== Auto-Reply triggered ==="

if (-not (Test-Path $DISCUSSION_FILE)) {
    log "Discussion file not found, skip"
    exit 0
}

# Record file size before write
$fileInfoBefore = Get-Item $DISCUSSION_FILE
$sizeBefore = $fileInfoBefore.Length
log "File size before: $sizeBefore bytes"

$content = Get-Content $DISCUSSION_FILE -Raw -Encoding UTF8
$openclaw_count = ([regex]::Matches($content, '\*\*OpenClaw\*\*')).Count
$claude_count = ([regex]::Matches($content, '\*\*Claude Code\*\*')).Count

log "Current - OpenClaw: $openclaw_count, Claude Code: $claude_count"

$last_openclaw_index = 0
$last_write_verified = $false
if (Test-Path $STATE_FILE) {
    $json = Get-Content $STATE_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
    $last_openclaw_index = $json.last_openclaw_index
    $last_write_verified = $json.last_write_verified
}

log "Last processed: $last_openclaw_index, write_verified: $last_write_verified"

# Check for OpenClaw ACK
if (Test-AckReceived -From "openclaw") {
    log "OpenClaw has read our previous message"
}

if ($openclaw_count -le $last_openclaw_index) {
    log "No new OpenClaw messages, skip"
    exit 0
}

log "Detected new OpenClaw messages, generating reply..."

$recent_lines = Get-Content $DISCUSSION_FILE -Last 40 -Encoding UTF8
$context = $recent_lines -join "`n"

$prompt = "You are participating in a technical discussion. Read the context and reply to the last OpenClaw message.

Context:
$context

Requirements:
1. Reply as Claude Code (technical expert)
2. Be technical, in-depth
3. Output pure text (Markdown), no timestamp or role prefix
4. 1-3 sentences only"

log "Calling Claude Code..."

Set-Location $PROJECT_ROOT
try {
    # 设置 UTF-8 编码避免中文乱码
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $result = & bun --env-file=.env ./src/entrypoints/cli.tsx -p "$prompt" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $reply = "`n`[$timestamp`] **Claude Code**:`n$result`n"
        # Use raw byte write to avoid encoding issues
        [System.IO.File]::AppendAllText($DISCUSSION_FILE, $reply, [System.Text.Encoding]::UTF8)
        log "Reply appended (UTF-8 direct write)"

        # Self-verification: check if reply was written successfully
        $fileInfoAfter = Get-Item $DISCUSSION_FILE
        $sizeAfter = $fileInfoAfter.Length
        $expectedSize = $sizeBefore + [System.Text.Encoding]::UTF8.GetByteCount($reply)
        $sizeDiff = $sizeAfter - $sizeBefore

        if ($sizeAfter -le $sizeBefore) {
            log "ERROR: File not growing after write, size before=$sizeBefore after=$sizeAfter"
            Write-FailedEntry -EntryType "claude_write" -ErrorMsg "File size verification failed" -Payload @{expected_size=$expectedSize; actual_size=$sizeAfter}
        } else {
            log "Write verification: size grew by $sizeDiff bytes"
        }

        # Content verification: check for encoding issues
        $content = Get-Content $DISCUSSION_FILE -Raw -Encoding UTF8
        if ($content -match '\*\*Claude Code\*\*:[^\x00-\x7F]+') {
            log "WARNING: Possible encoding issue detected in file"
        } else {
            log "Content verification: encoding OK"
        }

        $trigger = "action=auto-reply`ntimestamp=$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00')`nsource=claude-code"
        Set-Content -Path $TRIGGER_FILE -Value $trigger -Encoding UTF8
        log "Trigger written"

        $newState = @{
            last_openclaw_index = $openclaw_count
            last_auto_reply = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00"
            last_write_verified = $true
            last_write_size = $sizeAfter
        } | ConvertTo-Json -Depth 3
        Set-Content -Path $STATE_FILE -Value $newState -Encoding UTF8

        # Write ACK to notify OpenClaw
        Write-Ack -Recipient "openclaw" -EntryType "claude_message"

        log "=== Auto-Reply complete ==="
    } else {
        log "Claude Code failed: $result"
    }
} catch {
    log "Error: $_"
    Write-FailedEntry -EntryType "claude_error" -ErrorMsg $_.Exception.Message -Payload @{stage="auto_reply"}
}