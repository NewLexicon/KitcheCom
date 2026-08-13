# KitchenCOM — cold-open (main)

**Last refreshed:** 2026-08-13, after `feat/grocy-chores` + `feat/hardware-deploy` merged to main and the kitchen panel came fully to life.

Read this first. Everything below is verified, with the command that verifies it.

---

## 1. Where is HEAD?

- **HEAD:** `1ff0b98` — `fix(screensaver): restart the timer when the screensaver is switched on`, **plus the cold-open + fix-up commits that set this line.**
- **Branch:** `main`. A scratch worktree for the merge lives at `.worktrees/main-merge`.
- **Ahead of origin/main:** **105** commits. **NOT PUSHED** — pushing is outward-facing and was deliberately left to Garrett.
- Recent arc: `2979235` (activity bridge) → `ac16298` (merge grocy) → `3f0c153` (merge hardware) → `1ff0b98` (timer restart fix).

```bash
git log --oneline -4 && git rev-list --count origin/main..HEAD
```

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

- **Push main to origin** — 105 commits unpushed. `git push origin main` from `.worktrees/main-merge`.
- **S1 Task 10 (Tier-2)** for the meal-plan/shopping cards — unblocked by the dev-HA, and newly relevant since those two cards also carried the bare-`lit` defect and have never loaded in HA.
- **Touch is still not working** — see §5.
- `feat/choreops-chores` (16 commits) is unmerged and belongs to a **concurrent session**. Leave it alone.

## 5. Carry-forwards

**Touch hardware — unresolved.** The ViewSonic TD1655's touch panel (`G2Touch`, `2a94:504d`, 100mA, 12 Mb/s) has **never enumerated on the Pi**, across 4 cables, multiple USB-A ports, a raised `usb_max_current_enable`, a reboot, and a Thunderbolt dock. The Pi's USB is provably healthy (a keyboard hot-plug enumerated live in `dmesg`).

**It DOES enumerate on the MacBook — including over USB-A→USB-C — but only through a GenesysLogic hub.** That is the difference: a hub is in the working path, absent from the Pi path.

→ **Recommended part: the official [Raspberry Pi USB 3 Hub](https://www.raspberrypi.com/products/usb-3-hub/)** (~$12, USB-A upstream captive cable, 4× USB-A downstream, USB-C power input for self-powered mode). Wire: `Pi USB-A → hub → USB-A→C cable → monitor USB-C`. Not yet purchased or tested.

Note macOS enumerates the panel but binds **no driver** (no external-touchscreen support), so "touch does nothing on the Mac" says nothing about Linux, which supports this device class natively.

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
