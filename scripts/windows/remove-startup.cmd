@echo off
setlocal
set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\scripts\remove-startup.ps1"
set "STATUS=%ERRORLEVEL%"
if not "%STATUS%"=="0" (
  echo.
  echo Failed to remove startup shortcut. Error code: %STATUS%
  exit /b %STATUS%
)

echo.
echo Startup shortcut removed successfully.
exit /b 0
