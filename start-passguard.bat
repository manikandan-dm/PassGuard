@echo off
setlocal
rem Foreground Windows launcher; no Arena or browser automation is required.
where node >nul 2>nul
if errorlevel 1 (
  echo PassGuard requires Node.js 20+ on this computer. Install Node LTS, then open a new terminal.
  pause
  exit /b 127
)
if not exist "%~dp0scripts\dev-server.mjs" (
  echo Cannot find scripts\dev-server.mjs. Keep this launcher in the complete PassGuard project.
  pause
  exit /b 1
)
pushd "%~dp0"
if errorlevel 1 exit /b 1
node "%~dp0scripts\dev-server.mjs" --host 127.0.0.1 --port 3000 --open %*
set "result=%errorlevel%"
popd
if not "%result%"=="0" (
  echo PassGuard did not start. Read the error above; no existing process was stopped.
  pause
)
exit /b %result%
