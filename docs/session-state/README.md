# KitchenCOM — cold-open (`main`)

**Last refreshed:** 2026-09-08 morning. Repo unchanged since `8d0f863`; this refresh records
**Pi-side runtime work only** (dongle relocation, signal sensors) plus a correction.
**Read this first.** Everything below is verified, with the command that verifies it.

> This is the **project-wide** cold-open, written from `main`'s perspective. Feature branches
> carry their own branch-scoped cold-opens; see §3.

---

## 1. Where is HEAD?

```bash
git branch --show-current                 # expect: main
git log --oneline -1                      # authoritative tip — NOT frozen here
git status --porcelain                    # expect: empty
git ls-remote origin refs/heads/main      # pushed? compare to git rev-parse HEAD
```

**Stable PREFIX** — immutable and verifiable. The tip is deliberately **not** frozen (a
close-out commit cannot name its own SHA, and stamping it is itself a commit, so the loop never
converges). `6613fce` and everything below it will not move:

```
68a5820 feat(kroger): add an OAuth test harness to prove the flows before building
b6863e2 docs: no pantry inventory — record barcodes for identity only
300affe docs: Kroger API findings — Products is the search API, not Catalog
de78070 feat(grocy): add a rest_command to push a recipe's missing items to the list
8a45788 docs: capture the grocery-ordering scope decision and the deferred store routing
55e58d1 feat(panel): show the Grocy meal plan on both calendar views
108928d docs: design — voice for todo lists, grocery lists, and the Grocy meal plan
422d55d docs: correct the USB hub advice — do not replace the hub or the cable
c3208fe docs: cold-open §1 — extend the frozen prefix through this session's commits
3a57b0d docs: cold-open — chore claiming fixed, hardware decisions, bulb finding
55eb992 fix(panel): shorten the awaiting-review label to "Review"
b233a7c feat(panel): claim via kiosk buttons, show points, route claimed to Completed
f1c4851 docs: cold-start sanity-check fix-ups — freeze the prefix through 977d9cf
977d9cf docs: cold-open — dongle relocated, signal sensors enabled, one correction
8d0f863 docs: cold-start sanity-check fix-ups — freeze the prefix through 2179800
2179800 docs: cold-open — adaptive lighting live, ChoreOps reset, repo/Pi reconciled
66d5872 Merge feat/adaptive-lighting: adaptive lighting live on three ZL1 bulbs
6613fce Merge PR #4: Kitchen panel — chores end-to-end, calendar, screensaver, daily quotes
```

Everything above is frozen and verifiable. The **tip is deliberately not stamped here** — a
close-out commit cannot name its own SHA, and stamping it is itself a commit, so the loop never
converges. Get the tip from `git log --oneline -1`, which §1 already calls authoritative.

⚠️ **This checkout is SHARED — `main` lives in the `.worktrees/main-merge` worktree**, not the
repo root (the root has `feat/choreops-chores` checked out). Two Claude sessions worked this
project on 2026-09-04 and the branch tip moved mid-session. **Always check
`git branch --show-current` before committing**, and re-run `git log` rather than trusting a
remembered SHA.

---

## 2. Empirical state

All re-verified **2026-09-07 night**; the ChoreOps/panel rows re-verified **2026-09-08 midday**.

⚠️ **Chore points are no longer 0.** Rowan **4.0**, Wystan **4.0** (re-verified 14:40) — the kids
are earning. Read live state; do not assume the day-one reset numbers.

Re-verified at close 2026-09-08 14:40: Pi up 1 d 5 h · HA **200** · card tests **109 passing** ·
14 chores · `kitchen.yaml` and `grocy_recipes.yaml` both **byte-identical repo↔Pi**.
The only non-benign log ERROR is a `NWK_NO_ROUTE` burst against bulb `_3` (Rowan's, now switched
off at the wall) — self-limiting, see `flux-retries-are-self-limiting`.

| Check | Command | Expected |
|---|---|---|
| Kitchen Pi | `ssh kitchencom 'uptime'` | responds (up ~21 h) |
| HA healthy | `ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8123/'` | `200` |
| No errors | `ssh kitchencom 'sudo grep -icE "(choreops\|screensaver\|zha\|lovelace).*(error\|traceback)" /home/garrettdehart/homeassistant/home-assistant.log'` | `0` |
| Photos | `ssh kitchencom 'ls -1 /home/garrettdehart/homeassistant/media/photos \| wc -l'` | `212` |
| AdGuard Pi | `ssh adguard 'uptime'` | responds |
| Card tests | `cd custom_cards/screensaver-card && npm test` | **109 passing** |
| Dashboard parses | `python3 -c "import yaml,io; yaml.safe_load(io.open('homeassistant/dashboards/kitchen.yaml',encoding='utf-8'))"` | no output |
| Zigbee devices | see §5 recorder-DB snippet, or count `devices_v15` | **4** (coordinator + 3 bulbs) |
| Light entities | `light.*` in `core.entity_registry` | **3** |
| Signal sensors | RSSI/LQI rows, `disabled_by` | **6 enabled, 0 disabled** |
| Repo == Pi | `diff homeassistant/dashboards/kitchen.yaml <(ssh kitchencom 'sudo cat …/dashboards/kitchen.yaml')` | no output |

**No project-wide test suite / typecheck / build.** The only test suite is
`custom_cards/screensaver-card` (109 passing). Everything else is YAML + docs + Pi deployment;
the verification loop is: edit → parse YAML → deploy → restart HA → grep log → look at the panel.

⚠️ **`custom_cards/screensaver-card` typecheck reports 3 PRE-EXISTING errors** in
`test/dist-browser-loadable.test.ts` (missing `@types/node`). Unrelated to any recent change —
do not chase them as a regression. `npm test` is clean.

⚠️ **`dist/` is gitignored.** The built card is deployed to the Pi but never committed. After
editing the card: `npm run build`, copy to the Pi, **and bump the `?v=` cache-buster** in
`.storage/lovelace_resources` (now **v11**) — otherwise the panel serves the cached bundle.

**Known-benign drift:** `habluetooth.scanner ... Failed to force stop scanner`
(`AttributeError: 'NoneType' object has no attribute 'send'`) repeats every few minutes.
Bluetooth stack, unrelated. Do not chase it.

---

## 3. Branches — what is live and what is parked

`main` now carries the entire kitchen-panel arc **and adaptive lighting**. Every feature branch
below is **behind main by 120-121 commits** (`research/att-network-control` by 95) and would
need a rebase/merge before further work. Verify rather than trust these counts:
`git rev-list --count <branch>..main`.

| Branch | Ahead | What it holds |
|---|---|---|
| `feat/choreops-chores` | 0 | **MERGED via PR #4.** Safe to delete. |
| `fort-knox` | 40 | Grocy deployed to the Pi; SD-card swap postponed (reader + spare card missing) |
| `feat/grocy-kitchen` | 9 | Grocy shopping card — deferred, a concurrent session owned `kitchen.yaml` |
| `feat/adaptive-lighting` | 0 | **MERGED 2026-09-07** (`66d5872`). Safe to delete. |
| `feat/irrigation` | 1 | Rainwater capture design; shares the Zigbee coordinator gate |
| `feat/panel-features` | 1 | Panel feature design — six items, half already built |
| `research/att-network-control` | 1 | AT&T gateway cannot do per-device control — negative result, worth keeping |

**Branch-scoped cold-opens** (read the branch's own, not this one, when working there):
- `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/COLD-OPEN-choreops-chores.md` —
  now historical, but the most detailed record of the panel/ChoreOps arc and still the reference
  for §5's traps

---

## 4. What just shipped

### 4a-quater. Grocy, voice and Kroger groundwork — 2026-09-08 afternoon

**Shipped:**
- **Grocy meal plan is on both calendar views** (`55e58d1`). `calendar.grocy_calendar` already
  existed but was on neither card. ⚠️ Home uses `listWeek`, which renders **only days that have
  events**, so an empty week looks like a broken deploy — it is not.
- **`rest_command.grocy_add_recipe_to_shoplist`** (`de78070`) — pushes a recipe's missing items to
  the shopping list. Wraps **Grocy's own** stock-aware endpoint; do not reimplement it by
  iterating `recipes_pos_resolved`. `check_config` passes. **Activate with
  `rest_command.reload` — no restart needed. NOT YET RUN.**
- **Kroger OAuth harness** at `tools/kroger/` (`68a5820`) — proves both auth flows once
  credentials exist. Error paths tested against live Kroger; success path untested.

**Designs written (no code):**
- `docs/superpowers/specs/2026-09-08-voice-lists-and-meal-plan-design.md`
- `docs/superpowers/specs/2026-09-08-grocery-ordering-notes.md`
- `docs/superpowers/specs/2026-09-08-kroger-api-findings.md`

**Verified live against Grocy 4.6.0 (probes cleaned up afterwards):**
| Fact | Detail |
|---|---|
| Meal plan POST | `type: recipe` and `type: note` both accepted; ICS feed shows both |
| Recipe → list | `POST /api/recipes/{id}/add-not-fulfilled-products-to-shoppinglist` → 204 |
| Barcode mapping | `POST /objects/product_barcodes` records identity with **zero stock movement** |
| External lookup | Resolves national brands (Coca-Cola) but **`null` for Kroger store brands** |
| Real recipes | **4** (Tacos, Chicken Fried Rice, Pasta Pomodoro, Cheesy Beef Skillet) + **4 date-named artifacts** that must never match a spoken phrase |

⚠️ **NO PANTRY INVENTORY IS BEING KEPT — deliberate household decision.** They assume they need
everything and delete what they have at ordering time. So: never propose `add`/`consume` scanning;
0 products in stock is **intended**; and no future rule may ask "do we already have chicken?" —
**the human is the stock sensor.**

⚠️ **Kroger: Products is the search API, NOT Catalog.** Catalog V2 has no free-text parameter at
all. `/v1/products?filter.term=` is the search. Also: the **public** Cart API is a single
write-only `PUT` (cannot list/amend/delete); only **Partner** can delete an item. Neither cart spec
declares a `refreshUrl` — **that is the biggest unknown and must be proven first.**

⚠️ **A live-data lesson:** a probe POST to `add-not-fulfilled-products-to-shoppinglist` added 4 real
rows to the household's actual shopping list (deleted afterwards). Meal-plan probes had used a
far-future date to stay clear of real data; apply that same care to every Grocy write.

### 4a-ter. Chore claiming FIXED — panel claims now work (2026-09-08 midday, `b233a7c`, `55eb992`)

**The bug the user reported: every chore sat at `pending`; tapping and confirming did nothing.**

**Root cause — ChoreOps has TWO claim paths with different authorization:**
- `choreops.claim_chore` (**service**) ALWAYS runs the participation check and **never consults
  kiosk mode** (`is_kiosk_mode_enabled` appears nowhere in `services.py`).
- The per-chore **claim button** skips that check when kiosk mode is on (`button.py:348`), and
  `kiosk_mode: true` was already set.

The panel called the **service**. The kiosk is the non-admin `Panel` user and the kids'
`ha_user_id` is `''`, so every branch of `_has_participation_authority_for_target`
(`auth_helpers.py:332`) returned False → `not_authorized_action` → state unchanged. Proven in the
log at 11:47:56, not merely derived.

**Fix:** `tap_action` now presses the chore's own claim button, read from the sensor's
**`claim_button_eid`** attribute. That attribute comes from
`entity_registry.async_get_entity_id()` on the unique_id, so it is structurally immune to the
`_2`/`_3` and stale-slug traps — do **not** "improve" it by rebuilding the id from the slug.

**Also shipped in the same arc:**
- Claimed chores now leave Morning/Evening and appear under **Completed** as **"Review"**
  (`mdi:clock-check-outline`, amber, full opacity); approved stay dimmed green with `+N pts`.
- To-do tiles show the point value (`2 pts`) instead of `PENDING`.

**Verified end-to-end 12:37-12:38:** Rowan 0.0 → **4.0**, Wystan 0.0 → **4.0**, 3 chores
`approved`, 2 ledger entries each, **0 auth rejections since the fix**.

⚠️ **Approve was deliberately left alone.** It uses `AUTH_ACTION_APPROVAL`, which has **no** kiosk
bypass (`button.py:490`) — so kids still cannot self-approve at the panel and a parent approves as
admin elsewhere. This preserves the `kiosk-admin-approval-hole` fix. Do not "unify" the two paths.

⚠️ **The kids' `ha_user_id` has ALWAYS been `''`** — verified across every backup to July. It is
**not** reset damage, and linking them is **not** needed now that the button path is used.

⚠️ **A dashboard deploy does not reach the panel until the kiosk browser restarts.** The Pi's
file was correct at 10:48 and the panel still called the old service at 11:47. `pkill -TERM -f
"chromium --js-flags"` (over SSH — the supervisor respawns in ~3 s) cleared it. An HA restart does
**not**; see `kiosk-service-worker-serves-stale-js`.

### 4a. Adaptive lighting — LIVE (merged `66d5872`, 2026-09-07 night)

The arc that had been staged-but-blocked since August is **done and verified running**, not
desk-checked.

- **Coordinator gate cleared** — ZBDongle-P (TI CC2652) on `/dev/ttyUSB0`, network formed on
  **ch 15 / PAN 2701**.
- **Three Third Reality ZL1 bulbs paired** in their final fixtures — Living Room, Wystan's,
  Rowan's. `devices_v15` = 4 (coordinator + 3), `light.*` = 3.
- **§2 flux switch and §3 automations activated** in `homeassistant/packages/lighting.yaml`.
- **`mode: mired` confirmed from the hardware**, not the box: every bulb reports
  `color_capabilities = 25` (`0b11001`, bit 4 = ColorTemperature) over **142-454 mired**.
- **Lights section added to the Home view** — three `tile` cards with brightness sliders plus
  the master switch, sitting 2-across.
- **ChoreOps reset to day one** — Rowan 6.0 → 0.0, ledgers cleared, all chores back to
  `pending`, one "Cook Dinner" stuck `overdue` since Aug 18 cleared. Definitions all survived.

**End-to-end proof (the leg that had never run):** `input_boolean` on at 21:14:20 → automation →
`switch.adaptive_lighting` on the same second → bulb writes at **21:14:21**.

⚠️ **454 mired is the ZL1's warm FLOOR** and `stop_colortemp: 2200` sits exactly on it. Warmer
requests **clamp silently**, so "not warm enough at night" is a hardware limit, not a config bug.

⚠️ **The adaptive loop is ALL-OR-NOTHING.** `input_boolean.adaptive_lighting_enabled` is a single
global switch; flux has no per-bulb opt-out and re-asserts colour every 60 s on every entity in
the `lights:` list — including the kids' rooms. To exempt a bulb, remove it from that list.

### 4a-bis. Zigbee RF work — 2026-09-08 morning (Pi-side only, no commits)

- **Dongle relocated to its extension cable, ~5 ft from the Pi** — this closes the red
  carry-forward. Verified by the kernel, not by assertion: `usb 1-2: USB disconnect, device
  number 2` at 07:51:13 → re-enumeration as **device number 3** at 07:51:22 → `cp210x converter
  now attached to ttyUSB0`. Same serial, **same `/dev/ttyUSB0`**, so ZHA's pinned path stayed
  valid and no HA restart was needed.
- **All 6 RSSI/LQI sensors enabled** (2 per bulb) by clearing `disabled_by: integration` in
  `core.entity_registry` with HA stopped.
- **Topology scan needs no action** — it already runs automatically. Verified in the installed
  zigpy 1.5.1 source on the Pi: `CONF_TOPO_SCAN_PERIOD_DEFAULT = 4 * 60` minutes and
  `CONF_TOPO_SCAN_ENABLED_DEFAULT = True` (`zigpy/config/defaults.py:49-50`). There is **no
  manual trigger reachable without an API token** — modern ZHA exposes the scan as a websocket
  command, not a service or button.

**Signal baseline (2026-09-08 ~08:38).** No pre-move baseline exists, so this is a starting
mark, **not** evidence the move helped — do not claim an improvement from it.

| Bulb | LQI | note |
|---|---|---|
| Living Room | **69** | steady |
| Rowan | **69** | recovered from 36 |
| Wystan | not yet reported | `on` but quiet since 07:18 |

⚠️ **A freshly-rejoined bulb reports a pessimistic first LQI.** Rowan's read **36** thirty
seconds after rejoining and settled to **69** within ~15 minutes. Do not act on the first
reading after a rejoin.

⚠️ **A bulb switched off at the wall leaves the mesh entirely** — it stops routing for other
devices and cannot receive flux colour updates. Rowan's was off overnight (last seen 22:08,
`unavailable` for 10 h) and rejoined on its own at 08:23:57 with no re-pairing. This is normal,
but with only 3 bulbs each dark one measurably weakens the mesh.

### 4b. Kitchen panel (PR #4, 100 commits, 2026-06-15 → 09-04)

Full detail: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/COLD-OPEN-choreops-chores.md`

- **Chores work end to end.** Claim at the panel, approve from a phone/Mac. The kiosk
  **self-approval hole is closed** — the panel runs as non-admin `Panel`, so a kid can claim but
  not approve. The **auto-approve leak** is closed too: all 14 chores moved
  `auto_approve_pending` → `clear_pending`, so an unverified claim is dropped at midnight
  instead of silently granting points.
- **Rewards pruned to the 4 Cash Outs** (`deploy/choreops-content/prune_rewards.py`).
- **Calendar live**; Kitchen dashboard rebuilt; tap-to-claim tiles in Morning/Evening rows.
- **Screensaver**: 212 photos, portrait pairing, and **shuffle-bag ordering** — order and cursor
  resume across activations, so every photo shows once before any repeats (repeats 25% → 0%).
- **Daily quotes** — `command_line` sensor + Perspective card.
- **Zigbee/ZHA is configured** — ch 15, PAN `2701`, radio live. **No bulbs paired yet.**
- **Pi Wi-Fi fixed** — was 46.7% packet loss from co-channel interference; now 0%.

---

## 5. 🔴 Traps that have each cost real time — read before touching these areas

**ZHA serial path — use `/dev/ttyUSB0`, NOT the by-id path.** HA runs in **Docker** here and
`/dev/serial/by-id/` exists on the host but **not inside the container**. Pointing ZHA at it
stops the radio **silently**: HA still returns 200, zero log errors, but `zigbee.db` never
opens. Diagnostic — a live radio has `zigbee.db-wal`/`-shm` beside the db.
✅ `homeassistant/packages/lighting.yaml` §4 step 1a on `feat/adaptive-lighting` **was** wrong
(it said to use the by-id path); **corrected 2026-09-07** in `45455ad`.
⚠️ **Do NOT use `lsof`/`fuser` to test whether the port is open** — neither is installed on the
Pi, so both return empty and mimic a dead radio (this misled a session on 2026-09-07). Use
`/proc` instead: `sudo bash -c 'for f in /proc/[0-9]*/fd/*; do readlink $f | grep -q ttyUSB &&
echo OPEN; done'`. Also, a config entry's `state: None` on disk proves nothing — that field is
not persisted, so **every** integration reads `None`.

**Zigbee is on channel 15 — do NOT re-form to chase 25.** Home Wi-Fi 2.4 GHz is on ch 10; they
do not overlap. Re-forming would force re-pairing every device for nothing.

**Pi unreachable? Check the ROUTE before blaming the Pi.** Three different conditions look
identical. `route -n get default | grep interface` → `en0` = home, `utun*` = the **work VPN has
captured the LAN** (hit twice on 2026-09-04; `ipconfig getifaddr en0` still shows a
`192.168.1.x` address, so the address is NOT the tell), `10.x` = at the office, where there is
**no path at all** (Tailscale is blocked by Fortinet).

**`core.entity_registry` and `core.restore_state` are NOT live state.** The registry keeps rows
for deleted entities indefinitely; `restore_state` is a startup snapshot. Both showed 16 rewards
long after 12 were deleted. **Query the recorder DB** (`home-assistant_v2.db`, newest `states`
row per `metadata_id`) to prove an entity is gone.

**The calendar card accepts only three views:** `dayGridMonth`, `dayGridDay`, `listWeek`.
`dayGridWeek` / `timeGridWeek` do not exist and **fail silently** to a month view.

**A stuck card after a long screensaver is the BROWSER, not HA.** The kiosk chromium had run
~2 days at 1.25 GB when it produced a permanent spinner. `pkill -TERM -f "chromium --js-flags"`
— the launcher's supervisor loop respawns it in 3s.

⚠️ **Measure with PSS, not summed RSS.** The kiosk runs ~9 chromium processes that share
memory; adding their RSS double-counts it and makes a healthy panel look near the spinner
threshold. Verified 2026-09-07: summed RSS read **1272 MB** at 38 min uptime while true usage
was **782 MB PSS** (largest renderer 367 MB, 6 GB free) — healthy. Use:
```bash
ssh kitchencom 'tot=0; for p in $(pgrep chromium); do tot=$((tot+$(awk "/^Pss:/{s+=\$2} END{print s+0}" /proc/$p/smaps_rollup))); done; echo "$((tot/1024)) MB PSS"'
```
Compare **PSS against the ~1.25 GB spinner figure**; the older "~330 MB at 10 h" note was a
single-process RSS reading and is not comparable to it.

**`kitchen.yaml` is contested** — sessions edit it live on the Pi. Always `diff` the Pi copy
against the repo before deploying, and back up on the Pi first.
✅ As of 2026-09-07 night, **`main` and the Pi are byte-identical** (1922 lines).
⚠️ **Measure the repo copy per-REF, not per-worktree.** A 2026-09-07 session saw the 46-line
"Layout B / PLACEHOLDERS" draft in the `feat/adaptive-lighting` worktree and wrongly concluded
the whole repo was stale. That draft exists only on that branch (cut 2026-08-14, before the
dashboard landed); `main` has had the real file since `592be89`. Use
`git cat-file -p <ref>:homeassistant/dashboards/kitchen.yaml | wc -l` for each ref — and note a
`git show <ref>:path` inside a shell `for` loop mangled the ref and reported **0 lines for every
branch**. A 0 there means the command is broken, not that the file is missing.

**Suffixed entity ids break naive `endswith` filters — TWICE now.** ZHA disambiguates identical
model slugs with `_2`/`_3`, so a bulb's signal sensors are `sensor.…_rssi`, `sensor.…_rssi_2`,
`sensor.…_rssi_3`. A filter matching ids that *end* in `_rssi`/`_lqi` silently returns only the
first bulb. On 2026-09-08 that produced a confident, wrong claim that "only bulb 1 has RSSI/LQI
sensors — ZHA creates them inconsistently." **All three bulbs have identical 11-entity sets.**
Match with a regex allowing the optional suffix: `re.compile(r"_(rssi|lqi)(_\d+)?$")`, or group
by `device_id` from `core.device_registry`.
⚠️ **This is the same failure shape as the branch-count loop below** — a broken query read as a
real result. When a query returns "none" or "zero" for something that ought to exist, suspect the
query first. Verify per-device before explaining an absence away.

**Flux entities NEVER appear in `core.entity_registry`.** `switch.adaptive_lighting` has no
`unique_id`, so it is never registered — polling the registry for it returns nothing no matter
how long you wait, which looks exactly like a silently-dropped YAML package (especially right
after a restart, when the benign Bluetooth stall already makes late entities plausible). This
cost ~4 minutes on 2026-09-07. **Query the recorder DB for live state instead:**
```bash
ssh kitchencom 'sudo python3 -c "
import sqlite3,datetime
c=sqlite3.connect(\"file:/home/garrettdehart/homeassistant/home-assistant_v2.db?mode=ro\",uri=True)
for r in c.execute(\"\"\"SELECT sm.entity_id,s.state,s.last_updated_ts FROM states s
JOIN states_meta sm ON s.metadata_id=sm.metadata_id
WHERE sm.entity_id LIKE \"switch.adaptive%\" ORDER BY s.last_updated_ts DESC LIMIT 5\"\"\"):
    print(r[0],r[1],datetime.datetime.fromtimestamp(r[2]))
"'
```
`supported_color_modes` is likewise **never written to the recorder** — read the Zigbee
`color_capabilities` attribute from `zigbee.db` instead.

**An unassigned ZHA device shows a MISLEADING Area.** In Settings → Devices it renders as
`Kitchen ▸ Texas Ins…` — that is the **inherited area of the parent coordinator** (which lives in
Kitchen), not an assignment. Its own `area_id` is `None`. Do not "fix" a Kitchen assignment that
was never made; check `area_id` in `core.device_registry`.

**Editing ChoreOps `.storage` requires HA STOPPED.** ChoreOps holds the file in memory and
rewrites it on shutdown, so a live edit is silently clobbered on the next restart. Same applies
to `core.area_registry` — area renames are UI actions. And a malformed `point_periods` produces
**no error anywhere**; the only symptom is the points sensor reading "Unavailable", so verify by
sensor, not by file. Adults (Garrett, Rebecca) have `point_periods: null` — leave that null.

**Deleting a ChoreOps reward does NOT check `pending_count`** — it silently discards a
redemption the kid already spent points on. `prune_rewards.py` guards this; the UI does not.

---

## 6. Hardware

**Kitchen Pi** — `ssh kitchencom` @ `192.168.1.234` (reserved). **Moved ~10 ft on 2026-09-07**;
now piled behind the ViewSonic with the brick and antenna. Wi-Fi is unaffected (-58 to -64 dBm,
3.3% loss, tx-failure counter frozen). ⚠️ **Thermal headroom is reduced in that pile:** idle is
~55 °C but 4-core load reaches the 80 °C soft limit in ~100 s and throttles, peaking at
**83.4 °C** (`throttled=0x80008`). It plateaus there rather than running away, and cools to
55 °C in ~90 s. **Not** a power fault — core voltage held 0.8960 V with no under-voltage
events. Normal kiosk duty never gets near it; see `pi-thermal-headroom-in-the-pile.md`.
✅ **The Zigbee dongle is now on its extension cable, ~5 ft from the Pi** (2026-09-08 07:51,
kernel-verified — see §4a-bis). Target separation was 30 cm minimum / 50 cm-1 m ideal, to get the
antenna clear of the Pi's USB3 controller and 2.4 GHz Wi-Fi radio; 5 ft comfortably exceeds it.
⚠️ **After any re-plug, confirm the path is still `/dev/ttyUSB0` and ONLY that.** Re-enumeration
as `ttyUSB1` kills the radio silently, because ZHA's path is pinned (it must be — `by-id` does
not exist inside the Docker container). Check `ls /dev/ttyUSB*` and `dmesg -T | tail`. Pi 5, HA in **Docker** (there is
no `homeassistant.service`; use `docker restart homeassistant`). Runs labwc/Wayland; the kiosk is
chromium launched from `~/.config/labwc/autostart` via
`deploy/kiosk/start-kiosk-wayland.sh`, which supervises and respawns it. Needs its **own 27 W
supply**. Touch requires a **USB hub** in the path. Tailnet `100.91.117.105`.

**Wi-Fi — pinned to 2.4 GHz ch 10 (2026-09-04).** It was on 5 GHz ch 44 where a **hidden AP
`C6:98:5C:AB:21:A2`** sat on the same channel: 46.7% packet loss with *clean* latency, which is
the signature of collisions rather than distance. Now 0% loss. Persisted in netplan
(`band: "2.4GHz"`, `powersave 2`); backup `/etc/netplan/90-NM-37d92620-*.yaml.bak-preband-*`.
Better long-term: change the router's 5 GHz channel away from 44, or plug in ethernet
(**`eth0` is DOWN**).

**Zigbee** — ITead **ZBDongle-P** (CC2652P; the CP210x bridge → `ttyUSB` is the -P
discriminator). On the Pi's **root hub via the 1.5 m extension cable** (see above).
⚠️ **Do NOT move the dongle onto a USB hub.** Its problem is RF proximity, not connectivity, and
a hub adds a failure point to the subsystem with the nastiest failure mode — a hub-induced
re-enumeration to `ttyUSB1` takes the mesh down with no error. The touchscreen is what needs a
hub; the dongle wants a direct port plus distance.
**3 Third Reality ZL1 bulbs paired** (2026-09-07), NWK 49012 / 56913 / 56469, all reporting
`color_capabilities = 25` over 142-454 mired. Entity ids are the ZHA slugs
`light.third_reality_inc_3rcb01057z{,_2,_3}` — the UI renames changed display names only.
⚠️ The `_2`/`_3` suffixes are **positional** disambiguation of identical model slugs, not stable
identity: re-pair a bulb and a suffix can land on a different physical bulb. Confirm by area.

**AdGuard Pi** — `ssh adguard` @ `192.168.1.113`. Home-LAN only (**not** on the tailnet), so
`Connection refused` usually means the wrong network. Runs in **Docker** — `systemctl` reports
nothing about it.

---

## 7. Carry-forwards

- ✅ **HARDWARE — SETTLED 2026-09-08.** **Voice PE ordered.** **Buy no USB hub.**
  - 🔴 **DO NOT REPLACE THE USB HUB OR THE PRINTER CABLE.** That powered-hub + old USB-B cable
    combination was the ONLY one that worked after a long session of cable-swapping. A spare
    4-port hub (`3-2.4`) is already in the chain and **empty** — plug into that.
    Do **not** reason from the panel's 12 M / 100 mA draw: that is what it pulls once enumerated
    and says nothing about why enumeration fails without a hub. See `viewsonic-touch-needs-hub`.
  - **Voice PE** is a **Wi-Fi satellite — no USB at all**, so it cannot disturb that chain. Wake
    word runs on the device and STT goes to Gemini, so the "offload speech processing on weaker
    hardware" warning on HA's Voice PE page does not apply here (Pi 5 / 8 GB, load ~0.3, and the
    expensive step is already offloaded). No custom wake words.
- 🟡 **Kroger developer app not yet registered.** Blocks all grocery-ordering work. See §7b.
- 🟡 **`rest_command.grocy_add_recipe_to_shoplist` has never been run.** Needs
  `rest_command.reload` first. See §7b.
- 🔴 **AdGuard is BUILT but NOT IN SERVICE** — the router still needs pointing at
  **`192.168.1.113`** for DNS. Until then none of the blocking or scheduling applies to any
  device.
- 🔴 **25 photos have only ONE copy.** Backup audited 2026-09-04 filename-by-filename: the 90
  added that day are in `Photos/__KitchCom` ✅, 97 of the original 122 are in
  `Photos/../Mom's Photos` ✅, but **25 exist only as HEIC in `~/Downloads`** (`IMG_2816`,
  `IMG_2822`, `IMG_2823`, `IMG_2825`, `IMG_2832`, `IMG_2839`, `IMG_2857`, `IMG_2869`,
  `IMG_2872`, `IMG_2881`, `IMG_2902`, `IMG_2908`, …). `~/Downloads` is not a backup. **The 212
  photos are Pi-only and not in git** (correctly — binary content), so a fresh clone cannot
  reproduce the screensaver.
- ✅ ~~**Move the Zigbee dongle to its extension cable.**~~ **DONE 2026-09-08**, ~5 ft, kernel-
  verified (§4a-bis).
- 🟡 **Topology scan due ~12:00 on 2026-09-08** (4 h after the 08:09 HA restart). It refreshes
  `neighbors_v15`, which is currently **stale at LQI=0** — written before the dongle moved. Pull
  it then for the first complete mesh picture; nothing needs to be held open for it.
- ✅ ~~**Wystan's bulb has not reported signal.**~~ **EXPLAINED 2026-09-08** — it is simply
  **switched off at the wall**, which removes it from the mesh entirely (not a fault). It produced
  210 `NWK_NO_ROUTE` errors 08:10 → 09:19 and then **stopped on its own** when ZHA marked it
  `unavailable` and flux's `is_on()` guard began skipping it. **Do not add a flux availability
  condition — it would duplicate a guard HA already has.** See
  `flux-retries-are-self-limiting`. It rejoins by itself when powered back on.
- 🟡 **Bulb 4 of 4 is unplaced.** Adding it is: pair via ZHA → **Add device** (do NOT re-form the
  network), append one line to the `lights:` list in `homeassistant/packages/lighting.yaml`, and
  copy one `tile` into the Lights section of `homeassistant/dashboards/kitchen.yaml`. Not a
  rewrite. ⚠️ Deploy dashboard edits to the **Pi** and sync back; do not assume the repo copy is
  what is live.
- 🟡 **Areas still need creating in the UI** — bulb 2 sits in the generic `Bedroom` (rename it to
  "Wystan's Bedroom") and bulb 3 has **no area at all** (create "Rowan's Bedroom"). Cosmetic:
  flux targets entity_ids, not areas. Area edits are UI-only (see §5). Re-confirmed 2026-09-08:
  bulb 3's `area_id` is still `None`.
- 🟢 **Watch bulb 2 (Wystan) on the adaptive loop.** In the first verified run, bulbs 1 and 3 got
  writes at 21:14:21 but bulb 2 did not — consistent with flux skipping lights that are off, or a
  colour already at target. Not diagnosed as a fault; worth a look if it never shifts.
- 🟡 **`feat/choreops-chores` AND `feat/adaptive-lighting` are merged and safe to delete**,
  locally and on origin (both worktrees too).
- 🟡 **Every other feature branch is 105-106 commits behind main** (`research/att-network-control`
  by 80) and needs a rebase before work.
- 🟡 **`listWeek` hides empty days** — FullCalendar's list view renders only days with events.
  Showing all 7 cells would need a custom card.
- 🟡 **Router 5 GHz ch 44 is still contested**; the Pi is parked on 2.4 GHz as a workaround.
- 🟢 ~~**Chore Champion `6/250` un-zeroed** for Rowan~~ — **RESOLVED 2026-09-07** by the full
  ChoreOps reset (see §4a). Rowan 6.0 → 0.0, ledger cleared, all chores `pending`. Backup:
  `.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-prefullreset-*`.
- 🟢 **Points-structure trap:** zeroing points naively breaks the points sensor — every level
  must be a dict with `all_time` **nested**. Presents ONLY as the entity showing "Unavailable".

---

## 7b. What is the next move?

Nothing is half-built and nothing is blocked on a decision. Two threads are **waiting on the
outside world**, and one small thing is ready to run.

### 🎯 Ready right now — activate and test the recipe→shopping-list command (2 min)

Built, deployed, `check_config`-clean, but **never actually run**:

1. Call **`rest_command.reload`** (Developer Tools → Actions). **No HA restart needed.**
2. Call **`rest_command.grocy_add_recipe_to_shoplist`** with `recipe_id: 1` (Tacos).
3. Check Grocy's shopping list — expect **4 rows** (all ingredients, because no stock is tracked).
4. ⚠️ **Delete the test rows afterwards** — that is the household's real list.
   `DELETE /api/objects/shopping_list/{id}`.

### ⏳ Waiting on hardware — voice

The **HA Voice Preview Edition was ordered 2026-09-08**. Nothing can be built or tested until it
arrives. When it does, the design is ready:
`/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/docs/superpowers/specs/2026-09-08-voice-lists-and-meal-plan-design.md`

**First implementation step is a verification, not code:** confirm which `todo.*` entities accept
`todo.add_item`. `supported_features` is **not in the recorder**, so it must be read live.

### ⏳ Waiting on the user — Kroger credentials

The user was going to register an app at **developer.kroger.com**. When they have a client id and
secret, run the harness and paste the output:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/tools/kroger
export KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...
python3 kroger_auth.py client && python3 kroger_auth.py search milk
python3 kroger_auth.py authorize      # open URL, approve, copy ?code=
python3 kroger_auth.py exchange CODE
python3 kroger_auth.py refresh        # <- THE decisive result
```

**Interpret it as:** `REFRESH WORKS` → viable, store and renew silently. `NO REFRESH TOKEN` →
re-consent every `expires_in`, and the design must change. Read
`/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/tools/kroger/README.md` first.

### Other standing options

1. **Place bulb 4** (the dongle move is DONE — §4a-bis; do not redo it). Read first:
   `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/homeassistant/packages/lighting.yaml` §4.
2. **Two-minute UI cleanup** — rename the `Bedroom` area to "Wystan's Bedroom", create
   "Rowan's Bedroom" for bulb 3. UI-only; see §5.
3. **The oldest 🔴 carry-forward** — point the router's DNS at AdGuard (`192.168.1.113`).
4. **Back up the 25 single-copy HEICs** out of `~/Downloads` (§7).

⚠️ **Paths above are in the `main-merge` worktree, NOT the repo root.** The root has
`feat/choreops-chores` checked out, which predates the lighting merge.

**Mandatory pre-flights, whatever you pick:**
- `git branch --show-current` — this checkout is **shared**; `main` lives in
  `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge`, and the repo root has
  `feat/choreops-chores`.
- `route -n get default | grep interface` before concluding the Pi is unreachable (§5).
- Read §5 in full before touching ZHA, `kitchen.yaml`, ChoreOps `.storage`, or the entity
  registry. Every trap there cost a real session.

---

## 8. Memory layer

`/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`
(outside the repo; `MEMORY.md` there is the index — **57 entries**)

Most relevant on `main`:
- 🔴 `zha-must-use-ttyusb-in-docker.md` — before touching the ZHA serial path
- 🔴 `pi-wifi-cochannel-interference.md` — before diagnosing any Pi connectivity
- `entity-registry-is-not-live-state.md` — proving an entity is really gone
- `calendar-card-only-three-views.md` — the 3 valid `initial_view` values
- `kiosk-spinner-after-screensaver.md` — a stuck card is the renderer, not HA
- `screensaver-photos-folder-and-formats.md` — folder, formats, HEIC trap, ordering
- `reward-delete-drops-pending-claims.md` — `delete_reward` ignores `pending_count`
- `kitchen-yaml-contested-file.md` — the shared-file discipline
- `kiosk-admin-approval-hole.md` — `group_ids` is authoritative, not `is_admin`
- `midnight-rollover-guard.md` — the phantom re-award, and why midday restarts are safe

Added 2026-09-07 (lighting/chores arc):
- 🔴 `choreops-full-reset-procedure.md` — STOP HA first; adults keep `point_periods: null`
- 🔴 `flux-entities-not-in-registry.md` — why `switch.adaptive_lighting` is never in the registry
- `zl1-color-temp-limits.md` — `mode: mired` confirmed; 2202 K is the warm floor
- `lights-section-on-home.md` — 2-across via `grid_options.columns`, NOT `max_columns`
- 🔴 `zha-suffixed-entity-ids-break-filters.md` — when a query says "none", suspect the query

- 🔴 `choreops-claim-service-vs-button.md` — the SERVICE ignores kiosk mode; use the BUTTON
- `flux-retries-are-self-limiting.md` — a bulb off at the wall: ~70 min of errors, then silence
- 🔴 `grocy-api-write-endpoints.md` — verified Grocy writes; **probes must never hit the real list**

**Environment gotchas that cost time:**
- **`timeout` does not exist on macOS** — use `ssh -o ConnectTimeout=N`.
- **`--include=*.py` fails unquoted under zsh** — quote it.
- **`sudo cmd > file` fails** — the shell redirects unprivileged; use `sudo tee` or a heredoc.
- **`cd` into a nested repo changes cwd for later tool calls** — use absolute paths (this is
  also the load-bearing rule in the project `CLAUDE.md`).
