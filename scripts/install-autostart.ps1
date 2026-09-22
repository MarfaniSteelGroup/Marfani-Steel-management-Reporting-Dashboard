$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$shortcutPath = Join-Path $startup 'Marfani Steel Reporting.lnk'
$launcher = Join-Path $project 'scripts\start-dashboard-hidden.vbs'
$taskName = 'Marfani Steel Reporting'

# A logon task is more reliable than a Startup-folder shortcut because it keeps
# the absolute launcher path and does not depend on the logon shell directory.
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('"' + $launcher + '"') -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

if (Test-Path $shortcutPath) {
	Remove-Item $shortcutPath -Force
}

Write-Host "Installed logon task: $taskName"