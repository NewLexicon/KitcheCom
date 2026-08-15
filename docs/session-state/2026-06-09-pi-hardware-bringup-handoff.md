# Pi 5 Hardware Bring-Up — Handoff (BLOCKED on HDMI adapter)

**Date:** 2026-06-09
**Status:** Pi 5 hardware bring-up STALLED. Two headless-provisioning attempts failed (Pi never joined Wi-Fi). Decided to go visual — blocked on a physical HDMI adapter. Resume when it arrives.

> Written from the `feat/grocy-chores` worktree (the main checkout was on `feat/audio-music` — a concurrent session). This is a hardware-thread handoff, separate from the grocy-chores software slice (see that branch's own state).

---

## What we're doing

User got the Pi 5 hardware + a **ViewSonic TD1655** portable touch monitor. Goal: stand up the **foundation** (HA Container + screensaver + calendar + kiosk — all already merged on `main`) on the Pi. Grocy/chores comes later once that slice finishes. (User chose "Foundation first" scope.)

## The blocker chain (resolved → current)

1. **No display:** Pi 5 USB-C is power-IN only — it does NOT output video (unlike a laptop). Video only leaves via **micro-HDMI**. User had connected monitor→Pi via a single USB-C cable (no video + under-power). **Resolved understanding.**
2. **Cable gap:** User has a **micro-HDMI → full-size-HDMI** cable (the Pi kit cable) + the Pi's 27W PSU + a spare USB-C charger. The TD1655 takes **mini-HDMI**. So the missing piece is a **full-HDMI-female → mini-HDMI-male adapter** (~$6) OR a micro-HDMI→mini-HDMI cable. **← USER IS SOURCING THIS. This is the current block.**
3. **Headless attempts (both FAILED — Pi never joined Wi-Fi):**
   - **Attempt 1:** bundled SD card (stock Pi OS Desktop, 2024-03-15 Bookworm, stage4). Hand-provisioned boot partition: `ssh` flag + `userconf.txt` (user `garrett`) + `wpa_supplicant.conf` (SSID `ThunderEnlighten`). Pi consumed `ssh`+`userconf.txt` (so those mechanisms work) but **ignored `wpa_supplicant.conf`** → no Wi-Fi. Confirmed via router device list (no `raspberrypi` host present).
   - **Attempt 2:** wrote a `firstrun.sh` + `cmdline.txt systemd.run` hook (the Imager method for NetworkManager images) to configure Wi-Fi via `nmcli` + write an `.nmconnection` file + set hostname `kitchencom`. **Also failed** — `kitchencom.local` never resolved, no SSH-open host, not in router list.
   - **Conclusion:** blind provisioning is exhausted. We can't see WHY (not-booting vs wifi-driver vs firstrun-error vs region). Need eyes on the screen.

## Credentials / config in play (all on the SD card now)

- **Pi user:** `garrett` / password `627gar627` (SHA-512 hash written to `userconf.txt`; hash generated via the grocy container's Linux `openssl passwd -6` because macOS LibreSSL lacks `-6` and Python 3.9 `crypt` only had METHOD_CRYPT).
- **Wi-Fi:** SSID `ThunderEnlighten`, psk `elegantzoo250` (13 chars), country US. **Confirmed correct by user** against connected devices.
- **Intended hostname:** `kitchencom` (so `kitchencom.local`).
- **Network:** single SSID, 2.4+5GHz, subnet `192.168.1.x`, gateway `192.168.1.254` (router admin there). Mac is on this same network.

## NEXT SESSION — resume here (adapter in hand)

1. **Cable it up (separate power + video):**
   - Pi micro-HDMI → user's cable → full→mini-HDMI adapter → TD1655 mini-HDMI input.
   - Pi USB-C ← 27W PSU. TD1655 USB-C ← its own charger. **Don't chain monitor power to the Pi.**
2. **Boot and WATCH the screen.** Determine in seconds: does it boot to desktop? boot-loop? Wi-Fi error? This answers the "why" that 2 blind attempts couldn't.
3. **Likely fixes once visible:**
   - If it boots fine but no Wi-Fi: configure Wi-Fi directly on the desktop (NetworkManager applet) or `sudo nmcli device wifi connect ThunderEnlighten password elegantzoo250`.
   - If boot-loops: suspect SD write / re-flash with **Raspberry Pi Imager** (user has admin account — install needs admin, same sudoers wall as Docker; use `su - admin-jdehart1`).
4. **Once on the network:** `ssh garrett@kitchencom.local` (or its IP from the router). Then the real setup per `deploy/INSTALL.md` Phase A→E:
   - OS update, install Docker, HA Container, deploy `homeassistant/*` config, copy `custom_cards/screensaver-card/dist/`, register resource, kiosk systemd unit (mind the **Bookworm `chromium` vs `chromium-browser`** gotcha in INSTALL.md).

## Mac-side state (environment changes this session)

- **Docker Desktop** installed (admin account, `/Applications`) — v4.77. Daemon runs. CLI at `/Applications/Docker.app/Contents/Resources/bin`.
- **Grocy eval container** running: `grocy`, `lscr.io/linuxserver/grocy`, host 9283, volume `~/grocy-eval-demo`, `GROCY_MODE=demo`. API key minted (in `/tmp/grocy-api-key.txt`). This is the Tier-2/fixture source for the grocy-chores slice — **but the demo container's /api/chores was empty at last check (0 chores even in demo mode — may need the demo dataset re-seeded or chores added).** Keep until grocy-chores card is verified.
- **Raspberry Pi Imager:** NOT installed (brew cask hit the `/Applications` sudoers wall; would need admin account).

## Concurrency note

Three sessions have touched this repo: this one (`feat/grocy-chores`, paused at Task 1 of 11), the screensaver-followups session (merged → main as PR #3), and now `feat/audio-music` (active, main checkout is on it). See memory `concurrent-sessions-branch-hazard.md`. Verify `git branch --show-current` before any commit; prefer worktrees.
