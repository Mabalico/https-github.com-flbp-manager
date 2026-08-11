@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Avvia FLBP Server.ps1"
if errorlevel 1 (
  echo.
  echo Impossibile avviare FLBP Server Locale.
  echo La finestra resta aperta per permettere di leggere l'errore.
  pause
)
endlocal
