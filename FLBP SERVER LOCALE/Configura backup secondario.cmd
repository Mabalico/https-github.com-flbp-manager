@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configura backup secondario.ps1"
if errorlevel 1 pause
endlocal
