# KitchenCOM — cold-open (main)

**Last refreshed:** 2026-08-13 (evening), after the 108-commit push landed. Prior refresh: earlier the same day, when `feat/grocy-chores` + `feat/hardware-deploy` merged and the kitchen panel came fully to life.

Read this first. Everything below is verified, with the command that verifies it.

---

## 1. Where is HEAD?

- **HEAD:** `231e683` — `fix(shopping): correct the check-off contract; hide the dead button`, **plus the cold-open close-out + fix-up commits that set this line.** That is also the last **code** commit.
- **Branch:** `main`. A scratch worktree for the merge lives at `.worktrees/main-merge` — **`main` is checked out there, not in the primary checkout.**
- **Ahead of origin/main:** **0** (4 evening commits pushed; `origin/main` at the fix-up commit).
- Recent arc (2026-08-13 evening, **S1 Task 10 start → finish**): `91252c9` (touch resolution) → `ed6e481` (cold-open refresh) → `f601e1f` (OQ-1 findings) → `3dd1585` (recipe seed + negative-id defect) → `1e29942` (close-out) → `29ce9fb` (**OQ-1 resolved, fixtures corrected**) → `7de6e16` (**negative-id filter**) → `231e683` (**check-off contract fixed; Task 10 complete**).

```bash
git log --oneline -4 && git rev-list --count origin/main..HEAD   # expect 0
```

⚠️ **The primary checkout `/Users/jdehart1/___Code_DEV/KitchenCOM` is usually on a *different* branch** (a concurrent session parks `feat/choreops-chores` there — see §4). Work on `main` from `.worktrees/main-merge`. Verify `git branch --show-current` before every commit.

## 2. Empirical state

| Package | Tests | Typecheck | Build | dist imports |
|---|---|---|---|---|
| `custom_cards/grocy-food-card` | **110 / 14 files** | 0 errors | clean | **0** |
| `custom_cards/screensaver-card` | **73 / 13 files** | 0 errors | clean | **0** |

```bash
cd custom_cards/<pkg> && npm install && npm run build && npm test && npm run typecheck
```

⚠️ **Build BEFORE testing in a fresh worktree.** `dist-browser-loadable.test.ts` reads `dist/`, so on a clean checkout it fails 8 tests until `npm run build` has run once. That is the guard working, not a regression.

## 2b. Live dev environment (Tier-2 rig — Mac only, nothing to do with the Pi)

Both containers were left **running** on 2026-08-13 evening. Restart with the compose files
if they are down.

| Piece | Where | State |
|---|---|---|
| Grocy **4.6.0** | `http://localhost:9283` | up; seeded (below) |
| dev-HA | `http://localhost:8124` | up, 0 errors. Login **`dev` / `devdev123`** |
| HACS **2.0.5** | dev-HA sidebar | ✅ installed |
| grocy integration **v1.3.0** | `pygrocy2==2.4.1` | ✅ configured; both sensors **enabled** |

⚠️ **Version wall — do not "upgrade" the grocy integration.** HA 2025.7.4 pins pydantic
2.11.7; grocy v1.3.1+ needs `pygrocy2` ≥2.5.0 → pydantic ≥2.12.2 → `RequirementsNotFound`,
which surfaces only as **"Config flow could not be loaded: 500"**. **v1.3.0 is the newest
version that works here.** Full table in the findings doc §4-DONE.

- **Dashboards ready to use:** the default lovelace has a **Recipes** view (recipe card) and a
  **Shopping** view (shopping + meal-plan cards, `shopping_list_id: 1`). All three cards are
  registered resources. **Cards were added by editing `.storage/lovelace` directly + restart** —
  faster and less error-prone than HA's editor, where the badge `+`, the card `+`, and the
  per-view pencil are easy to confuse.
- **API key:** `sqlite3 deploy/grocy/grocy-config/data/grocy.db "select api_key from api_keys limit 1;"`
- **Redeploy a card here:** build → copy `dist/*.js` into `dev-config/www/` → **bump `?v=N`** in
  `.storage/lovelace_resources` → restart HA. Skipping the bump serves a cached module.
- **Seeded shopping list:** paper towels (**no product_id** — the fail-safe row, ✓ correctly
  hidden), Eggs ×2, Milk ×1.5. **Re-seed after check-off testing** — pressing ✓ really does
  delete the Grocy row:
  ```bash
  K=$(sqlite3 deploy/grocy/grocy-config/data/grocy.db "select api_key from api_keys limit 1;")
  curl -s -X POST -H "GROCY-API-KEY: $K" -H "Content-Type: application/json" \
    -d '{"shopping_list_id":1,"product_id":1,"amount":2,"note":""}' \
    http://localhost:9283/api/objects/shopping_list
  ```
- **Seeded data:** 4 recipes / 21 ingredients, 18 products, 11 units, 3 shopping-list items
  (one with `product_id: null`), 2 meal-plan entries. Edge cases covered: text amounts
  (`"a pinch"`), fractional amounts (0.333), varied units, differing `base_servings`.
- ⚠️ **The dev-HA config is mounted from the `grocy-chores` worktree**, not `main-merge`:
  `.worktrees/grocy-chores/deploy/homeassistant/dev-config`. Harmless (the one package it
  keeps is byte-identical to `main`'s), but **do NOT naively re-run `dev-setup.sh` from
  `main-merge`** — it stages an *empty* config and destroys the HA login/onboarding/DB.
  To change secrets, edit `dev-config/secrets.yaml` in place and `docker restart`.
- ⚠️ **Recreating the Grocy container invalidates the API key** in that `secrets.yaml`,
  which shows up as `rest_command` **401s** and an empty "No recipes" dashboard — not as an
  obvious auth error. Cost real time on 2026-08-13.

## 3. What just shipped

**The kitchen panel works end-to-end for the first time.** The screensaver blanks after 3 minutes, cycles 26 Maine photos, and wakes on mouse/keyboard input. That required three independent fixes that only came together at the merge:

1. **The card could not load at all** (`b008280`). Built with plain `tsc`, which emits bare `lit` import specifiers no browser can resolve → HA showed only "Configuration error". **All four cards** were affected; the screensaver had been broken on the Pi since deployment. Fixed by bundling with vite; guarded by `dist-browser-loadable.test.ts` in both packages (asserts **no imports at all** in `dist/`).
2. **Nothing pressed the wake button** (`2979235`). The wake automation waited on `input_button.kitchen_activity`, but the touch handler meant to press it was never built — so idle was a one-way door. The card now observes pointer/key input on `window` (capture, passive, throttled 5s) and presses it. Not touch-only, so a mouse wakes the panel.
3. **The timer never restarted** (`1ff0b98`). The safety switch added at `80a3ee4` rejected the one `timer.finished` event that would have driven blanking, leaving the timer `idle` forever. Enabling the switch now re-arms the countdown.

**Also on main from the merge:** Grocy recipe card S2 (Tier-2-verified against live Grocy 4.6.0, transport verified inside real HA), the dev-HA harness (`deploy/homeassistant/`), Wayland kiosk hardening, and the keyring fix.

## 4. Next moves

- **S1 Task 10 — ✅ COMPLETE (2026-08-13 evening).** All three OQs resolved and the check-off
  round-trip **confirmed by a human in a real browser**. Detail:
  `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/docs/session-state/2026-08-13-s1-task10-oq1-findings.md`
  (§0 = completion + the poll-lag defect; §2-RESOLVED = live sensor shapes; §4-DONE = version wall).

  Settled — do not re-litigate:
  - **OQ-1: pygrocy HYDRATES** the nested `product`/`recipe` objects. The provisional fixtures
    were RIGHT; both are now verbatim live captures. The raw-REST "nested objects are missing"
    scare was a false alarm — *the sensor layer is the authority, not `/api/objects/...`.*
  - **OQ-2/OQ-3:** the service is `remove_product_in_shopping_list(list_id, product_id,
    amount)` — keys on the **PRODUCT** id, and the key is **`list_id`**. Fixed at `231e683`.
  - **`done` filtering: NOT our bug.** pygrocy drops the field, so the card cannot filter
    checked-off items. Do not add a filter — there is nothing to filter on.
  - **Negative-id recipe rows: FIXED** (`7de6e16`) and deployed.

- **NEXT — the ✓ button feels dead for up to 30s.** The grocy integration polls on
  `SCAN_INTERVAL = 30s` (`custom_components/grocy/const.py:14`), so a removed row lingers on
  screen until the next poll. **A user's natural response is to press again, firing a second
  removal** — that is how two items vanished while testing one button. Options and a leaning
  are in the findings doc §0; it is a design decision, deliberately not improvised at session
  end. **This is the highest-value next piece of work on the food slice.**

- **Also open (cosmetic):** live `day` is a full ISO datetime and the meal-plan card renders it
  raw — visible on screen as `2026-08-14T00:00:00`. Format at the card render layer;
  `parseMeals` keeps `day` opaque on purpose.

- ⚠️ **The Pi may run a newer HA**, which would pull grocy **v1.15.0** → the **`grocy-py`**
  library instead of `pygrocy2`. Hydration behavior there is **unverified**; the OQ-1 answer is
  authoritative only for `pygrocy2`. Check the Pi's HA version before relying on it.
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
