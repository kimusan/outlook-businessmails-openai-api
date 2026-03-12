param(
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = Split-Path -Parent $PSScriptRoot
}

$InstallDir = $InstallDir.Trim().Trim('"')
$InstallDir = $InstallDir.TrimEnd('\', '/')
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "Outlook AI Local Host.lnk"
$VbsPath = Join-Path $InstallDir "start-hidden.vbs"

if (-not (Test-Path $VbsPath)) {
  throw "Missing launcher script: $VbsPath"
}

$WScriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"
if (-not (Test-Path $WScriptExe)) {
  throw "wscript.exe not found at $WScriptExe"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $WScriptExe
$Shortcut.Arguments = '"' + $VbsPath + '"'
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = (Join-Path $InstallDir "OutlookAiLocalHost.exe") + ",0"
$Shortcut.Description = "Starts Outlook AI local host silently"
$Shortcut.Save()

Write-Host "Installed startup shortcut: $ShortcutPath"
