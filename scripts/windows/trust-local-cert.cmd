@echo off
setlocal
set "INSTALL_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%scripts\trust-local-cert.ps1" -InstallDir "%INSTALL_DIR%"
set "STATUS=%ERRORLEVEL%"
if not "%STATUS%"=="0" (
  echo.
  echo Failed to trust the local certificate. Error code: %STATUS%
  exit /b %STATUS%
)

echo.
echo Certificate trust completed successfully.
exit /b 0
