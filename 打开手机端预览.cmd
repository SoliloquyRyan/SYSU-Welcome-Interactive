@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title SYSU Welcome - Mobile Preview

set "PNPM_BIN="

for /f "delims=" %%I in ('where pnpm.cmd 2^>nul') do (
  if not defined PNPM_BIN set "PNPM_BIN=%%I"
)

if not defined PNPM_BIN if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" (
  set "PNPM_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
)

if not defined PNPM_BIN (
  for /f "delims=" %%I in ('dir /b /s "%USERPROFILE%\.cache\codex-runtimes\*\dependencies\bin\fallback\pnpm.cmd" 2^>nul') do (
    if not defined PNPM_BIN set "PNPM_BIN=%%I"
  )
)

if not defined PNPM_BIN (
  echo.
  echo [Cannot start] pnpm and the Codex bundled runtime were not found.
  echo Install Node.js 22.18 or newer, then run:
  echo   npm install -g pnpm@11.16.0
  echo.
  pause
  exit /b 1
)

for %%I in ("%PNPM_BIN%") do set "PATH=%%~dpI;%PATH%"

if not exist "node_modules\.modules.yaml" goto install_dependencies
if not exist "node_modules\.bin\tsx.cmd" goto install_dependencies
goto start_preview

:install_dependencies
echo.
echo [First run] Installing project dependencies. Keep the network connected...
call "%PNPM_BIN%" install --frozen-lockfile
if errorlevel 1 goto failed

:start_preview
echo.
echo [Starting] Opening the 390x844 mobile preview and flow checker...
echo Close the preview browser to clean temporary data and exit.
echo.
call "%PNPM_BIN%" preview:mobile
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo [Failed] Keep the error messages above and ask the project owner or Codex to inspect them.
echo.
if "%DEMO_PREVIEW_SMOKE%"=="1" exit /b 1
pause
exit /b 1
