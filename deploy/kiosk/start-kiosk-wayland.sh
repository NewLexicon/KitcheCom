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
#
# Reboot-proofing (added 2026-07-02): on boot the kiosk used to launch immediately
# and exec chromium exactly once. If HA wasn't serving yet (the container takes
# ~30-60s to come up), or chromium later crashed / was navigated away and closed,
# nothing brought the dashboard back — the panel sat on an error page until a human
# intervened. Two guards below fix that: (1) wait until HA answers 200 before the
# first launch; (2) respawn chromium if it ever exits. Note: no `set -e` — a transient
# curl/chromium failure must NOT kill the supervisor loop.
set -uo pipefail

# kitchen-snapshot = the committed YAML dashboard deployed to /config (see deploy/INSTALL.md Phase C).
HA_URL="${HA_URL:-http://localhost:8123/kitchen-snapshot}"
HA_HEALTH="${HA_HEALTH:-http://localhost:8123/}"

# Screen NEVER blanks (spec §4d: the screensaver CARD handles idle visually, not display-off).
# labwc/Wayland has no built-in DPMS timeout by default; we additionally make sure nothing
# powers the panel down. wlopm keeps all outputs on.
command -v wlopm >/dev/null 2>&1 && wlopm --on '*' || true

# (1) Wait for Home Assistant to be serving before the first launch. Cap the wait so a
# genuinely-down HA still lands us on chromium (showing HA's own connection error, which
# self-recovers once HA returns) rather than looping forever with a blank panel.
echo "kiosk: waiting for HA at $HA_HEALTH ..."
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HA_HEALTH" 2>/dev/null || echo 000)"
  [ "$code" = "200" ] && { echo "kiosk: HA up (200)"; break; }
  sleep 2
done

# Chromium's profile records the previous exit; after a power-cut or our own respawn it
# reads "Crashed" and shows a "restore pages?" bubble that blocks the kiosk. Flip it to
# Normal before each launch so the kiosk always comes up clean.
clear_crash_flag() {
  local prefs="$HOME/.config/chromium/Default/Preferences"
  [ -f "$prefs" ] && sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/;s/"exited_cleanly":false/"exited_cleanly":true/' "$prefs" 2>/dev/null || true
}

# (2) Supervisor loop: relaunch chromium if it exits (crash, or a stray window close).
# chromium is run in the foreground (no exec) so control returns here on exit.
while true; do
  clear_crash_flag
  chromium \
    --ozone-platform=wayland \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate \
    --check-for-update-interval=31536000 \
    "$HA_URL" || true
  echo "kiosk: chromium exited (code $?); respawning in 3s"
  sleep 3
done
