#!/usr/bin/env bash
#
# deploy-dashboard.sh — push homeassistant/dashboards/kitchen.yaml to the Pi.
#
# WHY THIS EXISTS
#   kitchen.yaml is a contested file: it is edited live on the Pi (phone-side
#   dashboard edits, hand-fixes at the panel) AND in this repo. On 2026-09-08 the
#   live file was found 1932 lines AHEAD of the repo, holding the claim-button
#   migration and the Grocy calendar — work that existed on no branch. A plain
#   `scp` would have destroyed it.
#
#   This script makes that failure structurally impossible: it REFUSES to deploy
#   unless the live file is exactly what we last saw. Drift is a hard stop, not a
#   warning you can miss.
#
# USAGE
#   deploy/deploy-dashboard.sh              # deploy (safe: aborts on drift)
#   deploy/deploy-dashboard.sh --check      # compare only, change nothing
#   deploy/deploy-dashboard.sh --adopt      # record live as the new baseline
#   deploy/deploy-dashboard.sh --pull       # copy live -> repo (adopt Pi's version)
#
# ON DRIFT, DO NOT PASS --adopt REFLEXIVELY. Adopting blesses whatever is on the
# Pi as correct. Look at the diff first: if the Pi has work the repo lacks, use
# --pull and commit it, the way a4188bf did.
#
# The baseline lives in deploy/.kitchen-yaml.baseline and is GITIGNORED — it is
# this machine's record of what it last saw on the Pi, not shared config. A fresh
# clone has no baseline, so the first deploy from it will (correctly) refuse
# until you --check the diff and then --adopt.
#
# TEST STATUS (2026-09-10)
#   Verified live against the Pi: reachability, drift detection, the drift
#   REFUSAL path (exit 2, nothing written), --adopt, md5 on both ends, the
#   backups dir, and the exact check_config command (exit 0).
#   NOT yet exercised end-to-end: stages 3-6 writing to the live panel, and the
#   check_config rollback branch. First real deploy should be run with a human
#   watching, and --check immediately before it.

set -euo pipefail

HOST="${KITCHENCOM_HOST:-kitchencom}"
REMOTE_DIR="/home/garrettdehart/homeassistant"
REMOTE_FILE="$REMOTE_DIR/dashboards/kitchen.yaml"
CONTAINER="homeassistant"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_FILE="$REPO_ROOT/homeassistant/dashboards/kitchen.yaml"
BASELINE="$REPO_ROOT/deploy/.kitchen-yaml.baseline"

MODE="deploy"
[[ "${1:-}" == "--check" ]] && MODE="check"
[[ "${1:-}" == "--adopt" ]] && MODE="adopt"
[[ "${1:-}" == "--pull"  ]] && MODE="pull"

say()  { printf '  %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }
head_() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# md5 differs between macOS (md5 -q) and Linux (md5sum).
local_md5() { md5 -q "$1" 2>/dev/null || md5sum "$1" | awk '{print $1}'; }

# ---------------------------------------------------------------- reachability
head_ "1. Pi reachability"
if ! ssh -o ConnectTimeout=8 -o BatchMode=yes "$HOST" true 2>/dev/null; then
  bad "cannot reach '$HOST' over ssh"
  say ""
  say "Check YOUR network before suspecting the Pi — a corporate 10.x network"
  say "cannot route to 192.168.1.x, and Tailscale is blocked there:"
  say "    route -n get default | grep -E 'interface|gateway'"
  say ""
  say "macOS has no timeout(1); this script uses ssh's own -o ConnectTimeout."
  exit 1
fi
ok "reachable: $HOST"

# ---------------------------------------------------------------- drift gate
head_ "2. Drift check"
[[ -f "$LOCAL_FILE" ]] || { bad "missing $LOCAL_FILE"; exit 1; }

REMOTE_MD5="$(ssh "$HOST" "md5sum '$REMOTE_FILE' 2>/dev/null | awk '{print \$1}'" || true)"
[[ -n "$REMOTE_MD5" ]] || { bad "no kitchen.yaml on the Pi at $REMOTE_FILE"; exit 1; }
LOCAL_MD5="$(local_md5 "$LOCAL_FILE")"

say "live: $REMOTE_MD5  ($(ssh "$HOST" "wc -l < '$REMOTE_FILE'" | tr -d ' ') lines)"
say "repo: $LOCAL_MD5  ($(wc -l < "$LOCAL_FILE" | tr -d ' ') lines)"

if [[ "$MODE" == "adopt" ]]; then
  echo "$REMOTE_MD5" > "$BASELINE"
  ok "baseline recorded: $REMOTE_MD5"
  say "(this blesses the CURRENT live file as known-good)"
  exit 0
fi

if [[ "$MODE" == "pull" ]]; then
  scp -q "$HOST:$REMOTE_FILE" "$LOCAL_FILE"
  echo "$REMOTE_MD5" > "$BASELINE"
  ok "pulled live -> repo, baseline updated"
  say "Review and commit: git diff -- homeassistant/dashboards/kitchen.yaml"
  exit 0
fi

if [[ "$REMOTE_MD5" == "$LOCAL_MD5" ]]; then
  ok "in sync — nothing to deploy"
  [[ "$MODE" == "check" ]] && exit 0
  exit 0
fi

# Live differs from repo. Is it the baseline we expect, or unknown drift?
if [[ -f "$BASELINE" ]] && [[ "$(cat "$BASELINE")" == "$REMOTE_MD5" ]]; then
  ok "live matches recorded baseline — repo has the newer version"
else
  bad "LIVE FILE HAS DRIFTED — refusing to deploy"
  say ""
  if [[ -f "$BASELINE" ]]; then
    say "expected (baseline): $(cat "$BASELINE")"
  else
    say "expected (baseline): <none recorded>"
  fi
  say "actually on the Pi:  $REMOTE_MD5"
  say ""
  say "The Pi holds changes this repo does not know about. Deploying would"
  say "DESTROY them. Inspect before doing anything else:"
  say ""
  say "    ssh $HOST 'cat $REMOTE_FILE' | diff - $LOCAL_FILE | head -60"
  say ""
  say "Then either:"
  say "    deploy/deploy-dashboard.sh --pull    # Pi is right; take its version"
  say "    deploy/deploy-dashboard.sh --adopt   # repo is right; bless & re-run"
  exit 2
fi

if [[ "$MODE" == "check" ]]; then
  say "(--check: stopping before any change)"
  exit 0
fi

# ---------------------------------------------------------------- backup
head_ "3. Backup"
TS="$(date +%Y%m%d-%H%M%S)"
REMOTE_BAK="$REMOTE_DIR/backups/kitchen.yaml.bak-$TS"
ssh "$HOST" "mkdir -p '$REMOTE_DIR/backups' && cp '$REMOTE_FILE' '$REMOTE_BAK'"
ok "Pi backup: $REMOTE_BAK"

LOCAL_SNAP="$REPO_ROOT/docs/pi-snapshots/kitchen.yaml.live-$TS"
scp -q "$HOST:$REMOTE_FILE" "$LOCAL_SNAP"
ok "repo snapshot: docs/pi-snapshots/kitchen.yaml.live-$TS"

# ---------------------------------------------------------------- deploy
head_ "4. Deploy"
scp -q "$LOCAL_FILE" "$HOST:$REMOTE_FILE"
PUSHED_MD5="$(ssh "$HOST" "md5sum '$REMOTE_FILE' | awk '{print \$1}'")"
if [[ "$PUSHED_MD5" != "$LOCAL_MD5" ]]; then
  bad "post-copy hash mismatch — restoring backup"
  ssh "$HOST" "cp '$REMOTE_BAK' '$REMOTE_FILE'"
  exit 1
fi
ok "copied and verified: $PUSHED_MD5"

# ---------------------------------------------------------------- validate
head_ "5. HA config check"
# ~/homeassistant is bind-mounted to /config, so the new file is already visible
# inside the container. There is no `ha` CLI on this Pi (HA runs via Docker).
if ssh "$HOST" "timeout 120 docker exec $CONTAINER python -m homeassistant --script check_config -c /config" >/tmp/kc-check.log 2>&1; then
  ok "check_config passed"
else
  bad "check_config FAILED — rolling back"
  tail -20 /tmp/kc-check.log >&2
  ssh "$HOST" "cp '$REMOTE_BAK' '$REMOTE_FILE'"
  bad "restored $REMOTE_BAK"
  exit 1
fi

# ---------------------------------------------------------------- reload
head_ "6. Reload"
# kitchen.yaml is a mode:yaml dashboard (configuration.yaml:29-30). YAML
# dashboards are re-read per browser fetch — NO HA restart is needed. The panel
# picks the change up on its next load.
ok "no restart needed (mode: yaml dashboard)"
echo "$LOCAL_MD5" > "$BASELINE"
ok "baseline updated: $LOCAL_MD5"

head_ "Done"
say "Refresh the panel to see it. If the panel shows stale content, the kiosk"
say "service worker is serving cached JS — that is a CARD problem, not this file:"
say "    ssh $HOST 'pkill -f chromium'    # supervisor respawns it"
