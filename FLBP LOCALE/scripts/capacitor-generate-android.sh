#!/usr/bin/env bash
# FLBP Manager Suite - Capacitor Android generator (R7-bis)
# Usage:
#   bash scripts/capacitor-generate-android.sh
#
# Generates ./android and syncs the built web bundle.

set -euo pipefail

echo "[FLBP] Installing web deps..."
npm install

echo "[FLBP] Building web bundle for wrapper (base=./)..."
npm run build:mobile

echo "[FLBP] Installing Capacitor (dev) + Android package..."
npm i -D @capacitor/cli @capacitor/core
npm i @capacitor/android

if [ -d "android" ]; then
  echo "[FLBP] android/ already exists. Skipping 'cap add android'"
else
  echo "[FLBP] Generating Android project (android/)..."
  npm run cap:add:android
fi

echo "[FLBP] Syncing web -> Android..."
npm run cap:sync:android

echo "[FLBP] Done. You can open Android Studio with: npm run cap:open:android"
