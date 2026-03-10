$Repo = $PSScriptRoot
$Log = Join-Path $Repo "start-desktop.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $Log -Value "[$timestamp] $Message"
}

$npmCandidates = @(
    (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "C:\nodejs\npm.cmd",
    (Join-Path $env:ProgramFiles "nodejs\npm.cmd"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\npm.cmd")
) | Where-Object { $_ -and (Test-Path $_) }

$Npm = $npmCandidates | Select-Object -First 1

Write-Log "Startup requested from PowerShell helper."
Write-Log "Repo: $Repo"

if (-not (Test-Path (Join-Path $Repo "package.json"))) {
    Write-Log "ERROR: package.json not found in repo path."
    throw "package.json not found in repo path: $Repo"
}

if (-not $Npm) {
    Write-Log "ERROR: npm.cmd not found. Install Node.js with npm or add npm.cmd to PATH."
    throw "npm.cmd not found. Install Node.js or add npm.cmd to PATH."
}

# Skip if port 3000 is already listening.
$inUse = netstat -ano | Select-String ":3000" | Select-String "LISTENING"
if (-not $inUse) {
    Write-Log "Starting host with: $Npm run start:desktop"
    $cmd = "cd /d `"$Repo`" && call `"$Npm`" run start:desktop >> `"$Log`" 2>&1"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -WindowStyle Hidden
    Start-Sleep -Seconds 8
} else {
    Write-Log "Port 3000 already listening; skipping new host start."
}

if (-not (Get-Process -Name node -ErrorAction SilentlyContinue)) {
    Write-Log "WARNING: node.exe is not running after startup attempt."
}

# Launch Outlook after local add-in host starts.
Start-Process "outlook.exe"
