$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $project 'data\workbook-sync.log'
$userFile = Join-Path $project '.local-users.json'
$syncTokenFile = Join-Path $project '.users-sync-token'
$syncUrl = if ($env:USER_SYNC_URL) { $env:USER_SYNC_URL } else { 'https://dashboard.marfanisteel.com/api/users/sync' }
$publishPaths = @('index.html', 'css', 'js', 'server.js', 'package.json', 'package-lock.json', 'README.md', 'render.yaml', 'scripts', 'tests')

Push-Location $project
try {
    $syncToken = if ($env:USER_SYNC_TOKEN) { $env:USER_SYNC_TOKEN } elseif (Test-Path $syncTokenFile) { (Get-Content $syncTokenFile -Raw).Trim() } else { '' }
    if ($syncToken) {
        $response = Invoke-RestMethod -Uri $syncUrl -Headers @{ 'X-User-Sync-Token' = $syncToken } -Method Get
        if (-not $response.users) { throw 'Hosted user sync returned no users.' }
        $usersByName = [ordered]@{}
        foreach ($account in $response.users) {
            $usersByName[$account.username] = [ordered]@{
                username = $account.username
                display_name = $account.display_name
                password = $account.password
                role = $account.role
                permissions = @($account.permissions)
            }
        }
        $json = $usersByName | ConvertTo-Json -Depth 10
        $temporaryUserFile = "$userFile.tmp"
        [System.IO.File]::WriteAllText($temporaryUserFile, "$json`n", [System.Text.UTF8Encoding]::new($false))
        Move-Item -Path $temporaryUserFile -Destination $userFile -Force
        Add-Content -Path $logFile -Value "$(Get-Date -Format o) pulled hosted users"
    }

    $changes = git status --porcelain -- $publishPaths
    if (-not $changes) {
        exit 0
    }

    git add --all -- $publishPaths
    $message = "Sync local dashboard changes $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit --only --message $message -- $publishPaths | Out-Null
    git push origin main | Out-Null
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) pushed dashboard changes"
} catch {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) ERROR $($_.Exception.Message)"
    exit 1
} finally {
    Pop-Location
}