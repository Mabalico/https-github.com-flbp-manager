# FLBP Manager Suite - Capacitor Android generator (R7-bis)
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\capacitor-generate-android.ps1
#
# This script installs Capacitor packages (if missing) and generates ./android
# without changing any web-app logic.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "[FLBP] Installing web deps..." -ForegroundColor Cyan
npm install

Write-Host "[FLBP] Building web bundle for wrapper (base=./)..." -ForegroundColor Cyan
npm run build:mobile

Write-Host "[FLBP] Installing Capacitor (dev) + Android package..." -ForegroundColor Cyan
npm i -D @capacitor/cli @capacitor/core
npm i @capacitor/android

if (Test-Path -Path "android") {
  Write-Host "[FLBP] android/ already exists. Skipping 'cap add android'" -ForegroundColor Yellow
} else {
  Write-Host "[FLBP] Generating Android project (android/)..." -ForegroundColor Cyan
  npm run cap:add:android
}

Write-Host "[FLBP] Syncing web -> Android..." -ForegroundColor Cyan
npm run cap:sync:android

Write-Host "[FLBP] Done. You can open Android Studio with: npm run cap:open:android" -ForegroundColor Green
