# ChoreOps Achievements + Badges — entry sheet (2026-08-05)

**Purpose:** type-and-go sheet. Blueprint source: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md` §3–4.

**Status:** DRAFTED OFFLINE 2026-08-05 (Pi unreachable — underpowered via laptop dock). Nothing entered yet. Schema verified against `reference/ChoreOps-main` (v1.0.8); Pi runs 1.0.7 — see §6.

---

## 0. ⚠️ ORDER MATTERS — achievements BEFORE badges

The blueprint (§ build order, step 5) lists "Badges + Achievements" together. **That order is wrong and will block you.**

An achievement-linked badge requires selecting an existing achievement — `CFOF_BADGES_INPUT_ASSOCIATED_ACHIEVEMENT` is `vol.Required` (`flow_helpers.py:2059`). "Streak Master" links to the "7-Day Streak" achievement, so that achievement must exist first.

**Correct order: rewards → bonuses/penalties → achievements (§2) → badges (§4).** Badges can also award rewards/bonuses/penalties, which is the second reason they come last.

---

## 1. Achievement form — 9 fields

From `build_achievement_schema` (`flow_helpers.py:3007`).

| Field | Required? | Notes |
|---|---|---|
| **Name** | ✅ | Unique-checked |
| Description | optional | Free text |
| Labels | optional | **Skip** |
| Icon | optional | HA icon picker |
| **Assigned Users** | ✅ | Multi-select. **Select Rowan + Wystan.** Unlike rewards this does NOT pre-fill — you must pick |
| **Type** | ✅ | Dropdown, 3 options (below). Defaults to Chore Streak |
| Selected Chore | conditional | **Only meaningful for `Chore Streak`.** Leave as "None" for other types |
| Criteria | optional | Free text, non-streak types only. Descriptive — not enforced by the engine |
| **Target Value** | ✅ | Number box, min 0, step 0.1 |
| **Reward Points** | ✅ | Number box, min 0, step 0.01. Points granted on completion |

### The 3 achievement types (`const.py:4072`)

| Label in UI | Internal value | Meaning |
|---|---|---|
| Chore Streak | `chore_streak` | Consecutive days completing **one specific chore** (uses Selected Chore) |
| Chore Total | `chore_total` | Lifetime count of **any** chores completed |
| Daily Minimum Chores | `daily_minimum` | Consecutive days hitting a minimum chore count per day |

---

## 2. ACHIEVEMENTS — 3 adds (Perfect Week already ships)

`Perfect Week` already exists in storage — **leave it alone.** Assigned Users = Rowan + Wystan on all three.

| # | Name | Type | Selected Chore | Target Value | Reward Points | Description | Icon |
|---|---|---|---|---|---|---|---|
| 1 | 7-Day Streak | **Daily Minimum Chores** | *(None)* | **7** | 25 | Complete at least one chore every day for 7 days running. | `mdi:calendar-check` |
| 2 | Chore Champion | **Chore Total** | *(None)* | **250** | 100 | 250 chores completed all-time. A long haul. | `mdi:trophy-award` |
| 3 | Early Riser | **Chore Streak** | **Brush Teeth** | **5** | 20 | Brush your teeth 5 days running without a reminder. | `mdi:weather-sunset-up` |

**Total after entry: 4 achievements.**

### ⚠️ "Early Bird" was changed — read this

Blueprint §4 specifies *"Early Bird — morning chores before 9am, 5 days running."* **This is not buildable.** None of the three achievement types supports a time-of-day condition; there is no "before 9am" field anywhere in the achievement schema. The engine tracks streaks, totals, and daily minimums only.

Rather than drop it, I substituted **Early Riser** — a 5-day `chore_streak` on `Brush Teeth`, the closest existing morning-routine chore. It keeps the "consistent morning habit" intent using a mechanic the engine actually enforces.

If you specifically want the before-9am semantics, that needs an HA automation outside ChoreOps watching completion timestamps — out of scope for the entry sheets, and worth deciding separately.

**Also note on 7-Day Streak:** the blueprint says "≥1 chore every day for 7 days," which is `daily_minimum`, *not* `chore_streak` despite the name. `chore_streak` tracks one specific chore; `daily_minimum` tracks "any chore, every day." I've typed it as Daily Minimum with target 7. Target Value here is the **number of consecutive days**.

---

## 3. Badge form — fields vary BY TYPE

From `build_badge_common_schema` (`flow_helpers.py:1845`). This form is not fixed — eight `INCLUDE_*` sets (`const.py:4016-4069`) switch fields on and off per badge type. **Field matrix, resolved:**

| Field | Cumulative | Daily | Periodic | Special Occasion | Achievement-Linked |
|---|:--:|:--:|:--:|:--:|:--:|
| Name / Description / Labels / Icon | ✅ | ✅ | ✅ | ✅ | ✅ |
| Target Type (dropdown) | ❌ *(implicit points)* | ✅ | ✅ | ❌ | ❌ |
| Target Threshold Value | ✅ | ✅ | ✅ | ❌ | ❌ |
| Maintenance Rules | ✅ | ❌ | ❌ | ❌ | ❌ |
| Occasion Type | ❌ | ❌ | ❌ | ✅ | ❌ |
| Associated Achievement | ❌ | ❌ | ❌ | ❌ | ✅ **required** |
| Selected Chores | ❌ | ✅ | ✅ | ❌ | ❌ |
| Assigned Users | ✅ | ✅ | ✅ | ✅ | ❌ |
| Award Items / Award Points | ✅ | ✅ | ✅ | ✅ | ✅ |
| Award Penalties | ❌ | ✅ | ✅ | ❌ | ❌ |
| Reset Schedule | ✅ | ✅ | ✅ | ✅ | ❌ |

Two consequences worth knowing before you sit down:

- **Cumulative badges have no Target Type dropdown** — it's implicitly points-based (`is_cumulative` skips the field, `:1972`). You'll only see a threshold number.
- **Achievement-linked badges have no Assigned Users field.** They inherit scope from the linked achievement. Don't go looking for it.
- **Daily badges hide all streak target types** (`:1940`) — streaks are meaningless within a single day.

**Occasion types** (`const.py:3943`): `birthday`, `holiday`, `custom`.

---

## 4. BADGES — 1 retune + 5 adds

`Week Winner` already exists in storage. It maps to the blueprint's Periodic "Perfect Week" badge — **retune it, don't add a duplicate.**

Assigned Users = **Rowan + Wystan** wherever the field appears (all but Streak Master).

### Retune first (Edit)

| Existing | New Name | Type | Target Type | Threshold | Selected Chores | Award Points | Description | Icon |
|---|---|---|---|---|---|---|---|---|
| `Week Winner` | **Perfect Week** | Periodic | Days Selected Chores Completed | **7** | *(leave empty = all)* | 30 | Every assigned chore, Monday through Sunday. | `mdi:calendar-star` |

### Then add these 5

| # | Name | Type | Target Type | Threshold | Selected Chores | Award Points | Description | Icon |
|---|---|---|---|---|---|---|---|---|
| 1 | Clean Sweep | **Daily** | Chores Completed | **4** | *(leave empty = all)* | 10 | Every chore on your list, done in one day. | `mdi:broom` |
| 2 | Century Club | **Cumulative** | *(no field)* | **100** | — | 25 | 100 points earned, all-time. | `mdi:numeric-100-box` |
| 3 | 500 Club | **Cumulative** | *(no field)* | **500** | — | 75 | 500 points earned, all-time. A serious milestone. | `mdi:trophy-variant` |
| 4 | Holiday Helper | **Special Occasion** | *(no field)* | *(no field)* | — | 20 | Pitched in with extra chores over a holiday. | `mdi:gift` |
| 5 | Streak Master | **Achievement-Linked** | *(no field)* | *(no field)* | — | 40 | Earned by completing the 7-Day Streak achievement. | `mdi:fire` |

**Badge #5 requires "7-Day Streak" to already exist** (§2 achievement #1). Associated Achievement = **7-Day Streak**.
**Badge #4 (Holiday Helper):** Occasion Type = **holiday**.

**Total after entry: 6 badges.**

### Fields left at default, deliberately

- **Maintenance Rules** (cumulative only) — leave empty. It's for badges that can be *lost*; lifetime point milestones shouldn't be revocable.
- **Reset Schedule** — leave at default (`FREQUENCY_NONE`) on all. Perfect Week's weekly cadence comes from its periodic target type, not the reset schedule. Setting both is how you get double-resets.
- **Award Items** — leave empty everywhere. Points are the award; wiring badges to also grant rewards adds a second economy to reason about. Revisit once the base system has run a few weeks.
- **Award Penalties** (daily/periodic only) — leave empty. Badges should not punish.

---

## 5. Decisions baked in

- **Clean Sweep threshold = 4, not "all daily chores."** There's no "all my assigned chores" target — only a fixed number. Both kids have ~5–6 daily-ish assignments (Brush Teeth, Fishy, Set the Table, Plants, Feed Cats/Wash Dishes), and rotation chores mean the count varies day to day. 4 is achievable on a normal day without being trivial. **Tune after watching a week of real completions.**
- **Perfect Week uses "Days Selected Chores Completed" with threshold 7** — 7 qualifying days inside the period. Leaving Selected Chores empty means all assigned chores count.
- **Award points scale with rarity:** daily 10 → weekly 30 → 100pts 25 → streak-linked 40 → 500pts 75. The 500 Club at 75 pts ($7.50) is the biggest single payout in the system, which is intended for a months-long goal.
- **Badge points stack on top of chore points.** A Perfect Week pays 30 bonus points on top of the ~140 earned doing the chores. That's ~20% uplift for consistency — enough to notice, not enough to distort the economy.

---

## 6. Verification after entry

Version caveat: reference source is **1.0.8**, Pi runs **1.0.7**. Badge schema is the most complex of the five content types and therefore the likeliest place for a patch-level delta. **If a form shows a field this sheet doesn't list, trust the form and note the delta here.**

```bash
ssh kitchencom    # (or kitchencom-eth on a direct-ethernet link)
sudo docker exec homeassistant python3 -c "
import json,glob
f=glob.glob('/config/.storage/choreops/choreops_data_*')[0]
d=json.load(open(f))['data']
for k in ('achievements','badges'):
    v=d.get(k,{}); v=list(v.values()) if isinstance(v,dict) else v
    print(k.upper(), len(v))
    for x in v:
        print('   ', x.get('name'), '| type:', x.get('type') or x.get('badge_type'),
              '| target:', x.get('target_value') or x.get('target_threshold_value'),
              '| users:', len(x.get('assigned_user_ids') or []))
"
```

Expect **ACHIEVEMENTS 4** and **BADGES 6**, with Streak Master showing a populated associated-achievement field.

Entity count (`platform=choreops`, never `kc_`):

```bash
sudo docker exec homeassistant python3 -c "
import json
r=json.load(open('/config/.storage/core.entity_registry'))
print(len([x for x in r['data']['entities'] if x.get('platform')=='choreops']))
"
```

---

## 7. Next after this sheet

All gamification content is then complete → **Task 8, Dashboard Generator.** Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-15-choreops-chores.md`. In Task 8 select **only Rowan + Wystan** as dashboard users (excludes the stale parent entities).
