# ChoreOps Bonuses + Penalties — entry sheet (2026-08-05)

**Purpose:** type-and-go sheet. Every decision pre-made; at the keyboard you only transcribe. Blueprint source: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md` §5–6.

**Status:** DRAFTED OFFLINE 2026-08-05 (Pi unreachable — underpowered via laptop dock). Nothing entered yet. Schema verified against `reference/ChoreOps-main` (v1.0.8); Pi runs 1.0.7 — see §5.

**Entry order:** do this sheet **after** rewards, **before** achievements/badges. Bonuses and penalties have no dependencies, but badges can award them, so they must exist first.

---

## 1. The forms — 5 fields each, identical shape

Verified from `flow_helpers.py:2803` (`build_bonus_schema`) and `:2899` (`build_penalty_schema`). The two forms are structurally identical.

| Field | Required? | Notes |
|---|---|---|
| **Name** | ✅ Required | Unique-checked; duplicates rejected (`validate_bonus_or_penalty_data`) |
| Description | optional | Free text |
| Labels | optional | HA registry labels. **Skip** — same reasoning as the reward sheet §4 |
| **Points** | ✅ Required | Number box, min 0, step 0.01 |
| Icon | optional | HA icon picker |

**No Assigned Users field.** Unlike rewards, bonuses and penalties are not scoped to users — a parent grants them to whoever earned them at grant time. This is a real difference from the reward form; don't go looking for the field.

### ⚠️ Enter penalty points as a POSITIVE number

The form takes a positive value and negates it internally (`process_penalty_form_input`, `:2995` — `-abs(points)`). So for a −5 penalty you type **`5`**, not `-5`. Typing `-5` will fail the `min=0` constraint.

The blueprint writes penalties as negative (−5, −2) because that's their effect. The **Points column below is what you literally type.**

---

## 2. BONUSES — 1 retune + 3 adds

### Retune first (Edit, do NOT re-add — names are unique-checked)

| Existing | New Name | Points (type this) | Description | Icon |
|---|---|---|---|---|
| `Cheerful` | **Above & Beyond** | **10** | Went well past what was asked — without being told. | `mdi:star-shooting` |

### Then add these 3

| # | Name | Points (type this) | Description | Icon |
|---|---|---|---|---|
| 1 | Great Attitude | 5 | Cheerful and willing, even about a chore you didn't feel like doing. | `mdi:emoticon-happy-outline` |
| 2 | Helped a Sibling | 8 | Pitched in on someone else's chore without being asked. | `mdi:hand-heart` |
| 3 | Initiative | 7 | Saw something that needed doing and just did it. | `mdi:lightbulb-on-outline` |

**Total after entry: 4 bonuses.**

---

## 3. PENALTIES — 1 retune + 1 add

Kept deliberately light — the system leans on positive reinforcement (blueprint §6).

### Retune first (Edit, do NOT re-add)

| Existing | New Name | Points (type this) | Description | Icon |
|---|---|---|---|---|
| `Demerit` | **Missed Chore** | **5** | An assigned chore didn't get done and nobody flagged it. | `mdi:close-circle-outline` |

### Then add this 1

| # | Name | Points (type this) | Description | Icon |
|---|---|---|---|---|
| 1 | Reminder Needed | 2 | Needed more than one reminder to get started. | `mdi:bell-alert-outline` |

**Total after entry: 2 penalties.**

---

## 4. Decisions baked in

- **Points typed positive for both.** See §1 warning. The stored values will read −5 and −2 for penalties; that's correct.
- **Labels skipped**, same as rewards — HA registry labels don't group anything on the dashboard.
- **Penalty scale is small on purpose.** At 1 pt = $0.10, "Missed Chore" costs $0.50 — a real but non-punishing signal. Blueprint §6 explicitly prefers positive reinforcement, so penalties stay at 2 points below the smallest bonus.
- **Bonus scale sits between chore values.** Chores run 2–10 pts; bonuses run 5–10. "Above & Beyond" at 10 equals the largest chore (Cook Dinner) — intentional, since it's meant to be rare.
- **No cooldown/frequency fields exist** on either form. Grant discipline is a house rule.

---

## 5. Verification after entry

Version caveat: reference source is **1.0.8**, Pi runs **1.0.7**. If a form shows a field this sheet doesn't list, trust the form and note the delta here.

```bash
ssh kitchencom    # (or kitchencom-eth on a direct-ethernet link)
sudo docker exec homeassistant python3 -c "
import json,glob
f=glob.glob('/config/.storage/choreops/choreops_data_*')[0]
d=json.load(open(f))['data']
for k in ('bonuses','penalties'):
    v=d.get(k,{}); v=list(v.values()) if isinstance(v,dict) else v
    print(k.upper(), len(v))
    for x in v: print('   ', x.get('name'), '|', x.get('points'))
"
```

Expect **BONUSES 4** (Above & Beyond 10, Great Attitude 5, Helped a Sibling 8, Initiative 7) and **PENALTIES 2** (Missed Chore **−5**, Reminder Needed **−2** — negative in storage, positive in the form).

Entity count check:

```bash
sudo docker exec homeassistant python3 -c "
import json
r=json.load(open('/config/.storage/core.entity_registry'))
print(len([x for x in r['data']['entities'] if x.get('platform')=='choreops']))
"
```

Use `platform=choreops`, **never** the `kc_` prefix (returns 0).

---

## 6. Next after this sheet

**Achievements → Badges** (in that order — achievement-linked badges require an existing achievement). Sheet: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-05-choreops-achievements-badges-entry-sheet.md`
