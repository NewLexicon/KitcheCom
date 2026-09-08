# KitchenCOM — cold-open (`main`)

**Last refreshed:** 2026-09-07 night, after **`feat/adaptive-lighting` merged** (`66d5872`).
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
2179800 docs: cold-open — adaptive lighting live, ChoreOps reset, repo/Pi reconciled
66d5872 Merge feat/adaptive-lighting: adaptive lighting live on three ZL1 bulbs
ff11b5f feat(panel): add the Lights section to Home — 2-across tiles + master switch
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

All re-verified **2026-09-07 night**.

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
🔴 The **Zigbee dongle is STILL plugged straight into the Pi**, not on its extension cable. This
was tolerable while the coordinator was alone; **three bulbs now depend on it**, so this has been
promoted from a nicety to a real carry-forward — do it before placing bulb 4 somewhere distant,
since that is when range actually gets tested. Moving it also helps the thermal pile above. Pi 5, HA in **Docker** (there is
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
discriminator). On the Pi's root hub, **not** on the extension cable (see above).
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
- 🔴 **Move the Zigbee dongle to its extension cable.** Three bulbs now route through a radio
  sitting flush against the Pi's USB3/Wi-Fi — the single most common ZHA complaint. Pairs
  naturally with the thermal-pile fix (§6).
- 🟡 **Bulb 4 of 4 is unplaced.** Adding it is: pair via ZHA → **Add device** (do NOT re-form the
  network), append one line to the `lights:` list in `homeassistant/packages/lighting.yaml`, and
  copy one `tile` into the Lights section of `homeassistant/dashboards/kitchen.yaml`. Not a
  rewrite. ⚠️ Deploy dashboard edits to the **Pi** and sync back; do not assume the repo copy is
  what is live.
- 🟡 **Areas still need creating in the UI** — bulb 2 sits in the generic `Bedroom` (rename it to
  "Wystan's Bedroom") and bulb 3 has **no area at all** (create "Rowan's Bedroom"). Cosmetic:
  flux targets entity_ids, not areas. Area edits are UI-only (see §5).
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

Nothing is half-built and nothing is blocked on a decision. `main` is clean, pushed, and
byte-identical to the Pi. Pick whichever of these fits the session:

1. **Physical, and the highest-value single action** — move the Zigbee dongle onto its USB
   extension cable, and place **bulb 4** while you are there. Read first:
   `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/homeassistant/packages/lighting.yaml` §4 (the
   activation checklist; steps 0/1a/1b are DONE — do **not** re-form the network).
   Then: pair → append one line to the `lights:` list in that file → copy one `tile` into the
   Lights section of
   `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/homeassistant/dashboards/kitchen.yaml`
   → deploy to the Pi → `check_config` → restart → verify via the recorder DB (§5).

2. **Two-minute UI cleanup** — rename the `Bedroom` area to "Wystan's Bedroom" and create
   "Rowan's Bedroom" for bulb 3. UI-only; see §5.

3. **The oldest 🔴 carry-forward** — point the router's DNS at AdGuard (`192.168.1.113`).
   Nothing AdGuard does applies to any device until this happens.

4. **Backup the 25 single-copy HEICs** out of `~/Downloads` (§7).

⚠️ **Both paths above are in the `main-merge` worktree, NOT the repo root.** The root has
`feat/choreops-chores` checked out, which predates the lighting merge — `lighting.yaml` does not
exist there at all. Reading the root copy of `kitchen.yaml` on that branch is likewise not what
is on `main`.

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
(outside the repo; `MEMORY.md` there is the index — **53 entries**)

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

**Environment gotchas that cost time:**
- **`timeout` does not exist on macOS** — use `ssh -o ConnectTimeout=N`.
- **`--include=*.py` fails unquoted under zsh** — quote it.
- **`sudo cmd > file` fails** — the shell redirects unprivileged; use `sudo tee` or a heredoc.
- **`cd` into a nested repo changes cwd for later tool calls** — use absolute paths (this is
  also the load-bearing rule in the project `CLAUDE.md`).
