# COLD OPEN — `feat/choreops-chores`

**Refreshed:** 2026-09-03 late morning (chore-reset + reward-pruning session).
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
git rev-list --count main..HEAD           # ahead of main
git status --porcelain                    # expect: empty
```

**Stable prefix of the 2026-09-02 arc** (immutable; anything above `6c8d7e2` landed later):

```
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

Three paths — **Garrett has not picked one yet**:
1. **Delete the 12 from the store** — works on 1.0.7 today; regenerable later from
   `deploy/choreops-content/gen_content.py`.
2. **Upgrade 1.0.7 → 1.0.8** — makes the already-applied edit take effect and is the
   reversible mechanism Garrett wanted; but it is an upgrade on a live family-facing panel.
   Back up the store and review the `pre_v50` migration path first.
3. **Revert the unassign** (from the stash or the backup) and leave all 16 visible.

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

### (d) ZHA setup + bulb pairing — requires Garrett PHYSICALLY AT THE PANEL
**Switch branches first:** `git checkout feat/adaptive-lighting`. The runbook is
`homeassistant/packages/lighting.yaml` on **that** branch — it does **not** exist here.

- Settings → Devices & Services → Add Integration → **Zigbee Home Automation**
- Serial port: the **by-id** path (§6), never `/dev/ttyUSB0`
- Radio type: **`znp`** (TI Z-Stack) — correct for CC2652P
- **Form a new network**
- ⚠️ ZHA usually does **not** prompt for a channel and silently forms on **15**. That is
  **fine** here — **do NOT re-form a network to chase 25.** If it does offer a choice, pick
  **25**. Never 26 (regulation power-limited; some bulbs refuse to join).
- Pair each bulb **in its final fixture** (mesh topology depends on it), power-cycling an
  unprovisioned ZL1 to enter pairing mode.

### (e) Calendar CSS decision — pure repo-side, no Pi needed
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
- **Stable path — never `/dev/ttyUSB0`:**
  `/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_8aae1a09dd9def11b750cda661ce3355-if00-port0`
- Mounted in the USB extension cradle from a surplus Wi-Fi dongle — permanent home, satisfies
  `lighting.yaml`'s extension-cable requirement. Link: 12 Mbps, 100 mA, **direct to Pi root
  hub (bus 001)**, NOT behind the RTS5411 hub the touchscreen needs.
- Home 2.4 GHz Wi-Fi is on **ch 10**; the Pi's own `wlan0` is **5 GHz ch 44** (different band,
  cannot interfere with Zigbee).

**Surplus Wi-Fi dongle** (RTL8822BU): unplugged, spare. **No macOS driver exists.** Not a
Zigbee substitute.

**Tailscale from Garrett's office: BLOCKED** by Fortinet (drops the UDP Tailscale needs). Ran
~3 min on cached state, then offline. `tailscale up`/`down` are **no-ops on the Mac App Store
build**. Unaffected at home.

**⚠️ Cisco VPN gotcha — cost ~20 min on 2026-09-02.** With the work VPN connected *at home*,
the Mac's default route goes to `utun11` and the Pi is unreachable on the LAN;
`ssh kitchencom` returns *"Connection refused"* or a timeout, which reads exactly like a dead
Pi. **Check `route -n get default | grep interface` before diagnosing anything else** — it
should say `en0`.

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

## 8. Carry-forwards

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
- 🔴 **Reward pruning is UNFINISHED** (§4a) — 12 rewards carry an inert
  `assigned_user_ids: []` on 1.0.7 and all 16 still show. Three paths, none chosen. Originals
  stashed at `meta._kc_unassigned_rewards_20260903`.
- **`meta._kc_unassigned_rewards_20260903` is a KitchenCOM-added key**, not a ChoreOps field.
  Harmless (ChoreOps ignores unknown meta keys — verified across a restart), but delete it once
  the reward decision lands so it does not confuse a future reader.
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
