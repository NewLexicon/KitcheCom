# Grocy integration v1.15.0 on HA 2026.6.3 — three documented facts overturned

**Date:** 2026-08-18. **Branch:** `feat/grocy-kitchen`. **Verified on the Pi**, not the dev rig.

Installed `iamkarlson/grocy` **v1.15.0** on the Pi's **HA 2026.6.3** and enabled the entities.
Three load-bearing claims in the existing docs are now **wrong for this version**.

## 1. ✅ The HA version wall does not apply to v1.15.0

Docs said grocy **v1.3.0 is "the only one that works"**, because v1.3.1+ needs `pygrocy2` ≥2.5.0
→ pydantic ≥2.12.2, conflicting with HA 2025.7.4's pinned 2.11.7.

**On HA 2026.6.3 the conflict is inverted and absent.** The Pi ships **pydantic 2.13.4**, and:

| grocy | requirements |
|---|---|
| v1.3.0 | `pygrocy2==2.4.1` → needs pydantic `~=2.11.3` ❌ **would downgrade HA's pydantic** |
| v1.3.2 | `pygrocy2==2.5.0` |
| v1.5.0 | `grocy-py==0.0.2` |
| **v1.15.0** | **`grocy-py==0.1.0`, `icalendar==7.0.0`** — no pydantic pin ✅ |

**v1.15.0 installed and loaded with zero errors.** The config flow did **not** 500.
⚠️ Note the Pi had `icalendar` **6.3.1** and the manifest wants **7.0.0**; HA resolved it at
config-flow time without complaint.

**→ Do not port the "v1.3.0 is the only one that works" rule forward. It is a
HA-2025.7.4 fact, not a universal one.**

## 2. 🔑 `done` IS carried through — the lossy-integration problem is GONE

The 2026-08-14 "stop investing in the food card" decision rests on: *pygrocy drops the `done`
field, so the card can only DELETE, never mark-done — and it structurally cannot reach parity.*

**`sensor.grocy_shopping_list` attributes on the Pi, read from Developer Tools:**

```yaml
products:
  - id: 3
    product_id: null
    amount: 1
    note: paper towels
    product: null
    done: false        # ← the field that was supposedly dropped
count: 1
```

**`done` is present.** `grocy-py` is not `pygrocy2` and does not have the flaw.
**The structural argument for shelving the shopping card no longer holds on this version.**

## 3. 🔑 There IS a `todo` platform now

The roadmap (§3) states: *"`PLATFORMS` is only `sensor` + `binary_sensor` — there is **NO `todo`
platform**. The tempting 'native `todo.grocy_shopping_list` → built-in todo-list card for free'
path **does not exist**. Shopping list is custom-card work."*

**v1.15.0 ships 6 `todo` entities**, including **`todo.grocy_shopping_list`**, live with state `1`.

`supported_features: 6` decodes to:

| Feature | |
|---|---|
| `UPDATE_TODO_ITEM` (2) | ✅ **check items off** |
| `DELETE_TODO_ITEM` (4) | ✅ |
| `CREATE_TODO_ITEM` (1) | ❌ **cannot add items** |
| `MOVE` / due-date / description | ❌ |

**→ The "free built-in todo card" path the roadmap ruled out now exists — for check-off, not
for adding.** Adding is still possible via `POST /objects/shopping_list` (verified this morning),
so a small add-item control alongside the built-in card would close the gap.

## Full entity inventory (20 total; most disabled by default)

Enabled here: `sensor.grocy_shopping_list` · `sensor.grocy_meal_plan` ·
`todo.grocy_shopping_list` · `todo.grocy_meal_plan` · `calendar.grocy_calendar`

Disabled: stock · chores · tasks · batteries sensors, their `todo` twins, and 7 binary_sensors
(expired / expiring / missing / overdue products, batteries, chores, tasks).
**Leave them disabled** — this household uses 5 of Grocy's 14 subsystems.

⚠️ **Entities ship DISABLED.** Enabling was done by editing `.storage/core.entity_registry`
directly (backed up to `core.entity_registry.bak-pregrocy`) and restarting. The UI route is
Settings → Devices & Services → Grocy → the "+N disabled entities" link.

⚠️ **`sensor.grocy_meal_plan` reads `0`** while the database holds 2 meal-plan rows. Unexplained.
Possibly the entries are in the past (`2026-08-14`, `2026-08-15`) and the sensor only counts
upcoming meals. **Verify before building anything on that sensor.**

## What this does to the plan

`docs/session-state/2026-08-18-grocy-kitchen-plan.md` **Task 1** (rewrite the shopping card onto
REST to get a done-toggle) may be **unnecessary**. Test in this order:

1. **Put HA's built-in to-do card on `todo.grocy_shopping_list`.** If check-off works and
   survives a round-trip to Grocy, the custom shopping card is redundant for the core use.
2. If it works, the remaining gaps are **adding items** (REST `POST`) and **appearance**
   — and appearance is the whole reason Garrett wants custom cards, so a custom card may still
   win on looks while the built-in one proves the data path.
3. The 30-second poll lag still applies to anything reading the sensor. Check whether the `todo`
   entity refreshes faster or whether HA's card issues an optimistic update.

**Still true and unchanged:** no recipe sensor exists, so recipes remain REST-only via
`homeassistant/packages/grocy_recipes.yaml`.
