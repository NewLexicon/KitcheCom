# Pi follow-ups — two things to fix when the Pi is next reachable

**Date:** 2026-08-11
**Pi state at time of writing:** UNREACHABLE. `ssh kitchencom` (192.168.1.234) times out and `kitchencom.local` does not resolve — powered down or off the LAN. Neither item below could be verified live.

---

## 1. 🔴 The screensaver card has never worked — deploy the fix

**Confirmed** from a photo of the kitchen display: a **"Configuration error"** tile sits exactly where `custom:screensaver-card` is placed (`homeassistant/dashboards/kitchen.yaml:19`), and it is the only custom card on that dashboard.

**Cause:** the bare-specifier defect (see `2026-08-11-ha-gate-verification.md` §6b). The card was built with plain `tsc`, which emits `import ... from "lit"`; no browser can resolve that, so the module never loaded and the element never registered.

**This is NOT an idle-detection bug.** `input_boolean.kitchen_idle` and `packages/screensaver.yaml` were never reached. Do not debug them for this symptom.

**The fix is committed and built** (`b008280`, rebuilt at `fd57094`):

```
custom_cards/screensaver-card/dist/screensaver-card.js   30,663 bytes, 0 imports
```

**To deploy:**
```bash
cd custom_cards/screensaver-card && npm install && npm run build
scp dist/screensaver-card.js kitchencom:<ha-config>/www/
```
Then in HA: **Settings → Dashboards → Resources**, change `/local/screensaver-card.js` to **`/local/screensaver-card.js?v=2`**.

⚠️ **The version bump is not optional.** Browsers cache Lovelace modules through a hard refresh; without a new URL the Pi serves the cached broken module and nothing appears to change. This cost ~6 minutes of false debugging on the dev box (§6c).

**Then reload the kiosk** and expect the "Configuration error" tile to disappear.

**Two separate questions — do not conflate them:**
- **Tile stops erroring** → the packaging defect is fixed. This is the part we *know* is broken.
- **Screensaver still never appears** → *now* investigate the idle automation, which has never once been exercised because the card never loaded to consume it. It may work immediately; it may not. Treat it as a fresh problem, with the card actually running.

---

## 2. Login on every reboot — should NOT be happening

**Reported:** the kiosk asks for an HA login after every reboot / power outage.

**Expected behaviour:** log in **once** with **"Keep me logged in"** checked. That stores a `normal` refresh token in the chromium profile for `http://localhost:8123/`, and it survives reboots. See the memory note `pi-power-and-kiosk-login.md`.

**The kiosk script is NOT the cause.** `deploy/kiosk/start-kiosk-wayland.sh` (the Wayland variant that is actually deployed — the X11 `start-kiosk.sh` in the repo does not apply, see `pi-kiosk-wayland-labwc.md`) uses chromium's **default profile** at `~/.config/chromium/Default`. There is no `--incognito`, no `--guest`, no `--user-data-dir` override, and nothing that wipes the profile. The reboot-proofing (wait-for-HA + respawn) is present and working as designed.

**So the token is either never stored or being invalidated.** Diagnose in this order:

```bash
# (a) Is a persistent refresh token actually stored?
#     Expect token_type "normal" and client_id http://localhost:8123/
ssh kitchencom
sudo grep -o '"token_type": *"[a-z]*"' <ha-config>/.storage/auth | sort | uniq -c

# (b) Does the chromium profile survive a reboot? Compare before/after:
ls -la ~/.config/chromium/Default/ | head
stat -c '%y %n' ~/.config/chromium/Default/Preferences

# (c) Is anything clearing it at boot? (a cleanup unit, tmpfs mount, etc.)
mount | grep -E 'chromium|home'
```

**Most likely cause:** the login that stuck was done **without** the "Keep me logged in" box checked — that yields a short-lived session token rather than a persistent refresh token. `preselect_remember_me` is true by default, but the box can be unchecked, and any login done through a *different* browser/profile (e.g. a phone) does not help the kiosk.

**Fix, if (a) shows no `normal` token:** log in on the **kiosk itself**, with **"Keep me logged in" checked**, then reboot and confirm the token is still in `.storage/auth`.

**Known gotcha from a previous session:** if the login fields appear not to accept input, that was the USB keyboard (G.SKILL KM250) dropping off the input device list — check `/proc/bus/input/devices` and reboot to re-enumerate. It is not an HA problem.

**Do NOT try `auth_providers: trusted_networks`.** Already attempted and reverted: HA's trusted_networks flow always returns a user-picker form step even with a single user, and a kiosk browser cannot auto-submit it — it sits on the login page and never authenticates. Detail in `pi-power-and-kiosk-login.md`.

**If truly zero-touch is ever required,** the remaining option is injecting a long-lived token into how the kiosk loads HA (never implemented; would mean a wrapper page or a seeded `hassTokens` localStorage entry — the same mechanism this session used to drive the dev-HA in a headless browser).
