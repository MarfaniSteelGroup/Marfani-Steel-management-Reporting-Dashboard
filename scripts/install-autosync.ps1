$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot 'sync-workbook.ps1'
$taskName = 'Marfani Steel Workbook Auto Sync'
$powerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '"'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $project
$start = (Get-Date).AddMinutes(1)
$intervalTrigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($intervalTrigger, $logonTrigger) -Settings $settings -Force | Out-Null
Write-Host "Installed task: $taskName"