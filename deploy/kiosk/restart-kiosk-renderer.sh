#!/usr/bin/env bash
# Overnight kiosk renderer restart — leak mitigation.
#
# WHY THIS EXISTS (2026-09-29): the kitchen panel was blinking through
# screensaver photos 2-3 per second. Root cause was NOT the slideshow interval
# (photo_duration: 10 was correct on all three time-of-day views). The chromium
# renderer had been up 3d12h and had grown to 1239MB RSS: the screensaver decodes
# 212 full-size JPEGs and screensaver-card.ts caches decoded bitmaps per item for
# orientation pairing (_ensureOrientation), so decoded-image memory accumulates
# across days of cycling. At that size the renderer sits in permanent memory
# pressure, evicting decoded images and immediately re-decoding them to repaint
# — that re-decode churn IS the blink, and it was writing ~168MB/s to the SD card.
#
# The tell that this is client-side, not a card-logic spin: Home Assistant's
# backend was at 0.64% CPU throughout. The card's _skip() path reschedules at
# setTimeout(...,0) and WOULD spin this fast, but it calls media_source/resolve_media
# every iteration; an idle backend proves that path was not firing.
#
# Killing chromium is safe and self-healing: start-kiosk-wayland.sh runs it in
# the foreground inside a `while true` supervisor loop and respawns after 3s.
#
# THRESHOLD, not unconditional: a healthy renderer settles around 250-300MB.
# Restarting only above RSS_LIMIT_MB means a panel that is behaving is never
# interrupted, and the job stays a no-op on nights when nothing leaked.

set -uo pipefail   # no `set -e`: a probe failure must not leave the panel unrestarted

RSS_LIMIT_MB="${RSS_LIMIT_MB:-700}"
LOG="${HOME}/kiosk-renderer-restart.log"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

# Largest chromium RENDERER by RSS, in MB. Renderers hold the decoded-image
# memory; the browser/gpu/utility processes are not what leaks here.
peak_renderer_mb() {
  ps -eo rss,args 2>/dev/null \
    | grep '[c]hromium' \
    | grep -- '--type=renderer' \
    | awk '{ if ($1 > max) max = $1 } END { printf "%d", (max ? max/1024 : 0) }'
}

peak="$(peak_renderer_mb)"
peak="${peak:-0}"

if [ "$peak" -eq 0 ]; then
  log "no chromium renderer found; nothing to do (supervisor may be mid-respawn)"
  exit 0
fi

if [ "$peak" -lt "$RSS_LIMIT_MB" ]; then
  log "renderer peak ${peak}MB < ${RSS_LIMIT_MB}MB threshold; no restart needed"
  exit 0
fi

log "renderer peak ${peak}MB >= ${RSS_LIMIT_MB}MB; restarting kiosk chromium"
# ⚠ Kill the MAIN process, never only the renderers. The supervisor loop in
# start-kiosk-wayland.sh respawns only when the MAIN chromium exits, so a
# tempting `pkill -f "chromium.*type=renderer"` leaves the main process alive
# with ZERO renderers — the panel goes blank and nothing brings it back
# (learned the hard way 2026-09-10). This pattern matches the main process.
pkill -f '/usr/lib/chromium/chromium'

# Confirm the supervisor actually brought it back, so a failed respawn shows up
# in the log as a failure instead of silently leaving a dead panel until morning.
for _ in $(seq 1 20); do
  sleep 2
  if pgrep -f '[c]hromium.*--type=renderer' >/dev/null 2>&1; then
    new="$(peak_renderer_mb)"
    log "respawn confirmed; renderer now ${new}MB"
    exit 0
  fi
done

log "ERROR: no renderer after ~40s — panel may be down, check start-kiosk-wayland.sh"
exit 1
