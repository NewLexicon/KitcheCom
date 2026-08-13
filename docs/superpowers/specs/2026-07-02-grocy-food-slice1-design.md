# KitchenCOM × Grocy — Slice 1: Meal-Plan + Shopping Cards

**Date:** 2026-07-02
**Status:** Design ratified (brainstorming complete) — ready for writing-plans.
**Parent roadmap:** `2026-07-02-grocy-food-ops-roadmap.md` (read §2 walls, §3 data contract, §5 slice table first).
**Supersedes (inherits from):** `2026-06-08-grocy-chores-slice-design.md` — chores moved to ChoreOps; this slice repurposes that slice's card scaffold and pipeline work for the food domain.

---

## 1. Summary

Slice 1 puts Grocy's **food domain** on the KitchenCOM kitchen touchscreen via two custom Lit cards:

- **`grocy-mealplan-card`** — read-only "what's for dinner" display of the meal plan.
- **`grocy-shopping-card`** — the shopping list with per-item **check-off** (no free-text add in S1).

It is the foundation slice of the food-ops roadmap: it proves the Docker → HACS → attribute-blob sensor → custom card → kitchen screen → round-trip pipeline for the food domain, exactly as the (now-superseded) chores slice would have for chores. Recipes, web-import, auto-list, and the Kroger cart integration (roadmap S2–S6) all build on the surfaces this slice establishes.

**Scope fence.** *In:* two cards in one package; check-off round-trip on the shopping card; the Grocy backend compose + HACS wiring (documented); Tier-1 + Tier-2 verification. *Out:* free-text add to the shopping list; meal-plan editing (both need clunkier `add_generic`/`update_generic` paths — deferred); recipes/stock/import/Kroger (later slices); on-screen Tier-3 (Pi-blocked).

---

## 2. Package layout — one package, two cards

Repurpose the existing `custom_cards/grocy-chores-card/` scaffold (bare config only — no `src/`/`test/`/`demo/` yet) into **`custom_cards/grocy-food-card/`**, mirroring the proven `screensaver-card` TS/Lit/vitest setup:

```
custom_cards/grocy-food-card/
  package.json  tsconfig.json  tsconfig.test.json  vitest.config.ts
  src/
    shared.ts          # blob-parse + theme-row helpers (both cards share these)
    mealplan-card.ts   # registers custom element: grocy-mealplan-card
    shopping-card.ts   # registers custom element: grocy-shopping-card
  test/                # pure-function TDD (Tier-1)
  demo/index.html      # offline visual check (mirror screensaver demo import-map verbatim)
  → dist/grocy-food-card.js   # both elements, one build
```

**Rationale:** both cards read the same attribute-blob-sensor shape and share parse/theme helpers, so one package avoids duplicating the scaffold. This is the roadmap's §110 grant to decide the split at the S1 spec, exercised here.

---

## 3. The verified data contract & parse layer

Field names below are **source-derived from pygrocy** (`ShoppingListProduct`, `MealPlanItem`, `RecipeItem`, `MealPlanSection`), read at source on 2026-07-02. They are **NOT confirmed against the live sensor** — see OQ-1.

### 3.1 Shopping list — `sensor.grocy_shopping_list.attributes.products[]`
Each item (`ShoppingListProduct`): `id` (entry id), `product_id`, `amount` (**float**), `note`, nested `product` (`{ name, id, … }`).

- **`parseShoppingItems(products)` → `{ id, name, amountLabel, note }[]`**
  - `name = item.product?.name`, **fail-safe** to `"(unnamed)"` when `product` is absent (the integration may not hydrate the nested object).
  - `amountLabel` = `formatAmount(item.amount)`.
  - Returns `[]` for nullish/empty input; never throws.
- **`formatAmount(amount)` → string.** `amount` is a float, so raw render gives "2.0 eggs". **Rule:** integer-valued floats render with no decimal (`2.0 → "2"`); non-integer floats render as-is (`1.5 → "1.5"`). **No unit suffix in S1** — unit-aware formatting (via `product.default_quantity_unit_purchase.name`) is deferred (another nested-hydration OQ-1 surface; YAGNI for S1).

### 3.2 Meal plan — `sensor.grocy_meal_plan.attributes.meals[]`
Each item (`MealPlanItem`): `id`, `day` (**date**), `type`, `recipe_id`, `recipe_servings`, nested `recipe` (`{ name, … }`), `note`, `product_id`, **`section_id` / `section`** (`MealPlanSection{ name, sort_number }`).

- **`parseMeals(meals)` → `{ id, day, label, kind }[]`**
  - **`type` drives label resolution via a switch WITH a `default` branch** — the set is treated as **OPEN, not closed**. Grocy meal plans have **section rows** (headers like "Lunch"/"Dinner") beyond the RECIPE/PRODUCT/NOTE content types; whether the integration emits them into `meals[]` is a Tier-2 unknown. RECIPE → `recipe?.name`; NOTE → `note`; PRODUCT → product name; **unknown/section → safe generic fallback (render, never throw).**
  - **`day` is opaque passthrough** — `parseMeals` does NOT assume `day` is a `Date`-parseable string vs. some other serialized shape (OQ-1). Any date *interpretation* (sort/group-by-day) is a card-layer decision, not a parse concern.
  - Returns `[]` for nullish/empty input; never throws.

### 3.3 Check-off payload builder
- **`buildRemovePayload(...)` → service-data object** for `grocy.remove_product_in_shopping_list`.
- **`canCheckOff(...)` → boolean** — gates whether the ✓ button renders (see §4.2).

**Tier boundary (critical — avoid the over-fit trap):** `buildRemovePayload` is Tier-1-tested for **input→output mapping only** ("payload is built from these inputs in this structure"). It is **NOT** proof the structure matches the live service contract — the fields the service actually wants (entry `id` vs `product_id`; whether a list id is required) are **OQ-2/OQ-3**, resolved at Tier-2. A green Tier-1 suite means "the payload-builder is internally consistent," NOT "check-off works." Tier-2 confirms the output matches the service's accepted shape.

---

## 4. Card behavior

### 4.1 `grocy-mealplan-card` (read-only)
- `setConfig({ entity = "sensor.grocy_meal_plan" })`.
- On `hass` setter: reads `attributes.meals[]` → `parseMeals` → renders rows (label + kind; `day` available for the card to group/sort). No mutation, no buttons.
- Theme via `kitchencom` CSS vars (mirror screensaver's `css` block).

### 4.2 `grocy-shopping-card` (display + check-off)
- `setConfig({ entity = "sensor.grocy_shopping_list", shopping_list_id? })`.
- Reads `attributes.products[]` → `parseShoppingItems` → rows with `amountLabel` + name.
- Per-row **✓ check-off** → `hass.callService("grocy", "remove_product_in_shopping_list", buildRemovePayload(...))`.
- **Guard (chores `done_by` precedent):** when `canCheckOff(...)` is false — the required id (OQ-2) or list id (OQ-3) isn't resolvable — rows render **read-only, no ✓ button**, rather than firing a call that 500s. The mutation path is only wired when the guard passes.
- No free-text add (S1 scope).

Both cards register via the guarded `customElements.define` footer (mirror `screensaver-card.ts` verbatim) plus a **new** `window.customCards` entry each (good practice for the HA card picker; screensaver has none — this is new work).

---

## 5. Open questions (resolved at Tier-2 by reading the LIVE entity — do not block Tier-1)

These are live-read resolutions, not design unknowns. Tier-1 TDD proceeds against provisional fixtures now; Tier-2 confirms/corrects.

- **OQ-1 — provisional serialized keys (blocker-shape risk).** Fixture field names are source-derived from pygrocy; the HACS integration's `as_dict()` mapper may **flatten, rename, or camelCase** them, and the serialized form of nested objects (`product`, `recipe`) and of `day` (a Python `date`) is unconfirmed. Fixtures carry a "PROVISIONAL — pending Tier-2" header. **Tests must not over-fit to guessed keys.** Resolve: capture the real sensor JSON in dev-HA, correct fixtures, re-run the suite.
- **OQ-2 — check-off entry id.** Whether `remove_product_in_shopping_list` wants the shopping-list **entry `id`** or the **`product_id`**. Pin empirically at Tier-2; do not guess.
- **OQ-3 — shopping-list id sourcing (distinct from OQ-2).** `remove_product_in_shopping_list` likely needs the **list id** too. Candidate sources: (a) the `shopping_list_id` card-config field; (b) a sensor attribute; (c) default to Grocy's list `1`. If unresolvable, `canCheckOff` fails closed and every row renders read-only (check-off silently never works) — so this is load-bearing for the mutation path. Resolve at Tier-2: confirm which source is correct.

---

## 6. Testing posture — three tiers (chores precedent)

No tier's claim is made until that tier has actually run (verification-before-completion).

- **Tier-1 — pure-function TDD (now, in CI, no HA/Grocy):** `parseShoppingItems`, `parseMeals` (incl. the `default`/section branch + nested fail-safes), `formatAmount`, `canCheckOff`, `buildRemovePayload` (input→output mapping only — §3.3 boundary). Against PROVISIONAL fixtures (OQ-1 header). Red→green→refactor.
- **Tier-2 — live round-trip on the Mac (not Pi-blocked):** stand up Docker + Grocy + dev-HA with HACS + the grocy integration pointed at the local Grocy container. Capture the real `sensor.grocy_shopping_list` + `sensor.grocy_meal_plan` shapes (**resolves OQ-1**); confirm/correct fixtures + re-run the suite. Render both cards against real data. Press ✓ check-off → confirm the item **removed in Grocy's own UI** (**resolves OQ-2 + OQ-3**; confirms `buildRemovePayload`'s output matches the live service contract). This tier proves the slice works.
  - **Prerequisite:** Docker was not running on the Mac at design time (2026-07-02); the old `grocy-eval` container state is unknown. Treat Grocy stand-up as fresh — a distinct plan task budgets it.
- **Tier-3 — on-kitchen-screen:** Pi-blocked, deferred to the hardware phase. NOT claimed by this slice.

---

## 7. Supersession, dashboard reconciliation & carry-forwards

- **Supersession banner** on `2026-06-08-grocy-chores-slice-design.md` → points to the roadmap + this spec (chores → ChoreOps; that card never built; scaffold/pipeline inherited here). A plan task.
- **Dashboard reconciliation** (`homeassistant/dashboards/kitchen.yaml`): the `todo.groceries` placeholder → replaced by `custom:grocy-shopping-card`; the `todo.chores` placeholder → owned by ChoreOps (out of scope, note only — leave for that integration).
- **Boundary amendment** — the zero-custom-Python crossing (via the runtime HACS-installed grocy integration; repo `custom_components/` stays empty) is recorded in the roadmap; parent-spec §6b reconciliation is a plan task, now for the food domain not chores.
- **Grocy backend** — compose fragment (`lscr.io/linuxserver/grocy`, arm64, host 9283→80) + INSTALL.md "Grocy backend" phase inherited from the chores slice's §4; stand-up on the Pi is slice-D/Pi-blocked, but the local container is needed for Tier-2 now.
- **Scaffold naming** — the `grocy-chores-card/` directory is renamed/repurposed to `grocy-food-card/`; the plan handles the git move + the `package.json` `name` change.
