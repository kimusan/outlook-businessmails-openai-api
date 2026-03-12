$ErrorActionPreference = "Stop"

$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "Outlook AI Local Host.lnk"

if (Test-Path $ShortcutPath) {
  Remove-Item $ShortcutPath -Force
  Write-Host "Removed startup shortcut: $ShortcutPath"
} else {
  Write-Host "Startup shortcut not found: $ShortcutPath"
}
