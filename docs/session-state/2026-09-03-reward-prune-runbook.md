# RUNBOOK — finish the reward pruning (cold-open §4a, path 1)

**Written:** 2026-09-03 afternoon, from the office. **The Pi was unreachable all session** —
this is prepared work, verified against fixtures, not yet run against the Pi.

**Decision (Garrett, this session):** path **1 — delete the 12**. Paths 2 (upgrade to 1.0.8)
and 3 (revert the unassign) are NOT taken. Rationale: path 1 works on the Pi's 1.0.7 today,
and all 16 rewards are regenerable from `deploy/choreops-content/gen_content.py`, so the
deletion is reversible without the risk of upgrading a live family-facing panel.

**Goal:** only the **4 Cash Outs** ($1/$5/$10/$20) remain redeemable. The other **12** come
back later via bonuses.

---

## Why the previous attempt failed (do not repeat it)

`assigned_user_ids: []` was written to the 12 non-Cash-Outs. That gate exists in ChoreOps
**1.0.8**; the Pi runs **1.0.7**, whose reward loop (Pi `button.py:146-148`) builds a button
for **every** reward with no assignment check. The edit is **inert** — all 16 still show.

⚠️ For any *behaviour* question, grep the **Pi's** `custom_components/choreops/`, never
`reference/ChoreOps-main` (which is 1.0.8).

---

## The script

**`/Users/jdehart1/___Code_DEV/KitchenCOM/deploy/choreops-content/prune_rewards.py`**

It mirrors what ChoreOps' own `delete_reward` does
(`reference/ChoreOps-main/custom_components/choreops/managers/reward_manager.py:929-990`):

1. `del data["rewards"][reward_id]`
2. ~~removes HA entities~~ — a live-HA call; **cannot** be done from a JSON edit (see step 6)
3. **prunes each assignee's `reward_data[reward_id]`** — skipping this leaves orphaned
   redemption history behind. The script does this.

It also clears the `meta._kc_unassigned_rewards_20260903` stash left by the failed attempt.

### Safety properties (all exercised against fixtures)

| Behaviour | Exit | Verified |
|---|---|---|
| **Dry run is the default** — writes nothing without `--apply` | 0 | ✅ store byte-identical after |
| Refuses if a deleted reward has a **pending (unapproved) redemption** | 2 | ✅ no backup, no write |
| Refuses if the 4 Cash Outs aren't all present (wrong store) | 1 | ✅ |
| Refuses if handed the store **directory** instead of the file | 1 | ✅ |
| Backs up to `.bak-prunerewards-<stamp>` before writing | 0 | ✅ backup holds the original 16 |
| Idempotent — re-running on a pruned store is a no-op | 0 | ✅ |
| Points and Cash Out history untouched | — | ✅ Rowan 6.0 / Wystan 3.0 preserved |

⚠️ **The pending-redemption guard matters.** ChoreOps' own `delete_reward` does **not** check
`pending_count` — deleting a reward with an unapproved redemption silently discards a claim the
kid already spent points on. `--force` overrides; only use it deliberately.

---

## Steps (run at home, on the LAN)

```bash
# 0. sanity — you must be on the home network, not corporate/VPN
route -n get default | grep interface        # expect en0 (NOT utun*, NOT en19)
ssh kitchencom 'uptime'

# 1. find the live store FILE (it lives inside a DIRECTORY)
ssh kitchencom 'ls -la /home/garrettdehart/homeassistant/.storage/choreops/'
#    payload as of 2026-09-03:
#    choreops_data_01KXV33Q540SYEF1KFM54DCEDJ
#    (siblings named _recovery/_removal/.bak-* are NOT the payload)

# 2. copy the script over
scp deploy/choreops-content/prune_rewards.py kitchencom:/tmp/

# 3. DRY RUN first — reads only, writes nothing
ssh kitchencom 'sudo python3 /tmp/prune_rewards.py \
  /home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ'
```

**Read the dry-run output before going further.** Confirm: 16 found, 4 keep, 12 delete, and no
`⚠ ... PENDING` line. If a PENDING line appears, **stop** — approve or disapprove that
redemption from a phone/Mac as `KitchenCom` first, then re-run the dry run.

```bash
# 4. STOP HA — the store must not be written underneath a running HA
ssh kitchencom 'docker stop homeassistant'

# 5. apply
ssh kitchencom 'sudo python3 /tmp/prune_rewards.py \
  /home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ --apply'

# 6. start HA back up
ssh kitchencom 'docker start homeassistant'
sleep 25
ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/'   # expect 200
```

### Verify

```bash
# no ChoreOps errors
ssh kitchencom 'sudo grep -icE "choreops.*(error|traceback)" \
  /home/garrettdehart/homeassistant/home-assistant.log'          # expect 0

# exactly 4 rewards remain
ssh kitchencom 'sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ\"))
r=d.get(\"rewards\") or d[\"data\"][\"rewards\"]
print(len(r), sorted(v[\"name\"] for v in r.values()))"'
```

Then **look at the panel**: only the 4 Cash Outs should be redeemable.

### Rollback

```bash
ssh kitchencom 'docker stop homeassistant'
ssh kitchencom 'sudo cp /home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-prunerewards-<stamp> \
                        /home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ'
ssh kitchencom 'docker start homeassistant'
```

An older pre-session backup also exists:
`...choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-premissable-20260903-0958`

---

## Expected aftermath

- **Orphaned button entities** in `core.entity_registry` for the 12 deleted rewards. Harmless
  (they render `unavailable`); removable from the HA UI. Same orphan class as cold-open §7.
- `kitchen.yaml` needs **no** change — rewards appear nowhere in it
  (`grep -ciE 'bonus|penalt|reward|redeem' kitchen.yaml` → **0**), so the kids' panel tiles are
  unaffected. Redemption is via ChoreOps' own buttons.
- To bring the 12 back later: regenerate from `deploy/choreops-content/gen_content.py`.

## Open question for whoever runs this

The dry run will print any per-user `reward_data` references it's about to prune. On the Pi
these are **redemption history** for the deleted rewards (last-claimed/approved timestamps and
period rollups). Deleting them matches ChoreOps' own behaviour, but if you'd rather keep that
history for the record, say so before step 5 — it would need a variant that keeps `reward_data`
and accepts the orphans.
