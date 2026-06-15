# KitchenCOM — Pi Deployment Phase B Handoff (2026-06-15)

**This is a deployment-progress handoff, not a code-state cold-open.** The project cold-open remains `docs/session-state/2026-06-08-main-integrated-cold-open.md` (code/branch state). This file tracks the **live hardware deployment** that started when the Pi 5 arrived 2026-06-15.

## WHERE DEPLOYMENT STANDS (deploy/INSTALL.md phases)

- **Phase A — OS + boot: DONE.** Pi 5 booted. Hit a boot loop (welcome splash → black → repeat); root cause was a corrupted/marginal SD flash (bootfs readable, ext4 rootfs bad). Fixed by clean re-flash with verification. OS = **Raspberry Pi OS Desktop, Debian 13 (trixie), aarch64**, 8GB Pi, 106GB free.
- **Phase A.2 / Phase B — Docker + HA: DONE.**
  - Docker **29.5.3** installed (official get.docker.com script), daemon **active + enabled on boot**. `garrettdehart` added to `docker` group.
  - Home Assistant container running: image `ghcr.io/home-assistant/home-assistant:stable` (3.34GB, arm64), `--network=host --privileged --restart=unless-stopped`, TZ=America/New_York, config volume `/home/garrettdehart/homeassistant:/config`. **Port 8123 listening; onboarding screen reached** at `http://192.168.1.225:8123`.
  - Benign log noise: `habluetooth` scanner error on the Pi's onboard BT adapter — HA runs fine; address when configuring integrations.
  - HA onboarding DONE (user created admin account in browser).
- **Phase C — deploy repo onto Pi: DONE & VERIFIED (2026-06-15).**
  - `configuration.yaml` MERGED (kept onboarding `default_config:` + automations/scripts/scenes includes; ADDED `homeassistant: packages: !include_dir_named packages` + `lovelace:` storage-mode + kitchen-snapshot yaml dashboard). Original backed up to `configuration.yaml.onboarding-bak`.
  - Copied to Pi `/config` (host `/home/garrettdehart/homeassistant`): `packages/{screensaver,calendar}.yaml` + `.calendar-verify.py`, `themes/kitchencom.yaml`, `dashboards/kitchen.yaml`, `www/screensaver-card.js` (freshly rebuilt via `npm run build`).
  - `check_config` → exit 0 clean. Restarted HA.
  - **Verified live:** entities `input_boolean.kitchen_idle`, `timer.kitchen_inactivity`, `input_button.kitchen_activity` in entity_registry. Card serves HTTP 200 at `/local/screensaver-card.js`. Lovelace resource `/local/screensaver-card.js` (module) registered in `.storage/lovelace_resources` (written via host path — note: container sees `/config/.storage`, host sees `/home/garrettdehart/homeassistant/.storage`).
  - Benign boot log noise: `habluetooth` BT AttributeError + HA-internal translation-cache WARNINGs (scene/sun/energy/backup/cloud/mobile_app) — NOT from our packages.
- **Phase D — kiosk: DONE & REBOOT-VERIFIED (2026-06-15).** Pi runs **labwc / Wayland** (Debian 13 default), NOT X11 — so the repo's original X11 kiosk files (`start-kiosk.sh` DISPLAY=:0/xset, `kitchencom-kiosk.service`) do NOT apply. Built Wayland-native variant:
  - `deploy/kiosk/start-kiosk-wayland.sh` — `chromium --ozone-platform=wayland --kiosk http://localhost:8123/kitchen-snapshot`, never-blank.
  - `deploy/kiosk/labwc-autostart` — launched from `~/.config/labwc/autostart` (deployed = system `/etc/xdg/labwc/autostart` 4 desktop-default lines + our kiosk line appended, so desktop fallback survives if chromium exits).
  - On Pi: kiosk script at `/home/garrettdehart/kitchencom/deploy/kiosk/start-kiosk-wayland.sh` (chmod +x). chromium binary = `/usr/bin/chromium` (v147); `chromium-browser` does NOT exist.
  - Verified: reboot → autologin (autologin-user=garrettdehart, session rpd-labwc) → labwc → chromium fullscreen at dashboard, NO browser chrome. User confirmed visual.
- **This work committed on branch `feat/hardware-deploy`** (off `origin/main`), commit `80c8112` — the 2 kiosk files + this handoff. NOT on `feat/audio-music` (where they were first authored — moved off to avoid mislabeling). Branch is 1 ahead of origin/main, unpushed.
- **Phase B integrations — PARTIALLY DONE (2026-06-15), no-credential cards wired live:**
  - **Weather: DONE.** Met.no was auto-created by `default_config` during onboarding (no API key). Real entity = `weather.forecast_home` (NOT the placeholder `weather.home`). Dashboard updated to point at it (commit `af70670`). Live on kiosk.
  - **Groceries + Chores: DONE.** Added two **Local To-do** integrations via HA UI named `Groceries`/`Chores` → produced entities `todo.groceries` + `todo.chores` (exact match to dashboard placeholders, so NO dashboard edit needed). Live on kiosk. NOTE: list titles have a stray trailing space (`'Groceries '`/`'Chores '`) — cosmetic only, entity IDs are clean. These are instance state (HA `.storage` config entries), NOT in the repo. (Caveat: `todo.chores` may later be replaced by a Grocy card per the concurrent grocy-chores slice.)
- **STILL NEEDS USER ACCOUNTS/KEYS:** `calendar.family` (Google Calendar OAuth), voice button (`action: assist` → Gemini API key + USB mic + Assist pipeline), screensaver media source (Google Photos OAuth or local images). Also Google Gemini integration for voice.
- **HEAD = `af70670`** on `feat/hardware-deploy`, 3 commits ahead of `origin/main`, UNPUSHED. Arc: `80c8112` (kiosk + handoff) → `0c740c1` (handoff fix-ups) → `af70670` (weather card wired).

## PI ACCESS (how to drive it)
- `ssh kitchencom` — passwordless (dedicated key `~/.ssh/id_kitchencom`, alias in `~/.ssh/config`). Pi: user `garrettdehart`, host `KitchenCom`, IP `192.168.1.225` (DHCP).
- **Passwordless sudo** enabled on Pi: `/etc/sudoers.d/010_garrettdehart-nopasswd` (so `ssh kitchencom 'sudo ...'` works non-interactively).
- **macOS gotcha:** Claude's Bash tool needs **VS Code granted Local Network permission** (System Settings → Privacy & Security → Local Network) or it gets "no route to host" to the Pi. Already granted this session.
- Permission rule `Bash(ssh kitchencom *)` added to `.claude/settings.local.json` (gitignored).
- Memory files: `pi-ssh-access-from-claude.md`, `hardware-deployment-phase-live.md`.

## PHASE C — NEXT MOVES (deploy/INSTALL.md Phase C)
1. Copy `homeassistant/*` from this repo into the Pi's `/config` (`/home/garrettdehart/homeassistant`).
2. Build `custom_cards/screensaver-card` → copy `dist` output into `/config/www/`; register resource `/local/screensaver-card.js` (module) in HA.
3. Restart HA; check config validity.
4. Then Phase D (kiosk) — NOTE: Debian 13 (trixie), newer than the Bookworm the runbook assumes; verify `chromium` vs `chromium-browser` binary name (INSTALL.md:27-31) before trusting the kiosk unit.
5. Replace placeholder entity ids (`calendar.family`, `weather.home`, `todo.*`) once real integrations added (Phase B HA-UI clicks: Gemini, Google Calendar/Tasks/Photos, Assist pipeline).

## CONCURRENT-SESSION HAZARD (still applies)
Shared checkout; another session owns `feat/grocy-chores`. Verify `git branch --show-current` before any commit. This session has made NO repo commits — only SSH config + settings.local.json (gitignored) + memory + this handoff. Current branch: `feat/audio-music` (empty slice, unrelated to deployment).
