# Session state — 2026-09-03: approve Fishy, "missable" chores, reward pruning

**Branch:** `feat/choreops-chores`
**Pi:** reachable all session (`en0`, no VPN interference). HA restarted once, cleanly.

---

## Status

**Done:**
1. `Fishy — Evening` approved (parent action, from a non-panel device). Verified in the store:
   `state: claimed` → `approved`, Rowan's balance `6.0`, `by_source.chores = 6.0`.
2. **All 14 chores:** `approval_reset_pending_claim_action` changed
   `auto_approve_pending` → `clear_pending`. Verified present after an HA restart with
   **0 ChoreOps errors**.

**Attempted and FAILED (root-caused, not mysterious):**
3. Pruning rewards to Cash-Outs-only by emptying `assigned_user_ids` on the 12
   non-Cash-Outs. **The data edit is applied but has NO EFFECT on this version.** See
   "The reward pruning failure" below.

**Deliberately not done:**
4. Bonuses/penalties left untouched (Garrett's call). They are approver-only buttons and
   appear **nowhere** in `kitchen.yaml` (`grep -ciE 'bonus|penalt|reward|redeem'` → **0**),
   so the kids never see them regardless.
5. Real "missed" state + due dates — explicitly deferred (see "What 'missable' turned out
   to mean").

---

## Decisions & reasoning

### What "missable" turned out to mean (the premise was partly wrong)

Garrett's ask: *"If they are not claimed before midnight the chart resets and they do not get
any points for the chores they missed."*

**The points half was already true.** Unclaimed chores never reach the `pending_claim_action`
branch — that is guarded by `if context.get("has_pending_claim")`
(`chore_manager.py:1823`, vendored 1.0.8). Unclaimed chores fall through to
`RESET_AND_RESCHEDULE`: reset, no award. So no change was needed to stop points for
unclaimed chores.

**`mark_missed_and_lock` would have been a silent no-op.** The missed guard is:

```python
# chore_engine.py:706-712
overdue_type == OVERDUE_HANDLING_AT_DUE_DATE_MARK_MISSED_AND_LOCK
and due_date is not None
and now > due_date
```

**Every chore has `due_date: null`**, and every `per_assignee_due_dates` entry is null too.
Setting `mark_missed_and_lock` without also setting due dates changes *nothing* — and would
have been reported as "missable is on" while nothing was missable. This is why the due-date
data got checked before editing rather than after.

**What was actually missing** was not the points consequence but (a) the visible `missed`
mark, and (b) a real lock — a late claim is still accepted any time before midnight.

**The leak that was worth closing:** `auto_approve_pending` on all 14 chores meant a kid could
tap a chore they had not done and the points would be **auto-granted at midnight with no
parent approval**. That is the exact opposite of the approval discipline Garrett had just
exercised by hand on Fishy. `clear_pending` drops an unverified claim at the boundary instead.
Garrett chose this ("just close the auto-approve leak") over the fuller due-date version.

### Why bonuses/penalties were left alone

They have **no `enabled` flag and no assignment field** (bonus schema is 6 fields: `internal_id`,
`name`, `points`, `description`, `icon`, `bonus_labels`). Their buttons are created
unconditionally from `bonuses_data`/`penalties_data` (`button.py:478`, `508`). So "keep but
disable" is **not expressible in the data** for these two — the only options were delete or
leave. Since they are `ApproverBonusApplyButton`/`ApproverPenaltyApplyButton` (approver-only)
and absent from the kiosk dashboard, leaving them dormant has zero user-facing effect and
makes reintroduction free.

---

## The reward pruning failure — ROOT CAUSED

### What was tried

Emptied `assigned_user_ids` on the 12 non-Cash-Out rewards, keeping the 4 Cash Outs. The
reasoning came from the **vendored** source:

```python
# reference/ChoreOps-main (1.0.8) button.py:417-419
for reward_id, reward_info in coordinator.rewards_data.items():
    if not is_user_assigned_to_reward(coordinator, assignee_id, reward_id):
        continue
```

That gate is real — in **1.0.8**.

### Why it did not work

**The Pi runs 1.0.7. Per-reward user assignment is a 1.0.8 feature.**

| Evidence | 1.0.8 (vendored) | 1.0.7 (Pi, live) |
|---|---|---|
| `DATA_REWARD_ASSIGNED_USER_IDS` const | present (`const.py:1613`) | **ABSENT** (9 keys → 8) |
| `is_user_assigned_to_reward` helper | `entity_helpers.py:1257` | **does not exist** |
| reward button loop | gated by assignment | **`button.py:146-148`, NO gate** |

Pi 1.0.7's loop is simply:

```python
# Pi button.py:146-148
for reward_id, reward_info in coordinator.rewards_data.items():
    reward_icon = reward_info.get(const.DATA_REWARD_ICON, const.SENTINEL_EMPTY)
    # ... creates Redeem/Approve/Disapprove unconditionally
```

The `assigned_user_ids` field **is** in the stored data (written by a migration —
`migrations/pre_v50.py` references it), which is exactly what made the field look load-bearing.
1.0.7's button code never reads it.

**This is the vendored-source trap in `choreops-source-vendored-locally.md` firing for real.**
The memory warns the vendored copy is 1.0.8 vs the Pi's 1.0.7; that was treated as a version
label rather than a behavioural difference. Lesson: **for any behaviour question, grep the
Pi's `custom_components/choreops/`, not `reference/ChoreOps-main`.** Use the vendored copy
only for form schemas/enums with the Pi off.

### How the failure was actually detected (the control-group method)

Registry presence proves nothing — HA keeps registry rows for entities an integration has
stopped creating (that is what the documented `feed_cats`/`fishy` orphans are). Two misleading
reads happened first:

- `core.entity_registry` still listed snack/screen-time buttons → **inconclusive**.
- `core.restore_state` showed them `unknown` → **inconclusive**; a never-pressed button always
  reads `unknown`, and kept `cash_out_10` read `unknown` too.

The decisive test was a **control group**: the known-dead orphans
(`chore_status_fishy`, `chore_status_feed_cats`, confirmed dead in the cold-open) are
**absent** from `core.restore_state`, while snack/screen-time buttons are **present with a
fresh timestamp** matching the post-restart write. Entities that stop being created drop out;
these did not. Also confirmed `core.restore_state` mtime (10:01) was *after* the restart
(10:00), so it was not a stale file.

**Reusable method:** to tell "orphan" from "live", compare against a known-dead entity in the
same file, and check the file's mtime against the restart time.

### Current data state (harmless but ineffective)

- 12 non-Cash-Out rewards have `assigned_user_ids: []`.
- The original lists are stashed verbatim at
  `meta._kc_unassigned_rewards_20260903` (12 entries) for exact restore.
- **All 16 rewards still appear on the ChoreOps dashboards** because 1.0.7 ignores the field.
- Reward *definitions* (name/cost/icon/description) are fully intact; nothing was deleted.

### Three real paths forward (pick tomorrow)

1. **Delete the 12 from the store** — works on 1.0.7 today. Definitions are regenerable from
   `deploy/choreops-content/gen_content.py`. Loses nothing but requires regeneration later.
2. **Upgrade ChoreOps 1.0.7 → 1.0.8** — makes the already-applied `assigned_user_ids` edit
   take effect immediately, and it is the reversible mechanism Garrett actually wanted.
   Carries upgrade risk on a live family-facing panel; needs a store backup and a migration
   review first (there is a `pre_v50` migration path in play).
3. **Revert the unassign** (restore from `meta._kc_unassigned_rewards_20260903` or the
   `.bak-premissable-` backup) and leave all 16 visible for now.

---

## Architecture notes

**ChoreOps store layout** — `.storage/choreops/` is a **DIRECTORY**, not a file (an early
`json.load` on it raised `IsADirectoryError`). Live store:
`choreops_data_01KXV33Q540SYEF1KFM54DCEDJ`; siblings are `_recovery`/`_removal`/`.bak-*`
snapshots. Top-level keys: `meta`, `users`, `chores`, `badges`, `rewards`, `penalties`,
`bonuses`, `achievements`, `challenges`, `notifications`.

**Reward visibility is version-dependent** (above). Chore/reward *content* changes are safe as
direct store edits + `docker restart homeassistant`; ChoreOps did **not** overwrite the edits
on boot (verified).

**HA runs in Docker** on the Pi: `docker restart homeassistant`, came back `200` in ~20s.
There is no `homeassistant.service` — `systemctl` shows only `docker.service`.

---

## Gotchas

- **`timeout` does not exist on macOS.** Use `ssh -o ConnectTimeout=N` instead.
- **`--include=*.py` fails under zsh** without quoting (`no matches found`). Quote it or use
  `--include='*.py'`.
- **cwd drifts into the vendored repo.** A bare `cd reference/ChoreOps-main` changed the
  session's working directory for subsequent calls. Use **absolute paths** or a subshell —
  this is the documented nested-repo trap.
- **`last_claimed` reads `None` on an approved chore.** Expected: it lives at the store's top
  level, not inside the per-chore dict. Not evidence of a rollover bug.
- **Ledger key guess was wrong.** Neither `ledger` nor `point_ledger` exists at the top level;
  a "0 entries" result was the query missing, not the award missing. Points moving in
  `users[].points` / `point_periods.all_time.by_source.chores` is the real confirmation.
- **`point_periods.all_time` nesting survived** all edits (verified `True` for both kids).
  This is the structure whose corruption shows up *only* as the points sensor reading
  "Unavailable".

---

## ⚠️ Cold-open correction: `admin_approval_bypass` is `True`, not off

`COLD-OPEN-choreops-chores.md` §5 stated the setting was **off** and called that the reason the
kiosk cannot approve. **It reads `True`** in `core.config_entries` (ChoreOps entry options).

**The doc's conclusion still holds, for a different reason:** the flag is an **admin** bypass —
per `auth_helpers.py:70-83` it lets an HA *admin* skip the approval **link** check. The kiosk
runs as non-admin **`Panel`**, so `True` does not grant the panel approval rights. The live
proof is the 08:01 log refusal: the panel *was* denied.

**This setting was NOT changed this session.** Edits were confined to
`chores[].approval_reset_pending_claim_action` and `rewards[].assigned_user_ids` in the
ChoreOps store — a different file from `core.config_entries`.

Still worth a deliberate decision: `admin_approval_bypass: True` means if a kid were ever
linked to an admin HA user, or the kiosk were ever switched back to an admin account, self-approval
would open up immediately. The non-admin `Panel` user is currently the only thing holding that
door shut.

---

## Verification commands run this session

```bash
# repo
git branch --show-current                      # feat/choreops-chores
git log --oneline -1                           # 64fda01 (before this session's docs commit)
git rev-list --count main..HEAD                # 89
git status --porcelain                         # clean

# network / Pi
route -n get default | grep interface          # en0  (NOT utun11 — no VPN interference)
ssh kitchencom 'uptime'                        # up 1 day 12:43
ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8123/'   # 200
diff <(ssh kitchencom 'sudo cat .../dashboards/kitchen.yaml') homeassistant/dashboards/kitchen.yaml  # identical

# after the edits
ssh kitchencom 'sudo tail -400 .../home-assistant.log | grep -icE "choreops.*(error|traceback)"'  # 0
```
