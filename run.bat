@echo off
cd /d "%~dp0"

rem Prefer a tab in the already-open Windows Terminal (avoids stray cmd.exe windows).
if not defined WT_SESSION (
  where wt >nul 2>&1 && (
    rem "%~dp0" ends with \ which escapes the closing quote; "%~dp0." avoids that.
    rem Use %~nx0 (no spaces) so wt/cmd do not mangle the Bot Projects path.
    start "" wt -w 0 nt --title "Cube AR" -d "%~dp0." cmd /c "call %~nx0 %*"
    exit /b 0
  )
)

where node >nul 2>&1 || (echo Node.js required. & pause & exit /b 1)
if not exist node_modules (
  echo Installing...
  call npm install || (pause & exit /b 1)
)
start "" "https://localhost:5188"
call npm run dev
if errorlevel 1 pause
