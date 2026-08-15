# Kitchen Panel Features — Design

**Date:** 2026-08-15
**Status:** DESIGN ONLY — no code written.
**Branch:** `feat/panel-features`

Six requested features. **Half are largely already built** — this document marks each as
**BUILD-NEW**, **SURFACE-EXISTING**, or **EXTEND**, so nobody rebuilds working software.

**Not on the Tuesday 2026-08-18 path.** Captured while the Pi was unavailable.

---

## 0. Summary — what is actually new

| # | Feature | Classification | Real work |
|---|---|---|---|
| 1 | Allowance synced to chores/rewards | **SURFACE-EXISTING** | A card. The economy already exists. |
| 2 | School-morning checklist + countdown | **BUILD-NEW** | Helpers + template + automation |
| 3 | Recipe display | **SURFACE-EXISTING** | Card already ships; place it |
| 4 | Trash day reminder | **BUILD-NEW** | Smallest item here |
| 5 | Shared shopping lists (Costco/Amazon/Lowes) | **EXTEND** | More `local_todo` lists + card reuse |
| 6 | Quotes / dictionary / mantras | **BUILD-NEW** | Largest item; hybrid API + fallback |

**Decisions locked 2026-08-15:** plan all six with reuse marked; quotes use **hybrid API with
local fallback**; countdown uses **fixed weekday times + manual no-school toggle**.

---

## 1. Allowance — SURFACE-EXISTING

**Do not build an allowance system. It exists.**

Verified 2026-08-15:
- ChoreOps ships a full **redeem** subsystem (101 `redeem` hits in source) with currency support.
- The economy is **already configured: 1 pt = $0.10** (cold-open §2, Pi Tasks 1-7).
- Balance sensor exists per kid: **`sensor.rowan_choreops_points`** (and the Wystan equivalent),
  confirmed in the dev-rig entity registry.

**The work is a display**, not a system: a card showing points and their dollar value.

```yaml
# Sketch. Dollar value = points × 0.10 — keep the rate in ONE place.
- type: markdown
  content: >
    Rowan: {{ states('sensor.rowan_choreops_points') }} pts
    (${{ '%.2f' | format(states('sensor.rowan_choreops_points') | float(0) * 0.10) }})
```

⚠️ **The rate is duplicated the moment you template it.** ChoreOps holds 1pt=$0.10 internally; the
card above hardcodes `0.10` again. If the rate ever changes in ChoreOps, this silently disagrees.
**Mitigation:** put the rate in a single `input_number` and reference it from every template, or
accept the duplication and write the ChoreOps value next to it in a comment.

⚠️ **Entity-name trap:** the dev rig currently shows `sensor.rowan_choreops_2_points` alongside the
real one — that is the duplicate "ChoreOps 2" entry. **Delete that entry before wiring cards**, or
you will bind to the wrong sensor.

> 🚩 **OPEN:** is "allowance" just a displayed balance, or does real money change hands on a
> schedule (weekly payout)? If the latter, that is a *human* process — HA can display and remind,
> but it should not pretend to track cash it cannot verify.

---

## 2. School-morning checklist + countdown — BUILD-NEW

**Locked design: fixed weekday times + a manual no-school toggle.** (Calendar-driven was rejected
as over-coupled; it depends on school events actually being on `calendar.family`.)

### Components

```yaml
input_datetime:      # one per weekday — leave/bus time
  school_leave_mon: {has_date: false, has_time: true}
  # ... tue/wed/thu/fri

input_boolean:
  school_day_override:   # flip OFF for holidays, snow days, breaks
    name: No School Today
```

### Countdown

A **template sensor** computing minutes until today's leave time. Recomputes on a
`time_pattern` trigger (every minute is fine — this is cheap).

**Display states:**
- `> 30 min` — calm, normal text
- `10-30 min` — highlighted
- `< 10 min` — urgent styling
- past leave time — stop counting, do not show negatives

⚠️ **Design for the failure that matters: a countdown that is WRONG is worse than none.** If the
helper is unset, the template must render "—", never a bogus number. A kid trusting a broken
countdown misses a bus.

### Checklist

Simplest correct approach: a **`local_todo` list** (`todo.school_morning`) with `todo.` services
already available (`add_item`, `update_item`, `remove_completed_items` — all verified present).

**Nightly reset automation** re-adds the standard items so the list is fresh each morning.

> 🚩 **OPEN:** one shared list, or one per kid? Two kids on different schedules argues per-kid;
> simplicity argues shared. Decide before building — it changes the entity model.

---

## 3. Recipe display — SURFACE-EXISTING

**`custom_cards/grocy-food-card/src/recipe-card.ts` already exists and ships.** Do not rebuild it.

Work remaining is placement and one behaviour:

⚠️ **Keep the screen awake while cooking.** The screensaver package
(`homeassistant/packages/screensaver.yaml`) blanks on an inactivity timer. Reading a recipe with
flour on your hands is exactly when nobody touches the screen — and exactly when it must not blank.

**Approach:** an `input_boolean.cooking_mode` that suppresses the screensaver, same pattern as the
existing `kitchen_screensaver_enabled` safety switch. Toggle it from the recipe view.

---

## 4. Trash day reminder — BUILD-NEW (smallest item)

Consistently reported as the highest-value-per-effort home automation. Two parts:

1. **Night-before notification** — automation on a time trigger, day-of-week condition.
2. **Panel indicator** on trash-day-eve so it is visible without a phone.

**Use the TTS you already have.** `google_translate` TTS is configured (verified in
`core.config_entries`), so a spoken reminder costs nothing extra.

⚠️ **Alternating pickups** (recycling every other week) need a cycle reference date, not just a
weekday. If your pickup alternates, a plain weekday condition will be wrong half the time.

> 🚩 **OPEN:** trash weekly? recycling alternating? What day(s)?

---

## 5. Shared shopping lists — EXTEND

**What exists today:**
- `todo.groceries` (`local_todo`, wired 2026-06-15) — on the dashboard at `kitchen.yaml:28`
- A built shopping card: `custom_cards/grocy-food-card/src/shopping-card.ts`
- Grocy, for pantry/stock

**What is new: per-store lists.** Add `local_todo` lists — `todo.costco`, `todo.amazon`,
`todo.lowes` — and reuse the existing card per list.

**Why `local_todo` rather than Grocy for these:** Grocy models *stock and consumption*, which is
right for groceries but wrong for "buy a drill bit at Lowes." Keep Grocy for food, `local_todo` for
errand lists. **Do not force Lowes items into a pantry system.**

**"Shared" means phone access**, which the HA companion app already provides — anyone can add to a
`todo` list from their phone and it appears on the panel.

⚠️ **Do not proliferate lists.** Four lists is manageable; twelve becomes an unmaintained mess
nobody trusts. Start with the three named and add only on demonstrated need.

---

## 6. Quotes / dictionary word / mantras — BUILD-NEW (largest item)

**Locked design: hybrid — API with local fallback.**

### Architecture

`rest` sensors fetch daily content; a **local curated list** supplies the fallback. Verified
available: `rest` (with `CONF_JSON_ATTRS` and `value_template`), `command_line`, `shell_command`.

**Three content streams**, each independently failable:
1. Inspiration quote
2. Dictionary word of the day (+ definition)
3. Mindfulness mantra

### The fallback is the whole point

⚠️ **A blank or "unavailable" panel section looks broken to everyone in the house.** Every stream
must degrade to curated local content, never to an error string.

**Rules:**
- Fetch **once daily**, not on a short interval. These change daily; polling more is pure waste and
  invites rate limits.
- Cache the last good value. If today's fetch fails, prefer *yesterday's real content* over the
  fallback, and the fallback over nothing.
- **Render nothing rather than an error.** No `unknown`, no `unavailable`, no stack text.

### Content safety

⚠️ **This is a family screen with an 8- and a 12-year-old.** Public quote and word-of-day APIs are
not curated for children. A curated local list is *safe by construction*; an API is not.

**Recommendation:** lean heavily on the curated list, treat the API as garnish. If any API is
unvetted, prefer local-only for that stream — the "fresh content forever" benefit is small against
one bad word on the kitchen wall.

> 🚩 **OPEN:** which specific APIs? Each needs checking for cost, rate limit, terms, and content
> suitability before wiring. Mantras almost certainly have no good API — plan that stream as
> local-only.

---

## 7. Build order

Ordered by value-per-effort, cheapest first. Each is independently shippable.

1. **Trash reminder** — smallest, highest daily value, no new hardware
2. **Allowance card** — pure display over existing sensors
3. **Recipe placement + cooking-mode** — card exists; wire the screensaver interaction
4. **Shopping lists** — mechanical: add lists, reuse card
5. **School checklist + countdown** — real logic, needs the per-kid decision first
6. **Quotes/dictionary/mantras** — largest; do last, start local-only, add APIs after

**Do 1-4 before 5-6.** The first four are hours; the last two are the ones that sprawl.

---

## 8. Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | Allowance = display only, or real weekly payout? | §1 |
| 2 | School checklist shared or per-kid? | §2 |
| 3 | Trash/recycling schedule — days, and does recycling alternate? | §4 |
| 4 | Which quote/dictionary APIs — cost, limits, kid-appropriate? | §6 |
| 5 | Keep the 1pt=$0.10 rate in an `input_number`, or accept duplication? | §1 |

---

## 9. Deliberately NOT in scope

- **Rebuilding the recipe or shopping cards.** They exist and work.
- **Rebuilding the ChoreOps economy.** It is configured and running.
- **A fifth-through-tenth feature.** Four projects are already staged (ChoreOps, lighting,
  irrigation, parked internet-time). **The most common home-automation failure is fifty
  half-configured things nobody trusts.** Ship these, watch what the family actually uses for two
  weeks, then decide what is next from evidence rather than from a list.

---

## 10. Related

- `docs/session-state/2026-08-15-choreops-devrig-coldopen.md` — economy, entity names, the
  "ChoreOps 2" duplicate that must be deleted before wiring allowance cards.
  ⚠️ **Lives on branch `feat/choreops-chores`, NOT on this branch or `main`** — it will not be in
  your working tree here. Read it with:
  `git show feat/choreops-chores:docs/session-state/2026-08-15-choreops-devrig-coldopen.md`
- `homeassistant/packages/screensaver.yaml` — the safety-switch pattern reused in §2 and §3
- `homeassistant/dashboards/kitchen.yaml` — where these cards land (`todo.groceries` at :28)
- `custom_cards/grocy-food-card/src/` — `recipe-card.ts`, `shopping-card.ts`, both shipping
