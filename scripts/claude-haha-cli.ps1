# Claude Code Haha CLI Bridge Script
# Usage: .\claude-haha-cli.ps1 -Prompt "your prompt" [-File "path"]

param(
    [Parameter(Mandatory=$true)]
    [string]$Prompt,
    [string]$File
)

$ClaudeHahaDir = "D:\claude-code-haha"
Set-Location $ClaudeHahaDir

if ($File) {
    $FileContent = Get-Content $File -Raw
    bun --env-file=.env ./src/entrypoints/cli.tsx -p "$Prompt $FileContent"
} else {
    bun --env-file=.env ./src/entrypoints/cli.tsx -p $Prompt
}
