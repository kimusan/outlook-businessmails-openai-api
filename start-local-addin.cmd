@echo off
setlocal

set REPO=%~dp0
if "%REPO:~-1%"=="\" set REPO=%REPO:~0,-1%
set LOG=%REPO%\start-desktop.log

rem Skip starting another host if port 3000 is already in use.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000') do set PORT_IN_USE=1

if not defined PORT_IN_USE (
  start "OutlookAI-Local" /min cmd /c "cd /d \"%REPO%\" && npm run start:desktop >> \"%LOG%\" 2>&1"
  timeout /t 8 /nobreak >nul
)

start "" outlook.exe
endlocal
