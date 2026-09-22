$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$shortcutPath = Join-Path $startup 'Marfani Steel Reporting.lnk'
$launcher = Join-Path $project 'scripts\start-dashboard-hidden.vbs'

New-Item -ItemType Directory -Path $startup -Force | Out-Null

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcher + '"'
$shortcut.WorkingDirectory = $project
$shortcut.Description = 'Start Marfani Steel Reporting dashboard'
$shortcut.Save()

Write-Host "Installed startup shortcut: $shortcutPath"