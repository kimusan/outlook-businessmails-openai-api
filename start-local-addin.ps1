$Repo = $PSScriptRoot
$Log = Join-Path $Repo "start-desktop.log"
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

# Skip if port 3000 is already in use.
$inUse = netstat -ano | Select-String ":3000"
if (-not $inUse) {
    $cmd = "cd /d `"$Repo`" && `"$Npm`" run start:desktop >> `"$Log`" 2>&1"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -WindowStyle Hidden
    Start-Sleep -Seconds 8
}

# Launch Outlook after local add-in host starts.
Start-Process "outlook.exe"
