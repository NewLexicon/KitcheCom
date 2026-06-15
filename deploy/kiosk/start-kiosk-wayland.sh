#!/usr/bin/env bash
# Launch Chromium full-screen at the KitchenCOM dashboard — Wayland / labwc (Debian 13 trixie).
#
# This is the Wayland-native variant. The original start-kiosk.sh targets X11
# (DISPLAY=:0 + xset) per the Bookworm-era runbook; current Pi OS (trixie) boots
# labwc/Wayland, where the binary is `chromium` (NOT `chromium-browser`) and
# screen-power is managed by wlopm/swayidle (NOT xset). Verified on the live Pi
# 2026-06-15: compositor=labwc, WAYLAND_DISPLAY=wayland-0, chromium=/usr/bin/chromium.
#
# Launched from ~/.config/labwc/autostart, so it runs INSIDE the Wayland session
# (WAYLAND_DISPLAY already exported) — no DISPLAY wrangling needed.
set -euo pipefail

# kitchen-snapshot = the committed YAML dashboard deployed to /config (see deploy/INSTALL.md Phase C).
HA_URL="${HA_URL:-http://localhost:8123/kitchen-snapshot}"

# Screen NEVER blanks (spec §4d: the screensaver CARD handles idle visually, not display-off).
# labwc/Wayland has no built-in DPMS timeout by default; we additionally make sure nothing
# powers the panel down. wlopm keeps all outputs on.
command -v wlopm >/dev/null 2>&1 && wlopm --on '*' || true

# Chromium kiosk flags:
#   --ozone-platform=wayland : run native Wayland (no XWayland), crisp on the Pi panel
#   --kiosk                  : fullscreen, no chrome
#   --noerrdialogs / --disable-session-crashed-bubble : no "Chrome didn't shut down" nag after power-cut
#   --check-for-update-interval : effectively disable update prompts on an appliance
exec chromium \
  --ozone-platform=wayland \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  "$HA_URL"
