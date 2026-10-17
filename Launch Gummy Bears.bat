@echo off
setlocal
title Gummy Bears
cd /d "%~dp0"

py -3 --version >nul 2>nul
if not errorlevel 1 (
  py -3 launch.py %*
  goto :done
)

python --version >nul 2>nul
if not errorlevel 1 (
  python launch.py %*
  goto :done
)

echo.
echo Python 3 is required to run Gummy Bears.
echo Install it from https://www.python.org/downloads/
echo During installation, tick "Add python.exe to PATH".
echo.
pause
exit /b 1

:done
if errorlevel 1 pause
