@echo off
REM Crawls every page over localhost and reports broken links plus the status of
REM the old .html URLs. Exits non-zero if anything is broken. Double-click me.
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

node "%~dp0dev-server.js" --check

echo.
pause
