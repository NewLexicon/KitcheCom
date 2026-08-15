# Grocy Food-Ops Slice 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one card package (`grocy-food-card`) exposing two custom Lit elements — a read-only `grocy-mealplan-card` and a `grocy-shopping-card` with per-item check-off — that render Grocy's meal-plan and shopping-list attribute-blob sensors on the KitchenCOM kitchen screen, plus the Grocy backend deploy wiring.

**Architecture:** Grocy runs as a headless Docker service; its HACS integration surfaces the meal plan and shopping list as two attribute-blob sensors (`sensor.grocy_meal_plan.attributes.meals[]`, `sensor.grocy_shopping_list.attributes.products[]`). One package builds two custom elements from shared pure-function parse/format helpers (mirrors the proven `screensaver-card` pattern). Shopping check-off fires `grocy.remove_product_in_shopping_list`, guarded so it renders read-only when the required ids aren't resolvable. Native Grocy UI is never shown on the kitchen screen.

**Tech Stack:** Lit 3.3.3, TypeScript 5.6, Vitest 4 (node env), Docker (`lscr.io/linuxserver/grocy`, arm64), Home Assistant Container + HACS.

**Spec:** `docs/superpowers/specs/2026-07-02-grocy-food-slice1-design.md` (read it first — §3 data contract, §3.3 Tier-1/Tier-2 boundary, §5 the three OQs, §6 three tiers). **Roadmap:** `docs/superpowers/specs/2026-07-02-grocy-food-ops-roadmap.md`.

**Prerequisite reality (spec §6):** Tier-1 (pure functions) needs only the repo. Tier-2 (live round-trip) needs Docker + a fresh Grocy container + a dev-HA with HACS + the grocy integration — Docker was NOT running on the Mac at plan time; Task 9 budgets the stand-up. Tier-3 (on-screen) is Pi-blocked, out of scope.

**Field-name caveat (spec §5 OQ-1):** every field name in this plan is source-derived from pygrocy, NOT confirmed against the live sensor. Tasks 3–7 write PROVISIONAL fixtures + tests; Task 10 (Tier-2) confirms/corrects them. Do NOT over-fit tests to these guessed keys — assert structure/behavior, not exact-key-presence beyond what the parse contract needs.

---

## Chunk 1: Scaffold rename + package setup

### Task 1: Rename the scaffold to grocy-food-card (must be first — all later paths depend on it)

**Files:**
- Rename: `custom_cards/grocy-chores-card/` → `custom_cards/grocy-food-card/` (git mv, preserves history)
- Modify: `custom_cards/grocy-food-card/package.json` (name field)

- [ ] **Step 1: git mv the directory**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git mv custom_cards/grocy-chores-card custom_cards/grocy-food-card
```

- [ ] **Step 2: Change the package name**

In `custom_cards/grocy-food-card/package.json`, change line 2 only:
```json
  "name": "grocy-food-card",
```
Leave all other fields (scripts, deps, devDeps) unchanged — they are the proven screensaver scaffold.

- [ ] **Step 3: Reinstall to refresh the lockfile's name**

Run: `cd custom_cards/grocy-food-card && npm install`
Expected: lockfile updates the root package name; `node_modules/` present; no errors.

- [ ] **Step 4: Commit**

```bash
git add custom_cards/grocy-food-card/package.json custom_cards/grocy-food-card/package-lock.json
git commit -m "chore: rename grocy-chores-card scaffold to grocy-food-card (slice 1)"
```

---

### Task 2: Capture PROVISIONAL fixtures (source-derived; Task 10 confirms)

**This seeds Tier-1 with the spec §3 data contract. Field names are provisional (OQ-1).**

**Files:**
- Create: `custom_cards/grocy-food-card/test/fixtures/shopping-sensor.json`
- Create: `custom_cards/grocy-food-card/test/fixtures/mealplan-sensor.json`

- [ ] **Step 1: Write the shopping fixture**

`test/fixtures/shopping-sensor.json` — ≥2 items, one with a nested `product`, one WITHOUT (to exercise the fail-safe). Header comment records provisional status:

```json
{
  "_note": "PROVISIONAL — source-derived from pygrocy ShoppingListProduct; confirm against live sensor at Tier-2 (OQ-1).",
  "attributes": {
    "products": [
      { "id": 11, "product_id": 3, "amount": 2.0, "note": "", "product": { "id": 3, "name": "Eggs" } },
      { "id": 12, "product_id": 7, "amount": 1.5, "note": "organic", "product": { "id": 7, "name": "Milk" } },
      { "id": 13, "product_id": 9, "amount": 1.0, "note": "" }
    ]
  }
}
```

- [ ] **Step 2: Write the meal-plan fixture**

`test/fixtures/mealplan-sensor.json` — ≥3 items covering RECIPE, NOTE, and an UNKNOWN/section type (to exercise the `default` branch):

```json
{
  "_note": "PROVISIONAL — source-derived from pygrocy MealPlanItem; confirm against live sensor at Tier-2 (OQ-1). 'day' serialized form unconfirmed — treated as opaque.",
  "attributes": {
    "meals": [
      { "id": 1, "day": "2026-07-02", "type": "recipe", "recipe_id": 5, "recipe_servings": 4, "recipe": { "id": 5, "name": "Tacos" } },
      { "id": 2, "day": "2026-07-03", "type": "note", "note": "Leftovers night" },
      { "id": 3, "day": "2026-07-03", "type": "section", "section_id": 2, "section": { "id": 2, "name": "Dinner", "sort_number": 2 } }
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-food-card/test/fixtures/shopping-sensor.json custom_cards/grocy-food-card/test/fixtures/mealplan-sensor.json
git commit -m "test: provisional grocy sensor fixtures (source-derived, OQ-1 pending Tier-2)"
```

---

## Chunk 2: Shared pure functions (Tier-1 TDD)

### Task 3: parseShoppingItems + formatAmount (TDD)

**Files:**
- Create: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/shopping-parse.test.ts`

- [ ] **Step 1: Write the failing test**

`test/shopping-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseShoppingItems, formatAmount } from "../src/shared";
import fixture from "./fixtures/shopping-sensor.json";

describe("formatAmount", () => {
  it("strips trailing .0 for integer-valued floats", () => {
    expect(formatAmount(2.0)).toBe("2");
  });
  it("keeps non-integer floats as-is", () => {
    expect(formatAmount(1.5)).toBe("1.5");
  });
  it("fail-safe for missing/NaN amount", () => {
    expect(formatAmount(undefined as any)).toBe("");
    expect(formatAmount(NaN)).toBe("");
  });
});

describe("parseShoppingItems", () => {
  it("maps each product to a row with id, name, amountLabel, note", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ id: 11, name: "Eggs", amountLabel: "2", note: "" });
  });
  it("names from nested product; falls back to (unnamed) when product absent", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows[2].name).toBe("(unnamed)");
  });
  it("returns [] for nullish/empty input (never throws)", () => {
    expect(parseShoppingItems(undefined)).toEqual([]);
    expect(parseShoppingItems([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd custom_cards/grocy-food-card && npx vitest run test/shopping-parse.test.ts`
Expected: FAIL — `parseShoppingItems`/`formatAmount` not exported.

- [ ] **Step 3: Write minimal implementation**

`src/shared.ts`:
```ts
// Pure parse/format helpers shared by both grocy-food cards. All fail-safe:
// missing/malformed data => safe empty, never throw (screensaver-card discipline).
// Field names are PROVISIONAL (spec §5 OQ-1) — confirm at Tier-2.

export type ShoppingRow = { id: number; name: string; amountLabel: string; note: string };

// Grocy amount is a float (ShoppingListProduct.amount). "2.0 eggs" reads wrong on a
// kitchen screen: integer-valued floats drop the decimal; non-integers render as-is.
// No unit suffix in slice 1 (unit-aware deferred — spec §3.1 YAGNI).
export function formatAmount(amount: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  // String(2.0) === "2" and String(1.5) === "1.5" in JS, so a single String()
  // already drops the trailing .0 for integer-valued floats. No unit suffix (S1).
  return String(amount);
}

export function parseShoppingItems(products?: any[] | null): ShoppingRow[] {
  if (!Array.isArray(products)) return [];
  return products.map((p) => ({
    id: p?.id,
    name: p?.product?.name ?? "(unnamed)",   // name is nested; fail-safe if unhydrated
    amountLabel: formatAmount(p?.amount),
    note: p?.note ?? "",
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/shopping-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/shopping-parse.test.ts
git commit -m "feat: parseShoppingItems + formatAmount pure functions (nested-name fail-safe)"
```

---

### Task 4: parseMeals with open-set type branch (TDD)

**This encodes the spec §3.2 correction: `type` is an OPEN set — section rows exist beyond RECIPE/PRODUCT/NOTE. The switch MUST have a `default` branch and never throw. `day` is opaque passthrough.**

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/mealplan-parse.test.ts`

- [ ] **Step 1: Write the failing test**

`test/mealplan-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseMeals } from "../src/shared";
import fixture from "./fixtures/mealplan-sensor.json";

describe("parseMeals", () => {
  it("maps each meal to a row with id, day, label, kind", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows.length).toBe(3);
  });
  it("RECIPE label from nested recipe name", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[0]).toMatchObject({ id: 1, label: "Tacos", kind: "recipe" });
  });
  it("NOTE label from note text", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[1]).toMatchObject({ label: "Leftovers night", kind: "note" });
  });
  it("UNKNOWN/section type falls through the default branch, never throws", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[2].kind).toBe("section");
    expect(typeof rows[2].label).toBe("string"); // safe generic fallback, some string
  });
  it("day is passed through opaque (no Date coercion — stays the raw fixture value)", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[0].day).toBe(fixture.attributes.meals[0].day);
  });
  it("truly-unknown type still yields a row (open set)", () => {
    const rows = parseMeals([{ id: 9, day: "x", type: "future_type_grocy_adds" }] as any);
    expect(rows.length).toBe(1);
    expect(typeof rows[0].label).toBe("string");
  });
  it("returns [] for nullish/empty input (never throws)", () => {
    expect(parseMeals(undefined)).toEqual([]);
    expect(parseMeals([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/mealplan-parse.test.ts`
Expected: FAIL — `parseMeals` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared.ts`:
```ts
// day is opaque passthrough (spec §3.2): the serialized form of Grocy's date is
// unconfirmed (OQ-1), so parseMeals does NOT coerce it. Card layer decides date use.
export type MealRow = { id: number; day: unknown; label: string; kind: string };

// type is an OPEN set (spec §3.2): Grocy meal plans have section rows beyond
// RECIPE/PRODUCT/NOTE. The switch has a `default` branch and never throws — an
// unknown/section type renders generically rather than being dropped.
export function parseMeals(meals?: any[] | null): MealRow[] {
  if (!Array.isArray(meals)) return [];
  return meals.map((m) => {
    const kind = String(m?.type ?? "unknown");
    let label: string;
    switch (kind) {
      case "recipe":  label = m?.recipe?.name ?? "(recipe)"; break;
      case "note":    label = m?.note ?? "(note)"; break;
      case "product": label = m?.product?.name ?? "(product)"; break;
      case "section": label = m?.section?.name ?? "(section)"; break;
      default:        label = m?.note ?? m?.recipe?.name ?? "(meal)"; break;
    }
    return { id: m?.id, day: m?.day, label, kind };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/mealplan-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/mealplan-parse.test.ts
git commit -m "feat: parseMeals pure function (open-set type branch, day opaque)"
```

---

### Task 5: canCheckOff + buildRemovePayload (TDD)

**Spec §3.3 boundary — Tier-1 tests INPUT→OUTPUT MAPPING ONLY. It does NOT prove the payload matches the live `remove_product_in_shopping_list` contract (that is OQ-2 entry-id-vs-product-id + OQ-3 list-id-sourcing, confirmed at Tier-2). A green suite here means "the builder is internally consistent," NOT "check-off works."**

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/checkoff.test.ts`

- [ ] **Step 1: Write the failing test**

`test/checkoff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canCheckOff, buildRemovePayload } from "../src/shared";

describe("canCheckOff", () => {
  it("false when the shopping-list id is absent (OQ-3 unresolved => read-only)", () => {
    expect(canCheckOff(undefined)).toBe(false);
    expect(canCheckOff("")).toBe(false);
  });
  it("true when a shopping-list id is available", () => {
    expect(canCheckOff("1")).toBe(true);
  });
});

describe("buildRemovePayload", () => {
  // Tier-1: asserts input->output MAPPING only. Whether these are the exact fields
  // the service accepts (product_id vs entry id; list-id key name) is OQ-2/OQ-3,
  // confirmed at Tier-2. Do not read this test as "check-off works".
  it("maps (listId, productId) into the service-data shape", () => {
    expect(buildRemovePayload("1", 3)).toEqual({
      shopping_list_id: "1",
      product_id: 3,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/checkoff.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared.ts`:
```ts
// canCheckOff gates whether the ✓ button renders. If the shopping-list id (OQ-3)
// isn't resolvable, we render rows read-only rather than firing a call that 500s
// (chores done_by precedent — spec §4.2).
export function canCheckOff(shoppingListId?: string): boolean {
  return typeof shoppingListId === "string" && shoppingListId.length > 0;
}

// buildRemovePayload — INPUT→OUTPUT MAPPING ONLY (spec §3.3 boundary). The field
// names/shape here are the provisional best-guess for grocy.remove_product_in_shopping_list;
// Tier-2 confirms them (OQ-2 product_id-vs-entry-id; OQ-3 list-id key). NOT proof
// the service accepts this shape.
export function buildRemovePayload(shoppingListId: string, productId: number) {
  return { shopping_list_id: shoppingListId, product_id: productId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/checkoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/checkoff.test.ts
git commit -m "feat: canCheckOff + buildRemovePayload (Tier-1 mapping only; OQ-2/OQ-3 pending)"
```

---

## Chunk 3: The two Lit cards (glue)

Thin Lit glue over the tested pure functions. Per screensaver precedent, glue is verified by demo/manual check (Tier-2), not DOM unit tests — the testable logic lives in `shared.ts`.

### Task 6: grocy-mealplan-card (read-only Lit element)

**Files:**
- Create: `custom_cards/grocy-food-card/src/mealplan-card.ts`

- [ ] **Step 1: Write the element**

`src/mealplan-card.ts`:
```ts
import { LitElement, html, css, nothing } from "lit";
import { parseMeals, type MealRow } from "./shared";

type HassLike = { states?: Record<string, { attributes?: any } | undefined> };

export class GrocyMealplanCard extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: HassLike;
  private _entity = "sensor.grocy_meal_plan";

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
  }

  private get _rows(): MealRow[] {
    return parseMeals(this.hass?.states?.[this._entity]?.attributes?.meals);
  }

  render() {
    const rows = this._rows;
    if (rows.length === 0) return html`<div class="empty">No meals planned</div>`;
    return html`
      <div class="list">
        ${rows.map((r) => html`
          <div class="row">
            <span class="day">${String(r.day ?? "")}</span>
            <span class="label">${r.label}</span>
          </div>`)}
      </div>`;
  }

  static styles = css`
    .list { display: flex; flex-direction: column; gap: 6px; padding: 8px;
      color: var(--primary-text-color, #e8edf6); font: 500 18px/1.3 system-ui, sans-serif; }
    .row { display: flex; gap: 12px; align-items: baseline; }
    .day { opacity: .7; min-width: 88px; }
    .label { font-weight: 700; }
    .empty { padding: 16px; opacity: .7; color: var(--primary-text-color, #e8edf6); }
  `;
}

if (!customElements.get("grocy-mealplan-card")) {
  customElements.define("grocy-mealplan-card", GrocyMealplanCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-mealplan-card", name: "Grocy Meal Plan", description: "This week's planned meals from Grocy",
});
```

- [ ] **Step 2: Typecheck + full test suite (regression guard)**

Run: `cd custom_cards/grocy-food-card && npm run typecheck && npx vitest run`
Expected: 0 type errors; all pure-function tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-food-card/src/mealplan-card.ts
git commit -m "feat: grocy-mealplan-card Lit element (read-only meal rows)"
```

---

### Task 7: grocy-shopping-card (display + guarded check-off)

**Files:**
- Create: `custom_cards/grocy-food-card/src/shopping-card.ts`

- [ ] **Step 1: Write the element**

`src/shopping-card.ts`:
```ts
import { LitElement, html, css, nothing } from "lit";
import { parseShoppingItems, canCheckOff, buildRemovePayload, type ShoppingRow } from "./shared";

type HassLike = {
  states?: Record<string, { attributes?: any } | undefined>;
  callService?: (domain: string, service: string, data: Record<string, unknown>) => void;
};

export class GrocyShoppingCard extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: HassLike;
  private _entity = "sensor.grocy_shopping_list";
  private _listId?: string;   // OQ-3: sourced from config for slice 1; Tier-2 confirms

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
    this._listId = config?.shopping_list_id != null ? String(config.shopping_list_id) : undefined;
  }

  private get _rows(): ShoppingRow[] {
    return parseShoppingItems(this.hass?.states?.[this._entity]?.attributes?.products);
  }

  private _checkOff(productId: number): void {
    if (!canCheckOff(this._listId)) return;
    this.hass?.callService?.("grocy", "remove_product_in_shopping_list",
      buildRemovePayload(this._listId as string, productId));
  }

  render() {
    const rows = this._rows;
    const canCheck = canCheckOff(this._listId);
    if (rows.length === 0) return html`<div class="empty">Shopping list empty</div>`;
    return html`
      <div class="list">
        ${rows.map((r) => html`
          <div class="row">
            <span class="amt">${r.amountLabel}</span>
            <span class="name">${r.name}</span>
            ${canCheck
              ? html`<button class="check" @click=${() => this._checkOff(r.id)}>✓</button>`
              : nothing}
          </div>`)}
      </div>`;
  }

  static styles = css`
    .list { display: flex; flex-direction: column; gap: 6px; padding: 8px;
      color: var(--primary-text-color, #e8edf6); font: 500 18px/1.3 system-ui, sans-serif; }
    .row { display: flex; gap: 12px; align-items: center; }
    .amt { opacity: .7; min-width: 44px; text-align: right; }
    .name { flex: 1; }
    .check { min-width: 44px; min-height: 44px; font-size: 20px; cursor: pointer;
      border: none; border-radius: 8px; background: var(--primary-color, #3b82f6); color: #fff; }
    .empty { padding: 16px; opacity: .7; color: var(--primary-text-color, #e8edf6); }
  `;
}

if (!customElements.get("grocy-shopping-card")) {
  customElements.define("grocy-shopping-card", GrocyShoppingCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-shopping-card", name: "Grocy Shopping List", description: "Shopping list from Grocy with check-off",
});
```

- [ ] **Step 2: Build to verify both elements compile into one dist**

Run: `npm run build`
Expected: emits `dist/` JS for `shared`, `mealplan-card`, `shopping-card`; no errors.

- [ ] **Step 3: Typecheck + full test suite**

Run: `npm run typecheck && npx vitest run`
Expected: 0 type errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add custom_cards/grocy-food-card/src/shopping-card.ts
git commit -m "feat: grocy-shopping-card Lit element (guarded check-off, read-only when OQ-3 unresolved)"
```

---

### Task 8: Offline demo harness (visual check, no HA)

**Files:**
- Create: `custom_cards/grocy-food-card/demo/index.html`

- [ ] **Step 1: Build the demo page**

**Load-bearing — the import map is verbatim from screensaver's demo (`screensaver-card/demo/index.html:9-14`).** `tsc` does not bundle the bare `lit` specifier, so the browser needs this map or the page is blank with a module-resolution error. This card imports only `lit` (no `style-map`), so only the `lit` entry is strictly needed — keeping both is harmless.

`demo/index.html`:
```html
<!doctype html>
<meta charset="utf-8" />
<title>grocy-food-card demo</title>
<style>body{margin:0;background:#141821;padding:24px;display:flex;gap:24px;flex-wrap:wrap}
  .pane{background:#1b2130;border-radius:12px;min-width:320px}</style>
<script type="importmap">
{ "imports": {
  "lit": "https://cdn.jsdelivr.net/npm/lit@3.3.3/+esm"
} }
</script>
<script type="module">
  import "../dist/mealplan-card.js";
  import "../dist/shopping-card.js";

  const meals = { states: { "sensor.grocy_meal_plan": { attributes: { meals: [
    { id: 1, day: "Wed", type: "recipe", recipe: { name: "Tacos" } },
    { id: 2, day: "Thu", type: "note", note: "Leftovers night" },
    { id: 3, day: "Thu", type: "section", section: { name: "Dinner" } }
  ] } } } };

  const shop = { states: { "sensor.grocy_shopping_list": { attributes: { products: [
    { id: 11, amount: 2.0, note: "", product: { name: "Eggs" } },
    { id: 12, amount: 1.5, note: "organic", product: { name: "Milk" } },
    { id: 13, amount: 1.0, note: "" }
  ] } } }, callService: (d, s, data) => console.log("callService", d, s, data) };

  const mp = document.createElement("grocy-mealplan-card");
  mp.setConfig({}); mp.hass = meals;
  const mpPane = document.createElement("div"); mpPane.className = "pane"; mpPane.appendChild(mp);

  const sc = document.createElement("grocy-shopping-card");
  sc.setConfig({ shopping_list_id: "1" }); sc.hass = shop;   // check-off visible
  const scPane = document.createElement("div"); scPane.className = "pane"; scPane.appendChild(sc);

  document.body.append(mpPane, scPane);
</script>
```

- [ ] **Step 2: Verify in a browser**

Open `custom_cards/grocy-food-card/demo/index.html`. Confirm: meal rows render (incl. the section row via the default branch); shopping rows show `2 Eggs`, `1.5 Milk`, and `1 (unnamed)`; the ✓ buttons render (list id stubbed). Clicking ✓ logs a `callService` to the console (no real round-trip offline — that is Tier-2).

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-food-card/demo/index.html
git commit -m "test: offline demo harness for both grocy-food cards"
```

---

## Chunk 4: Deploy wiring + Tier-2 live round-trip

### Task 9: Grocy backend — compose fragment + INSTALL.md phase (preserve-then-point, NOT point-to-dead)

**Spec §7 + reviewer note:** the chores slice's compose/HACS content is being superseded. The plan must PRESERVE that content forward into a live doc, not leave it referenced-only inside a superseded spec. Author the compose fragment + INSTALL phase here so nothing follows a pointer into a dead doc.

**Files:**
- Create: `deploy/grocy/docker-compose.grocy.yml`
- Modify: `deploy/INSTALL.md` (new "Grocy backend" phase)

- [ ] **Step 1: Write the compose fragment**

`deploy/grocy/docker-compose.grocy.yml`:
```yaml
services:
  grocy:
    image: lscr.io/linuxserver/grocy:latest   # arm64 multi-arch — auto-selects aarch64 on Pi 5
    container_name: grocy
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./grocy-config:/config
    ports:
      - "9283:80"
    restart: unless-stopped
```

- [ ] **Step 2: Add the INSTALL.md Grocy-backend phase**

Insert a "Grocy backend" phase into `deploy/INSTALL.md` documenting (self-contained — do NOT point at the superseded chores spec):
1. Run the compose; browse `http://<pi-host>:9283` (default admin/admin — change it); Grocy → Manage API keys → create one.
2. Install HACS (if absent). HACS → custom repo `https://github.com/custom-components/grocy` (type: Integration) → download → restart HA.
3. Settings → Devices & Services → Add → Grocy. **Config-flow note:** URL = `http://<pi-host>` (NO port, NO path); **Port = `9283`** (published host port — do NOT leave the 9192 default); paste the API key.
4. Integration entities are **disabled by default** — enable `sensor.grocy_meal_plan` and `sensor.grocy_shopping_list`.
5. Card resource: copy the built `custom_cards/grocy-food-card/dist/*.js` to `/config/www/`; register `/local/mealplan-card.js` and `/local/shopping-card.js` (module) per the existing Phase C resource pattern.

- [ ] **Step 3: Commit**

```bash
git add deploy/grocy/docker-compose.grocy.yml deploy/INSTALL.md
git commit -m "docs: deploy Grocy backend (compose + INSTALL phase, HACS wiring, port note)"
```

---

### Task 10: Tier-2 live round-trip verification (dev-HA on the Mac) — resolves OQ-1/OQ-2/OQ-3

**This is the tier that proves the slice works (spec §6 Tier-2). Not Pi-blocked. Docker was NOT running at plan time — budget the stand-up.**

**Files:** none (verification task; produces a checked result + possible fixture corrections).

- [ ] **Step 1: Bring Docker up + stand a fresh Grocy container**

Ensure Docker Desktop is running on the Mac. Run `docker compose -f deploy/grocy/docker-compose.grocy.yml up -d`. Browse `http://localhost:9283`, log in (admin/admin), create an API key. Add ≥2 shopping-list items and ≥1 planned meal (a recipe + a note) so the sensors have real data.

- [ ] **Step 2: Stand up a dev-HA with HACS + the grocy integration**

Run a throwaway HA Container locally; install HACS; add the grocy integration; config-flow pointed at the local Grocy (URL `http://host.docker.internal`, Port `9283`, the API key). Enable `sensor.grocy_meal_plan` + `sensor.grocy_shopping_list`.

- [ ] **Step 3: Resolve OQ-1 — confirm the live attribute shapes**

Developer Tools → States → both sensors. Compare the real `attributes.meals[]` / `attributes.products[]` field names + nesting + `day` serialized form against the Task 2 fixtures. **If they drift, update the fixtures + re-run `npx vitest run`** (the parse functions may need field-name corrections). Record the confirmed shape in the commit message.

- [ ] **Step 4: Resolve OQ-2 + OQ-3 — the check-off round-trip**

Register the built card resources in dev-HA; add both cards to a dashboard. For the shopping card, set `shopping_list_id` (try `1` — Grocy's default list; this confirms OQ-3's source). Confirm rows render. Press ✓ on an item → open **Grocy's own UI** (`localhost:9283` → Shopping list) and confirm the item was **removed**. If the call 500s, inspect the required service fields (`product_id` vs entry `id`, list-id key name) → correct `buildRemovePayload`/`canCheckOff` + the Task 5 test to match the real contract, re-run the suite, rebuild, retest the round-trip.

- [ ] **Step 5: Record the result**

Append a verification note to the slice's session-state/handoff: HA + Grocy versions, the confirmed sensor shapes (OQ-1), the confirmed check-off id/list-id contract (OQ-2/OQ-3), and that the round-trip succeeded. Do NOT claim the slice "works" until this step passes (verification-before-completion). If fixtures/payload were corrected, commit those:

```bash
git add -A
git commit -m "test: Tier-2 confirms live grocy sensor shapes + check-off contract (OQ-1/2/3 resolved)"
```

---

## Chunk 5: Supersession + dashboard reconciliation

### Task 11: Supersession banner, dashboard swap, parent-spec boundary amendment

**Files:**
- Modify: `docs/superpowers/specs/2026-06-08-grocy-chores-slice-design.md` (supersession banner)
- Modify: `homeassistant/dashboards/kitchen.yaml` (todo.groceries → custom card)
- Modify: `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` (§6b boundary amendment)

- [ ] **Step 1: Add the supersession banner to the chores slice spec**

At the top of `2026-06-08-grocy-chores-slice-design.md` (below the title), insert:
```markdown
> **⚠️ SUPERSEDED (2026-07-02).** Chores moved to the ChoreOps HACS integration.
> This slice's card was never built. Its pipeline work (Docker/HACS/scaffold) is
> inherited by the food-ops roadmap. See `2026-07-02-grocy-food-ops-roadmap.md`
> and `2026-07-02-grocy-food-slice1-design.md`. The Grocy compose + INSTALL wiring
> once described here now lives in `deploy/INSTALL.md` (Grocy-backend phase) — do
> not follow references into this superseded doc for deploy steps.
```

- [ ] **Step 2: Swap the dashboard grocery placeholder**

In `homeassistant/dashboards/kitchen.yaml`, replace the Groceries section's `todo-list` card (lines 26-27):
```yaml
          - type: custom:grocy-shopping-card
            entity: sensor.grocy_shopping_list
            shopping_list_id: "1"   # confirm against live Grocy at Tier-2 (OQ-3)
```
Leave the `todo.chores` card unchanged with a comment: `# owned by ChoreOps integration (separate) — out of scope for this slice`.

- [ ] **Step 3: Amend the parent spec §6b boundary**

In `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md`, under §6b, add a note: the zero-custom-Python boundary is crossed for the **household food domain** via the runtime HACS-installed grocy integration (meal plan + shopping list now; recipes/stock later). **Repo `custom_components/` stays empty** — HACS installs into HA's config dir on the Pi; nothing is vendored. Cross-reference `2026-07-02-grocy-food-ops-roadmap.md`. (The chores framing is superseded — this is now food, not chores.)

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-08-grocy-chores-slice-design.md homeassistant/dashboards/kitchen.yaml docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md
git commit -m "docs: supersede chores slice, swap dashboard to grocy-shopping-card, food boundary amendment"
```

---

## Done criteria

- **Chunk 1:** scaffold renamed to `grocy-food-card`; provisional fixtures capture the source-derived shape (OQ-1 pending).
- **Chunk 2:** all pure-function tests green in CI (Tier-1) — `parseShoppingItems`/`formatAmount`, `parseMeals` (open-set default branch), `canCheckOff`/`buildRemovePayload` (mapping-only).
- **Chunk 3:** both cards build into `dist/`; render rows; meal-plan read-only; shopping check-off gated on `canCheckOff`; offline demo confirms visuals incl. the section-row + `(unnamed)` fail-safes.
- **Chunk 4:** compose + INSTALL phase authored self-contained (preserve-then-point); **Tier-2 live round-trip verified** (check-off → removed in Grocy) — OQ-1/OQ-2/OQ-3 resolved, fixtures/payload corrected if drifted.
- **Chunk 5:** chores slice superseded with banner; `todo.groceries` → `custom:grocy-shopping-card`; parent §6b food-domain boundary amendment recorded.
- Tier-3 (on-kitchen-screen) explicitly deferred to the Pi hardware phase — NOT a done-criterion here.
