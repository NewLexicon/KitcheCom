# KitchenCOM — cold-open (main)

**Last refreshed:** 2026-08-14 (late morning), after the Google Calendar OAuth arc. Prior refresh: 2026-08-13 evening, after the 108-commit push landed.

Read this first. Everything below is verified, with the command that verifies it.

---

## 🔶 YOU MAY BE ON `fort-knox` — READ THIS BANNER FIRST

**Everything below §"THE REAL DEADLINE" is written from `main`'s perspective as of
2026-08-14 and does NOT describe the `fort-knox` branch.** Check where you are before
trusting a single number in it:

```bash
git branch --show-current
```

### If you are on `fort-knox`

- **Worktree:** `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox`
- **Last substantive commit:** `0be81e3` — Phase 1 runbook. **Everything after it is
  cold-open bookkeeping** (banner + SHA fix-ups), so HEAD will be a few commits past it.
  Cited this way on purpose: a fix-up commit cannot name its own SHA, and chasing the
  exact count just spawns another fix-up. Get live values from:

  ```bash
  git log --oneline -1 && git rev-list --count origin/main..HEAD
  ```

- **Substantive arc:** `1bf1bfd` (design) → `1af56db` (Phase 2 runbook) → `0be81e3`
  (Phase 1 runbook). Three docs commits; that is the whole branch.
- ✅ **PUSHED 2026-08-17.** `origin/fort-knox` exists and this branch tracks it. (It was
  laptop-only for three commits — the hazard memory `concurrent-sessions-branch-hazard`
  warns about. Resolved.) Verify with `git rev-list --count origin/fort-knox..HEAD` —
  **0** means nothing is stranded on this laptop.
- **Content is 100% docs.** No code, no tests, no build. §2's test tables below do not
  apply to anything on this branch.

**The three artifacts, in reading order:**

1. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/superpowers/specs/2026-08-16-parental-controls-design.md`
   — the design. §13 has the phase/gate table; **Appendix A lists 8 corrections that are
   contrary to popular online guidance — do not "fix" them back.**
2. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/session-state/2026-08-17-phase1-device-controls-runbook.md`
   — **Phase 1, UNGATED, the actual next move.**
3. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/session-state/2026-08-17-adguard-pi-flashing-runbook.md`
   — Phase 2, **gated behind Tuesday 2026-08-18**, and additionally blocked on hardware.

### 🎯 The literal next move on Fort Knox

**Execute the Phase 1 runbook (artifact 2).** Design §13 marks it **"Anytime"** — zero
network risk, no Pi, no hardware purchase — and sequences it *first* because it delivers
the download-approval capability that was the original ask. It is the only Fort Knox
phase that can legitimately run before Tuesday.

Phase 2 is **double-blocked** and should not be started: the Tuesday gate, plus §0's
open hardware question (the old Pi's model is still unidentified; a microSD reader is
the most likely thing to stall that evening).

**Tuesday still outranks all of this.** The wife-returns deliverable is the calendar +
chore chart, and per memory `S2514` the remaining ChoreOps work needs the Pi. If Tuesday
work is available, do that first — Phase 1 is what to do when it is *not*.

### Carry-forwards specific to `fort-knox`

- **Old Pi model unidentified.** Phase 2 §0. Photos confirmed a full-size Pi (not a USB
  dongle, which was the initial misread), inferred 3B/3B+, **not confirmed.** Boot it and
  read `/proc/cpuinfo` rather than reading silkscreen through the case.
- **The old SanDisk 32GB card is ~6yr old.** Fine for Phase 2 testing; **do not carry it
  into Phase 3** — household DNS on a drawer-aged card is how you get silent corruption
  weeks later.
- **Phase 3 requires the printed rollback card** (design §12 / Phase 2 §8) physically
  posted near the gateway *before* cutover. Printed, not just in the repo — the failure
  it addresses is one where looking things up is itself impaired.
- **`/clients/update` needs read-modify-write** (design §9.3). A naive write silently
  drops omitted fields. **Same silent-corruption shape as the ChoreOps penalty-sign bug**
  (memory `choreops-content-is-generated-json`) — treat with equal suspicion.

---

## ⏰ THE REAL DEADLINE — **Tuesday 2026-08-18**

Garrett promised his wife the **calendar and chore chart** would be **up and working** when she
returns Tuesday. That is the priority filter for every call. Prefer shipping a working panel over
polish. The food slice is already past the bar — **do not sink more time into it.**

Status against that promise:
- **Calendar → DONE** (2026-08-14). Google Calendar connected, read+write verified, on the dashboard.
- **Chore chart → mostly done, ON THE PI, NOT ON MAIN.** ChoreOps 1.0.7 is installed on the Pi via
  HACS with profiles + **11 chores entered, parents as approvers**. That work is documented on
  `feat/choreops-chores` (a **concurrent session's** branch — leave it alone). **What is unverified
  is whether the Pi panel actually displays it.** That is the highest-value remaining check.

## 1. Where is HEAD?

- **HEAD:** `dd021ca` — `docs: capture the OAuth autofill trap + ChoreOps dev-rig staging`,
  **plus the fix-up commit that set this line.** Last **code** commit is `2119d98`
  (fractional-delete fix).
- **Branch:** `main`, checked out at `.worktrees/main-merge` — **not in the primary checkout.**
- **Ahead of origin/main:** **0** — everything below is **PUSHED**.
- Recent arc (2026-08-13 evening → 2026-08-14): `231e683` (check-off contract) → `ff08a09`
  (Task 10 complete) → `a67742e` (fix-up) → `2119d98` (**Grocy `intval` fractional-delete fix**)
  → `912b1ed` (**Google Calendar connected**).

```bash
git log --oneline -4 && git rev-list --count origin/main..HEAD   # expect 0
```

⚠️ **The primary checkout `/Users/jdehart1/___Code_DEV/KitchenCOM` is usually on a *different* branch** (a concurrent session parks `feat/choreops-chores` there — see §4). Work on `main` from `.worktrees/main-merge`. Verify `git branch --show-current` before every commit.

## 2. Empirical state

| Package | Tests | Typecheck | Build | dist imports |
|---|---|---|---|---|
| `custom_cards/grocy-food-card` | **114 / 14 files** | 0 errors | clean | **0** |
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
- ✅ **MIGRATED 2026-08-14 — the dev-HA config now lives in `main-merge`.** It used to be mounted
  from the `grocy-chores` worktree. Both containers now mount from
  `.worktrees/main-merge/deploy/homeassistant/dev-config` and `.../deploy/grocy/grocy-config`.
  The copy was `cp -a` and verified byte-identical (`diff -r` empty; DB + `.storage/auth` +
  `lovelace_resources` all checksum-matched). **The original is still in `.worktrees/grocy-chores`
  (detached HEAD, 55M) as a rollback** — delete it once you are confident. `dev-config/` is
  **gitignored** (`.gitignore:34`), so this added no repo noise.
  **Still do NOT naively re-run `dev-setup.sh`** — it stages an *empty* config and destroys the HA
  login/onboarding/DB. To change secrets, edit `dev-config/secrets.yaml` in place and `docker restart`.
- ⚠️ **`dev-config/configuration.yaml` is a GENERATED COPY.** The canonical file is
  `deploy/homeassistant/dev-configuration.yaml`. Editing the copy is how a stray character got in
  and put HA into **recovery mode** on 2026-08-14. After any edit:
  `diff deploy/homeassistant/dev-configuration.yaml deploy/homeassistant/dev-config/configuration.yaml`
  (expect identical).
- **Google Calendar is configured here** (2026-08-14): entity **`calendar.family`**, read+write
  verified, plus a **Calendar** dashboard view. Full runbook and the redirect-URI traps:
  `docs/session-state/2026-08-14-google-calendar-oauth-setup.md`. **`internal_url`/`external_url`
  are now set to `http://localhost:8124`** in `.storage/core.config` — they were `None`, which is
  what broke the OAuth callback.
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

- **RESOLVED 2026-08-14 — fractional rows could not be checked off** (`2119d98`). Pressing ✓ on a
  1.5 row left it at 0.5; only whole-number rows cleared. **Grocy's own controller truncates the
  removal amount** — `StockApiController.php:745` does `intval($requestBody['product_amount'])`,
  and `intval(1.5)` is `1`. Not a card bug and not an HA bug: the HA schema coerces to float
  (`services.py:154`) and pygrocy2 forwards it unchanged (`grocy_api_client.py:689`); Grocy's own
  service layer handles floats fine (`StockService.php:1169`). Fix is `Math.ceil` in
  `buildRemovePayload` — **ceil, not round**, since 0.5 must become 1 (a 0 removal is a no-op that
  would strand the row forever). Verified end-to-end through the real HA service. ⚠️ **The old test
  asserted `amount` stayed `1.5` — a green test locking in the bug.** That is trap #6 (§6) firing
  again: *when a check passes, ask what it supplied that production will not.*

- ⚠️ **STOP INVESTING IN THE FOOD CARD** (raised by Garrett 2026-08-14, and it is correct).
  Grocy already ships a complete shopping list at `http://localhost:9283/shoppinglist` — real
  done/undone toggles, quantity editing, add-item, clear-list, add-from-recipe. The custom card
  reimplements a thin slice of that through a **lossy** integration, and it cannot reach parity:
  **pygrocy drops the `done` field**, so the card can only DELETE, never mark-done. That is why the
  ✓ is semantically wrong (Grocy's ✓ means "done" and is reversible; ours means "gone forever") and
  why the card "doesn't feel like fully-realized app functionality" — it isn't, and it structurally
  cannot be. **Open direction, not yet decided:** embed Grocy's own UI in an iframe/webpage card for
  *management*, and keep the custom card for the glanceable *view*. Test that before building a
  quantity stepper, a ✓→✗ swap, or any further parity work — those may all be moot.

- **NEXT (food slice, if it is ever picked back up) — the ✓ button feels dead for up to 30s.** The grocy integration polls on
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
- `feat/choreops-chores` (16 commits, all docs) is unmerged and belongs to a **concurrent session**.
  Leave it alone. It is 120 behind `main`. **It documents the ChoreOps work already performed on the
  Pi** — profiles, 11 chores with parents as approvers, plus reward-store / bonuses-penalties /
  achievements entry sheets.

- ✅ **Branches cleaned 2026-08-14: 5 → 2.** `feat/audio-music` (`0cdc0f5`), `feat/hardware-deploy`
  (`2979235`), and `feat/grocy-chores` (`f2e561c`) were all **fully merged into `main`** (zero unique
  commits, confirmed with `git merge-base --is-ancestor`) and deleted; SHAs recorded here in case a
  reflog recovery is ever wanted. Only `main` + `feat/choreops-chores` remain.
  ⚠️ **`git branch -d` will falsely claim "not fully merged"** when the primary checkout is parked on
  `feat/choreops-chores` — `-d` compares against the *current* HEAD, not `main`. Verify with
  `git merge-base --is-ancestor <branch> main` before reaching for `-D`.

## 4a. ChoreOps on the dev rig — INSTALLED, NOT YET EXERCISED

**The Pi is unavailable until Monday 2026-08-17** (Garrett worked remote Friday). The Tuesday date
may slip, and that is fine — but the chore-chart display risk can be retired **without the Pi**,
because ChoreOps is vendored locally and the dev rig can run it.

Staged on 2026-08-14, all verified:

| Piece | State |
|---|---|
| ChoreOps **1.0.8** (from `reference/ChoreOps-main`) | ✅ copied into `dev-config/custom_components/choreops`, loads clean |
| HA version gate (`hacs.json` wants ≥2025.6) | ✅ dev-HA is 2025.7.4 |
| `python-dateutil>=2.9.0` | ✅ 2.9.0.post0 already in the image |
| `button-card` | ✅ `www/community/button-card/`, registered `?v=1`, serves 200 |
| `auto-entities` | ✅ `www/community/lovelace-auto-entities/`, registered `?v=1`, serves 200 |

**No version wall here** — unlike the grocy integration, every dependency is satisfied.

⚠️ **Dev runs 1.0.8; the Pi runs 1.0.7.** If the generated dashboard differs on Monday, suspect this
first.

⚠️ `auto-entities` publishes **no release assets** — the `releases/latest/download/` URL 404s. Fetch
the built file from the tag instead:
`https://raw.githubusercontent.com/thomasloven/lovelace-auto-entities/v1.16.1/auto-entities.js`

**NOT YET DONE: nobody has run the config-flow wizard, so the generated dashboard has never been
seen.** That is the actual open question. Add the integration
(**Settings → Devices & Services → + ADD INTEGRATION → ChoreOps**) with **2 kids and 2-3 chores** —
this is a *display* test, not a data-entry session.

⚠️ **Confirm you picked the right integration.** ChoreOps' first screen mentions a **points label**
or an intro. **It never shows a Google sign-in.** On 2026-08-14 "Google Calendar" was selected by
mistake instead, which deleted the working calendar integration and cost a recovery cycle.

🔑 **Do NOT re-enter the 11 Pi chores by hand.** `config_flow.py:469` has an
`async_step_paste_json_input` that accepts a **diagnostics export**. Pull diagnostics from the Pi on
Monday and paste them in to replicate everything exactly.

💡 ChoreOps ships a **`calendar.py`** — it exposes chores as a *calendar entity*. Chores and family
events may be able to share one view. Worth checking before designing the panel layout.

## 4b. 🎯 THE LITERAL NEXT MOVE (2026-08-14 → Tuesday 2026-08-18)

Ordered against the deadline, not against technical interest. **The Pi is gone until Monday
2026-08-17**, so items 1-2 are the weekend's work and 3-5 wait for hardware.

1. **Run the ChoreOps config-flow wizard on the DEV rig** (§4a). Everything is installed and
   verified; nobody has seen the generated dashboard yet. **This is the single highest-value thing
   available without the Pi** — it converts Monday from "discover ChoreOps display problems under
   deadline pressure" into "deploy a known-good config". 2 kids, 2-3 chores is enough.
2. **Decide the Grocy-embed question** (§4). Add an iframe/webpage view pointing at
   `http://localhost:9283/shoppinglist`, compare it against the custom card on a touch-sized
   viewport. If the embed is acceptable, a whole category of planned card work disappears.
3. **Get on the Pi (Monday) and verify the chore chart actually displays.** ChoreOps + 11 chores are
   already entered there, but **nobody has confirmed the panel renders them**. The Pi was
   **unreachable** from the work network on 2026-08-14 (`ssh kitchencom` → timeout on
   `192.168.1.234`); use `ssh kitchencom-eth` + the ethernet notes, or try from the home network.
   Pull a **diagnostics export** while you are there — it is the no-retyping path into any other HA
   (§4a).
4. **Repeat the Google Calendar OAuth on the Pi.** The dev-rig setup does NOT carry over — the Pi
   needs its own redirect URI and its own `my.home-assistant.io` instance URL. Follow
   `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/docs/session-state/2026-08-14-google-calendar-oauth-setup.md`
   §3 **and §3b** exactly. Both traps cost real time on 2026-08-14 and **will recur**.
5. **Put real events on `calendar.family`.** It holds only the "KitchenCOM test event" that proved
   the write path. An empty calendar on the wall is not a working calendar.
6. **Rotate the OAuth client secret** (see the runbook §6 — it was screenshotted into a transcript).
   Also tidy the orphaned grant(s) at https://myaccount.google.com/permissions — the integration was
   removed and re-added on 2026-08-14, so KitchenCOM may appear more than once. **Do not revoke the
   one currently in use.**

**Explicitly NOT next:** the food-card poll lag, the quantity stepper, the ✓→✗ swap, and the card
styling. All are real, all are logged, none are on the Tuesday path — and the stepper/✓ items may be
mooted entirely by the embed-Grocy direction in §4.

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
- `viewsonic-touch-needs-hub.md` — TD1655 touch needs a USB hub in the path
- `v3-internet-time-as-chore-reward.md` — **V3/V4 idea + the Tuesday deadline.** Earned chore points
  unlock per-device internet time via an AT&T-managed network gate; kid picks the device. The
  enforcement layer (does the AT&T gateway even support per-device time windows?) is **unresearched
  and constrains everything above it** — check feasibility before designing reward mechanics.

## 9. Push state

**Everything is PUSHED.** `origin/main` == `main` == `dd021ca` (plus this fix-up).

This session's commits:

- `2119d98` — `fix(shopping): round the removal amount up — Grocy truncates it`
- `912b1ed` — `feat(calendar): connect Google Calendar — calendar.family is real now`
- `aec3c07` — `docs: refresh cold-open — calendar shipped, Grocy intval fix, rig migrated`
- `5f94717` + `d919b40` — cold-start sanity-check fix-ups
- `dd021ca` — `docs: capture the OAuth autofill trap + ChoreOps dev-rig staging`

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge
git branch --show-current    # MUST print `main` before any commit
git rev-list --count origin/main..HEAD   # expect 0
```
