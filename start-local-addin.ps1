param(
    [switch]$Visible
)

$Repo = $PSScriptRoot
$Log = Join-Path $Repo "start-desktop.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $Log -Value "[$timestamp] $Message"
}

function Test-PortListening {
    param([int]$Port)
    return [bool](netstat -ano | Select-String ":$Port" | Select-String "LISTENING")
}

function Wait-ForPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds) {
        if (Test-PortListening -Port $Port) {
            return $true
        }
        Start-Sleep -Seconds 1
    }

    return $false
}

$npmCandidates = @(
    "C:\nodejs\npm.cmd",
    (Get-ChildItem -Path "C:\nodejs" -Filter "npm.cmd" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName),
    (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
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

# The packaged local host (OutlookAiLocalHost.exe, auto-started at logon by
# install-startup.cmd) serves release/local-host/www - a build snapshot that
# goes stale as soon as the source changes. Stop it so the dev server can
# serve the current code on port 3000.
$packagedHost = Get-Process -Name "OutlookAiLocalHost" -ErrorAction SilentlyContinue
if ($packagedHost) {
    Write-Log "Stopping packaged local host (OutlookAiLocalHost.exe) so the dev server serves the current build."
    $packagedHost | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

# Serve the add-in with the webpack dev server (includes the /proxy/fetch
# middleware from local-host/dev-proxy.cjs, same wire protocol as the
# packaged host). office-addin-debugging is deliberately NOT used: its
# sideload step requires a Microsoft 365 login and the add-in is already
# registered in desktop Outlook, so nothing needs sideloading.
if (-not (Test-PortListening -Port 3000)) {
    Write-Log "Starting webpack dev server: $Npm run dev-server"
    $cmd = "cd /d `"$Repo`" && call `"$Npm`" run dev-server >> `"$Log`" 2>&1"
    if ($Visible) {
        Write-Log "Launch mode: visible console."
        $visibleCmd = "cd /d `"$Repo`" && call `"$Npm`" run dev-server"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k $visibleCmd" -WindowStyle Normal
    } else {
        Write-Log "Launch mode: hidden console."
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -WindowStyle Hidden
    }
    if (Wait-ForPort -Port 3000 -TimeoutSeconds 90) {
        Write-Log "Port 3000 is listening. Dev server appears ready."
    } else {
        Write-Log "WARNING: Timed out waiting for port 3000. Outlook may open before the dev server is ready."
    }
} else {
    Write-Log "Port 3000 already listening; reusing existing server."
}

# Launch Outlook after the dev server starts.
Start-Process "outlook.exe"
