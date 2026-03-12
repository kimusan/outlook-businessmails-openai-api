param(
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = Split-Path -Parent $PSScriptRoot
}

$InstallDir = (Resolve-Path $InstallDir).Path
$CertPath = Join-Path $InstallDir "certs\localhost.cer"

if (-not (Test-Path $CertPath)) {
  throw "Certificate file not found: $CertPath"
}

Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Write-Host "Trusted localhost certificate for current user: $CertPath"
