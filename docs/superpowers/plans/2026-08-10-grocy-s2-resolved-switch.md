# Grocy S2 — `recipes_pos_resolved` Switch + Hybrid Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed live defect where every recipe ingredient renders `"(unknown)"`, by switching the ingredient source to Grocy's `recipes_pos_resolved` endpoint and reworking the transport from a single oversized sensor to a hybrid (thin list sensor + per-recipe on-demand fetch).

**Architecture:** LIST keeps the S1-proven `hass.states[...].attributes` pattern but the sensor now carries **only** the recipe list (~8 KB at 25 recipes, vs ~85 KB for the whole library against a ~16 KB ceiling). DETAIL fetches its own ingredients on demand via a response-returning `rest_command` filtered with `query[]=recipe_id=N`, so the ~76 KB of ingredient bulk never enters HA state. `quantity_units` is fetched once and cached, because the resolved endpoint carries `product_name` but **not** a unit name.

**Tech Stack:** TypeScript + Lit 3 (no bundler — raw `tsc` output), Vitest, Home Assistant `rest` / `rest_command` YAML, Grocy 4.6.0 REST API.

---

## Context you need before starting

**Read these first:**

- **Spec (AMENDED — read the amendment blocks, not the superseded text beneath them):**
  `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md` — **§2.1** (transport) and **§4.2** (ingredient source) both carry 2026-08-10 amendments that supersede their original text.
- **Empirical findings (every number in this plan traces here):**
  `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/session-state/2026-08-07-grocy-tier2-s2-findings.md`

**Why this is a redesign and not a bugfix:** the shipped `parseIngredients` reads `r.name` and `r.unit`. **Those fields exist on no Grocy payload.** The provisional fixtures invented them (`test/fixtures/recipes-pos.json` says rows are "shown PRE-JOINED"), the tests asserted against those invented rows, and everything passed — 54 green tests over a contract that live data does not satisfy. This plan replaces the fixtures with **captured live shapes** so the tests can no longer pass against a fiction.

**⚠️ Mandatory pre-flight before ANY commit:**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print: feat/grocy-chores
```

Another window shares this repo's main checkout on `feat/choreops-chores`. All work here is worktree-isolated. Every command below assumes you are in the worktree.

**Test commands** (run from `custom_cards/grocy-food-card/`):

```bash
npx vitest run          # full suite — 54 passing at plan time
npm run typecheck       # must stay at 0 errors
npm run build           # emits dist/{shared,mealplan-card,shopping-card,recipe-card}.js
```

**Docker note:** **Tasks 1–8 are entirely offline** — no container, no Grocy, no HA. Only **Task 9** (Tier-2 verification) needs the live instance, and it needs Docker Desktop started **by hand** (a GUI app; an agent session cannot launch it), then `docker compose -f deploy/grocy/docker-compose.grocy.yml up -d`. Test data persists in the gitignored `deploy/grocy/grocy-config/` bind dir and restores on `up`.

**A caution about that split:** Tasks 1–8 will end with a green suite, a clean typecheck, and a demo that renders correctly — **none of which proves the fix works against real Grocy.** That exact combination (54 green tests over invented fixtures) is what let the `"(unknown)"` defect ship in the first place. **Task 9 is where this plan's claim is actually earned.**

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `custom_cards/grocy-food-card/test/fixtures/recipes-pos-resolved.json` | **Create** | Captured-shape fixture for the resolved endpoint. Replaces the fiction in `recipes-pos.json`. |
| `custom_cards/grocy-food-card/test/fixtures/quantity-units.json` | **Create** | Captured-shape fixture for the unit lookup. |
| `custom_cards/grocy-food-card/src/shared.ts` | Modify | `buildUnitMap` (new) + `parseIngredients` (amended signature/internals). Row contract `IngredientRow` is **unchanged**. |
| `custom_cards/grocy-food-card/test/ingredient-parse.test.ts` | Modify | Rewritten against the resolved shape. |
| `custom_cards/grocy-food-card/test/unit-map.test.ts` | **Create** | `buildUnitMap` fail-safes. |
| `custom_cards/grocy-food-card/src/recipe-card.ts` | Modify | Async ingredient fetch on DETAIL open + loading/error states. |
| `custom_cards/grocy-food-card/test/recipe-fetch.test.ts` | **Create** | The fetch state machine, exercised through a fake `hass`. |
| `homeassistant/packages/grocy_recipes.yaml` | Modify | Narrow sensor to the recipe list; add the `rest_command`s. |
| `deploy/INSTALL.md` | Modify | Phase B2 secrets + the two new `rest_command` entries. |
| `custom_cards/grocy-food-card/demo/index.html` | Modify | Fake `hass` answers both `rest_command`s (its `callService` stub currently returns `undefined`). |

**`test/fixtures/recipes-pos.json` is NOT deleted** — it becomes the fixture for the superseded raw-`recipes_pos` fallback path, with its `_note` corrected to say so.

---

## Task 1: Replace the fiction fixtures with captured live shapes

**Files:**
- Create: `custom_cards/grocy-food-card/test/fixtures/recipes-pos-resolved.json`
- Create: `custom_cards/grocy-food-card/test/fixtures/quantity-units.json`
- Modify: `custom_cards/grocy-food-card/test/fixtures/recipes-pos.json` (header note only)

This task ships no behavior. It exists first so every later test asserts against a shape Grocy actually returns.

- [ ] **Step 1: Create the resolved-endpoint fixture**

These field names and values come from findings §4 (live Grocy 4.6.0, Weeknight Tacos at its 4→6 factor: `1.5 → 2.25`, `12 → 18`, `0.25 → 0.375`). `recipe_amount` is **already scaled**; `qu_id` is a bare int with **no** accompanying unit name.

Create `custom_cards/grocy-food-card/test/fixtures/recipes-pos-resolved.json`:

```json
{
  "_note": "CAPTURED SHAPE — GET /api/objects/recipes_pos_resolved against live Grocy 4.6.0 (2026-08-07, findings §4). recipe_amount is ALREADY SCALED server-side. There is NO unit name on these rows — qu_id is a bare int and units come from quantity-units.json. Do not add a `name` or `unit` key to these rows: the previous fixture invented both and the tests passed against data Grocy never returns.",
  "recipes_pos_resolved": [
    { "id": 10, "recipe_id": 1, "product_id": 3, "product_name": "Ground beef", "recipe_amount": 2.25, "qu_id": 4, "only_check_single_unit_in_stock": 0 },
    { "id": 11, "recipe_id": 1, "product_id": 8, "product_name": "Tortillas", "recipe_amount": 18, "qu_id": 2, "only_check_single_unit_in_stock": 0 },
    { "id": 12, "recipe_id": 1, "product_id": 9, "product_name": "Salt", "recipe_amount": "a pinch", "qu_id": 5, "only_check_single_unit_in_stock": 0 },
    { "id": 13, "recipe_id": 3, "product_id": 4, "product_name": "Butter", "recipe_amount": 0.49950000000000006, "qu_id": 4, "only_check_single_unit_in_stock": 0 },
    { "id": 14, "recipe_id": 3, "product_id": 5, "recipe_amount": 2, "qu_id": 99, "only_check_single_unit_in_stock": 0 }
  ]
}
```

Row 13 is the real float-noise value Grocy returned for Shortbread butter (findings §4) — it proves 2dp rounding is still load-bearing after scaling moved server-side. Row 14 deliberately omits `product_name` and uses an unmapped `qu_id` to exercise both fail-safes.

- [ ] **Step 2: Create the quantity-units fixture**

Ids and names from the spec §4.2 amendment (findings §4):

```json
{
  "_note": "CAPTURED SHAPE — GET /api/objects/quantity_units against live Grocy 4.6.0 (2026-08-07). 6 rows, ~900 B, static and cacheable. Fetched once per card lifetime.",
  "quantity_units": [
    { "id": 2, "name": "Piece", "name_plural": "Pieces" },
    { "id": 3, "name": "Pack", "name_plural": "Packs" },
    { "id": 4, "name": "Pound", "name_plural": "Pounds" },
    { "id": 5, "name": "Tablespoon", "name_plural": "Tablespoons" },
    { "id": 6, "name": "Cup", "name_plural": "Cups" },
    { "id": 7, "name": "Gram", "name_plural": "Grams" }
  ]
}
```

- [ ] **Step 3: Correct the old fixture's header note**

In `custom_cards/grocy-food-card/test/fixtures/recipes-pos.json`, replace the `_note` value with:

```
SUPERSEDED as the card's live source (spec §4.2, amended 2026-08-10) — the card now reads recipes_pos_resolved. RETAINED because the raw recipes_pos field names WERE confirmed correct at Tier-2. ⚠️ The `name` and `unit` keys on these rows are FICTION: no Grocy payload carries them. That fiction is exactly why every live ingredient rendered "(unknown)". Do not use this fixture for new tests.
```

- [ ] **Step 4: Verify the suite still passes untouched**

Run: `npx vitest run`
Expected: **54 passed** — no test reads the new fixtures yet, so this must be unchanged.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-food-card/test/fixtures/
git commit -m "test: capture live recipes_pos_resolved + quantity_units fixture shapes

The prior recipes-pos.json invented pre-joined name/unit keys that no Grocy
payload carries, so 54 green tests asserted against a fiction while every
live ingredient rendered (unknown). Fixtures now carry captured shapes."
```

---

## Task 2: `buildUnitMap` — the qu_id → unit-name lookup

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Test: `custom_cards/grocy-food-card/test/unit-map.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `custom_cards/grocy-food-card/test/unit-map.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildUnitMap } from "../src/shared";
import units from "./fixtures/quantity-units.json";

describe("buildUnitMap", () => {
  it("maps quantity-unit ids to their names", () => {
    const map = buildUnitMap(units.quantity_units as any);
    expect(map[4]).toBe("Pound");
    expect(map[2]).toBe("Piece");
    expect(map[7]).toBe("Gram");
  });

  it("returns an empty map for nullish or malformed input (never throws)", () => {
    expect(buildUnitMap(undefined)).toEqual({});
    expect(buildUnitMap(null)).toEqual({});
    expect(buildUnitMap("not an array" as any)).toEqual({});
  });

  it("skips rows missing an id or a name rather than emitting junk keys", () => {
    const map = buildUnitMap([
      { id: 1, name: "Good" },
      { name: "NoId" },
      { id: 2 },
      null,
    ] as any);
    expect(map).toEqual({ 1: "Good" });
  });

  it("prefers the singular name — plural forms are not v1 behavior", () => {
    const map = buildUnitMap([{ id: 9, name: "Cup", name_plural: "Cups" }] as any);
    expect(map[9]).toBe("Cup");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/unit-map.test.ts`
Expected: FAIL — `buildUnitMap` is not exported from `../src/shared`.

- [ ] **Step 3: Implement the minimal code**

Append to `custom_cards/grocy-food-card/src/shared.ts`:

```typescript
/** qu_id → unit name. Built once per card lifetime from /objects/quantity_units.
 *
 * WHY THIS EXISTS: recipes_pos_resolved pre-joins product_name but carries NO
 * unit name — qu_id stays a bare int (spec §4.2). An earlier probe reported a
 * unit name on the resolved row; that was a substring false-positive on
 * `only_check_single_unit_in_stock`. A full key dump confirmed otherwise.
 *
 * v1 uses the singular `name` for every amount. Pluralizing on amount !== 1 is
 * a deliberate non-goal (YAGNI) — "2 Pound Ground beef" reads acceptably on a
 * kitchen screen and `name_plural` can be wired later without a shape change.
 */
export function buildUnitMap(rows?: any[] | null): Record<number, string> {
  if (!Array.isArray(rows)) return {};
  const map: Record<number, string> = {};
  for (const r of rows) {
    if (r == null) continue;
    if (typeof r.id !== "number" || typeof r.name !== "string") continue;
    map[r.id] = r.name;
  }
  return map;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run test/unit-map.test.ts`
Expected: **4 passed**

Then the full suite — `npx vitest run` → **58 passed**, and `npm run typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/unit-map.test.ts
git commit -m "feat: add buildUnitMap for qu_id -> unit-name resolution

recipes_pos_resolved pre-joins product_name but carries no unit name, so
units come from a cached /objects/quantity_units lookup (spec §4.2)."
```

---

## Task 3: Re-point `parseIngredients` at the resolved shape

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts:190-204`
- Test: `custom_cards/grocy-food-card/test/ingredient-parse.test.ts` (rewrite)

**This is the task that fixes the live defect.** `IngredientRow` — `{ id, name, amount, unit }` — is **unchanged**, so `scaleIngredients` and the DETAIL render need no contract change. This is the "costs one function, not the slice" outcome the spec's OQ-S2-3 planned for.

> **Note on the retained `recipe_id` filter.** Task 5 fetches rows already filtered server-side by `query[]=recipe_id=N`, so the client-side filter below is **belt-and-braces, and deliberately kept**. It costs nothing, it keeps the function correct when handed an unfiltered payload (the demo harness and every test do exactly that), and it preserves the phantom-row guard that a prior review caught. **`recipe_id` must therefore remain in the fixtures** — if a future change strips it from the fetched rows, this filter silently returns `[]` and DETAIL goes empty. That coupling is the one thing to watch here.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `custom_cards/grocy-food-card/test/ingredient-parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseIngredients, buildUnitMap } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

const ROWS = fixture.recipes_pos_resolved as any;
const UNITS = buildUnitMap(units.quantity_units as any);

describe("parseIngredients (recipes_pos_resolved)", () => {
  it("filters rows to the requested recipe", () => {
    expect(parseIngredients(ROWS, 1, UNITS).length).toBe(3);
    expect(parseIngredients(ROWS, 3, UNITS).length).toBe(2);
  });

  it("maps product_name -> name and resolves the unit via qu_id", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[0]).toEqual({ id: 10, name: "Ground beef", amount: 2.25, unit: "Pound" });
  });

  it("takes recipe_amount as-is — Grocy already scaled it server-side", () => {
    // Live Tacos at its 4->6 factor: base 1.5 arrives as 2.25, base 12 as 18.
    // The card must NOT scale again or a 6-serving recipe renders as 9.
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[0].amount).toBe(2.25);
    expect(rows[1].amount).toBe(18);
  });

  it("rounds server-side float noise to 2dp", () => {
    // Real value Grocy returned for Shortbread butter (0.333 lb x 1.5).
    // Scaling moving server-side did NOT remove the need to round.
    const rows = parseIngredients(ROWS, 3, UNITS);
    expect(rows[0].amount).toBe(0.5);
  });

  it("name fail-safes to (unknown) when product_name is absent", () => {
    const rows = parseIngredients(ROWS, 3, UNITS);
    expect(rows[1].name).toBe("(unknown)");
  });

  it("unit fail-safes to empty string for an unmapped qu_id", () => {
    const rows = parseIngredients(ROWS, 3, UNITS);
    expect(rows[1].unit).toBe("");
  });

  it("unit fail-safes to empty string when the unit map has not loaded yet", () => {
    // DETAIL can render before the quantity_units fetch resolves. That must
    // show a bare amount, not crash and not print "undefined".
    const rows = parseIngredients(ROWS, 1, {});
    expect(rows[0].unit).toBe("");
    expect(rows[0].name).toBe("Ground beef");
  });

  it("preserves a non-numeric amount for formatAmount to blank (spec §4.3)", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[2].amount).toBe("a pinch");
  });

  it("returns [] for nullish input or an unmatched recipe id (never throws)", () => {
    expect(parseIngredients(undefined, 1, UNITS)).toEqual([]);
    expect(parseIngredients(ROWS, 999, UNITS)).toEqual([]);
  });

  it("returns [] when recipeId is unresolved (no phantom matches)", () => {
    expect(parseIngredients([{ id: 1, product_name: "Mystery" }] as any, undefined, UNITS))
      .toEqual([]);
  });

  it("drops null row entries instead of making phantom rows", () => {
    const out = parseIngredients(
      [null, undefined, { id: 2, recipe_id: 1, product_name: "OK", recipe_amount: 2, qu_id: 6 }] as any,
      1, UNITS);
    expect(out).toEqual([{ id: 2, name: "OK", amount: 2, unit: "Cup" }]);
  });

  it("tolerates a missing unit map argument entirely", () => {
    const rows = parseIngredients(ROWS, 1);
    expect(rows[0].unit).toBe("");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/ingredient-parse.test.ts`
Expected: FAIL — the current implementation reads `r.name`/`r.amount`/`r.unit`, so `name` comes back `"(unknown)"` and `amount` `undefined`.

- [ ] **Step 3: Write the implementation**

Replace `parseIngredients` in `custom_cards/grocy-food-card/src/shared.ts` (currently lines 190-204):

```typescript
/** Rows from /objects/recipes_pos_resolved -> IngredientRow[] for one recipe.
 *
 * AMENDED 2026-08-10 (spec §4.2). Previously read `r.name` / `r.unit`, which
 * exist on NO Grocy payload — every live ingredient rendered "(unknown)" with a
 * blank unit. The resolved endpoint supplies `product_name` (joined) and
 * `recipe_amount` (ALREADY SCALED server-side); units come from `unitsById`.
 *
 * The IngredientRow contract is deliberately unchanged so downstream consumers
 * — scaleIngredients and the DETAIL render — need no edit.
 */
export function parseIngredients(
  rows?: any[] | null,
  recipeId?: number,
  unitsById: Record<number, string> = {},
): IngredientRow[] {
  if (!Array.isArray(rows)) return [];
  // An unresolved recipeId must yield [], not "every row whose recipe_id is also
  // missing". Without this, `undefined === undefined` matches — and null entries
  // (null?.recipe_id is undefined) become phantom rows.
  if (recipeId === undefined || recipeId === null) return [];
  return rows
    .filter((r) => r != null && r.recipe_id === recipeId)
    .map((r) => ({
      id: r?.id,
      name: r?.product_name ?? "(unknown)",
      // Grocy pre-scales, but it also emits float noise doing so
      // (0.333 lb x 1.5 came back as 0.49950000000000006). Round here for the
      // same reason scaleIngredients does — formatAmount would print every digit.
      amount: roundAmount(r?.recipe_amount),
      unit: unitsById[r?.qu_id] ?? "",
    }));
}
```

Add this helper immediately above it:

```typescript
/** 2dp rounding that passes non-numeric amounts through untouched (spec §4.3). */
function roundAmount(amount: unknown): unknown {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return amount;
  return Math.round(amount * 100) / 100;
}
```

**`scaleIngredients` rounds inline** at `shared.ts:99` — `Math.round(r.amount * factor * 100) / 100`. **Leave that line alone.** It is guarded on both sides by an overflow check (`Number.isFinite(scaled)`) and a non-numeric early return that `roundAmount` does not replicate, so refactoring the two into one helper would either lose those guards or complicate this one. Two three-line roundings with different guard requirements is the cheaper shape; note the duplication in the commit body so it stays visible.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run test/ingredient-parse.test.ts`
Expected: **12 passed**

Then: `npx vitest run` → **62 passed**. The arithmetic: 54 baseline − 8 old `ingredient-parse` tests + 12 new ones + 4 from Task 2's `unit-map` = 62. `npm run typecheck` → 0 errors.

> If the total differs, **do not adjust the number to match** — reconcile which test moved and say so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/ingredient-parse.test.ts
git commit -m "fix: read ingredients from recipes_pos_resolved, not invented fields

parseIngredients read r.name/r.unit, which no Grocy payload carries, so every
live ingredient rendered (unknown) with a blank unit. Now reads product_name +
recipe_amount (pre-scaled) and resolves units via the qu_id map.
IngredientRow is unchanged, so no downstream consumer moves. Spec §4.2."
```

---

## Task 4: Stop double-scaling in the DETAIL view

**Files:**
- Modify: `custom_cards/grocy-food-card/src/recipe-card.ts:73-77`

`recipe-card.ts` currently wraps `parseIngredients` in `scaleIngredients`. Now that `recipe_amount` arrives pre-scaled, leaving that wrapper would apply the factor **twice** — a 4→6 recipe would render 9 tortillas instead of 18.

- [ ] **Step 1: Write the failing test**

Create `custom_cards/grocy-food-card/test/recipe-detail-scaling.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseIngredients, buildUnitMap, scaleIngredients } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

const ROWS = fixture.recipes_pos_resolved as any;
const UNITS = buildUnitMap(units.quantity_units as any);

describe("DETAIL ingredient amounts are not scaled twice", () => {
  it("parsed amounts are already final for a 4->6 recipe", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[1].amount).toBe(18);   // not 12 (unscaled) and not 27 (double)
  });

  it("re-scaling would corrupt them — this is what the card must NOT do", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    const doubled = scaleIngredients(rows, 4, 6);
    expect(doubled[1].amount).toBe(27);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/recipe-detail-scaling.test.ts`
Expected: **PASS on both** — these assert the pure functions, which already behave this way. The test documents the hazard and guards the Step 3 edit. If the second case does not yield 27, stop: `scaleIngredients` is not behaving as the spec describes and this plan's premise needs re-checking.

- [ ] **Step 3: Remove the redundant scaling call**

In `custom_cards/grocy-food-card/src/recipe-card.ts`, replace lines 73-77:

```typescript
    const scaled = scaleIngredients(
      parseIngredients(this._attrs.recipes_pos, r.id),
      r.baseServings,
      r.desiredServings,
    );
```

with:

```typescript
    // NOT re-scaled: recipes_pos_resolved delivers recipe_amount already scaled
    // server-side (spec §4.2). Wrapping this in scaleIngredients would apply the
    // factor twice — a 4->6 recipe would render 27 tortillas instead of 18.
    // scaleIngredients is retained in shared.ts as the tested fallback and the
    // hook for the deferred on-screen servings control (spec §4.3, §5.3).
    const scaled = this._ingredients;
```

Then remove `scaleIngredients` from the import on line 5 (leave `parseIngredients`, `formatAmount`, and the types). `this._ingredients` is introduced in Task 5 — **this task will not typecheck on its own**, which is expected and resolved there.

- [ ] **Step 4: Confirm the expected transient failure**

Run: `npm run typecheck`
Expected: an error that `_ingredients` does not exist on `GrocyRecipeCard`. **Do not fix it here** — Task 5 adds the property. Commit the pair together at the end of Task 5.

- [ ] **Step 5: Stage but do not commit yet**

```bash
git add custom_cards/grocy-food-card/test/recipe-detail-scaling.test.ts
git commit -m "test: guard against double-scaling pre-scaled ingredient amounts"
```

Leave `recipe-card.ts` modified-but-uncommitted; it lands with Task 5.

---

## Task 5: Fetch ingredients on demand when DETAIL opens

**Files:**
- Modify: `custom_cards/grocy-food-card/src/recipe-card.ts`
- Test: `custom_cards/grocy-food-card/test/recipe-fetch.test.ts` (create)

This is the transport rework's card half. Opening a recipe calls an HA service that returns that recipe's ingredients; `quantity_units` is fetched once and cached.

**The HA call shape** (spec §2.1; `returnResponse: true` is a verified parameter):

```typescript
hass.callService("rest_command", "grocy_recipe_ingredients", { recipe_id: 1 }, undefined, false, true)
```

It resolves to `{ response: { content: [...] } }`.

- [ ] **Step 1: Write the failing test**

Create `custom_cards/grocy-food-card/test/recipe-fetch.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { fetchIngredients, fetchUnitMap } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

function fakeHass(response: unknown, spy = vi.fn()) {
  return {
    callService: spy.mockResolvedValue({ response: { content: response } }),
  } as any;
}

describe("fetchIngredients", () => {
  it("calls the rest_command with the recipe id and returnResponse", async () => {
    const spy = vi.fn().mockResolvedValue({ response: { content: [] } });
    await fetchIngredients(fakeHass([], spy), 7);
    expect(spy).toHaveBeenCalledWith(
      "rest_command", "grocy_recipe_ingredients", { recipe_id: 7 }, undefined, false, true);
  });

  it("returns the raw rows for parseIngredients to shape", async () => {
    const rows = fixture.recipes_pos_resolved;
    const out = await fetchIngredients(fakeHass(rows), 1);
    expect(out).toEqual(rows);
  });

  it("returns [] when the service throws — DETAIL must degrade, not crash", async () => {
    const hass = { callService: vi.fn().mockRejectedValue(new Error("503")) } as any;
    await expect(fetchIngredients(hass, 1)).resolves.toEqual([]);
  });

  it("returns [] when the response shape is unexpected", async () => {
    const hass = { callService: vi.fn().mockResolvedValue({}) } as any;
    await expect(fetchIngredients(hass, 1)).resolves.toEqual([]);
  });

  it("returns [] when hass is absent", async () => {
    await expect(fetchIngredients(undefined, 1)).resolves.toEqual([]);
  });
});

describe("fetchUnitMap", () => {
  it("returns a built map from the service response", async () => {
    const map = await fetchUnitMap(fakeHass(units.quantity_units));
    expect(map[4]).toBe("Pound");
  });

  it("returns {} when the service fails — units blank, amounts still render", async () => {
    const hass = { callService: vi.fn().mockRejectedValue(new Error("nope")) } as any;
    await expect(fetchUnitMap(hass)).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/recipe-fetch.test.ts`
Expected: FAIL — neither `fetchIngredients` nor `fetchUnitMap` is exported.

- [ ] **Step 3: Implement the two fetch helpers**

Append to `custom_cards/grocy-food-card/src/shared.ts`:

```typescript
type CallServiceHass = {
  callService?: (
    domain: string, service: string, data?: unknown,
    target?: unknown, notify?: boolean, returnResponse?: boolean,
  ) => Promise<any>;
};

/** One recipe's resolved ingredient rows, fetched on demand.
 *
 * WHY ON DEMAND (spec §2.1): the whole library's ingredients measure ~76 KB at
 * 25 recipes against a ~16 KB HA attribute ceiling, and the overflow failure
 * mode is silent truncation. Server-side `query[]=recipe_id=N` filtering brings
 * one recipe down to ~1.5 KB, so DETAIL fetches only what it is showing.
 *
 * Every failure resolves to [] rather than rejecting: a kitchen screen shows an
 * empty ingredient list far more gracefully than an unhandled rejection.
 */
export async function fetchIngredients(hass: CallServiceHass | undefined, recipeId: number): Promise<any[]> {
  if (typeof hass?.callService !== "function") return [];
  try {
    const res = await hass.callService(
      "rest_command", "grocy_recipe_ingredients", { recipe_id: recipeId },
      undefined, false, true);
    const content = res?.response?.content;
    return Array.isArray(content) ? content : [];
  } catch {
    return [];
  }
}

/** The qu_id -> name map, fetched once and cached by the caller.
 *  ~900 B and static, so a failure degrades to blank units, not a broken view. */
export async function fetchUnitMap(hass: CallServiceHass | undefined): Promise<Record<number, string>> {
  if (typeof hass?.callService !== "function") return {};
  try {
    const res = await hass.callService(
      "rest_command", "grocy_quantity_units", {}, undefined, false, true);
    return buildUnitMap(res?.response?.content);
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Wire the card to them**

In `custom_cards/grocy-food-card/src/recipe-card.ts`, update the import (line 4-7) to:

```typescript
import {
  parseRecipes, parseIngredients, formatAmount,
  fetchIngredients, fetchUnitMap,
  type RecipeRow, type IngredientRow,
} from "./shared.js";
```

Widen the `HassLike` type on line 9:

```typescript
type HassLike = {
  states?: Record<string, { attributes?: any } | undefined>;
  callService?: (
    domain: string, service: string, data?: unknown,
    target?: unknown, notify?: boolean, returnResponse?: boolean,
  ) => Promise<any>;
};
```

Add to `static properties` (after `_selectedId`):

```typescript
    _ingredients: { state: true },
    _loading: { state: true },
```

Add the backing fields after `_selectedId` (line 18):

```typescript
  private _ingredients: IngredientRow[] = [];
  private _loading = false;
  private _unitMap: Record<number, string> = {};
  private _unitMapLoaded = false;
```

Replace `_open` (lines 34-40) with:

```typescript
  private async _open(id: number): Promise<void> {
    // parseRecipes passes `id` through unguarded (upstream shape is an open
    // question), and a non-numeric id would route to a DETAIL view that can
    // never resolve. Ignore the click rather than enter an unresolvable state.
    if (typeof id !== "number" || !Number.isFinite(id)) return;
    this._selectedId = id;
    this._ingredients = [];
    this._loading = true;
    try {
      // Units are static — fetch once per card lifetime, then reuse.
      if (!this._unitMapLoaded) {
        this._unitMap = await fetchUnitMap(this.hass);
        this._unitMapLoaded = true;
      }
      const raw = await fetchIngredients(this.hass, id);
      // Guard against a fast back-then-forward: if the user left this recipe
      // while the fetch was in flight, its rows must not land in the new view.
      if (this._selectedId !== id) return;
      this._ingredients = parseIngredients(raw, id, this._unitMap);
    } finally {
      if (this._selectedId === id) this._loading = false;
    }
  }
```

Replace `_back` (line 41) with:

```typescript
  private _back(): void {
    this._selectedId = null;
    this._ingredients = [];
    this._loading = false;
  }
```

In `_renderDetail`, replace the `<ul class="ingredients">` block (lines 84-89) with:

```typescript
        ${this._loading
          ? html`<div class="empty">Loading ingredients…</div>`
          : scaled.length === 0
            ? html`<div class="empty">No ingredients</div>`
            : html`<ul class="ingredients">
                ${scaled.map((i: IngredientRow) => html`
                  <li><span class="amt">${formatAmount(i.amount as number)}</span>
                      <span class="unit">${i.unit}</span>
                      <span class="iname">${i.name}</span></li>`)}
              </ul>`}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run` → all green, including the Task 4 tests.
Run: `npm run typecheck` → **0 errors** (this resolves Task 4's transient failure).
Run: `npm run build` → emits 4 files.

Confirm the S1 blank-card regression guard still holds:

```bash
grep 'from "./shared' dist/*.js
```

Expected: every hit carries the `.js` extension. An extensionless hit means the browser will 404 and the card renders blank.

- [ ] **Step 6: Commit**

```bash
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/src/recipe-card.ts custom_cards/grocy-food-card/test/recipe-fetch.test.ts
git commit -m "feat: fetch DETAIL ingredients on demand via rest_command

Whole-library ingredients measure ~76KB at 25 recipes against a ~16KB HA
attribute ceiling that truncates silently. DETAIL now fetches one recipe
(~1.5KB) with query[]=recipe_id=N; units cached once. Drops the double-scale
that pre-scaled amounts would have caused. Spec §2.1."
```

---

## Task 6: Narrow the sensor and add the rest_commands

**Files:**
- Modify: `homeassistant/packages/grocy_recipes.yaml`

The shipped sensor fetches `/objects/recipes` and — per its own trailing note — never fetched ingredients at all. It stays, narrowed in intent, and gains the two commands DETAIL calls.

- [ ] **Step 1: Rewrite the package file**

Replace the entire contents of `homeassistant/packages/grocy_recipes.yaml`:

```yaml
# Slice 2 recipe proxy — HYBRID transport (spec §2.1, amended 2026-08-10).
#
# WHY THIS FILE EXISTS: the custom-components/grocy HACS integration exposes NO
# recipe sensor — recipes and recipes_pos are absent from its entity definitions
# (verified against its const.py). Recipe content lives only in Grocy's own REST
# API, so HA polls it server-side here. The API key stays in HA secrets; the
# browser never talks to Grocy directly and never sees the key.
#
# ⚠️ WHY THIS IS A HYBRID AND NOT ONE SENSOR (measured 2026-08-07):
#   The whole library in one sensor's attributes measured ~85 KB at 25 recipes
#   against an HA attribute ceiling of ~16 KB — about 5x over. The failure mode
#   is a TRUNCATED OR DROPPED ATTRIBUTE, NOT AN ERROR, so it would look fine on
#   a small library and quietly lose recipes as it grew.
#   The bulk is ingredients (~76 KB of that ~85 KB), not recipes (~8 KB). So:
#     - LIST  -> this sensor, recipes only, ~8 KB at 25 recipes. Card reads
#                hass.states[...] exactly as S1's two cards do.
#     - DETAIL -> the rest_commands below, one recipe at a time (~1.5 KB),
#                using Grocy's verified server-side query[] filtering.
#
# ⚠️ CEILING TRIPWIRE: the recipe list itself reaches ~17 KB at ~50 recipes and
# would then breach the same ceiling. If this household passes ~40 recipes,
# move LIST to an on-demand fetch too (spec §8 carry-forward).
#
# Two constraints this file must respect:
#   1. HA state is capped at 255 chars — hence value_template's constant "ok"
#      with the real data in json_attributes. Putting JSON in the state breaks it.
#   2. Attribute blobs bloat the recorder DB — hence the recorder exclude below.
#
# Field shapes CONFIRMED against live Grocy 4.6.0 on 2026-08-07 — the provisional
# guesses did not drift (findings §2). This is no longer provisional.
rest:
  - resource: !secret grocy_recipes_url        # e.g. http://<host>:9283/api/objects/recipes
    scan_interval: 600                          # recipes change rarely
    headers:
      GROCY-API-KEY: !secret grocy_api_key
    sensor:
      - name: "Grocy Recipes"
        unique_id: grocy_recipes_proxy
        value_template: "ok"                    # 255-char cap: never put JSON here
        json_attributes_path: "$"
        json_attributes:
          - recipes

recorder:
  exclude:
    entities:
      - sensor.grocy_recipes                    # attribute blob would bloat the DB

rest_command:
  # DETAIL calls this when a recipe opens. query[]=recipe_id=N is Grocy's own
  # server-side filter — VERIFIED: 5,084 B unfiltered vs 1,526 B for one recipe.
  # The card sends recipe_id; never interpolate anything else into this URL.
  grocy_recipe_ingredients:
    url: !secret grocy_recipe_ingredients_url
    method: GET
    headers:
      GROCY-API-KEY: !secret grocy_api_key
    content_type: "application/json"

  # Unit names for qu_id. recipes_pos_resolved joins product_name but NOT the
  # unit (spec §4.2). 6 rows / ~900 B / static — the card fetches this once.
  grocy_quantity_units:
    url: !secret grocy_quantity_units_url
    method: GET
    headers:
      GROCY-API-KEY: !secret grocy_api_key
    content_type: "application/json"
```

- [ ] **Step 2: Verify the YAML parses**

Run from the worktree root:

```bash
python3 -c "import yaml,sys; yaml.SafeLoader.add_multi_constructor('!', lambda l,s,n: None); yaml.safe_load(open('homeassistant/packages/grocy_recipes.yaml')); print('YAML OK')"
```

Expected: `YAML OK`. (The loader stub is needed because `!secret` is an HA-specific tag.)

- [ ] **Step 3: Commit**

```bash
git add homeassistant/packages/grocy_recipes.yaml
git commit -m "feat: hybrid recipe transport — list sensor + per-recipe rest_commands

Whole-library Option A measured ~5x over the HA attribute ceiling with silent
truncation as the failure mode. Sensor now carries the recipe list only;
ingredients and units are fetched per-recipe on demand. Spec §2.1."
```

---

## Task 7: Document the new secrets in INSTALL

**Files:**
- Modify: `deploy/INSTALL.md` (Phase B2)

Three new secrets are referenced. Without them HA fails to start the package, so this is required, not optional polish.

- [ ] **Step 1: Find the Phase B2 secrets block**

```bash
grep -n "grocy_recipes_url\|grocy_api_key" deploy/INSTALL.md
```

- [ ] **Step 2: Extend the documented secrets**

In the Phase B2 secrets list, alongside the existing `grocy_recipes_url` and `grocy_api_key`, add:

```yaml
# Recipe list — LIST view (polled every 600s into sensor.grocy_recipes)
grocy_recipes_url: "http://<grocy-host>:9283/api/objects/recipes"

# One recipe's resolved ingredients — DETAIL view, fetched on open.
# The query[] filter is Grocy's server-side filtering (1,526 B vs 5,084 B
# unfiltered). {{ recipe_id }} is templated by the card's service call.
grocy_recipe_ingredients_url: >-
  http://<grocy-host>:9283/api/objects/recipes_pos_resolved?query%5B%5D=recipe_id%3D{{ recipe_id }}

# Unit names for qu_id — fetched once per card load, ~900 B, static.
grocy_quantity_units_url: "http://<grocy-host>:9283/api/objects/quantity_units"
```

Add this note directly beneath:

> **Why three URLs and not one sensor:** the whole recipe library in a single sensor's attributes measures ~85 KB at 25 recipes against HA's ~16 KB attribute ceiling, and it **truncates silently** rather than erroring. The list is small (~8 KB) and stays in the sensor; ingredients are fetched one recipe at a time. See spec §2.1.
>
> **The `%5B%5D` and `%3D` are required** — they are URL-encoded `[]` and `=`. Grocy's filter syntax is `query[]=recipe_id=N`, and an unencoded `[` will not survive the request.

- [ ] **Step 3: Commit**

```bash
git add deploy/INSTALL.md
git commit -m "docs: INSTALL Phase B2 — the three Grocy recipe proxy secrets"
```

---

## Task 8: Teach the demo harness the new fetch path

**Files:**
- Modify: `custom_cards/grocy-food-card/demo/index.html`

**Why this is required, not polish:** the demo's fake `hass` stubs `callService` as a **logger that returns `undefined`** (line 26), and it feeds recipes a `recipes_pos` attribute (line 46) the card no longer reads. Left alone, every recipe in the demo renders **"No ingredients"** — and Task 9 Step 4 uses this harness as its render check, so a broken demo would either mask the fix or be mistaken for a regression.

- [ ] **Step 1: Replace the recipe-card fake hass**

In `demo/index.html`, find the `recipes` object (around line 40-52) and replace its `recipes_pos` attribute and the shared `callService` stub with a fake that answers both commands. Keep the existing `states` shape for `sensor.grocy_recipes`:

```javascript
  // Resolved-shape rows: product_name joined, recipe_amount PRE-SCALED, no unit
  // name (spec §4.2). Mirrors test/fixtures/recipes-pos-resolved.json.
  const RESOLVED = [
    { id: 10, recipe_id: 1, product_name: "Ground beef", recipe_amount: 2.25, qu_id: 4 },
    { id: 11, recipe_id: 1, product_name: "Tortillas",   recipe_amount: 18,   qu_id: 2 },
    { id: 12, recipe_id: 1, product_name: "Salt",        recipe_amount: "a pinch", qu_id: 5 },
    { id: 13, recipe_id: 2, product_name: "Butter",      recipe_amount: 0.49950000000000006, qu_id: 4 },
  ];
  const UNITS = [
    { id: 2, name: "Piece" }, { id: 4, name: "Pound" }, { id: 5, name: "Tablespoon" },
  ];

  // Answers the two rest_commands the card calls. The 120ms delay is deliberate:
  // it makes the DETAIL loading state visible instead of flashing past.
  const fakeCallService = (domain, service, data, target, notify, returnResponse) => {
    console.log("callService", domain, service, data);
    const content =
      service === "grocy_recipe_ingredients"
        ? RESOLVED.filter((r) => r.recipe_id === data.recipe_id)
        : service === "grocy_quantity_units" ? UNITS : [];
    return new Promise((resolve) =>
      setTimeout(() => resolve({ response: { content } }), 120));
  };
```

Attach it to the recipe card's fake hass, replacing the `recipes_pos` attribute entirely:

```javascript
  const recipes = {
    states: { "sensor.grocy_recipes": { attributes: { recipes: RECIPES } } },
    callService: fakeCallService,
  };
```

Keep whatever `RECIPES` array the file already defines for the list; only the ingredient source changes.

- [ ] **Step 2: Verify in a browser**

```bash
cd custom_cards/grocy-food-card && npm run build && python3 -m http.server 8777
# open http://localhost:8777/demo/index.html
```

Serve over HTTP — `file://` CORS-blocks ES modules and the page renders blank silently.

Confirm, with devtools console open: LIST renders its tiles; clicking a recipe shows **"Loading ingredients…"** briefly, then `2.25 Pound Ground beef` and `18 Piece Tortillas`; `Salt` shows a blank quantity with its name intact; **0 console errors**. Tab/Enter/Space still open and close DETAIL.

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-food-card/demo/index.html
git commit -m "test: demo harness answers the recipe rest_commands

The fake hass stubbed callService as a logger returning undefined, so every
demo recipe rendered 'No ingredients' once DETAIL moved to on-demand fetch."
```

---

## Task 9: Tier-2 verification against live Grocy

**Files:** none — this is verification. Any defect it finds becomes its own commit.

**⚠️ Requires Docker Desktop started BY HAND** (a GUI app; an agent session cannot launch it). Test data persists in the gitignored `deploy/grocy/grocy-config/` bind dir and restores on `up`.

- [ ] **Step 1: Bring the container back**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
docker compose -f deploy/grocy/docker-compose.grocy.yml up -d
sqlite3 deploy/grocy/grocy-config/data/grocy.db "select api_key from api_keys;"
```

Expected: the container starts and `http://localhost:9283` serves (admin/admin), with the 4 recipes from 2026-08-07 present. **If the API key query returns nothing**, create one via `GET /manageapikeys/new` — the `Add` button on `/manageapikeys` is `href="#"` and JS-driven and does **not** fire under browser automation.

- [ ] **Step 2: Re-confirm the two load-bearing findings**

```bash
KEY=<key from step 1>
# Resolved rows: expect product_name present, recipe_amount pre-scaled, NO unit name
curl -s -H "GROCY-API-KEY: $KEY" \
  "http://localhost:9283/api/objects/recipes_pos_resolved?query%5B%5D=recipe_id%3D1" \
  | python3 -m json.tool
# Unit lookup: expect 6 rows
curl -s -H "GROCY-API-KEY: $KEY" \
  "http://localhost:9283/api/objects/quantity_units" | python3 -m json.tool
```

Expected on recipe 1 (Weeknight Tacos, 4→6): `Ground beef` at `2.25`, `Tortillas` at `18`. **Dump every key on a row and confirm no unit name is present** — an earlier probe false-positived on the substring `only_check_single_unit_in_stock`.

**If the captured fixtures from Task 1 differ from what comes back, the fixtures are wrong, not the live data.** Correct them and re-run the suite.

- [ ] **Step 3: Close the unproven picture path**

All 4 test recipes have `picture_file_name: null`, so the LIST view's picture branch has **never met real data**.

Upload one image to a recipe through Grocy's own UI, then:

```bash
curl -s -H "GROCY-API-KEY: $KEY" http://localhost:9283/api/objects/recipes \
  | python3 -c "import json,sys; print([(r['id'], r['picture_file_name']) for r in json.load(sys.stdin)])"
```

Confirm the filename is non-null, then confirm the file itself is reachable at `/api/files/recipepictures/<name>` — **noting whether the API key is required on that request**, since an `<img src>` cannot send a header. If it is required, the picture path needs a rethink and that is a new finding to write up, not something to patch silently here.

- [ ] **Step 4: Render against live data**

The demo harness (Task 8) proves the card's own logic with a fake `hass`. **This step is different and cannot be skipped in its favor:** it exercises the real HA `rest_command` → Grocy round-trip, which is the half no test touches.

Point a dev-HA at the live container using the Task 6 package and Task 7 secrets, register the built resources, and add `grocy-recipe-card` to a dashboard. Confirm: LIST shows all recipes with the uploaded picture on one tile; opening a recipe shows the loading state and then **real ingredient names with real units** — `2.25 Pound Ground beef`, not `(unknown)`; `Salt` renders with a blank quantity (the documented `"a pinch"` limitation); keyboard Tab/Enter/Space still opens and closes DETAIL.

**If no dev-HA is available**, run the demo harness against live data instead by pointing its `fakeCallService` at real `fetch` calls to `localhost:9283` — and **record explicitly that the HA transport half went unverified.** Do not report Task 9 complete on the demo alone.

- [ ] **Step 5: Record the outcome**

Write findings to `docs/session-state/<today>-grocy-s2-tier2-verification.md`: what was confirmed, what drifted, whether the picture path needs an API key. **State plainly if any step did not run** — a partial Tier-2 recorded as complete is how the `"(unknown)"` defect survived a green suite in the first place.

- [ ] **Step 6: Commit**

```bash
git add docs/session-state/
git commit -m "docs: Tier-2 verification of the resolved-endpoint switch"
```

- [ ] **Step 7: Tear down**

```bash
docker compose -f deploy/grocy/docker-compose.grocy.yml down
```

The bind dir persists (gitignored) and keeps the test data.

---

## Out of scope

- **S1 Task 10 / OQ-1, OQ-2, OQ-3.** These need a throwaway dev-HA with HACS + the grocy integration, which has never been stood up. The old "one joint Tier-2 session" plan is **spent** — the 2026-08-07 session resolved S2's OQs only. Do not expect this plan to touch them.
- **S1 Task 11** (dashboard swap) — deferred; carries the `kitchen.yaml` clobber risk (this branch's copy is older than the live Pi's on `feat/hardware-deploy`).
- **Adjustable servings.** `scaleIngredients` is retained and parameterized for exactly this, but wiring a control is a later slice.
- **Pluralized units.** `name_plural` is captured in the fixture and deliberately unused.
- **`npm audit`'s postcss advisory** — dev-only, inherited from the screensaver scaffold, wants its own hygiene pass across both card packages.
