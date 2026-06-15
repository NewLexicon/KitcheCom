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
- **NEXT: Phase B integrations (HA-UI) + Phase D kiosk.** See PHASE C→D MOVES below.

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
