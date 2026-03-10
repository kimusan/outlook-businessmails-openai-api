@echo off
setlocal EnableExtensions

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"
set "LOG=%REPO%\start-desktop.log"

set "NPM="
for %%I in (npm.cmd) do set "NPM=%%~$PATH:I"
if not defined NPM if exist "C:\nodejs\npm.cmd" set "NPM=C:\nodejs\npm.cmd"
if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM=%ProgramFiles(x86)%\nodejs\npm.cmd"

>> "%LOG%" echo [%%date%% %%time%%] Startup requested from CMD helper.
>> "%LOG%" echo [%%date%% %%time%%] Repo: %REPO%

if not exist "%REPO%\package.json" (
  >> "%LOG%" echo [%%date%% %%time%%] ERROR: package.json not found in repo path.
  echo ERROR: package.json not found in "%REPO%"
  exit /b 1
)

if not defined NPM (
  >> "%LOG%" echo [%%date%% %%time%%] ERROR: npm.cmd not found. Install Node.js with npm or add npm.cmd to PATH.
  echo ERROR: npm.cmd not found. Install Node.js or add it to PATH.
  exit /b 1
)

set "PORT_IN_USE="
for /f "tokens=*" %%L in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do set "PORT_IN_USE=1"

if not defined PORT_IN_USE (
  >> "%LOG%" echo [%%date%% %%time%%] Starting host with: "%NPM%" run start:desktop
  start "OutlookAI-Local" /min cmd /c "cd /d \"%REPO%\" && call \"%NPM%\" run start:desktop >> \"%LOG%\" 2>&1"
  timeout /t 8 /nobreak >nul
) else (
  >> "%LOG%" echo [%%date%% %%time%%] Port 3000 already listening; skipping new host start.
)

tasklist | find /I "node.exe" >nul
if errorlevel 1 (
  >> "%LOG%" echo [%%date%% %%time%%] WARNING: node.exe is not running after startup attempt.
)

start "" outlook.exe
endlocal
