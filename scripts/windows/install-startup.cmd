@echo off
setlocal
set "INSTALL_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%scripts\install-startup.ps1" -InstallDir "%INSTALL_DIR%"
set "STATUS=%ERRORLEVEL%"
if not "%STATUS%"=="0" (
  echo.
  echo Failed to install startup shortcut. Error code: %STATUS%
  exit /b %STATUS%
)

echo.
echo Startup shortcut installed successfully.
exit /b 0
