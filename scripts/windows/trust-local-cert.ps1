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
$CaCertPath = Join-Path $InstallDir "certs\dev-ca.crt"
$LeafCertPath = Join-Path $InstallDir "certs\localhost.cer"

if (-not (Test-Path $CaCertPath)) {
  throw "CA certificate file not found: $CaCertPath"
}

Import-Certificate -FilePath $CaCertPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Write-Host "Trusted local CA certificate in CurrentUser\\Root: $CaCertPath"

if (Test-Path $LeafCertPath) {
  Import-Certificate -FilePath $LeafCertPath -CertStoreLocation "Cert:\CurrentUser\TrustedPeople" | Out-Null
  Write-Host "Imported leaf certificate in CurrentUser\\TrustedPeople: $LeafCertPath"
}
