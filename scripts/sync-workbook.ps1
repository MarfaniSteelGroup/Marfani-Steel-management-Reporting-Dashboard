$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $project 'data\workbook-sync.log'

Push-Location $project
try {
    # The repository ignore rules keep logs, dependencies, and local secrets out.
    $changes = git status --porcelain
    if (-not $changes) {
        exit 0
    }

    git add --all
    $message = "Sync local dashboard changes $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit --message $message | Out-Null
    git push origin main | Out-Null
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) pushed dashboard changes"
} catch {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) ERROR $($_.Exception.Message)"
    exit 1
} finally {
    Pop-Location
}