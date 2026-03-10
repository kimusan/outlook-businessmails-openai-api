@echo off
setlocal EnableExtensions

set "SHOW_CONSOLE=0"
if /I "%~1"=="--visible" set "SHOW_CONSOLE=1"
if /I "%~1"=="visible" set "SHOW_CONSOLE=1"

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"
set "LOG=%REPO%\start-desktop.log"

set "NPM="
if exist "C:\nodejs\npm.cmd" set "NPM=C:\nodejs\npm.cmd"
if not defined NPM if exist "C:\nodejs" (
  for /f "delims=" %%I in ('dir /b /s /a-d "C:\nodejs\npm.cmd" 2^>nul') do (
    if not defined NPM set "NPM=%%I"
  )
)
if not defined NPM for %%I in (npm.cmd) do set "NPM=%%~$PATH:I"
if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM=%ProgramFiles(x86)%\nodejs\npm.cmd"

call :log Startup requested from CMD helper.
call :log Repo: %REPO%

if not exist "%REPO%\package.json" (
  call :log ERROR: package.json not found in repo path.
  echo ERROR: package.json not found in "%REPO%"
  exit /b 1
)

if not defined NPM (
  call :log ERROR: npm.cmd not found. Install Node.js with npm or add npm.cmd to PATH.
  echo ERROR: npm.cmd not found. Install Node.js or add it to PATH.
  exit /b 1
)
if not exist "%NPM%" (
  call :log ERROR: Resolved npm path does not exist: "%NPM%"
  echo ERROR: Resolved npm path does not exist: "%NPM%"
  exit /b 1
)
call :log Using npm: "%NPM%"

set "PORT_IN_USE="
for /f "tokens=*" %%L in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do set "PORT_IN_USE=1"

if not defined PORT_IN_USE (
  call :log Starting host with: "%NPM%" run start:desktop
  if "%SHOW_CONSOLE%"=="1" (
    call :log Launch mode: visible console.
    start "OutlookAI-Local" /D "%REPO%" "%ComSpec%" /k ""%NPM%" run start:desktop"
  ) else (
    call :log Launch mode: hidden/minimized console.
    start "OutlookAI-Local" /min /D "%REPO%" "%ComSpec%" /c ""%NPM%" run start:desktop >> "%LOG%" 2>&1"
  )
  timeout /t 8 /nobreak >nul
) else (
  call :log Port 3000 already listening; skipping new host start.
)

tasklist | find /I "node.exe" >nul
if errorlevel 1 (
  call :log WARNING: node.exe is not running after startup attempt.
)

start "" outlook.exe
endlocal
exit /b 0

:log
>> "%LOG%" echo [%date% %time%] %*
exit /b 0
