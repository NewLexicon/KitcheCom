# COLD OPEN — `feat/choreops-chores`

**Refreshed:** 2026-09-04 evening (ZHA live, calendar view fixed, 212 photos, shuffle-bag ordering, Wi-Fi fixed, **PR #4 open**).
> ⚠️ **Two sessions worked this branch on 2026-09-04.** §7b is the other session's AdGuard/tooling
> work; §3b below is this one's. Both are current — do not assume one supersedes the other.
**Read this first.** Everything below is verified, with the command that verifies it.

> ⚠️ `docs/session-state/README.md` is the **main**-branch cold-open and is **STALE**
> (last refreshed 2026-08-14). It still frames an **Aug 18 deadline that has passed** and
> calls `feat/choreops-chores` "a concurrent session's branch — leave it alone," which is
> now **this** branch. Ignore it while working here; it needs a rewrite from main's
> perspective at merge time.

---

## 1. Where is HEAD?

```bash
git branch --show-current                 # expect: feat/choreops-chores
git log --oneline -1                      # authoritative tip — NOT frozen in this doc
git rev-list --count origin/main..HEAD    # ahead of main (use origin/main — local main
                                          #   carries an UNPUSHED commit, see §7b)
git status --porcelain                    # expect: empty
git ls-remote origin refs/heads/feat/choreops-chores   # pushed? compare to git rev-parse HEAD
```

⚠️ **Two sessions share this checkout and both pushed on 2026-09-04.** The branch tip can move
under you mid-session — it did. Re-run `git log` rather than trusting any SHA you remember, and
check `git branch --show-current` before every commit.

**Stable PREFIX of the arc** — immutable and verifiable. The tip is deliberately **not**
frozen here (see below); `5948535` and everything below it will not move:

```
5948535 docs: cold-open §7b — AdGuard card clone, backups, and tooling changes
81a852f feat(screensaver): resume photo order across activations (true shuffle bag)
13dc6ed docs(photos): screensaver photo reference + resize/upload helper
592be89 fix(panel): calendar cards used invalid views and silently rendered as month
38b16a0 docs: cold-open close-out — absolute paths restored, memory roster refreshed
8c4bbf1 docs: reward prune APPLIED and verified on the Pi — only Cash Outs remain
b17970e docs: record the reward-prune decision + the office-network diagnosis
c4edd39 feat(rewards): prune-to-Cash-Outs script + runbook (path 1, prepared offline)
3738f77 docs: cold-start sanity-check fix-ups
99ef30f docs: close the auto-approve leak; root-cause the reward-pruning failure
64fda01 docs: correct the kiosk-approval finding — the hole is closed, not open
2ef6949 docs: session state + branch cold-open for feat/choreops-chores
6c8d7e2 feat(panel): merge each kid's name into the section header bar
a6bb052 feat(panel): tap-to-claim chore tiles, split into Morning/Evening rows
f7e9a88 docs: session state — rollover resolved, Zigbee radio live, Tailscale blocked at work
df611f9 docs: resolve the nightly re-award bug — mechanism found, fix verified
```

The tip is **deliberately not stamped here** — a close-out commit cannot name its own SHA, and
stamping it is itself a commit, so the loop never converges. Ask `git log`. Same for the
ahead-count: quote the command, not the answer.

---

## 2. Empirical state

> **Provenance of the numbers below (be honest with yourself about this).**
> Repo-side facts were re-verified at close on 2026-09-04 evening: **109 tests passing**,
> **3 pre-existing typecheck errors**, `initial_view: listWeek` present, **PR #4 OPEN /
> MERGEABLE**, **99 commits** ahead of `origin/main`.
> **Pi-side facts** (212 photos, ZHA ch 15 / PAN 2701, Wi-Fi ch 10 @ 0% loss, card `?v=11`)
> were verified earlier the same day **while the Pi was reachable**, and could NOT be
> re-checked at close — the work VPN had captured the LAN route (see §6). Re-run the table
> below before relying on them.



| Check | Command | Expected |
|---|---|---|
| Pi reachable | `ssh kitchencom 'uptime'` | responds (LAN) |
| HA healthy | `ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8123/'` | `200` |
| ChoreOps errors | `ssh kitchencom 'sudo grep -icE "choreops.*(error\|traceback)" /home/garrettdehart/homeassistant/home-assistant.log'` | `0`, **unless** the approval error in §5 |
| Dashboard in sync | `diff <(ssh kitchencom 'sudo cat /home/garrettdehart/homeassistant/dashboards/kitchen.yaml') homeassistant/dashboards/kitchen.yaml` | identical (was, at close) |
| YAML parses | `python3 -c "import yaml,io; yaml.safe_load(io.open('homeassistant/dashboards/kitchen.yaml',encoding='utf-8'))"` | no output |

**No test suite / typecheck / build** on this branch — it is YAML + docs + Pi deployment. The
verification loop is: edit → parse YAML → deploy → restart HA → grep log → look at the panel.

**ChoreOps versions — MIND THE GAP.** Pi runs **1.0.7**; `reference/ChoreOps-main` is
**1.0.8**. They differ *behaviourally* (see §4a). Confirm before trusting either:
```bash
ssh kitchencom 'sudo grep version /home/garrettdehart/homeassistant/custom_components/choreops/manifest.json'
grep version reference/ChoreOps-main/custom_components/choreops/manifest.json
```

**HA runs in DOCKER** — there is no `homeassistant.service`:
```bash
ssh kitchencom 'docker restart homeassistant'   # back to 200 in ~20s
```

**The ChoreOps store is a DIRECTORY, not a file** (`json.load` on it raises
`IsADirectoryError`). Live store — siblings are `_recovery`/`_removal`/`.bak-*` snapshots:
`/home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ`
Top-level keys: `meta users chores badges rewards penalties bonuses achievements challenges notifications`.

**Telling a live entity from an ORPHAN** (registry presence proves nothing — HA keeps rows for
entities an integration stopped creating). Use a **control group**: the known-dead
`chore_status_fishy` / `chore_status_feed_cats` are **absent** from `core.restore_state`; an
entity still being created is **present with a post-restart timestamp**. Also check the file's
mtime against the restart time. `unknown` state proves nothing — a never-pressed button always
reads `unknown`.

**Known-benign drift:** `habluetooth.scanner ... Failed to force stop scanner`
(`AttributeError: 'NoneType' object has no attribute 'send'`) repeats every few minutes.
Bluetooth stack, unrelated to this project. Do not chase it.

---

## 3. What just shipped and why

Full detail: **`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-02-panel-tap-to-claim-and-rows.md`**

1. **The nightly phantom re-award is CLOSED.** `None` was failing the midnight-catchup guard
   open before the `schema45_seed_last_midnight_processed` migration existed, so every startup
   replayed the day's daily chores with their original `reference_id`s. Fixed upstream;
   verified by two deliberate mid-day restarts, three more during panel work, and one
   unattended overnight (stamp advanced to `2026-09-03T04:00:00.323600Z`, Rowan unchanged at
   2.0 / 1 entry). **A midday power outage does NOT double that day's points.**
2. **Tap-to-claim** — tiles called `more-info` (that was the popup Garrett photographed);
   they now call `choreops.claim_chore`, which routes to approval. **Confirmed working**:
   `Fishy — Evening` sits in `state=claimed`.
3. **Morning/Evening rows** — was `sort: method: state`, which left everything tied at
   `pending` and therefore unordered. Now explicit per-row entity lists with
   `sort: method: none`.
4. **Header merge** — kid's name moved into the tinted bar, "Chores Due" dropped.
   Rowan `#4fc3f7`, Wystan `#ba68c8`.

### Then on 2026-09-03 (this session)

Full detail: **`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-03-missable-chores-and-reward-pruning.md`**

5. **`Fishy — Evening` APPROVED** — the waiting claim is cleared. Rowan is at **6.0 points**
   (`by_source.chores = 6.0`). No claims are pending.
6. **Auto-approve leak CLOSED.** All 14 chores moved
   `approval_reset_pending_claim_action`: `auto_approve_pending` → **`clear_pending`**.
   Previously a kid could tap a chore they had not done and the points were **auto-granted at
   midnight with no parent approval**. Now an unverified claim is dropped at the boundary.
   Verified after an HA restart, 0 ChoreOps errors.
7. **"Missable" was investigated and is PARTLY A NON-ISSUE — read §4a before promising it.**
8. **Reward pruning FAILED (root-caused).** See §4a — it is a 1.0.7-vs-1.0.8 version gap, and
   the ineffective data edit is still applied.

---

### Then on 2026-09-04 (panel/photos/network session)

Ran alongside the AdGuard session in §7b — **the branch tip moved under both of us.** Verify
`git log` rather than trusting any SHA written here.

1. **ZHA IS NOW CONFIGURED — §4d is DONE.** Network formed on **channel 15**, PAN `2701`,
   ext-PAN `e1:e5:88:cc:f0:a0:a0:02`, radio_type `znp`, coordinator IEEE
   `00:12:4B:00:3A:04:E7:4E`. 0 ZHA errors. **No bulbs paired yet** (`devices_v15` = 1).
   🔴 **Channel 15 is FINE — do NOT re-form to chase 25.** Home Wi-Fi 2.4 GHz is now on ch 10;
   re-forming would force re-pairing every device for nothing.

2. **Calendar cards were using INVALID views** (`592be89`). The card accepts only
   `dayGridMonth` / `dayGridDay` / `listWeek` — verified in the shipped frontend bundle
   (`hass_frontend/frontend_latest/64859.*.js`). `dayGridWeek` and `timeGridWeek` do not exist,
   so both cards silently fell back to a **month** view while their comments described week
   layouts that never rendered. Home is now `listWeek`, Schedule explicit `dayGridMonth`.

3. **Photos: 122 → 212** (287 MB), all valid JPEGs. Added 90 from Dropbox via
   `deploy/photos/add-photos.sh` (resize to 1920px, HEIC→jpg). Two incoming files collided with
   existing *different* photos and were renamed `IMG_0249-dbx.jpg` / `IMG_0263-dbx.jpg`.

4. **Screensaver ordering is now a true shuffle bag** (`81a852f`). The start was always random;
   the defect was **repeats** — independent reshuffles meant ~25% of a session repeated from the
   previous one. `_startLoop` now resumes the previous order AND cursor when the folder is
   unchanged. Measured: repeats **25% → 0%**, coverage **99/122 → 122/122**. 109 tests pass.

5. **Wi-Fi FIXED — this was behind the SSH drops all day.** Not distance: a **hidden AP
   (`C6:98:5C:AB:21:A2`) sat on the same 5 GHz channel 44**. Symptom shape was clean latency
   (6-20 ms) with **46.7% packet loss**. Pinned to 2.4 GHz → **ch 10, signal 66, 0% loss**.
   Also disabled Wi-Fi power save. Both persist (netplan `band: "2.4GHz"`, `powersave 2`).

6. **PR #4 IS OPEN** — https://github.com/NewLexicon/KitcheCom/pull/4 (`feat/choreops-chores`
   → `main`, MERGEABLE, 99 commits, 51 files).

---

## 4. What's the next move?

**Nothing is blocked.** Start here:

### (a) 🔴 FIRST: finish the reward pruning — decide between 3 paths

**Goal (Garrett, 2026-09-03):** *"only have the Cash Outs available as rewards"* — the other 12
come back later via bonuses. **4 Cash Outs** ($1/$5/$10/$20) stay; **12 others** go.

**What was tried and why it failed:** `assigned_user_ids` was emptied on the 12 non-Cash-Outs.
That gate is real in the **vendored 1.0.8** source (`button.py:417-419` +
`is_user_assigned_to_reward`) but **the Pi runs 1.0.7, which has neither** — no
`DATA_REWARD_ASSIGNED_USER_IDS` const, no helper, and its reward loop
(**Pi `button.py:146-148`**) creates buttons for **every** reward with no assignment check.
Per-reward assignment is a **1.0.8 feature**. All 16 rewards still show.

> ⚠️ **THE LESSON — this is the vendored-source trap firing for real.** For any *behaviour*
> question, grep **`ssh kitchencom 'sudo grep ... /home/garrettdehart/homeassistant/custom_components/choreops/'`**,
> NOT `reference/ChoreOps-main`. The vendored copy is **1.0.8**; the Pi is **1.0.7**. Use the
> vendored tree only for form schemas/enums with the Pi off.

**Current data state:** the 12 have `assigned_user_ids: []` (inert on 1.0.7). Originals are
stashed verbatim at **`meta._kc_unassigned_rewards_20260903`** (12 entries). No definition was
deleted. Backup: `.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-premissable-20260903-0958`.

**✅ DONE 2026-09-03 evening — APPLIED TO THE PI AND VERIFIED.** Path 1 (delete the 12) was
chosen and executed. **Only the 4 Cash Outs remain redeemable.** Nothing here is outstanding.

Applied with `deploy/choreops-content/prune_rewards.py --apply` (HA stopped, then restarted).
Dry run was clean: no pending redemptions, and **no per-user `reward_data` to prune** — the
kids had never redeemed anything, so no history was lost.

**Verified after the restart:** store holds 4 rewards; `meta._kc_unassigned_rewards_20260903`
cleared; HA `200`; **0** ChoreOps errors; Rowan still 6.0 points; `kitchen.yaml` identical to
the repo. Backup: `...choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-prunerewards-20260903-173917`.

Live-state proof (`sensor.rowan_choreops_reward_status_*`, newest recorder rows):
the 4 Cash Outs are `locked`; all 12 pruned rewards flipped to `unavailable` at 17:40:05.
`locked` is **normal** — Pi `sensor.py:2729-2740` returns it when points < cost. Rowan has 6.0
and the cheapest Cash Out is 10, so it becomes `available` at 10 points.

> ⚠️ **VERIFYING A PRUNE — do not repeat this mistake.** `core.entity_registry` and
> `core.restore_state` are **NOT** live state. The registry keeps rows for deleted entities
> forever (it had not been written since **2026-09-01**), and `restore_state` is a *startup*
> snapshot. Both showed all 16 rewards long after the prune succeeded. **Query the recorder DB
> instead** — newest `states` row per `metadata_id`, joined to `states_meta`:
> ```bash
> ssh kitchencom 'sudo python3 -c "
> import sqlite3
> c=sqlite3.connect(\"file:/home/garrettdehart/homeassistant/home-assistant_v2.db?mode=ro\",uri=True)
> q=c.execute(\"SELECT sm.entity_id,s.state FROM states s JOIN states_meta sm ON s.metadata_id=sm.metadata_id WHERE sm.entity_id LIKE \x27sensor.rowan_choreops_reward_status_%\x27 AND s.state_id IN (SELECT MAX(state_id) FROM states GROUP BY metadata_id)\")
> [print(e,st) for e,st in sorted(q)]"'
> ```
> The known-dead `treat` / `cash` rewards are the **control group** — they read `unavailable`.

**To bring the 12 back later:** regenerate from
**`/Users/jdehart1/___Code_DEV/KitchenCOM/deploy/choreops-content/gen_content.py`**.
Script used: **`/Users/jdehart1/___Code_DEV/KitchenCOM/deploy/choreops-content/prune_rewards.py`**
(re-runnable; idempotent; dry-run by default).
Runbook, now historical: **`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-03-reward-prune-runbook.md`**

### (b) "Missable" chores — the premise is partly wrong, re-read before acting

Garrett's ask was *"not claimed before midnight → chart resets, no points."*

- **The points half is ALREADY TRUE.** Unclaimed chores never reach the
  `pending_claim_action` branch (guarded by `if context.get("has_pending_claim")`,
  `chore_manager.py:1823`); they fall through to `RESET_AND_RESCHEDULE` — reset, no award.
- **`mark_missed_and_lock` alone is a SILENT NO-OP.** Its guard needs `due_date is not None`
  (`chore_engine.py:706-712`) and **every chore has `due_date: null`** (all
  `per_assignee_due_dates` null too). Setting it without due dates changes nothing.
- **What is genuinely missing:** the visible `missed` mark and a real lock (a late claim is
  still accepted any time before midnight).
- **To do it for real:** set daily due times (e.g. 23:59) + weekly due dates, THEN
  `mark_missed_and_lock`. ⚠️ That also activates currently-inert
  `chore_due_window_offset` (`0d 1h 0m`) and `chore_due_reminder_offset` (`0d 0h 30m`) —
  expect new notifications and possible tile-appearance changes. Garrett deferred this.

### (c) Approve the waiting claim — ✅ DONE 2026-09-03, nothing pending
`Fishy — Evening` is `approved`. Kept here only so a future session does not re-hunt it.
When a claim *does* wait: approve from a **phone or the Mac** (as `KitchenCom`), NOT from the
panel — the panel is deliberately non-admin. See §5.

### (d) ZHA — ✅ SET UP 2026-09-04. Remaining: PAIR THE BULBS (needs Garrett at the panel)

Network is live: **ch 15**, PAN `2701`, `znp`, 0 errors, **0 bulbs paired**.

🔴 **THE SERIAL PATH MUST STAY `/dev/ttyUSB0` — the by-id path BREAKS IT HERE.**
This corrects the instruction that used to sit in this section (and still sits in
`lighting.yaml` §4 step 1a on `feat/adaptive-lighting`), which says to always use
`/dev/serial/by-id/...`. That advice is written for **host-installed** HA. **This Pi runs HA in
Docker**, and `/dev/serial/by-id/` is a udev symlink tree that exists on the host but **not
inside the container** — verified:
```bash
docker exec homeassistant ls /dev/serial/by-id/   # No such file or directory
docker exec homeassistant ls -l /dev/ttyUSB0      # crw-rw---- root dialout 188,0  ✅
```
⚠️ **The failure is SILENT:** HA still returns 200, the log shows **zero** ZHA errors, and the
config entry looks right — but `zigbee.db` is never opened. **Diagnostic:** a live radio has
`zigbee.db-wal` and `-shm` beside it; their absence means ZHA never connected.
Changing the path does NOT harm the network — the config-entry `unique_id` is the extended PAN
ID, not the path (round-tripped 2026-09-04 with channel/PAN intact).

**To pair bulbs** (Third Reality ZL1, on `feat/adaptive-lighting` the runbook is
`homeassistant/packages/lighting.yaml`):
- Settings → Devices & Services → **Zigbee Home Automation** → Add Device, then power-cycle an
  unprovisioned ZL1 to enter pairing mode
- Pair each bulb **in its final fixture** — mains-powered bulbs are mesh routers, so location
  shapes the mesh
- Then check `supported_color_modes`: `color_temp` present → `mode: mired`; only `hs`/`rgb`/`xy`
  → `mode: xy`. The ZL1 box says "Tunable White", so `mired` is expected
- Only then uncomment §2/§3 of `lighting.yaml`, `check_config`, restart

### (e) Calendar CSS decision — STILL OPEN (the *view* was fixed 2026-09-04, the CSS was not)
⚠️ Don't conflate the two. **Fixed:** the cards were using invalid `initial_view` values and
rendered as a month; Home is now `listWeek` (§3b item 2). **Still open:** the "SEPT 2" styling
below — a different problem with a different cause.
Carried since 2026-09-01. The built-in calendar card **cannot** produce "SEPT 2" strings —
they come from FullCalendar inside a shadow root. Real paths are a custom card or an HA theme,
both written up with source citations in
**`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-01-calendar-live-and-panel-layout.md`**

---

## 5. ✅ NOT A BUG: the kiosk cannot APPROVE chores — that is the fix working

Observed in the log **2026-09-03 08:01** — a real user action:

```
ERROR ... Authorization failed to Approve Chore 'Morning Brush' for Assignee 'Rowan':
          You are not authorized to approve_chores
```

**Why the two paths differ** (`helpers/auth_helpers.py`):

- **Claim** → `_has_participation_authority_for_target()`. Admin short-circuits, but it also
  falls through to per-user checks, and **`CONF_KIOSK_MODE` skips the assignee check on claim**
  (`button.py:623`) so unlinked kids can claim. Non-admin `Panel` claims fine.
- **Approve** → `_has_approval_authority_for_target()` → gated behind
  **`is_admin_approval_bypass_enabled(hass)`**. ⚠️ **CORRECTED 2026-09-03: this setting reads
  `True`**, not off (`core.config_entries` → ChoreOps entry → `options.admin_approval_bypass`).
  The conclusion is unchanged because it is an **admin** bypass — per `auth_helpers.py:70-83`
  it lets an HA *admin* skip the approval **link** check, and the kiosk runs as **non-admin
  `Panel`**, so it grants the panel nothing. The 08:01 refusal above is the live proof.
  Non-admin `Panel` is refused. This is the intended split.

  **The non-admin `Panel` user is therefore the ONLY thing holding this door shut.** If a kid
  were ever linked to an admin HA user, or the kiosk switched back to an admin account,
  self-approval opens immediately. Verify with:
  `ssh kitchencom 'sudo python3 -c "import json;d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.config_entries\"));print([e[\"options\"].get(\"admin_approval_bypass\") for e in d[\"data\"][\"entries\"] if e[\"domain\"]==\"choreops\"])"'`

**Identity facts — verified 2026-09-03:**
- HA users: **`Panel`** (`system-users`, NON-admin) — **this is what the kiosk runs as**;
  **`KitchenCom`** (`system-admin`) — Garrett's Mac/phone; `Home Assistant Content`
  (`system-read-only`, system-generated).
- ⚠️ **The raw `is_admin` field in `.storage/auth` reads `None` for EVERY user.**
  **`group_ids` is authoritative.** Reading `is_admin` will wrongly suggest nobody is admin.
- ChoreOps `Garrett` and `Rebecca` **share one HA user** (`KitchenCom`, `487379b1...`), both
  `can_approve=True`. `Rowan` and `Wystan` are **UNLINKED** (no `ha_user_id`) — which is why
  kiosk mode is required for them to claim at all.

**This is the self-approval hole being CLOSED, not a regression.** Verified 2026-09-03 from
refresh tokens: the kiosk browser runs as **`Panel`** (ip `::1` = localhost on the Pi), while
`KitchenCom` sessions come from `192.168.1.180` — Garrett's **Mac**, not the panel. An earlier
memory note said the kiosk ran as admin `KitchenCom` and could self-approve; that fix was
implemented at some point between 2026-08-17 and now, and the memory has been corrected.

**Do NOT "fix" this by enabling `is_admin_approval_bypass_enabled`** — that re-opens the hole,
letting any kid at the shared panel approve their own chores.

Parents approve from a phone/Mac as `KitchenCom`. **Remaining minor gap:** Garrett and Rebecca
share that one HA account, so approvals are not attributable to a specific parent. Linking
Rebecca to her own HA user would fix it. Not urgent.

⚠️ **There is a real claim waiting**: `Fishy — Evening` is in `state=claimed` and needs a
parent approval from a non-panel device.

---

## 6. Hardware facts worth not re-deriving

**Zigbee — hardware live, ZHA NOT configured.**
- ITead **ZBDongle-P** (CC2652P), `SYS_VERSION` → `transport=2 product=1 fw=2.7.1`.
- **-P vs -E discriminator:** the **CP210x** bridge (`10c4:ea60` → `ttyUSB`) means **-P**.
  The -E is EFR32MG21 with native USB → `ttyACM`.
- 🔴 **ZHA must use `/dev/ttyUSB0` — CORRECTED 2026-09-04.** The by-id path
  (`/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_8aae1a09dd9def11b750cda661ce3355-if00-port0`)
  exists on the **host** but NOT inside the HA **Docker** container, so pointing ZHA at it stops
  the radio silently. See §4d. The by-id path is still the right way to *identify* the dongle
  from a host shell — just not what goes in the ZHA config entry.
- Mounted in the USB extension cradle from a surplus Wi-Fi dongle — permanent home, satisfies
  `lighting.yaml`'s extension-cable requirement. Link: 12 Mbps, 100 mA, **direct to Pi root
  hub (bus 001)**, NOT behind the RTS5411 hub the touchscreen needs.
- Home 2.4 GHz Wi-Fi is on **ch 10**. ⚠️ **CHANGED 2026-09-04: the Pi's `wlan0` is now on
  2.4 GHz ch 10 too** (was 5 GHz ch 44 — moved off it because a hidden AP was colliding there;
  see §6b). Zigbee is on **ch 15**, which does not overlap Wi-Fi ch 10, so this is fine.

**Surplus Wi-Fi dongle** (RTL8822BU): unplugged, spare. **No macOS driver exists.** Not a
Zigbee substitute.

**Tailscale from Garrett's office: BLOCKED** by Fortinet (drops the UDP Tailscale needs). Ran
~3 min on cached state, then offline. `tailscale up`/`down` are **no-ops on the Mac App Store
build**. Unaffected at home.

**⚠️ AT THE OFFICE, the Pi is simply unreachable — verified 2026-09-03.** Both `en0` and
`en19` sit on corporate `10.x` subnets (not the home `192.168.1.0/24`), and Tailscale reads
`stopped` — which `tailscale up` cannot fix on the Mac App Store build (§6). There is **no**
path to the Pi from the office; do not burn time hunting one. **Diagnose in this order** —
it takes 15 seconds and distinguishes three different failures that all look like a dead Pi:
```bash
route -n get default | grep interface   # en0 = home · utun* = Cisco VPN · en19/10.x = office
ipconfig getifaddr en0                  # 192.168.1.x = home · 10.x = office
```
Plan office sessions as repo-only work (§4e is the standing candidate).

**⚠️ Cisco VPN gotcha — HIT AGAIN 2026-09-04 evening.** Symptom that time was
`ssh: connect to host 192.168.1.234 port 22: Connection refused` plus **100% ping loss**, with
`ipconfig getifaddr en0` STILL returning `192.168.1.180` — so the Mac *looks* like it is on the
home LAN. The tell is the ROUTE, not the address:
```bash
route -n get default | grep interface        # utun11 = VPN  ·  en0 = home
netstat -rn | grep '^192.168.1'              # "192.168.1 ... utun11" = the LAN is being swallowed
```
Disconnect the work VPN and the Pi returns instantly. **Nothing is wrong with the Pi.**

**⚠️ Cisco VPN gotcha — cost ~20 min on 2026-09-02.** With the work VPN connected *at home*,
the Mac's default route goes to `utun11` and the Pi is unreachable on the LAN;
`ssh kitchencom` returns *"Connection refused"* or a timeout, which reads exactly like a dead
Pi. **Check `route -n get default | grep interface` before diagnosing anything else** — it
should say `en0`.

---

## 6b. 🔴 Pi Wi-Fi — co-channel interference, FIXED 2026-09-04

**The Pi's SSH sessions died mid-command and transfers stalled all day.** It was **not**
distance or a weak radio — the Pi sits ~20 ft from the router, near line-of-sight.

**The diagnostic shape that matters:** latency stayed clean (6-20 ms) while **46.7% of packets
vanished**. Attenuation degrades latency *and* throughput together; clean latency plus heavy
loss means **collisions**.

A **hidden AP `C6:98:5C:AB:21:A2` was on 5 GHz channel 44** — the Pi's own channel:
```bash
ssh kitchencom 'sudo nmcli -f BSSID,SSID,SIGNAL,CHAN dev wifi list --rescan yes'
```

**Fix applied — pinned to 2.4 GHz** (ch 44 signal 56 → **ch 10 signal 66**, loss **46.7% → 0%**):
```bash
sudo nmcli con modify netplan-wlan0-ThunderEnlighten 802-11-wireless.band bg
sudo nmcli con modify netplan-wlan0-ThunderEnlighten 802-11-wireless.powersave 2
# reconnect in the BACKGROUND — taking the connection down kills your own ssh:
sudo nohup sh -c "sleep 2; nmcli con down <profile>; sleep 3; nmcli con up <profile>" &
```
**Both persist** — netplan holds `band: "2.4GHz"`; backup
`/etc/netplan/90-NM-37d92620-*.yaml.bak-preband-20260904-110835`.

Also found `Power save: on` (`iw dev wlan0 get power_save`) — worst-case latency 230 ms → 47 ms
once off, but it did **not** fix the loss; only the band change did.

**Better long-term fixes:** change the router's 5 GHz channel away from 44 (helps every device
and lets the Pi use the faster band), or plug in ethernet — **`eth0` is DOWN**.

---

## 7. ⚠️ Entity slugs are stale — read before touching tile lists

Entity IDs were minted from ORIGINAL chore names and **did not follow renames**:

| Entity ID | Actual chore today |
|---|---|
| `..._chore_status_brush_teeth` | **Morning Brush** |
| `..._chore_status_feed_cats` (bare) | **ORPHAN** — chore no longer exists |
| `..._chore_status_fishy` (bare) | **ORPHAN** — chore no longer exists |
| `..._feed_cats_morning` / `_evening`, `..._fishy_morning` / `_evening` | real |

**Never infer chore identity from the slug.** Map via `core.entity_registry`'s `original_name`
first (command in the session-state doc, §4). The orphans are excluded from the current lists;
they were invisible before only because the `unavailable`/`unknown` excludes caught them.

---

## 7b. AdGuard Pi card clone + tooling changes (2026-09-03/04 session)

**The AdGuard Pi now runs on a CLONED SD card. Verified backups exist off-Pi.**

### Backups on the laptop — `/Users/jdehart1/Pi-Images/`

| File | Size | What it is |
|---|---|---|
| `adguard-20260903.img.gz` | 1.4 GB | Full card image, gzipped. Decompresses to exactly **31,914,983,424 bytes**. |
| `AdGuardHome-20260903.yaml` | 12,518 B | Standalone config, 20 top-level keys, `schema_version: 34`. |

Restore the image to any ≥32 GB card (needs an ADMIN account — see below):

```bash
sudo sh -c 'gzip -dc /Users/jdehart1/Pi-Images/adguard-20260903.img.gz | dd of=/dev/rdiskN bs=4m'
```

⚠️ `AdGuardHome-20260903.yaml` contains the `users:` block with **password hashes**. It is
deliberately OUTSIDE the repo. Never commit it.

### The two SD cards — tell them apart by SERIAL, not by sight

Both are SanDisk **SDSL32G, manufactured 2016-11**, bought as a pair. Visually identical.

| Serial | Role |
|---|---|
| `0x55ce4187` | **ORIGINAL** — pulled from the Pi, known-good fallback. Keep safe. |
| `0x55ce406f` | **CLONE** — now running in the Pi. |

```bash
system_profiler SPCardReaderDataType | grep -E 'Serial Number|Product Name'
```

⚠️ **The clone did NOT retire the age risk** — only write-wear. Both cards are ~10 years old.
A genuinely new card is still worth buying; with the image file that swap is a 15-minute job.

### Clone verification (all passed)

`dd` read and write both moved 31,914,983,424 bytes / `7609+1` records; MBR `55aa`; ext4 magic
`53ef`; `cmdline.txt` PARTUUID `19cffe87-02` byte-identical to the source; after boot
`example.com` resolved and `doubleclick.net` → `0.0.0.0` (filtering live).

### AdGuard runs in DOCKER — `systemctl` reports NOTHING

`systemctl is-active AdGuardHome` returns `inactive` **even when AdGuard is running fine.**
That is not an outage.

```bash
ssh adguard 'sudo -n docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}"'
```

- Container `adguardhome`, image pinned `adguard/adguardhome:v0.107.78`
- Config bind-mount: **`/opt/adguard/conf/AdGuardHome.yaml`** — NOT `/opt/AdGuardHome/`
- Listens `:53` UDP+TCP and `:3000`

### Blocking config as deployed (read from the live Pi)

- **Filter lists:** AdGuard DNS filter (`filter_1.txt`) enabled; AdAway `enabled: false`.
- **Per-device YouTube schedule, 7 days**, on 6 devices: Oculus-VR, PS5, Roku-55-R625,
  Roku-55-S425, Roku-65-livingrm, iPad-kid-250. `PARENT-device-215` and `PARENT-mac-garrett`
  are deliberately exempt. Every client sets `use_global_blocked_services: false`, which is
  what makes the parent exemption work.
- **SafeSearch:** master `enabled: true`; youtube/google/bing/ddg/ecosia/pixabay/yandex forced.
- `user_rules: []` — no hand-written rules. Add specific domains there.

⚠️ **Two gaps, both deliberate-looking but worth a decision:**
1. `safebrowsing_enabled: false` **globally** while all 8 clients set it `true`. Per-client
   wins, so protection is live — but a **newly added device inherits `false`**.
2. `parental_enabled: false` everywhere. AdGuard's adult-content category blocking is OFF.

**Nothing points at the Pi for DNS yet.** It was not in service during this work; the router
still has to be pointed at `192.168.1.113`.

### 🔴 This Mac needs an ADMIN account for raw disk access

`jdehart1` is **NOT in sudoers** ("jdehart1 is not in the sudoers file"). The admin account is
**`admin-jdehart1`** (`dscl . -read /Groups/admin GroupMembership` → `root admin-jdehart1
tstech jamfadm`). Use `su - admin-jdehart1` in a REAL Terminal — the harness has no TTY for a
password prompt, and `!`-prefixed commands hit the same wall.

The Mac is **Jamf-managed** (DEP-enrolled, `gsu.jamfcloud.com`). If `dd` fails with "Operation
not permitted" *despite* a good sudo, that is policy, not credentials.

### 🔴 `sudo cmd > file` FAILS — the shell redirects UNPRIVILEGED

This cost three attempts. The `>` is performed by *your* shell before `sudo` runs, so it writes
as the unprivileged user and fails on root-only paths.

```bash
sudo sh -c 'cmd > /path/file'      # correct — root performs the redirection
```

Also: under `su - admin-jdehart1`, `~` resolves to **that** account's home. Use absolute paths.

### Claude CLI auto-updater — FIXED at the supported layer

`autoUpdates: false` was being overridden by `autoUpdatesProtectedForNative: true` (native
install). A prior session added `export DISABLE_AUTOUPDATER=1` to `~/.zshrc`; **that did not
hold** — `.zshrc` only reaches interactive shells, and the CLI self-updates in-process at
startup. 2.1.260 installed at 19:54 and repointed the symlink at 20:14, mid-session.

**Fix applied 2026-09-04:** an `env` block in `~/.claude/settings.json` — the location the
binary's own docs name:

```json
"env": { "DISABLE_AUTOUPDATER": "1" }
```

Backup of the file with this change: **`~/.claude/settings.json.bak-20260904-post-env`**
(9,228 bytes). Older backups: `.bak`, `.bak-2026-07-01-pre-claudemem-hooks`,
`.doctor-backup-20260828-080156`.

Currently on **2.1.260** (2.1.258 and .259 remain on disk under
`~/.local/share/claude/versions/`). Takes effect in NEWLY started sessions only. This disables
BACKGROUND updates only — `claude update` still works by hand.

### Project `CLAUDE.md` created on `main` (commit `b2203e6`)

> 🔴 **VERIFIED 2026-09-04 evening: `b2203e6` is UNPUSHED and the file is NOT on this branch.**
> `git rev-list --count origin/main..main` → **1**. It exists only in this laptop's local `main`;
> `origin/main` is at `b6451cb` without it, and **PR #4 does not carry it** (not an ancestor of
> `feat/choreops-chores`). So `/Users/jdehart1/___Code_DEV/KitchenCOM/CLAUDE.md` **does not
> exist in the working tree** while this branch is checked out — do not go looking for it.
> To publish it: `git push origin main`. Left unpushed deliberately — it is the other session's
> commit, not this one's to push.


`/Users/jdehart1/___Code_DEV/KitchenCOM/CLAUDE.md` — the repo had none. Load-bearing rule:
**write read targets as absolute paths, including after a `cd`.** The permission prompt is
armed by four `Read()` deny rules in `~/.claude/settings.json` (`**/.env`, `**/.env.*`,
`**/secrets*`, `**/credentials*`); an unresolvable relative `src/` cannot be proven not to
match them.

**Two theories already falsified — do not retry:** a `Bash(cd *)` allow-rule was present and
did NOT fire; and "never use `cd`" is wrong (absolute `cd` + relative `grep` still prompts).
Does not apply to revspecs (`git diff main...HEAD` has no absolute form).

⚠️ It is committed on **`main`**, so it is NOT visible in this worktree until merged.

---

## 8. Carry-forwards

**From 2026-09-04 (this session):**
- 🔴 **PR #4 is OPEN and unmerged** — https://github.com/NewLexicon/KitcheCom/pull/4
  (99 commits, 51 files, MERGEABLE). **After merge, this cold-open must be REWRITTEN from
  `main`'s perspective** — it is currently branch-scoped.
- 🟡 **Zigbee bulbs are NOT paired** (`devices_v15` = 1, coordinator only). Needs Garrett at the
  panel; see §4d.
- 🟡 **`listWeek` hides empty days.** FullCalendar's list view renders only days that HAVE
  events. If "show all 7 day cells" is ever wanted, the built-in card cannot do it at any
  `initial_view` — that needs a custom card.
- 🟡 **Router 5 GHz ch 44 is still contested** (§6b). The Pi is parked on 2.4 GHz as a
  workaround; changing the router's channel is the real fix and would let it use 5 GHz again.
- 🟡 **`eth0` is DOWN.** A cable would end the Wi-Fi issue permanently.
- 🟡 **The 212 photos (287 MB) exist ONLY on the Pi** — not in git (correctly). The 90 added
  today are in Dropbox; the original 122 may have no second copy. Worth a backup.
- 🟢 **`custom_cards/screensaver-card` typecheck has 3 PRE-EXISTING errors**
  (`dist-browser-loadable.test.ts`, missing `@types/node`). Unrelated to any recent change —
  don't chase them as a regression. `npm test` is clean: **109 passing**.
- 🟢 **`dist/` is gitignored** — the built card is deployed to the Pi but never committed. After
  editing the card: `npm run build`, copy to the Pi, **and bump the `?v=` cache-buster** in
  `.storage/lovelace_resources` (now **v11**), or the panel serves the cached bundle.


- **Orphaned entities** (§7) — 2 sensors + 6 buttons per kid. Harmless; worth cleaning.
- **Chore Champion `6/250` un-zeroed** for Rowan, partly from the Aug-19 phantom. Early Riser
  was zeroed 2026-09-01.
- **Points-structure trap:** zeroing points naively breaks the points sensor — every level must
  be a dict with `all_time` **nested**. Presents ONLY as the entity showing "Unavailable";
  read `home-assistant.log` before theorising.
- **Rollover residual risk (low):** the guard keys on *local* midnight. If the stamp is cleared
  or the clock jumps backwards across midnight, the `None` path re-opens. **Symptom:** ledger
  entries at a reset boundary with no preceding `last_claimed`.
- **ChoreOps logs nothing about resets at default verbosity** — to observe the guard, add
  `logger:` with `custom_components.choreops: debug` (back up `configuration.yaml` first —
  contested file), restart, read, restore.
- **`Cook Dinner` sits `overdue`**, Rowan-only; likely wants a due-window review.
- **`kitchen.yaml` is contested** — other sessions edit it live on the Pi. Always `diff` the Pi
  copy against the repo before deploying; back up on the Pi first.
- **Shared checkout** — verify `git branch --show-current` before every commit.
- ✅ **Reward pruning is DONE** (§4a) — applied and verified 2026-09-03 evening; only the 4
  Cash Outs remain. Backup `...bak-prunerewards-20260903-173917`. The 12 are regenerable from
  `gen_content.py`. **New orphans:** 12 rewards' button/sensor entities now read `unavailable`
  (same harmless class as §7); cleanable from the HA UI.
- ✅ **`meta._kc_unassigned_rewards_20260903` has been REMOVED** by the prune (2026-09-03
  evening). It was a KitchenCOM-added key, not a ChoreOps field. Nothing to clean up.
- **Bonuses (4) and penalties (2) are dormant, intentionally.** They have **no `enabled` flag
  and no assignment field**, so "disable" is not expressible in the data — only delete or
  leave. They are approver-only buttons and appear **nowhere** in `kitchen.yaml`
  (`grep -ciE 'bonus|penalt|reward|redeem'` → **0**), so the kids never see them. Reintroducing
  them later is free. `Missed Chore` is **−5** and is stored **negative** already.
- **`admin_approval_bypass` reads `True`** (§5) — not the `off` the doc previously claimed. The
  non-admin `Panel` user is the only thing preventing kiosk self-approval. Worth a deliberate
  decision, not urgent.
- **Ledger:** there is **no** top-level `ledger` / `point_ledger` key — those guesses return 0
  entries and read as "no award happened". Confirm points via
  `users[].points` and `users[].point_periods.all_time.by_source.chores`.

---

## 9. Memory layer

`/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`
(outside the repo; `MEMORY.md` there is the index)

Most relevant to this branch:
- 🔴 `zha-must-use-ttyusb-in-docker.md` — **read before touching the ZHA serial path** (§4d)
- 🔴 `pi-wifi-cochannel-interference.md` — **read before diagnosing any Pi connectivity** (§6b)
- `screensaver-photos-folder-and-formats.md` — folder, formats, HEIC trap, shuffle-bag ordering
- `calendar-card-only-three-views.md` — the 3 valid `initial_view` values
- `kiosk-spinner-after-screensaver.md` — a stuck card is the long-lived renderer, not HA
- `entity-registry-is-not-live-state.md` — query the recorder DB to prove an entity is gone
- `reward-delete-drops-pending-claims.md` — `delete_reward` ignores `pending_count`
- `reward-visibility-needs-1-0-8.md` — now RESOLVED (the prune shipped); still the reference
  for why `assigned_user_ids` is inert on 1.0.7
- 🔴 `entity-registry-is-not-live-state.md` — **read before verifying that any entity is gone**;
  the registry and `restore_state` both lie about it
- 🔴 `reward-delete-drops-pending-claims.md` — **read before deleting any reward**; ChoreOps
  discards an unapproved redemption the kid already paid for
- `pi-unreachable-from-office.md` — the office/VPN/home network ladder (§6)
- 🔴 `chore-reset-and-missable-semantics.md` — **read before promising "missable"** (§4b)
- `midnight-rollover-guard.md`
- `zigbee-channel-and-radio.md`
- `kiosk-admin-approval-hole.md`
- `kitchen-yaml-contested-file.md`
- `choreops-point-periods-structure.md`
- `kiosk-service-worker-serves-stale-js.md` — note: **no caching problem was observed**
  2026-09-02; deploys reached the panel directly.
- `choreops-source-vendored-locally.md` — read schemas from `reference/ChoreOps-main` with the
  Pi off. **Nested-repo cwd trap: use absolute paths for grep**, or the shell lands inside the
  vendored repo. 🔴 **UPGRADED 2026-09-03 from "version label" to "behavioural difference":**
  the 1.0.8-vs-1.0.7 gap caused a whole change to be built on code that is not running (§4a).
  For behaviour, grep the **Pi's** `custom_components/choreops/`.
- `choreops-content-is-generated-json.md` — the 12 removed rewards are regenerable from
  `deploy/choreops-content/gen_content.py`; penalties must be stored **negative**.

**Environment gotchas that cost time 2026-09-03:**
- **`timeout` does not exist on macOS** — use `ssh -o ConnectTimeout=N`.
- **`--include=*.py` fails unquoted under zsh** (`no matches found`) — quote it.
- **`cd reference/ChoreOps-main` changes cwd for later tool calls** — use absolute paths.
- **`last_claimed` reads `None` even on an approved chore** — it lives at the store's top
  level, not in the per-chore dict. Not a rollover bug.
