@echo off
REM Checks the live site's URLs and search metadata. Double-click me, or run
REM verify-live.bat from a terminal. Pass a URL to check somewhere else:
REM   verify-live.bat http://localhost:3000
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

node "%~dp0verify-live.js" %*

echo.
pause
