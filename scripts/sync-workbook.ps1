$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$workbook = Join-Path $project 'data\New Import Monitoring.xlsx'
$logFile = Join-Path $project 'data\workbook-sync.log'

Push-Location $project
try {
    if (-not (Test-Path $workbook)) {
        throw "Workbook not found: $workbook"
    }

    $changes = git status --porcelain -- 'data/New Import Monitoring.xlsx'
    if (-not $changes) {
        exit 0
    }

    git add -- 'data/New Import Monitoring.xlsx'
    $message = "Sync local workbook $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit --only --message $message -- 'data/New Import Monitoring.xlsx' | Out-Null
    git push origin main | Out-Null
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) pushed workbook"
} catch {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) ERROR $($_.Exception.Message)"
    exit 1
} finally {
    Pop-Location
}