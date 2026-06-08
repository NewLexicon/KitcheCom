# KitchenCOM Install Runbook (Pi 5 — Pi OS + HA Container)

## Phase A — OS + HA
1. Flash Raspberry Pi OS (64-bit) to NVMe SSD; keep SD/USB for media.
   - **Kiosk prerequisite:** use the **Desktop** image (not Lite). The kiosk systemd unit
     uses `graphical.target` + `DISPLAY=:0`, so the Pi must boot to the DESKTOP with autologin
     enabled (`raspi-config` → System Options → Boot / Auto Login → Desktop Autologin). On a
     Lite/console-boot Pi the kiosk will silently never start.
2. Install Docker; run the Home Assistant Container image; complete onboarding.

## Phase B — Integrations (HA UI, mostly clicks)
- Add **Google Gemini** integration (paste API key); enable the Assist LLM API on it.
- Add **Google Calendar / Tasks / Photos** (OAuth, family account).
- Build the **Assist voice pipeline**: USB mic → Gemini STT → conversation → Gemini TTS → speaker.

## Phase C — Deploy these files
1. Copy `homeassistant/*` into HA's `/config`.
2. Copy `custom_cards/screensaver-card` build output into `/config/www/`; **register the
   resource** (Settings → Dashboards → Resources → `/local/screensaver-card.js`, module).
3. Restart HA; check Config validity.

## Phase D — Kiosk
1. Copy repo to `/home/pi/kitchencom`; `chmod +x deploy/kiosk/start-kiosk.sh`.
2. `sudo cp deploy/kiosk/kitchencom-kiosk.service /etc/systemd/system/`
3. `sudo systemctl enable --now kitchencom-kiosk`

> **Bookworm browser binary:** on current Pi OS (Bookworm) the browser is `chromium`, not
> `chromium-browser` (the older Buster/Bullseye name) that `start-kiosk.sh` calls. If
> `chromium-browser` is missing the service crash-loops every 5s — either install/symlink it
> (`sudo apt install chromium-browser`, or `ln -s $(which chromium) /usr/bin/chromium-browser`)
> or change the script's `ExecStart` to call `chromium`.

## Phase E — Mobile
- Family installs HA Companion app, signs in on the home network.

## HARDWARE-PHASE TODOs (carry-forwards from design)
- [ ] **Kiosk dashboard target:** the kiosk's default `HA_URL` points at `/kitchen-snapshot` — the committed YAML SNAPSHOT dashboard (recovery/review copy), which does NOT reflect phone-side live edits to the storage-mode dashboard. Once the live dashboard exists, repoint `HA_URL` to the live dashboard's `url_path`.
- [ ] **M-12 kiosk auth:** choose long-lived access token vs `trusted_networks` for the kiosk; wire it.
- [ ] **M-10 activity bridge:** wire kiosk touch → `input_button.kitchen_activity` press (e.g. via a tap-action on the dashboard or a small JS ping) so the HA idle timer resets on touch.
- [ ] **M-8 codec validation:** test screensaver video formats on the actual Pi 5 (HEVC/H.265 hw decode limited).
- [ ] **C-4 calendar-by-voice:** add a custom `intent_script` for calendar event creation (calendar has no built-in add intent; only `CREATE_EVENT_SERVICE`). Separate plan.
- [ ] **Placeholders:** replace `weather.home`, `todo.groceries`, `todo.chores`, `calendar.family` with real entity ids.
- [ ] **M-2 canonical list:** confirm `local_todo` canonical + Google Tasks mirror.
