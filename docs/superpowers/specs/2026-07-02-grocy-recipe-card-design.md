# KitchenCOM × Grocy — Slice 2: Recipe Repository Card

**Date:** 2026-07-02 (design presented) · **approved 2026-08-05** · spec written 2026-08-05
**Status:** Design ratified (brainstorming complete) — ready for writing-plans.
**Parent roadmap:** `2026-07-02-grocy-food-ops-roadmap.md` — **read §8 first** (the architecture constraint is settled there and is load-bearing for this spec).
**Sibling slice:** `2026-07-02-grocy-food-slice1-design.md` — S2 mirrors S1's card shape, testing posture, and fail-safe discipline. Where this spec says "as S1," that is a deliberate reuse, not an omission.

---

## 1. Summary

Slice 2 puts the household's Grocy recipes on the kitchen screen as a **browse-and-cook** surface: a grid of recipes, and a detail view you can actually cook from — picture, servings, scaled ingredients, instructions.

**One custom Lit element, two views** (`grocy-recipe-card`): LIST (grid) and DETAIL (single recipe). View state lives in the element; there is no routing.

**Scope fence.** *In:* read-only browse of recipes; picture-forward grid with text fallback; detail view with servings-scaled ingredients; the HA-side data proxy that makes recipes reachable; Tier-1 + Tier-2 verification. *Out:* recipe **authoring** (create/edit/delete — stays in Grocy's own UI; the `add_generic`/`update_generic` path is clunky and write-shaped, against this slice's read-first posture); adjustable servings via touch +/− (YAGNI — see §5.3); meal-plan integration (S1 owns that surface); web-import and Kroger (S3–S6); on-screen Tier-3 (Pi-blocked).

---

## 2. The architecture constraint (settled — roadmap §8)

**The Grocy HACS integration exposes NO recipe sensor.** Verified against the integration's `const.py` on 2026-07-02: recipes and `recipes_pos` are absent from its entity/attribute definitions. Recipe content lives **only in Grocy's own REST API**. The integration's recipe touchpoints are `consume_recipe(recipe_id)` and the generic `add_generic`/`update_generic`/`delete_generic` services — none of which *read* recipe content.

**So S2 is not "point a new card at a new sensor."** The recipe data has to reach HA another way, and the chosen way is a **server-side proxy through HA** — the API key stays in HA secrets, and the browser never talks to Grocy directly.

This was decided against the alternative of a direct browser fetch. Grocy does ship permissive CORS (`Access-Control-Allow-Origin: *`, verified in source and a packet capture), so a browser fetch is not blocked *by Grocy*. It was rejected anyway because: the `GROCY-API-KEY` header triggers a preflight whose success through the linuxserver image's nginx is unverified; it would expose a **full-scope read+write API key** in the browser; and wildcard-header behavior varies by browser version. None of those risks buy anything the proxy doesn't already give.

### 2.1 Option A vs Option B — deferred to implementation (OQ-S2-1)

Two proxy shapes are both CORS-free and key-safe. **The choice is an open question resolved at implementation by measurement, not by preference** (§6).

- **Option A — `rest` sensor + `json_attributes`.** HA polls `/objects/recipes` and exposes `sensor.grocy_recipes` with the recipes in *attributes*; the card reads `hass.states[...]` **exactly as S1's cards do**. Constraints: HA state is capped at 255 chars (so JSON goes in attributes with a dummy state), and large attributes bloat the recorder database (**the sensor must be excluded from recorder**). Best when recipes change rarely — they do.
- **Option B — response-returning `rest_command`.** The card calls an HA service on demand and receives recipe JSON in the response (`hass.callService(domain, service, data, target, false, true)` — `returnResponse: true` is a verified parameter). No 255-char limit, no recorder storage, always fresh, key still server-side. More moving parts.

**Recommendation, to be confirmed by measurement: Option A.** It collapses S2 back into the proven S1 shape — the card's data access becomes `hass.states[entity].attributes`, identical to `grocy-mealplan-card`. The novelty is then a little `packages/` YAML rather than new card mechanics, which is the lower-risk trade. Option B wins only if the real payload proves too large for attributes, or if on-open freshness turns out to matter.

**Recipe pictures load as `<img src="/api/files/recipepictures/…">` URLs regardless of A or B** — image loads are not CORS-gated, and base64-in-attributes would be a recorder and payload disaster.

---

## 3. Package layout

S2 adds a **third card to the existing `grocy-food-card` package** rather than creating a new one — same rationale as S1's one-package-two-cards decision, plus the recipe card can reuse `shared.ts` helpers.

```
custom_cards/grocy-food-card/
  src/
    shared.ts          # S1: parse/format helpers — S2 ADDS scaleIngredients + parseRecipes
    mealplan-card.ts   # S1
    shopping-card.ts   # S1
    recipe-card.ts     # S2: registers grocy-recipe-card (LIST + DETAIL views)
  test/                          # one file per concern, matching S1's convention
    recipe-parse.test.ts         # parseRecipes
    ingredient-parse.test.ts     # parseIngredients
    scale-ingredients.test.ts    # scaleIngredients — the primary target (§4.3)
    strip-tags.test.ts           # stripTags, incl. the <ol><li> case (§5.4)
    fixtures/
      recipes.json               # PROVISIONAL — field names unverified (§4, OQ-S2-2)
      recipes-pos.json           # PROVISIONAL
  demo/index.html      # S2 extends with a recipe pane
```

### ⚠️ Multi-module import gotcha (learned 2026-08-05, S1 Task 8)

`tsc` emits local import specifiers **verbatim** and this package has **no bundler**, so every local import must carry an explicit `.js` extension — `import { … } from "./shared.js"`. Writing `"./shared"` compiles fine and then 404s in the browser, rendering a blank card. S1 hit this; S2's `recipe-card.ts` must not repeat it.

---

## 4. Data contract & parse layer

### ⚠️ Field names in this section are UNVERIFIED (OQ-S2-2)

S1's spec could cite field names as *source-derived* because pygrocy models the shopping list and meal plan. **pygrocy has no recipe-ingredient model**, and the Grocy source is not vendored in this repo (`reference/` holds ChoreOps only). So the names below are drawn from Grocy's published API object shapes and are **weaker evidence than S1's were** — they are a starting point for fixtures, not a contract.

**Discipline (inherited from S1's OQ-1):** fixtures carry a PROVISIONAL header; tests assert **structure and behavior, not exact-key-presence** beyond what the parse contract needs; Tier-2 confirms against a live instance and corrects.

### 4.1 Recipes — `/objects/recipes`

Expected per recipe: `id`, `name`, `description` (the instructions — **HTML**, see §5.4), `picture_file_name` (nullable), `base_servings`, `desired_servings`.

- **`parseRecipes(raw)` → `RecipeRow[]`** where `RecipeRow = { id, name, pictureUrl, baseServings, desiredServings, instructions }`
  - `name` fail-safes to `"(untitled recipe)"` — same posture as S1's `"(unnamed)"`.
  - `pictureUrl` is `null` when `picture_file_name` is absent; the LIST view branches on this (§5.1).
  - `baseServings` fail-safes to `1` — it is a **divisor** in §4.3, and a zero or missing value must never produce `Infinity` or `NaN` on screen.
  - Returns `[]` for nullish/malformed input; never throws.

### 4.2 Ingredients — `/objects/recipes_pos`

Expected per row: `id`, `recipe_id`, `product_id`, `amount`, `qu_id`, optional `note`.

**These are IDs, not names.** Rendering "2 cups Flour" requires joining `recipes_pos` → `products` (for the name) → `quantity_units` (for the unit). **Where that join happens is OQ-S2-3** (§6) — candidates: HA-side in the proxy (preferred: one pre-joined payload, card stays dumb), or Grocy's `/recipes/{id}/fulfillment` endpoint if it pre-resolves names.

- **`parseIngredients(raw, recipeId)` → `IngredientRow[]`** where `IngredientRow = { id, name, amount, unit }`
  - `name` and `unit` fail-safe to `"(unknown)"` and `""` respectively — an unresolved join must degrade to a readable row, not a crash or a blank list.

### 4.3 `scaleIngredients` — the one real pure function

This is the slice's **primary Tier-1 TDD target**, and the reason S2 has meaningful unit tests at all.

```
scaledAmount = amount × (desiredServings / baseServings)
```

- **`scaleIngredients(rows, baseServings, desiredServings) → IngredientRow[]`**
- **Guards, all test cases:** `baseServings` of `0`, negative, `NaN`, or missing → **treat as 1** (never divide by zero, never render `Infinity`/`NaN`); `desiredServings` missing → equals `baseServings`, i.e. scale factor 1.0; a non-numeric `amount` → passes through as-is rather than becoming `NaN`.
- **Rounding — `scaleIngredients` owns it; `formatAmount` is NOT modified.** Scaling produces float noise: `0.1 × 3` is `0.30000000000000004`, and `formatAmount` would render every digit (verified against the real helper). So `scaleIngredients` **rounds to at most 2 decimal places before** handing the number to `formatAmount`. `formatAmount` then does its S1 job unchanged — integer-valued results drop the decimal (`2.0 → "2"`), non-integers render as-is. **Do not "fix" rounding inside `formatAmount`:** it is shared with S1's shopping card, and changing it would silently alter that card's rendering. No fraction-prettifying (`0.5 → "½"`) — YAGNI.

- **⚠️ Non-numeric `amount` — the pass-through/blank collision, resolved.** These two rules collide, and the spec must say which wins:
  - `scaleIngredients` passes a non-numeric `amount` through **as-is** (it must not become `NaN`).
  - `formatAmount` returns `""` for anything failing `typeof amount === "number"` — **verified**: `"a pinch"`, `undefined`, `null`, `NaN`, and even the string `"2"` all render as `""`.

  **Resolution: pass-through wins at the scale layer, and `formatAmount` blanks it at the render layer.** A recipe row with `amount: "a pinch"` therefore renders with an **empty quantity** and its name intact — "Salt", not "a pinch Salt". This is the real behavior, stated so nobody discovers it at Tier-2 and reads it as a bug.

  **This is a deliberate v1 limitation, not a design goal.** If real recipes turn out to use text amounts often, the fix is a render-layer branch (`typeof amount === "string" ? amount : formatAmount(amount)`) — a small, contained change. Do not pre-build it; confirm the need at Tier-2 first. Tier-1 must include a test asserting this documented behavior so the collision stays visible.
- **v1 uses the recipe's own `desired_servings`.** The user does not change servings on screen in this slice (§5.3).

---

## 5. Card behavior

### 5.1 LIST view (default)

A grid of recipe tiles. **Each tile handles both shapes**, because a household's recipes will be a mix:

- **Picture present** → picture-forward tile: image with the name overlaid or beneath.
- **Picture absent** → text tile: name on a themed card, sized to match the picture tiles so the grid does not go ragged.

Tapping (or clicking, or activating via keyboard) a tile switches the element to DETAIL for that recipe.

**Empty state:** "No recipes" — same posture as S1's cards.

### 5.2 DETAIL view

Picture (when present) · recipe name · servings · **scaled ingredient list** · instructions. Plus a **back control** returning to LIST — this is the only navigation in the slice, and it must be reachable without touch (§5.3).

### 5.3 Touch-first, degrading gracefully

The design target is a touch screen: tap targets **≥44px**, matching S1's check-off button.

**But touch is not currently available** — the screen is touch-capable, and touch was cable-blocked at design time. So every interaction must also work with **mouse and keyboard**, which is what the Pi actually has today (Logitech mouse + G.SKILL keyboard, per the hardware notes). Concretely: tiles and the back control are **real focusable buttons**, not click-handlers on `div`s, so they are tabbable and Enter/Space-activatable. That is the whole of the graceful degradation — no separate no-touch layout.

**Adjustable servings (touch +/−) is explicitly deferred (YAGNI).** `scaleIngredients` already takes `desiredServings` as a parameter, so the pure function is ready; wiring a control to it is a later slice's work if it proves wanted.

### 5.4 ⚠️ Instructions are HTML — sanitize or render as text

Grocy's recipe `description` field holds **rich text authored in Grocy's WYSIWYG editor**, i.e. an HTML string. Lit escapes interpolated strings by default, so `${instructions}` renders visible tags rather than formatted text.

**Decision: render instructions as plain text in v1** — strip tags in the parse layer (a `stripTags` helper, Tier-1 tested) and render the result. Rationale: `unsafeHTML` on user-authored content is an injection surface, and pulling in a sanitizer for one field in a read-only kitchen display is disproportionate. Formatted instructions (lists, bold) are a legitimate later enhancement if plain text reads badly against real recipes; that is a Tier-2 observation, not a design assumption.

Whether `description` actually carries HTML in this household's recipes is **OQ-S2-4** (§6). If it turns out to be plain text, `stripTags` is a harmless no-op and this decision costs nothing.

#### `stripTags` whitespace contract (load-bearing — a naive strip is unreadable)

Deleting tags without inserting separators destroys the structure that made the text legible. **Verified:** `<ol><li>Preheat</li><li>Mix</li></ol>` through a naive `replace(/<[^>]*>/g, "")` yields **`"PreheatMix"`** — not "flat", but genuinely unreadable on a kitchen screen. A recipe's steps are exactly the content most likely to be an `<ol>`.

**Contract, in order:**
1. **Block-level closing tags and line breaks become newlines** — `</li>`, `</p>`, `</div>`, `</h1>`–`</h6>`, `</tr>`, and `<br>` / `<br/>`.
2. **Then** remove all remaining tags.
3. **Then** collapse runs of 2+ newlines to one, and trim.

The same input then yields **`"Preheat\nMix"`** (verified). The DETAIL view renders instructions with **`white-space: pre-line`** so those newlines survive to the screen — without it, step 1 is wasted.

**Tier-1 must test the `<ol><li>` case specifically**, since it is both the most likely real input and the one a naive implementation silently ruins.

### 5.5 Registration

Registers via the same guarded `customElements.define` footer as S1's cards, plus a `window.customCards` entry for the HA card picker.

---

## 6. Open questions (resolved at Tier-2 against a live instance — do not block Tier-1)

- **OQ-S2-1 — Option A (rest sensor) vs Option B (rest_command).** Resolve by **measuring** the real `/objects/recipes` payload against HA's attribute and recorder limits. Recommendation is A (§2.1). Both are CORS-free and key-safe, so this is a sizing decision, not a safety one.
- **OQ-S2-2 — the `recipes` / `recipes_pos` field shape.** Weaker evidence than S1's OQ-1 had (§4). Confirm every field name against the live instance and correct the fixtures.
- **⚠️ OQ-S2-3 — where the product/unit join happens. This is the one OQ with a DESIGN-LEVEL fallback, not just a fixture correction.** HA-side pre-joined payload (preferred — card stays dumb) vs `/recipes/{id}/fulfillment` if it pre-resolves names.

  **Why it is different from the others:** OQ-S2-1/2/4 resolve by correcting fixtures or config. OQ-S2-3 can invalidate a function that will already be TDD'd — §4.2 commits `parseIngredients` to receiving resolved `{id, name, amount, unit}` rows. If Tier-2 shows the pre-joined payload isn't achievable, that is a redesign plus new lookup machinery, not a rename.

  **Stated fallback (so the surprise costs one function, not the slice):** `parseIngredients` gains a second argument — product and quantity-unit lookup maps — and performs the join card-side, emitting the same `IngredientRow` shape. The row contract and every downstream consumer stay unchanged; only that one function's signature and internals move.

  **Sequencing consequence for the plan:** `scaleIngredients` is **join-independent** — it operates on `IngredientRow` regardless of where `name`/`unit` came from. **The plan must TDD `scaleIngredients` before `parseIngredients`**, so a Tier-2 surprise cannot strand the slice's primary pure function.
- **OQ-S2-4 — does `description` actually contain HTML in practice?** §5.4 assumes yes based on Grocy's editor. If real recipes carry plain text, `stripTags` becomes a harmless no-op and nothing changes. Confirm by eye at Tier-2.

**Shared prerequisite:** all four need Docker + a live Grocy — the same gate blocking S1's Task 10. **Standing that up once resolves S1's OQ-1/2/3 and S2's OQ-S2-1..4 together.**

**This must survive into the implementation plan, not just this spec.** The plan's Tier-2 task should state that it is a *joint* S1+S2 verification session and reference S1's Task 10 explicitly — otherwise Tier-2 gets scheduled as S2-only work and the Grocy stand-up cost is paid twice for no benefit.

---

## 7. Testing posture — three tiers (S1 precedent)

No tier's claim is made until that tier has actually run (verification-before-completion).

- **Tier-1 — pure-function TDD (now, no HA/Grocy):** four targets, one test file each (§3). Against PROVISIONAL fixtures. Red→green→refactor.
  - `scaleIngredients` — the primary target. Every guard in §4.3: zero/negative/`NaN`/missing `baseServings`, missing `desiredServings`, non-numeric `amount` pass-through, and rounding-before-format.
  - `stripTags` — including the `<ol><li>` case whose naive handling yields `"PreheatMix"` (§5.4).
  - `parseRecipes` — nested fail-safes, `pictureUrl` null branch, `baseServings` divisor guard.
  - `parseIngredients` — unresolved-join fail-safes.
  - **Order matters: TDD `scaleIngredients` and `stripTags` FIRST.** Both are join-independent, so an OQ-S2-3 surprise at Tier-2 cannot strand them (§6).
- **Tier-2 — live round-trip on the Mac (not Pi-blocked):** stand up Docker + Grocy + dev-HA; author ≥3 real recipes **including one with no picture and one with fractional amounts**; resolve all four OQs; render LIST and DETAIL against real data; confirm scaled amounts by hand against the arithmetic. **This tier proves the slice works.**
  - **Demo-harness note (learned S1):** `demo/index.html` cannot be opened over `file://` — ES modules are CORS-blocked on that scheme and the page silently renders blank. Serve over HTTP (`python3 -m http.server`).
- **Tier-3 — on-kitchen-screen:** Pi-blocked, deferred to the hardware phase. **Touch itself is only verifiable at Tier-3** — until then, §5.3's mouse/keyboard path is what is actually exercised. NOT claimed by this slice.

---

## 8. Carry-forwards

- **Recipe authoring stays in Grocy's UI.** S2 is a read/browse surface. Authoring needs `add_generic`/`update_generic`, which is both clunky and against the read-first posture.
- **Adjustable servings** — deferred (§5.3); `scaleIngredients` is already parameterized for it.
- **Formatted instructions** — deferred (§5.4); revisit if plain text reads badly against real recipes.
- **Meal-plan → recipe link.** S1's `grocy-mealplan-card` renders recipe *names* from nested `recipe.name`; a tap-through from a planned meal to its recipe detail is an obvious future connection. **Out of S2 scope** (it couples two cards and needs a shared view-state story), but worth noting before either card's internals harden.
- **Dashboard placement** — where `grocy-recipe-card` sits on `kitchen.yaml` is a plan/deploy concern, not a design one. Note the same clobber risk S1 recorded: this branch's `kitchen.yaml` is older than the live Pi's copy on `feat/hardware-deploy`.
