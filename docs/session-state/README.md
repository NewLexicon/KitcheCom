# KitchenCOM — cold-open (main)

**Last refreshed:** 2026-08-13 (evening), after the 108-commit push landed. Prior refresh: earlier the same day, when `feat/grocy-chores` + `feat/hardware-deploy` merged and the kitchen panel came fully to life.

Read this first. Everything below is verified, with the command that verifies it.

---

## 1. Where is HEAD?

- **HEAD:** `91252c9` — `docs: touch works — a USB hub between Pi and monitor is the requirement`. Last **code** commit is `1ff0b98` (timer restart fix).
- **Branch:** `main`. A scratch worktree for the merge lives at `.worktrees/main-merge` — **`main` is checked out there, not in the primary checkout.**
- **Ahead of origin/main:** **0.** All 108 commits are **PUSHED**; `origin/main` is at `91252c9`.
- Recent arc: `ac16298` (merge grocy) → `3f0c153` (merge hardware) → `1ff0b98` (timer restart fix) → `5bd6cd4` (cold-open) → `91252c9` (touch resolution).

```bash
git log --oneline -4 && git rev-list --count origin/main..HEAD   # expect 0
```

⚠️ **The primary checkout `/Users/jdehart1/___Code_DEV/KitchenCOM` is usually on a *different* branch** (a concurrent session parks `feat/choreops-chores` there — see §4). Work on `main` from `.worktrees/main-merge`. Verify `git branch --show-current` before every commit.

## 2. Empirical state

| Package | Tests | Typecheck | Build | dist imports |
|---|---|---|---|---|
| `custom_cards/grocy-food-card` | **100 / 14 files** | 0 errors | clean | **0** |
| `custom_cards/screensaver-card` | **73 / 13 files** | 0 errors | clean | **0** |

```bash
cd custom_cards/<pkg> && npm install && npm run build && npm test && npm run typecheck
```

⚠️ **Build BEFORE testing in a fresh worktree.** `dist-browser-loadable.test.ts` reads `dist/`, so on a clean checkout it fails 8 tests until `npm run build` has run once. That is the guard working, not a regression.

## 3. What just shipped

**The kitchen panel works end-to-end for the first time.** The screensaver blanks after 3 minutes, cycles 26 Maine photos, and wakes on mouse/keyboard input. That required three independent fixes that only came together at the merge:

1. **The card could not load at all** (`b008280`). Built with plain `tsc`, which emits bare `lit` import specifiers no browser can resolve → HA showed only "Configuration error". **All four cards** were affected; the screensaver had been broken on the Pi since deployment. Fixed by bundling with vite; guarded by `dist-browser-loadable.test.ts` in both packages (asserts **no imports at all** in `dist/`).
2. **Nothing pressed the wake button** (`2979235`). The wake automation waited on `input_button.kitchen_activity`, but the touch handler meant to press it was never built — so idle was a one-way door. The card now observes pointer/key input on `window` (capture, passive, throttled 5s) and presses it. Not touch-only, so a mouse wakes the panel.
3. **The timer never restarted** (`1ff0b98`). The safety switch added at `80a3ee4` rejected the one `timer.finished` event that would have driven blanking, leaving the timer `idle` forever. Enabling the switch now re-arms the countdown.

**Also on main from the merge:** Grocy recipe card S2 (Tier-2-verified against live Grocy 4.6.0, transport verified inside real HA), the dev-HA harness (`deploy/homeassistant/`), Wayland kiosk hardening, and the keyring fix.

## 4. Next moves

- **S1 Task 10 (Tier-2)** for the meal-plan/shopping cards — **the next move, and NOT Pi-blocked** (runs on the Mac via Docker; `deploy/grocy/` + `deploy/homeassistant/` both present). Plan: `docs/superpowers/plans/2026-07-02-grocy-food-slice1.md` → Task 10. Resolves OQ-1 (live sensor field names — the fixtures are **source-derived guesses**, never confirmed), OQ-2/OQ-3 (the check-off id + list-id contract). Newly relevant since those two cards also carried the bare-`lit` defect and have **never loaded in HA**.
  - ⚠️ Step 4's round-trip needs **a human with a real browser** — see trap §6.4. Claude can stand up the stack, seed data, and correct fixtures/tests, but cannot confirm an HA render.
- **Confirm touch survives a reboot.** Touch works now (§5), but the hub was added while the Pi was running; nobody has yet verified the panel comes up touch-enabled from cold.
- `feat/choreops-chores` (16 commits) is unmerged and belongs to a **concurrent session**. Leave it alone.

## 5. Carry-forwards

**Touch hardware — ✅ RESOLVED 2026-08-13. A USB HUB IS REQUIRED between the Pi and the monitor.**

The ViewSonic TD1655's touch panel does **not** enumerate on a direct Pi USB-A → monitor USB-C connection. Verified exhaustively: 4 cables, multiple USB-A ports, `usb_max_current_enable=1`, a reboot, and a Thunderbolt dock — **zero kernel events every time**, never even a failed enumeration. The Pi's USB was provably healthy throughout (a keyboard hot-plug enumerated live in `dmesg`).

**Put any powered USB hub in the path and it works immediately.** With a hub:

```
Bus 003 Device 008: ID 2a94:504d G2Touch Multi-Touch
hid-multitouch 0003:2A94:504D.0008: USB HID v1.11 Device [G2Touch Multi-Touch]
H: Handlers=mouse1 event8
```

Linux binds `hid-multitouch` automatically — no drivers, no config. The working hub here is a generic Realtek **RTS5411** (it appears as two chained hubs). The MacBook's working path used a GenesysLogic hub, so this is not vendor-specific: **the hub itself is the requirement**, presumably because the monitor needs a USB-C-capable host to negotiate before it presents the HID device, and the Pi's USB-A cannot.

The official [Raspberry Pi USB 3 Hub](https://www.raspberrypi.com/products/usb-3-hub/) (~$12) is a good permanent choice if the current one is a temporary loaner.

Note macOS enumerates the panel but binds **no driver** (no external-touchscreen support), so "touch does nothing on the Mac" said nothing about Linux — which supports this device class natively, as proven above.

**The screensaver safety switch.** `input_boolean.kitchen_screensaver_enabled` gates blanking. It is currently **on**. If a future change makes the panel unrecoverable, turn it off.

**Direct-ethernet link is usable but imperfect.** `eth0` was DHCP with no server → stuck `activating`, dropping constantly; fixed with `ipv4.method link-local` (persists across NM restart). It still drops occasionally. `169.254.x.x` does **not** route from macOS (goes out `en0`/wifi), so browse HA via an ssh tunnel: `ssh -f -N -L 8123:localhost:8123 kitchencom-eth` → `http://localhost:8123`.

## 6. Traps that cost real time — do not rediscover

1. **`.storage/core.restore_state` is STALE.** It flushes periodically, observed **5 minutes** behind live state. It contradicted what Garrett could see on the screen. Never diagnose from it; use the HA API/UI, or trust the human looking at the panel.
2. **A deployed file is not a running file.** Bit us three times: the browser cached a fixed Lovelace module (fixed by bumping `?v=N` on the resource URL); a bash supervisor kept running an old script from memory (needs the supervisor restarted, not just the file replaced); and **Chromium kept running an 18-hour-old card** after redeploy (needs `pkill chromium` — the supervisor respawns it).
3. **HA logs the browser's real error** under `frontend.js.modern` in `/config/home-assistant.log`. That turns a useless "Configuration error" into a stack trace: `docker exec homeassistant grep frontend.js /config/home-assistant.log | tail`.
4. **Do NOT verify HA renders with the `browser-automation` skill.** It resolves patchright, which nulls `customElements`; no HA dashboard renders in it, and it reports 0 errors while verifying nothing. It called the broken card clean. Only a human with a normal browser can confirm an HA render.
5. **`homeassistant/configuration.yaml` is a MERGE FRAGMENT** with no `default_config:` — mounted alone it yields an HA with no `rest_command` service. The dev-HA uses `deploy/homeassistant/dev-configuration.yaml` instead.
6. **Tests can pass against impossible data.** Three times this project shipped green tests that could not work in production: invented `name`/`unit` fields, `recipe_amount: "a pinch"` (Grocy coerces text to 0), and an importmap the demo supplied but HA does not. **When a check passes, ask what it supplied that production will not.**

## 7. Pi quick reference

- **Reach it:** `ssh kitchencom-eth` (direct ethernet). Home LAN `192.168.1.234` is unreachable from the work network — and now returns "connection refused" there, which is a *different host*, not the Pi.
- **HA config:** `/home/garrettdehart/homeassistant` (bind-mounted to `/config`). `.storage` is **root-owned** — edits need `sudo`. Passwordless sudo works.
- **Kiosk:** `/home/garrettdehart/kitchencom/deploy/kiosk/start-kiosk-wayland.sh`, launched from `~/.config/labwc/autostart`.
- **Photos:** `/config/media/` — 26 Maine JPEGs. Supported: `.jpg .jpeg .png .webp .mp4 .webm`. **`.HEIC` is not supported.**
- **Redeploy a card:** build → `scp` to `/config/www/` → **bump `?v=N`** in `.storage/lovelace_resources` → restart HA → **`pkill chromium`**.

## 8. Memory layer

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- `cards-must-be-bundled.md` — the bare-`lit` defect and the pattern behind it
- `pi-keyring-blocks-reboot.md` — the "Authentication required" prompt is the GNOME keyring, not HA
- `pi-eth0-link-local-fix.md` — direct-ethernet drops and the ssh-tunnel workaround
- `pi-power-and-kiosk-login.md` — the Pi 5 needs its own 27W supply; kiosk login is one-time "keep me logged in"
- `pi-kiosk-wayland-labwc.md` — labwc/Wayland, not X11
- `pi-direct-ethernet-fallback.md` — `kitchencom-eth`, the `%%` escaping gotcha
- `concurrent-sessions-branch-hazard.md` — **multiple sessions share this checkout; verify `git branch --show-current` before every commit**
