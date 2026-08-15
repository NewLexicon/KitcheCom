# Grocy Food-Ops Slice 2 — Recipe Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third custom Lit element — `grocy-recipe-card` — to the existing `grocy-food-card` package, presenting Grocy recipes as a browsable grid (LIST) and a cook-from detail view (DETAIL) with servings-scaled ingredients.

**Architecture:** The Grocy HACS integration exposes **no recipe sensor**, so recipe data reaches HA through a server-side proxy (a `rest` sensor — Option A) and the card reads `hass.states[...].attributes` exactly as S1's cards do. Four pure functions in `shared.ts` (`scaleIngredients`, `stripTags`, `parseRecipes`, `parseIngredients`) carry all the testable logic; the element is thin glue with local view state.

**Tech Stack:** Lit 3.3.3, TypeScript 5.6, Vitest 4 (node env), Home Assistant `rest` platform, Docker (`lscr.io/linuxserver/grocy`).

**Spec:** `docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md` — **read §2 (architecture constraint), §4 (data contract incl. the formatAmount collision), §5.4 (stripTags contract), §6 (OQs) before starting.**

**Prerequisite reality:** Tasks 1–8 need only the repo. **Task 9 (Tier-2) needs Docker + a live Grocy + dev-HA** — the same gate blocking S1's Task 10. **Task 9 is deliberately written as a JOINT S1+S2 session** (spec §6): standing Grocy up once resolves S1's OQ-1/2/3 and S2's OQ-S2-1..4 together. Do not schedule it as S2-only work.

**Field-name caveat (spec §4, OQ-S2-2):** every Grocy field name below is **weaker evidence than S1's were** — pygrocy has no recipe-ingredient model and Grocy source is not vendored here. Fixtures are PROVISIONAL. **Assert structure and behavior, not exact-key-presence.** Task 9 confirms.

**Sequencing rule (spec §6, OQ-S2-3):** `scaleIngredients` and `stripTags` are **join-independent** and are therefore TDD'd FIRST (Tasks 2–3). `parseIngredients` (Task 5) is the one function a Tier-2 surprise can invalidate, so it comes after the primary target is banked.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `custom_cards/grocy-food-card/test/fixtures/recipes.json` | PROVISIONAL recipe payload | 1 |
| `custom_cards/grocy-food-card/test/fixtures/recipes-pos.json` | PROVISIONAL ingredient rows | 1 |
| `custom_cards/grocy-food-card/src/shared.ts` | **Modified** — adds 4 functions + 2 types | 2,3,4,5 |
| `custom_cards/grocy-food-card/test/scale-ingredients.test.ts` | `scaleIngredients` guards | 2 |
| `custom_cards/grocy-food-card/test/strip-tags.test.ts` | `stripTags` whitespace contract | 3 |
| `custom_cards/grocy-food-card/test/recipe-parse.test.ts` | `parseRecipes` fail-safes | 4 |
| `custom_cards/grocy-food-card/test/ingredient-parse.test.ts` | `parseIngredients` fail-safes | 5 |
| `custom_cards/grocy-food-card/src/recipe-card.ts` | The Lit element, LIST + DETAIL | 6 |
| `custom_cards/grocy-food-card/demo/index.html` | **Modified** — adds a recipe pane | 7 |
| `homeassistant/packages/grocy_recipes.yaml` | The Option-A rest sensor | 8 |
| `deploy/INSTALL.md` | **Modified** — recipe-proxy install steps | 8 |

---

## Chunk 1: Fixtures

### Task 1: PROVISIONAL recipe fixtures

**Files:**
- Create: `custom_cards/grocy-food-card/test/fixtures/recipes.json`
- Create: `custom_cards/grocy-food-card/test/fixtures/recipes-pos.json`

- [ ] **Step 1: Write the recipe fixture**

`test/fixtures/recipes.json` — 3 recipes covering: picture present, picture absent, and HTML instructions.

```json
{
  "_note": "PROVISIONAL — field names from Grocy's published API object shapes, NOT source-verified (pygrocy has no recipe model; Grocy source not vendored). Confirm at Tier-2 (OQ-S2-2).",
  "recipes": [
    { "id": 1, "name": "Tacos", "description": "<ol><li>Brown the beef</li><li>Warm tortillas</li></ol>", "picture_file_name": "tacos.jpg", "base_servings": 4, "desired_servings": 6 },
    { "id": 2, "name": "Pancakes", "description": "<p>Mix.</p><p>Fry.</p>", "picture_file_name": null, "base_servings": 2, "desired_servings": 2 },
    { "id": 3, "description": "Plain text, no markup.", "picture_file_name": null, "base_servings": 0, "desired_servings": 3 }
  ]
}
```

Recipe 3 deliberately has **no `name`** and **`base_servings: 0`** — it exercises the `"(untitled recipe)"` fail-safe and the divide-by-zero guard.

- [ ] **Step 2: Write the ingredient fixture**

`test/fixtures/recipes-pos.json` — rows for recipes 1 and 2, including one with a **non-numeric amount** and one with an **unresolved join** (no name/unit).

```json
{
  "_note": "PROVISIONAL — see recipes.json. Rows are shown PRE-JOINED (name/unit resolved HA-side, spec §4.2 preferred path). If Tier-2 forces the card-side join, OQ-S2-3's fallback applies.",
  "recipes_pos": [
    { "id": 10, "recipe_id": 1, "product_id": 3, "amount": 1.5, "qu_id": 2, "name": "Ground beef", "unit": "lb" },
    { "id": 11, "recipe_id": 1, "product_id": 8, "amount": 12, "qu_id": 5, "name": "Tortillas", "unit": "" },
    { "id": 12, "recipe_id": 1, "product_id": 9, "amount": "a pinch", "qu_id": 5, "name": "Salt", "unit": "" },
    { "id": 13, "recipe_id": 2, "product_id": 4, "amount": 0.1, "qu_id": 2 }
  ]
}
```

Row 12's `"a pinch"` exercises the pass-through/blank collision (spec §4.3). Row 13 has **no `name`/`unit`** — the unresolved-join fail-safe.

- [ ] **Step 3: Verify both parse as JSON**

Run: `cd custom_cards/grocy-food-card && node -e "require('./test/fixtures/recipes.json'); require('./test/fixtures/recipes-pos.json'); console.log('both OK')"`
Expected: `both OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores before committing
git add custom_cards/grocy-food-card/test/fixtures/recipes.json custom_cards/grocy-food-card/test/fixtures/recipes-pos.json
git commit -m "test: provisional grocy recipe fixtures (unverified shape, OQ-S2-2 pending)"
```

---

## Chunk 2: Join-independent pure functions (TDD — do these FIRST)

### Task 2: scaleIngredients (TDD) — the primary target

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/scale-ingredients.test.ts`

- [ ] **Step 1: Write the failing test**

`test/scale-ingredients.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scaleIngredients, formatAmount, type IngredientRow } from "../src/shared";

const rows = (amount: any): IngredientRow[] => [{ id: 1, name: "Flour", amount, unit: "cup" }];

describe("scaleIngredients", () => {
  it("scales by desired/base", () => {
    expect(scaleIngredients(rows(2), 4, 8)[0].amount).toBe(4);
  });
  it("scale factor 1 when base equals desired", () => {
    expect(scaleIngredients(rows(2), 4, 4)[0].amount).toBe(2);
  });
  it("rounds to at most 2dp — no float noise", () => {
    // 0.1 * 3 === 0.30000000000000004 in IEEE754
    expect(scaleIngredients(rows(0.1), 1, 3)[0].amount).toBe(0.3);
  });
  it("treats baseServings 0 as 1 (never divides by zero)", () => {
    const out = scaleIngredients(rows(2), 0, 3)[0].amount as number;
    expect(Number.isFinite(out)).toBe(true);
    expect(out).toBe(6);
  });
  it("treats negative/NaN/missing baseServings as 1", () => {
    expect(scaleIngredients(rows(2), -4, 2)[0].amount).toBe(4);
    expect(scaleIngredients(rows(2), NaN, 2)[0].amount).toBe(4);
    expect(scaleIngredients(rows(2), undefined as any, 2)[0].amount).toBe(4);
  });
  it("missing desiredServings means factor 1.0", () => {
    expect(scaleIngredients(rows(2), 4, undefined as any)[0].amount).toBe(2);
  });
  it("passes a non-numeric amount through AS-IS (never NaN)", () => {
    expect(scaleIngredients(rows("a pinch"), 4, 8)[0].amount).toBe("a pinch");
  });
  it("DOCUMENTED v1 LIMITATION: a passed-through string renders blank via formatAmount", () => {
    // spec §4.3 — pass-through wins at the scale layer, formatAmount blanks it at render.
    // This test exists to keep the collision visible, not to bless it.
    const scaled = scaleIngredients(rows("a pinch"), 4, 8)[0].amount;
    expect(formatAmount(scaled as any)).toBe("");
  });
  it("returns [] for nullish input (never throws)", () => {
    expect(scaleIngredients(undefined as any, 4, 8)).toEqual([]);
    expect(scaleIngredients([], 4, 8)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd custom_cards/grocy-food-card && npx vitest run test/scale-ingredients.test.ts`
Expected: FAIL — `scaleIngredients` / `IngredientRow` not exported from `../src/shared`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared.ts`:
```ts
// ---- Slice 2: recipes ----------------------------------------------------
// Field names are PROVISIONAL (spec §4, OQ-S2-2) — weaker evidence than S1's.

export type IngredientRow = { id: number; name: string; amount: number | string; unit: string };

// scaleIngredients OWNS the rounding. Do NOT move it into formatAmount — that
// helper is shared with S1's shopping card and changing it would silently alter
// that card's rendering (spec §4.3).
//
// A non-numeric amount passes through AS-IS so it never becomes NaN. Note the
// documented consequence: formatAmount then renders it as "" (spec §4.3).
export function scaleIngredients(
  rows?: IngredientRow[] | null,
  baseServings?: number,
  desiredServings?: number,
): IngredientRow[] {
  if (!Array.isArray(rows)) return [];
  // A zero/negative/NaN/missing base is a divisor hazard — treat as 1.
  const base =
    typeof baseServings === "number" && Number.isFinite(baseServings) && baseServings > 0
      ? baseServings
      : 1;
  const desired =
    typeof desiredServings === "number" && Number.isFinite(desiredServings) && desiredServings > 0
      ? desiredServings
      : base;
  const factor = desired / base;
  return rows.map((r) => {
    if (typeof r?.amount !== "number" || Number.isNaN(r.amount)) return { ...r };
    // Round to <=2dp BEFORE formatAmount ever sees it: 0.1*3 is 0.30000000000000004.
    const scaled = Math.round(r.amount * factor * 100) / 100;
    return { ...r, amount: scaled };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/scale-ingredients.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/scale-ingredients.test.ts
git commit -m "feat: scaleIngredients with divisor guards + 2dp rounding (S2 primary pure fn)"
```

---

### Task 3: stripTags (TDD) — the whitespace contract

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/strip-tags.test.ts`

- [ ] **Step 1: Write the failing test**

`test/strip-tags.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stripTags } from "../src/shared";

describe("stripTags", () => {
  it("THE load-bearing case: <ol><li> keeps step separation", () => {
    // A naive replace(/<[^>]*>/g,"") yields "PreheatMix" — unreadable (spec §5.4).
    expect(stripTags("<ol><li>Preheat</li><li>Mix</li></ol>")).toBe("Preheat\nMix");
  });
  it("paragraphs become newlines", () => {
    expect(stripTags("<p>Mix.</p><p>Fry.</p>")).toBe("Mix.\nFry.");
  });
  it("<br> and <br/> become newlines", () => {
    expect(stripTags("a<br>b<br/>c")).toBe("a\nb\nc");
  });
  it("collapses runs of blank lines to one", () => {
    expect(stripTags("<p>a</p><div></div><p>b</p>")).toBe("a\nb");
  });
  it("strips inline tags without adding separators", () => {
    expect(stripTags("Mix <b>well</b> now")).toBe("Mix well now");
  });
  it("plain text passes through unchanged (the OQ-S2-4 no-op case)", () => {
    expect(stripTags("Plain text, no markup.")).toBe("Plain text, no markup.");
  });
  it("fail-safe for nullish input (never throws)", () => {
    expect(stripTags(undefined)).toBe("");
    expect(stripTags(null)).toBe("");
    expect(stripTags("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/strip-tags.test.ts`
Expected: FAIL — `stripTags` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared.ts`:
```ts
// Grocy's recipe `description` is WYSIWYG-authored HTML. We render it as PLAIN
// TEXT (spec §5.4) — unsafeHTML on user-authored content is an injection surface
// and a sanitizer dependency is disproportionate for one field.
//
// The separator rule is load-bearing: deleting tags without inserting newlines
// turns <ol><li>Preheat</li><li>Mix</li></ol> into "PreheatMix". The DETAIL view
// must render the result with `white-space: pre-line` or step 1 is wasted.
export function stripTags(html?: string | null): string {
  if (typeof html !== "string" || html.length === 0) return "";
  return html
    // 1. block-level closers + line breaks become newlines
    .replace(/<\/(li|p|div|h[1-6]|tr)\s*>|<br\s*\/?>/gi, "\n")
    // 2. remove every remaining tag
    .replace(/<[^>]*>/g, "")
    // 3. collapse runs of newlines (incl. surrounding spaces), then trim
    .replace(/[ \t]*\n[ \t]*(\n[ \t]*)+/g, "\n")
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/strip-tags.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/strip-tags.test.ts
git commit -m "feat: stripTags with block-separator whitespace contract (spec 5.4)"
```

---

## Chunk 3: Join-dependent parsers (TDD)

### Task 4: parseRecipes (TDD)

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/recipe-parse.test.ts`

- [ ] **Step 1: Write the failing test**

`test/recipe-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseRecipes } from "../src/shared";
import fixture from "./fixtures/recipes.json";

describe("parseRecipes", () => {
  it("maps each recipe to a row", () => {
    expect(parseRecipes(fixture.recipes as any).length).toBe(3);
  });
  it("builds pictureUrl from picture_file_name", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[0].pictureUrl).toContain("tacos.jpg");
  });
  it("pictureUrl is null when picture_file_name is absent (LIST branches on this)", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[1].pictureUrl).toBeNull();
  });
  it("name fail-safes to (untitled recipe)", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[2].name).toBe("(untitled recipe)");
  });
  it("baseServings fail-safes to 1 — it is a divisor", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[2].baseServings).toBe(1);   // fixture has base_servings: 0
  });
  it("instructions come through stripped of markup", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[0].instructions).toBe("Brown the beef\nWarm tortillas");
  });
  it("returns [] for nullish/malformed input (never throws)", () => {
    expect(parseRecipes(undefined)).toEqual([]);
    expect(parseRecipes([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/recipe-parse.test.ts`
Expected: FAIL — `parseRecipes` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared.ts`:
```ts
export type RecipeRow = {
  id: number;
  name: string;
  pictureUrl: string | null;
  baseServings: number;
  desiredServings: number;
  instructions: string;
};

// Grocy serves recipe pictures from this path. Loaded via <img src> — image
// loads are NOT CORS-gated, unlike a fetch (spec §2.1).
const PICTURE_BASE = "/api/files/recipepictures/";

export function parseRecipes(recipes?: any[] | null): RecipeRow[] {
  if (!Array.isArray(recipes)) return [];
  return recipes.map((r) => {
    // base is a DIVISOR in scaleIngredients — 0/negative/missing must become 1.
    const rawBase = r?.base_servings;
    const baseServings =
      typeof rawBase === "number" && Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 1;
    const rawDesired = r?.desired_servings;
    const desiredServings =
      typeof rawDesired === "number" && Number.isFinite(rawDesired) && rawDesired > 0
        ? rawDesired
        : baseServings;
    return {
      id: r?.id,
      name: r?.name ?? "(untitled recipe)",
      pictureUrl: r?.picture_file_name ? PICTURE_BASE + r.picture_file_name : null,
      baseServings,
      desiredServings,
      instructions: stripTags(r?.description),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/recipe-parse.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/recipe-parse.test.ts
git commit -m "feat: parseRecipes with divisor + name + picture fail-safes"
```

---

### Task 5: parseIngredients (TDD)

**⚠️ This is the one function OQ-S2-3 can invalidate (spec §6).** It is written for the **pre-joined** payload (names/units resolved HA-side). If Tier-2 (Task 9) shows the pre-join isn't achievable, the stated fallback applies: add a second argument carrying product/unit lookup maps and do the join here, keeping `IngredientRow` unchanged. **Tasks 2–3 are already banked and are unaffected either way.**

**Files:**
- Modify: `custom_cards/grocy-food-card/src/shared.ts`
- Create: `custom_cards/grocy-food-card/test/ingredient-parse.test.ts`

- [ ] **Step 1: Write the failing test**

`test/ingredient-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseIngredients } from "../src/shared";
import fixture from "./fixtures/recipes-pos.json";

describe("parseIngredients", () => {
  it("filters rows to the requested recipe", () => {
    expect(parseIngredients(fixture.recipes_pos as any, 1).length).toBe(3);
    expect(parseIngredients(fixture.recipes_pos as any, 2).length).toBe(1);
  });
  it("maps a pre-joined row to name/amount/unit", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 1);
    expect(rows[0]).toEqual({ id: 10, name: "Ground beef", amount: 1.5, unit: "lb" });
  });
  it("name fail-safes to (unknown) when the join is unresolved", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 2);
    expect(rows[0].name).toBe("(unknown)");
  });
  it("unit fail-safes to empty string", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 2);
    expect(rows[0].unit).toBe("");
  });
  it("preserves a non-numeric amount for scaleIngredients to pass through", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 1);
    expect(rows[2].amount).toBe("a pinch");
  });
  it("returns [] for nullish input or an unmatched recipe id (never throws)", () => {
    expect(parseIngredients(undefined, 1)).toEqual([]);
    expect(parseIngredients(fixture.recipes_pos as any, 999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingredient-parse.test.ts`
Expected: FAIL — `parseIngredients` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared.ts`:
```ts
// Written for the PRE-JOINED payload (name/unit resolved HA-side — spec §4.2's
// preferred path). OQ-S2-3 fallback if Tier-2 forces a card-side join: add a
// second arg carrying product/unit lookup maps and resolve here. IngredientRow
// stays the same either way, so no downstream consumer changes.
export function parseIngredients(rows?: any[] | null, recipeId?: number): IngredientRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r?.recipe_id === recipeId)
    .map((r) => ({
      id: r?.id,
      name: r?.name ?? "(unknown)",
      amount: r?.amount,
      unit: r?.unit ?? "",
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ingredient-parse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite + typecheck (regression guard)**

Run: `npx vitest run && npm run typecheck`
Expected: **16 S1 tests + 29 S2 tests = 45 passing**, 0 type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add custom_cards/grocy-food-card/src/shared.ts custom_cards/grocy-food-card/test/ingredient-parse.test.ts
git commit -m "feat: parseIngredients for pre-joined rows (OQ-S2-3 fallback documented)"
```

---

## Chunk 4: The card

### Task 6: grocy-recipe-card (LIST + DETAIL)

**⚠️ Import gotcha (spec §3):** local imports MUST carry `.js`. `from "./shared"` compiles and then 404s in the browser.

**Files:**
- Create: `custom_cards/grocy-food-card/src/recipe-card.ts`

- [ ] **Step 1: Write the element**

`src/recipe-card.ts`:
```ts
import { LitElement, html, css, nothing } from "lit";
// NOTE: explicit .js extension is required — tsc emits this specifier verbatim
// and browsers cannot resolve extensionless module paths (spec §3).
import {
  parseRecipes, parseIngredients, scaleIngredients, formatAmount,
  type RecipeRow, type IngredientRow,
} from "./shared.js";

type HassLike = { states?: Record<string, { attributes?: any } | undefined> };

export class GrocyRecipeCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _selectedId: { state: true },
  };
  hass?: HassLike;
  private _entity = "sensor.grocy_recipes";
  private _selectedId: number | null = null;   // null = LIST view, else DETAIL

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
  }

  private get _attrs(): any {
    return this.hass?.states?.[this._entity]?.attributes ?? {};
  }
  private get _recipes(): RecipeRow[] {
    return parseRecipes(this._attrs.recipes);
  }
  private get _selected(): RecipeRow | undefined {
    return this._recipes.find((r) => r.id === this._selectedId);
  }

  private _open(id: number): void { this._selectedId = id; }
  private _back(): void { this._selectedId = null; }

  render() {
    return this._selectedId === null ? this._renderList() : this._renderDetail();
  }

  private _renderList() {
    const recipes = this._recipes;
    if (recipes.length === 0) return html`<div class="empty">No recipes</div>`;
    return html`
      <div class="grid">
        ${recipes.map((r) => html`
          <button class="tile" @click=${() => this._open(r.id)}>
            ${r.pictureUrl
              ? html`<img class="thumb" src=${r.pictureUrl} alt="" loading="lazy" />`
              : html`<div class="thumb placeholder"></div>`}
            <span class="tile-name">${r.name}</span>
          </button>`)}
      </div>`;
  }

  private _renderDetail() {
    const r = this._selected;
    if (!r) return html`<div class="empty">Recipe not found</div>`;
    const scaled = scaleIngredients(
      parseIngredients(this._attrs.recipes_pos, r.id),
      r.baseServings,
      r.desiredServings,
    );
    return html`
      <div class="detail">
        <button class="back" @click=${this._back}>← Back</button>
        ${r.pictureUrl ? html`<img class="hero" src=${r.pictureUrl} alt="" />` : nothing}
        <h2 class="title">${r.name}</h2>
        <div class="servings">Serves ${r.desiredServings}</div>
        <ul class="ingredients">
          ${scaled.map((i: IngredientRow) => html`
            <li><span class="amt">${formatAmount(i.amount as number)}</span>
                <span class="unit">${i.unit}</span>
                <span class="iname">${i.name}</span></li>`)}
        </ul>
        <div class="instructions">${r.instructions}</div>
      </div>`;
  }

  static styles = css`
    :host { color: var(--primary-text-color, #e8edf6);
      font: 500 18px/1.35 system-ui, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px; padding: 8px; }
    /* Real <button>s, not click-handled divs: tabbable + Enter/Space activatable,
       which is the whole of the no-touch degradation (spec §5.3). */
    .tile { display: flex; flex-direction: column; gap: 6px; padding: 0;
      min-height: 44px; cursor: pointer; border: none; border-radius: 12px;
      overflow: hidden; background: var(--card-background-color, #1b2130);
      color: inherit; font: inherit; text-align: left; }
    .thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
    .placeholder { background: linear-gradient(135deg, #2a3348, #1b2130); }
    .tile-name { padding: 0 8px 8px; font-weight: 700; }
    .detail { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
    .back { align-self: flex-start; min-height: 44px; min-width: 44px; padding: 0 14px;
      cursor: pointer; border: none; border-radius: 8px;
      background: var(--primary-color, #3b82f6); color: #fff; font: inherit; }
    .hero { width: 100%; max-height: 260px; object-fit: cover; border-radius: 12px; }
    .title { margin: 0; font-size: 24px; }
    .servings { opacity: .7; }
    .ingredients { margin: 0; padding-left: 18px; display: flex;
      flex-direction: column; gap: 4px; }
    .amt { font-weight: 700; }
    /* pre-line is load-bearing: stripTags emits \n between steps and they are
       invisible without it (spec §5.4). */
    .instructions { white-space: pre-line; opacity: .92; }
    .empty { padding: 16px; opacity: .7; }
  `;
}

if (!customElements.get("grocy-recipe-card")) {
  customElements.define("grocy-recipe-card", GrocyRecipeCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-recipe-card", name: "Grocy Recipes", description: "Browse recipes from Grocy",
});
```

- [ ] **Step 2: Build + typecheck + full suite**

Run: `cd custom_cards/grocy-food-card && npm run build && npm run typecheck && npx vitest run`
Expected: `dist/recipe-card.js` emitted alongside the S1 files; 0 type errors; 45 tests PASS.

- [ ] **Step 3: Verify the emitted import kept its extension**

Run: `grep -n 'from "./shared' dist/recipe-card.js`
Expected: `from "./shared.js"` — **if it prints `from "./shared"` the browser will 404** (spec §3).

- [ ] **Step 4: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add custom_cards/grocy-food-card/src/recipe-card.ts
git commit -m "feat: grocy-recipe-card Lit element (LIST + DETAIL, keyboard-reachable)"
```

---

### Task 7: Extend the demo harness

**Files:**
- Modify: `custom_cards/grocy-food-card/demo/index.html`

- [ ] **Step 1: Add the recipe pane**

In `demo/index.html`, add this import beside the existing two:
```js
  import "../dist/recipe-card.js";
```

Then append before the final `document.body.append(...)` line:
```js
  const recipes = { states: { "sensor.grocy_recipes": { attributes: {
    recipes: [
      { id: 1, name: "Tacos", description: "<ol><li>Brown the beef</li><li>Warm tortillas</li></ol>",
        picture_file_name: null, base_servings: 4, desired_servings: 6 },
      { id: 2, name: "Pancakes", description: "<p>Mix.</p><p>Fry.</p>",
        picture_file_name: null, base_servings: 2, desired_servings: 2 }
    ],
    recipes_pos: [
      { id: 10, recipe_id: 1, amount: 1.5, name: "Ground beef", unit: "lb" },
      { id: 11, recipe_id: 1, amount: 12, name: "Tortillas", unit: "" },
      { id: 12, recipe_id: 1, amount: "a pinch", name: "Salt", unit: "" }
    ]
  } } } };

  const rc = document.createElement("grocy-recipe-card");
  rc.setConfig({}); rc.hass = recipes;
  const rcPane = document.createElement("div"); rcPane.className = "pane"; rcPane.appendChild(rc);
```

And add `rcPane` to the final append: `document.body.append(mpPane, scPane, rcPane);`

**Note:** `picture_file_name` is `null` in both demo recipes on purpose — the demo has no HA to serve `/api/files/...`, so a real filename would render a broken image. The placeholder-tile path is what's exercised offline.

- [ ] **Step 2: Serve and verify**

**`file://` will NOT work** — ES modules are CORS-blocked on that scheme and the page renders blank (learned S1 Task 8).

```bash
cd custom_cards/grocy-food-card && npm run build && python3 -m http.server 8777
```
Open `http://localhost:8777/demo/index.html`. Confirm:
- Recipe pane shows **2 tiles** (both placeholder style, no broken images).
- Clicking "Tacos" switches to DETAIL: title, "Serves 6", and **3 ingredients**.
- **Scaling is visible:** base 4 → desired 6 is ×1.5, so `1.5 lb` renders as **`2.25`** and `12` renders as **`18`**.
- **The Salt row shows a BLANK amount** — the documented v1 limitation (spec §4.3), not a bug.
- Instructions show **two lines**, not `"Brown the beefWarm tortillas"`.
- "← Back" returns to the grid. **Tab to it and press Enter** — it must activate without a mouse (spec §5.3).

Stop the server (Ctrl-C) when done.

- [ ] **Step 3: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add custom_cards/grocy-food-card/demo/index.html
git commit -m "test: extend demo harness with the recipe card pane"
```

---

## Chunk 5: The HA proxy

### Task 8: Option-A rest sensor + INSTALL steps

**This implements Option A (spec §2.1) as the recommended default. Task 9 measures the real payload and switches to Option B only if A proves unworkable.**

**Files:**
- Create: `homeassistant/packages/grocy_recipes.yaml`
- Modify: `deploy/INSTALL.md`

- [ ] **Step 1: Check whether packages/ is already wired**

Run: `grep -n "packages:" homeassistant/configuration.yaml || echo "NOT WIRED"`

If it prints `NOT WIRED`, add this to `homeassistant/configuration.yaml` under `homeassistant:`:
```yaml
homeassistant:
  packages: !include_dir_named packages
```

- [ ] **Step 2: Write the rest sensor package**

`homeassistant/packages/grocy_recipes.yaml`:
```yaml
# Slice 2 recipe proxy (Option A — spec §2.1).
# The Grocy HACS integration exposes NO recipe sensor, so HA polls Grocy's REST
# API server-side and parks the payload in ATTRIBUTES. The API key stays here,
# never in the browser.
#
# Two constraints this file must respect:
#   1. HA state is capped at 255 chars — hence value_template's constant "ok"
#      and the real data in json_attributes.
#   2. Large attributes bloat the recorder DB — see the recorder exclude below.
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
```

> **Ingredients (`recipes_pos`) are NOT fetched here yet.** Which endpoint supplies pre-joined ingredient rows is **OQ-S2-3**, resolved in Task 9. Add a second `rest` entry once the shape is known — the card already reads `attributes.recipes_pos`.

- [ ] **Step 3: Add the secrets template lines to INSTALL.md**

In `deploy/INSTALL.md`, inside the **Phase B2** section, append:

```markdown
6. **Recipe proxy (Slice 2).** The recipe card needs `homeassistant/packages/grocy_recipes.yaml`
   deployed and two entries in `/config/secrets.yaml`:
   ```yaml
   grocy_api_key: <the API key from step 1>
   grocy_recipes_url: http://<pi-host>:9283/api/objects/recipes
   ```
   Then restart HA and confirm `sensor.grocy_recipes` exists with a `recipes` attribute
   (Developer Tools → States). Register the card resource `/local/recipe-card.js` (module)
   alongside the S1 resources, and add the card:
   ```yaml
   - type: custom:grocy-recipe-card
     entity: sensor.grocy_recipes
   ```
   > `secrets.yaml` is gitignored — these values are entered on the target machine, never committed.
```

- [ ] **Step 4: Validate the YAML parses**

Run: `python3 -c "import yaml,sys; yaml.SafeLoader.add_constructor('!secret', lambda l,n: 'X'); yaml.SafeLoader.add_constructor('!include_dir_named', lambda l,n: 'X'); yaml.safe_load(open('homeassistant/packages/grocy_recipes.yaml')); print('YAML OK')"`
Expected: `YAML OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add homeassistant/packages/grocy_recipes.yaml deploy/INSTALL.md
git add homeassistant/configuration.yaml 2>/dev/null || true
git commit -m "feat: Option-A rest-sensor recipe proxy + INSTALL steps (key stays server-side)"
```

---

## Chunk 6: Tier-2 (Docker-gated)

### Task 9: JOINT S1+S2 live verification

**⚠️ This is a JOINT session with S1's Task 10 — do not run it as S2-only work.** Standing up Docker + Grocy + dev-HA once resolves S1's OQ-1/2/3 **and** S2's OQ-S2-1..4. Read S1's plan Task 10 (`docs/superpowers/plans/2026-07-02-grocy-food-slice1.md:663-692`) and run both together.

**Files:** none (verification task; produces fixture/implementation corrections).

- [ ] **Step 1: Stand up Grocy + dev-HA (shared with S1 Task 10)**

Follow S1 Task 10 Steps 1–2. Additionally, in Grocy's UI author **≥3 recipes** covering: one **with** a picture, one **without**, one with **fractional amounts** (e.g. 1.5), and instructions entered as a **numbered list** so `<ol><li>` is exercised.

- [ ] **Step 2: Resolve OQ-S2-2 — confirm the recipe field shape**

Developer Tools → States → `sensor.grocy_recipes`. Compare the real `recipes[]` against `test/fixtures/recipes.json`. **If they drift, correct the fixtures AND `parseRecipes`, then re-run `npx vitest run`.** Record the confirmed shape in the commit message.

- [ ] **Step 3: Resolve OQ-S2-3 — the ingredient join**

Query Grocy directly and inspect what comes back:
```bash
curl -s -H "GROCY-API-KEY: <key>" http://localhost:9283/api/objects/recipes_pos | head -40
curl -s -H "GROCY-API-KEY: <key>" http://localhost:9283/api/recipes/1/fulfillment | head -40
```
- If either returns **names/units already resolved** → add a second `rest` entry for it in `grocy_recipes.yaml`; `parseIngredients` needs no change.
- If both return **bare IDs** → the OQ-S2-3 fallback fires: add `products` and `quantity_units` rest entries, extend `parseIngredients` with a second lookup-maps argument, and update `ingredient-parse.test.ts`. **`IngredientRow` and every downstream consumer stay unchanged.**

- [ ] **Step 4: Resolve OQ-S2-1 — measure the payload**

```bash
curl -s -H "GROCY-API-KEY: <key>" http://localhost:9283/api/objects/recipes | wc -c
```
Compare against HA's practical attribute limits and check the sensor actually populates. **If the payload is unworkably large or HA truncates it, switch to Option B** (response-returning `rest_command`, spec §2.1) — the card's `_attrs` getter is the only place that changes.

- [ ] **Step 5: Resolve OQ-S2-4 — is `description` really HTML?**

Look at the real `description` values in Developer Tools. If they carry markup, `stripTags` is doing real work; if plain text, it is a harmless no-op. **Either way, confirm the DETAIL view's instructions render as separate lines, not a run-on.**

- [ ] **Step 6: Render and verify against real data**

Register `/local/recipe-card.js`, add the card, and confirm: the grid shows every recipe with picture tiles and placeholder tiles side by side; opening one shows scaled amounts; **hand-check the arithmetic** on the fractional recipe (`amount × desired/base`); instructions show line breaks.

- [ ] **Step 7: Record the result**

Append a verification note to the slice handoff: HA + Grocy versions, the confirmed recipe/ingredient shapes, which A/B option won and the measured payload size, whether `description` was HTML, and that scaled amounts were hand-checked. **Do not claim the slice works until this step passes** (verification-before-completion).

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
git branch --show-current   # MUST print feat/grocy-chores
git add -A
git commit -m "test: Tier-2 confirms live grocy recipe shapes (OQ-S2-1..4 resolved)"
```

---

## Done criteria

- **Chunk 1:** provisional fixtures exist and parse, covering the picture-absent, missing-name, zero-base-servings, non-numeric-amount, and unresolved-join cases.
- **Chunk 2:** `scaleIngredients` (9 tests) and `stripTags` (7 tests) green — both join-independent, both banked before any Tier-2 risk.
- **Chunk 3:** `parseRecipes` (7) and `parseIngredients` (6) green; **full suite 45 passing** (16 S1 + 29 S2), typecheck clean.
- **Chunk 4:** `grocy-recipe-card` builds; the emitted import keeps its `.js`; demo shows LIST → DETAIL, correct scaling (`1.5 → 2.25` at ×1.5), the blank-amount limitation, multi-line instructions, and a keyboard-reachable back control.
- **Chunk 5:** the rest-sensor package parses and INSTALL documents the secrets + resource registration.
- **Chunk 6:** **Tier-2 verified jointly with S1 Task 10** — all four OQs resolved, fixtures/implementation corrected if drifted, scaled amounts hand-checked against real recipes.
- **Tier-3 (on-kitchen-screen) is explicitly NOT a done-criterion** — Pi-blocked. **Touch itself is only verifiable at Tier-3**; until then the mouse/keyboard path is what has actually been exercised.
