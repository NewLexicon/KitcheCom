# Pi follow-ups — BOTH DEPLOYED 2026-08-11

**Date:** 2026-08-11
**Pi state:** reached over **direct ethernet** (`ssh kitchencom-eth`, `en22` link-local) from the work laptop — the home LAN `192.168.1.234` was unreachable, per `pi-direct-ethernet-fallback.md`. **Both fixes below are deployed and verified on the hardware.** One reboot is still owed to confirm the keyring fix hands-off.

## ✅ Deployment record (2026-08-11)

| Item | Before | After |
|---|---|---|
| `www/screensaver-card.js` | 13,969 B, **2 bare imports**, dated **Jun 15** — never rebuilt | 30,663 B, **0 imports**, `customElements.define` present |
| Lovelace resource URL | `/local/screensaver-card.js` | `/local/screensaver-card.js?v=2` |
| `deploy/kiosk/start-kiosk-wayland.sh` | no `--password-store` | `--password-store=basic` at line 79 |

**The screensaver diagnosis is confirmed on the hardware, not inferred:** the deployed file's first line was literally `import { LitElement, html, css, nothing } from "lit";`, dated **June 15** — the original `tsc` build, never rebuilt since. It could never have loaded.

- HA config lives at **`/home/garrettdehart/homeassistant`** (bind-mounted to `/config`); `.storage` is **root-owned**, so resource edits need `sudo`. Passwordless sudo works.
- HA was restarted to pick up the changed resource URL; came back **200 in ~3s**.
- `curl "http://localhost:8123/local/screensaver-card.js?v=2"` → **0 imports**. The card is now loadable.
- **Zero `frontend.js` errors** in the HA log after restart (the only errors are an unrelated `habluetooth` scanner quirk and `metno` DNS failures — expected, since direct-ethernet has no internet).
- Backups left on the Pi: `.storage/lovelace_resources.bak.20260811`, `start-kiosk-wayland.sh.bak.20260811`.

## ⏳ Still owed: one reboot

The keyring fix cannot be verified without rebooting — the running chromium was launched by the *old* script. **Reboot with no keyboard attached/touched** and confirm:
1. No "Unlock Keyring" dialog.
2. The kiosk lands on the dashboard unattended.
3. The screensaver tile no longer reads "Configuration error".

If the tile is clean but the screensaver still never *appears*, that is the **separate, never-yet-exercised** idle-automation question (`input_boolean.kitchen_idle`) — not this defect.

---

## Original diagnosis follows (kept for provenance)

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

## 2. The reboot prompt is the GNOME KEYRING, not Home Assistant

**Identified from a photo, 2026-08-11.** The dialog is **"Unlock Keyring — An application wants access to the keyring 'Default Keyring', but it is locked"**. That is a **Linux desktop dialog, not HA.**

**HA auth is fine.** Behind the dialog the HA frontend shows **"Loading data"** — not a login screen. The "Keep me logged in" refresh token persisted exactly as designed, and `pi-power-and-kiosk-login.md` remains correct. **Do not go re-checking `.storage/auth` for this symptom** — it is a different subsystem.

**Cause: autologin + keyring collision.** Chromium encrypts stored secrets with the login keyring. The keyring is normally unlocked *by the password you type at login* — but the Pi uses **autologin** (`autologin-user=garrettdehart`, per `pi-kiosk-wayland-labwc.md`), so no password is ever entered, the keyring stays locked, and Chromium's first request for it raises this modal over the kiosk.

Both features are individually correct; they interact badly. Nothing is misconfigured in HA or in the kiosk's reboot-proofing.

**Confirmed gap:** `deploy/kiosk/start-kiosk-wayland.sh` passes **no `--password-store` flag**, so Chromium defaults to detecting and using the GNOME keyring.

### Fix (preferred) — tell Chromium not to use the keyring

Add to the chromium invocation in `deploy/kiosk/start-kiosk-wayland.sh`:

```
    --password-store=basic \
```

Chromium then uses its own file-based store and never touches the keyring, so the dialog cannot appear. Appropriate here: the kiosk stores no passwords worth protecting (the HA refresh token is in the profile's localStorage, not the keyring), and the panel is a fixed-function appliance.

⚠️ **The file lives on branch `feat/hardware-deploy`, NOT on `feat/grocy-chores`.** It must be changed there, or on main after merge — do not cross the branches. On the Pi the deployed copy is `/home/garrettdehart/kitchencom/deploy/kiosk/start-kiosk-wayland.sh`; editing the repo alone does not fix the running kiosk.

### Alternative — unlock the keyring at login instead

Set the keyring's password to **empty** (`seahorse` → Default Keyring → Change Password → leave blank), which makes it auto-unlock without a prompt. Equivalent security outcome to `--password-store=basic`, more clicks, and it can be undone by a future keyring re-creation. Prefer the flag.

### Do NOT
- **Delete `~/.local/share/keyrings/`** to make it go away — it is re-created and can take other stored credentials with it.
- **Disable autologin** — that trades one prompt for another and breaks unattended boot, which is the whole point of the kiosk.

### Verify after fixing
Reboot with no keyboard input at all and confirm the kiosk lands on the dashboard with no dialog. That is the actual success criterion for "survives a power outage unattended".
