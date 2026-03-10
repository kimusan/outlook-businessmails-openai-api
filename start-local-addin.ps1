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

# Skip if port 3000 is already listening.
$inUse = Test-PortListening -Port 3000
if (-not $inUse) {
    Write-Log "Starting host with: $Npm run start:desktop"
    $cmd = "cd /d `"$Repo`" && call `"$Npm`" run start:desktop >> `"$Log`" 2>&1"
    if ($Visible) {
        Write-Log "Launch mode: visible console."
        $visibleCmd = "cd /d `"$Repo`" && call `"$Npm`" run start:desktop"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k $visibleCmd" -WindowStyle Normal
    } else {
        Write-Log "Launch mode: hidden console."
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -WindowStyle Hidden
    }
    if (Wait-ForPort -Port 3000 -TimeoutSeconds 60) {
        Write-Log "Port 3000 is listening. Host appears ready."
    } else {
        Write-Log "WARNING: Timed out waiting for port 3000. Outlook may open before host is ready."
    }
} else {
    Write-Log "Port 3000 already listening; skipping new host start."
}

if (-not (Get-Process -Name node -ErrorAction SilentlyContinue)) {
    Write-Log "WARNING: node.exe is not running after startup attempt."
}

# Launch Outlook after local add-in host starts.
Start-Process "outlook.exe"
