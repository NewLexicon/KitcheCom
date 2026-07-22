# ChoreOps Reward Store — entry sheet (2026-07-22)

**Purpose:** type-and-go sheet for entering the reward store in the ChoreOps UI. Every decision is pre-made; at the keyboard you only transcribe. Blueprint source: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md` §2.

**Status:** DRAFTED OFFLINE — Pi was powered down (2026-07-22). Nothing entered yet. Schema verified against local source `reference/ChoreOps-main` (v1.0.8) — see §5 for the version caveat.

---

## 0. Pre-flight

1. Pi powered on via **its own 27W USB-C brick** (never the ViewSonic port — brownout crash-loop).
2. `ipconfig getifaddr en0` → `192.168.1.x` ✅ (confirmed `192.168.1.180` on 2026-07-22)
3. `ssh kitchencom 'echo UP'` → `UP`
4. Mac browser → `http://192.168.1.234:8123` → Settings → Devices & Services → **ChoreOps** → **Configure** → Manage Rewards.

Do the entry on the **Mac**, not the kiosk — real keyboard, 20 entries.

---

## 1. The form — exactly 6 fields

Verified from `custom_components/choreops/helpers/flow_helpers.py:2682` (`build_reward_schema`):

| Field | Required? | Notes |
|---|---|---|
| **Name** | ✅ Required | Must be unique — duplicates rejected (`validate_rewards_inputs`, :2747) |
| Description | optional | Free text |
| Labels | optional | HA label multi-select. **Skip** — see §4 |
| **Cost** | ✅ Required | Number box, min 0, step 0.01 (points) |
| Icon | optional | HA icon picker (`mdi:` names below) |
| Assigned Users | optional | **Leave as-is** — pre-fills to all gamified users = Rowan + Wystan (`options_flow.py:3132-3140`) |

**There is no cooldown / max-per-week / stock-limit field.** Frequency limits are a house rule you enforce at approval time, not a config field. Where a limit matters I put it in the Description so the kids see it.

---

## 2. RETUNE FIRST — the 2 seed rewards (Edit, do NOT re-add)

Names are unique-checked, so adding a second "Treat" or "Cash" fails validation. Use **Edit Reward** on these two.

| Existing | New Name | Cost | Description | Icon |
|---|---|---|---|---|
| `treat` | **Special Snack** | **8** | Pick a special snack or candy from the treat stash. | `mdi:candy` |
| `cash` | **Cash Out — $1** | **10** | Trade 10 points for $1. Ask a parent to pay out. | `mdi:cash` |

---

## 3. ADD THESE — 18 new rewards

Enter in order. Assigned Users: leave the pre-filled Rowan + Wystan.

### Screen Time (3 new)
| # | Name | Cost | Description | Icon |
|---|---|---|---|---|
| 1 | Screen Time — 15 min | 10 | 15 extra minutes of screen time. | `mdi:timer-sand` |
| 2 | Screen Time — 30 min | 18 | 30 extra minutes of screen time. | `mdi:timer` |
| 3 | Screen Time — 1 hour | 32 | A full extra hour of screen time. | `mdi:timer-outline` |

### Cash Out (3 new — $1 tier done in §2)
| # | Name | Cost | Description | Icon |
|---|---|---|---|---|
| 4 | Cash Out — $5 | 50 | Trade 50 points for $5. Ask a parent to pay out. | `mdi:cash-multiple` |
| 5 | Cash Out — $10 | 100 | Trade 100 points for $10. Ask a parent to pay out. | `mdi:cash-multiple` |
| 6 | Cash Out — $20 | 200 | Trade 200 points for $20. Ask a parent to pay out. | `mdi:cash-100` |

### Privileges / Experiences (6)
| # | Name | Cost | Description | Icon |
|---|---|---|---|---|
| 7 | Pick Dinner Menu | 15 | Choose what the family eats for dinner one night. | `mdi:silverware-fork-knife` |
| 8 | Stay Up 30 Min Late | 20 | Stay up half an hour past bedtime. Not on a school night. | `mdi:weather-night` |
| 9 | Movie Night Pick | 25 | You choose the family movie. | `mdi:movie-open` |
| 10 | Friend Over | 40 | Have a friend over. Clear the day with a parent first. | `mdi:account-group` |
| 11 | Choose Weekend Activity | 50 | Pick what the family does this weekend. | `mdi:calendar-star` |
| 12 | Day Trip / Special Outing | 150 | A big day out — your pick, planned with a parent. | `mdi:map-marker-star` |

### Treats / Small Items (2 new — snack done in §2)
| # | Name | Cost | Description | Icon |
|---|---|---|---|---|
| 13 | Ice Cream Outing | 25 | A trip out for ice cream. | `mdi:ice-cream` |
| 14 | Small Toy / Trinket | 30 | A small toy or trinket on the next store run. | `mdi:teddy-bear` |

**Totals: 2 edited + 14 added = 16 rewards.**

> Blueprint §2 listed 15 line items; this sheet realizes all 15 (the $1 tier and the snack are the 2 retunes). Deltas from blueprint, all deliberate: "Movie night pick" moved from Screen Time → Privileges (it's a family-activity pick, not screen minutes); names normalized to `Category — Variant` so they sort together in the reward list and read cleanly on the kiosk card.

---

## 4. Decisions baked in (so you don't re-litigate at the keyboard)

- **Labels: skip entirely.** ChoreOps Labels are HA-registry labels, not reward categories — they don't group the reward store on the dashboard. The `Category — Variant` naming does the grouping visually. Adding labels means creating registry entries you'd then have to maintain.
- **Assigned Users: never touch.** Pre-fill = all gamified users = Rowan + Wystan exactly (parents are non-gamified since 2026-07-04). If a reward ever shows up assigned to Garrett/Rebecca, a parent's `enable_gamification` flag got flipped back — stop and check.
- **Cost is points, not dollars.** At 1 pt = $0.10 the cash tiers are exactly break-even ($1=10pts). Non-cash rewards are priced *above* their cash equivalent on purpose — 1hr screen time at 32 pts "costs" $3.20, so cashing out stays the boring-but-honest option and screen time isn't the cheapest path.
- **Earn-rate sanity check:** the 11 chores yield roughly 20–25 pts/day across both kids combined. So a 15-min screen block is well under a day's work, the $20 tier is ~8–10 days of consistent effort, and the 150-pt day trip is a multi-week goal. That spread is intentional — instant, weekly, and stretch tiers.
- **No cooldown fields exist**, so "Stay Up Late" and "Friend Over" carry the limit in the Description text. Enforce at approval.

---

## 5. Verification after entry

Version caveat: local reference source is **1.0.8**; the Pi runs **1.0.7**. The 6-field reward schema is almost certainly identical across that patch bump, but if the form shows a field this sheet doesn't list, trust the form and note the delta here.

After entering all 16, verify on the Pi (don't trust the UI alone):

```bash
ssh kitchencom
# dump reward names + costs from the live store
sudo docker exec homeassistant python -c "
import json,glob
f=glob.glob('/config/.storage/choreops/choreops_data_*')[0]
d=json.load(open(f))['data']['rewards']
for r in d.values(): print(r.get('name'), '|', r.get('cost'), '|', len(r.get('assigned_user_ids',[])))
print('TOTAL:', len(d))
"
```

Expect **TOTAL: 16**, every cost matching the tables above, and every row showing **2** assigned users. Then confirm entity creation:

```bash
sudo docker exec homeassistant grep -c '"platform": "choreops"' /config/.storage/core.entity_registry
```

(Count should rise vs. the pre-entry number — capture that number *before* you start. Use `platform=choreops`, **never** the `kc_` prefix — that returns 0.)

**Tooling note (carried forward):** nested-SSH quoting is fragile. If the inline probe above misbehaves, write it to a file, `scp` to the Pi, `docker cp` into the container, then run.

---

## 6. Next after rewards

Per blueprint build order: **Bonuses** (retune `cheerful` → Above & Beyond +10; add Great Attitude +5, Helped a Sibling +8, Initiative +7) → **Penalties** (retune `demerit` → Missed Chore −5; add Reminder Needed −2) → **Badges** (5 types) → **Achievements** → **Task 8** dashboard generator.
