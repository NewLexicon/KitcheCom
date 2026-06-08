#!/usr/bin/env bash
# Launch Chromium full-screen at the KitchenCOM dashboard (Pi OS).
set -euo pipefail
HA_URL="${HA_URL:-http://localhost:8123/kitchen-snapshot}"
# Disable screen blanking during active use (screensaver != display-off, spec §4d)
xset s off -dpms || true
exec chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --check-for-update-interval=31536000 \
  "$HA_URL"
