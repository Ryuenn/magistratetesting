@echo off
REM Starts the local dev server with clean URLs (the site no longer uses .html
REM extensions, so VS Code Live Server will 404 on every page). Double-click me.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

node "%~dp0dev-server.js" %*

echo.
echo   Server stopped.
pause
