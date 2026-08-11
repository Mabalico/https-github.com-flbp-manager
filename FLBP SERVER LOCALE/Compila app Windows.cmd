@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-app\Build-WindowsApp.ps1" -InstallShortcut
if errorlevel 1 (
  echo.
  echo Compilazione non riuscita. Leggere l'errore sopra.
  pause
)
endlocal
