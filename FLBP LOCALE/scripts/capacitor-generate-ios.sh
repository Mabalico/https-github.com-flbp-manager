#!/usr/bin/env bash
# FLBP Manager Suite - Capacitor iOS generator (R7-bis)
# Usage (macOS only):
#   bash scripts/capacitor-generate-ios.sh

set -euo pipefail

echo "[FLBP] Installing web deps..."
npm install

echo "[FLBP] Building web bundle for wrapper (base=./)..."
npm run build:mobile

echo "[FLBP] Installing Capacitor (dev) + iOS package..."
npm i -D @capacitor/cli @capacitor/core
npm i @capacitor/ios

if [ -d "ios" ]; then
  echo "[FLBP] ios/ already exists. Skipping 'cap add ios'"
else
  echo "[FLBP] Generating iOS project (ios/... )"
  npm run cap:add:ios
fi

echo "[FLBP] Syncing web -> iOS..."
npm run cap:sync:ios

echo "[FLBP] Done. You can open Xcode with: npm run cap:open:ios"
