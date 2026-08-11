# KitchenCOM × Grocy — Slice 2: Recipe Repository Card

**Date:** 2026-07-02 (design presented) · **approved 2026-08-05** · spec written 2026-08-05 · **AMENDED 2026-08-10 and again 2026-08-11**
**Status:** Implementation shipped 2026-08-10; **Tier-2-verified against live Grocy 4.6.0 on 2026-08-11.** Plan: `docs/superpowers/plans/2026-08-10-grocy-s2-resolved-switch.md`.

> **⚠️ READ THIS BEFORE THE BODY.** Several sections carry amendment blocks that **supersede the text beneath them**. Originals are retained for provenance, struck or marked where superseded — **do not implement from them.**
> - **§2.1 — transport. AMENDED TWICE; read the 2026-08-11 block, not the 2026-08-10 one.** The 2026-08-10 hybrid's list-sensor half turned out to be **impossible** — HA cannot extract a bare JSON array into attributes. **Both views now fetch on demand** via `rest_command`.
> - **§4.2 — ingredient source.** `recipes_pos_resolved` joins server-side and pre-scales. **Fixed a confirmed live defect** where every ingredient rendered `"(unknown)"` — now verified fixed against live data.
> - **§4.3 — text amounts. AMENDED 2026-08-11:** `recipe_amount` is **never** non-numeric; Grocy stores free text in a separate `variable_amount` field.
> - **§6, §8** carry smaller notes flowing from those.
>
> **Empirical basis:** `docs/session-state/2026-08-07-grocy-tier2-s2-findings.md` (first probe) and **`docs/session-state/2026-08-11-grocy-tier2-verification.md` (verification + the two 2026-08-11 findings — newer, read this one where they differ).**
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

### 2.1 Transport — AMENDED AGAIN 2026-08-11: fully on-demand (the list sensor is impossible)

> **⚠️ SECOND AMENDMENT (2026-08-11) — supersedes the 2026-08-10 hybrid below.** The hybrid's LIST half **cannot be built.** `sensor.grocy_recipes` can never populate, so LIST rendered "No recipes" forever and DETAIL was unreachable.
>
> **Why, verified two ways:**
> 1. **Live Grocy 4.6.0 (2026-08-11):** `GET /api/objects/recipes` returns a **bare JSON array**, not an object.
> 2. **HA source (`reference/core-dev/homeassistant/components/rest/`):** `json_attributes` are parsed from the **raw body before `value_template` runs** (`sensor.py:170-175`), so no template can reshape the payload. Then `parse_json_attributes` (`util.py:28-31`) takes `json_dict[0]` of a list and extracts named keys only if that is a dict — so a bare array yields the *first recipe*, which has no `recipes` key → `{}`. Tested against HA's pinned `jsonpath==0.82.2`: `$` returns `False` on an array, and `$[*]` / `$..*` / `$.*` all collapse back to `[0]`. **No `rest`-platform configuration works.**
>
> **DECISION — both views fetch on demand.** LIST uses the same `rest_command` + `returnResponse` transport DETAIL already uses and that is proven against live Grocy:
>
> - **LIST** → `rest_command.grocy_recipe_list` against `/objects/recipes`. **Measured 1,334 B for 4 recipes**; ~8 KB at 25. No attribute ceiling applies, because nothing goes into HA state.
> - **DETAIL** → `rest_command.grocy_recipe_ingredients` with `query[]=recipe_id=N` (**5,084 B → 1,526 B**, verified).
> - **Units** → `rest_command.grocy_quantity_units`, **861 B**, fetched once and cached.
>
> **What this costs, stated plainly:** LIST no longer renders instantly from cached HA state, so it shows a brief loading state on open, and it does **not** survive a Grocy outage the way a polled sensor would — an outage now yields "No recipes" rather than stale-but-present tiles. That is the price of the only configuration that works at all. The **~50-recipe ceiling tripwire** from the 2026-08-10 amendment is now **moot** — nothing enters HA attributes.
>
> **The `recorder:` exclude is also moot** and removed with the sensor.
>
> **Consequence for the card:** `grocy-recipe-card` no longer reads `hass.states` at all. It diverges from S1's two cards, which remain sensor-backed — that divergence is forced, not chosen.

---

### ~~2.1 Transport — AMENDED 2026-08-10: hybrid (thin list sensor + per-recipe fetch)~~ (SUPERSEDED)

> **⚠️ AMENDMENT (2026-08-10).** OQ-S2-1 was resolved by measurement on 2026-08-07 and **the answer overturned this section's recommendation.** Option A as originally scoped — *all* recipes AND *all* ingredients in one sensor's attributes — **does not scale**, so the decision below supersedes the "Recommendation: Option A" that follows. The original A-vs-B reasoning is retained beneath it because the hybrid is built from both halves.
>
> **Measured** (`docs/session-state/2026-08-07-grocy-tier2-s2-findings.md` §5): 6.4 KB at 4 recipes / 10 ingredients; extrapolating to a 25-recipe library gives **~85 KB against an HA attribute ceiling of ~16 KB — roughly 5× over**. The failure mode is a **truncated or dropped attribute, not a loud error**, so the shipped Task 8 sensor works on the toy dataset and would degrade silently as the library grows.
>
> **The bulk is the ingredients, not the recipes.** Of that ~85 KB, only ~8 KB is the recipe list; ~76 KB is `recipes_pos_resolved`. That split is what makes a hybrid work.
>
> **DECISION — hybrid transport:**
>
> - **LIST is a rest sensor (Option A shape), carrying the recipe list ONLY.** `sensor.grocy_recipes` exposes `/objects/recipes` in attributes — `id`, `name`, `picture_file_name`, `base_servings`, `desired_servings`. **No ingredient rows.** At 25 recipes this is ~8 KB, comfortably under the ~16 KB ceiling; at 50 it is ~17 KB and would need revisiting (§8 carry-forward). The card reads `hass.states[...].attributes` **exactly as S1's two cards do**, so the primary view keeps the proven pattern, renders instantly, and survives a Grocy blip.
> - **DETAIL fetches ingredients on demand (Option B shape).** Opening a recipe calls a response-returning `rest_command` against `/objects/recipes_pos_resolved?query[]=recipe_id=N` — **verified working server-side filtering**, 5,084 B unfiltered → **1,526 B for one recipe**. The ~76 KB of ingredient bulk therefore never enters HA state at all.
> - **`quantity_units` is fetched once and cached for the card's lifetime** — 6 rows, **~900 B**, static. Needed because the resolved endpoint carries no unit name (§4.2).
>
> **Why not full Option B for both views:** LIST is the view the kitchen screen sits on. Making it fetch-on-open costs a loading state on the primary surface and diverges from S1's card pattern for no measured benefit — the list payload fits the ceiling with ~2× headroom.
>
> **Why not keep Option A and cap the library:** the cap would be ~5–8 recipes, and exceeding it truncates silently rather than erroring. An invisible ceiling on a household's recipe count is not a shippable constraint.
>
> **Consequence for shipped code:** `homeassistant/packages/grocy_recipes.yaml` (Task 8) currently fetches the *unfiltered* payload. It must be narrowed to the recipe list and paired with a new `rest_command`. That is plan work, not spec work.

**Original A-vs-B analysis (retained — the hybrid is assembled from both):**

Two proxy shapes are both CORS-free and key-safe. ~~The choice is an open question resolved at implementation by measurement, not by preference~~ — **resolved 2026-08-07; see the amendment above** (§6).

- **Option A — `rest` sensor + `json_attributes`.** HA polls `/objects/recipes` and exposes `sensor.grocy_recipes` with the recipes in *attributes*; the card reads `hass.states[...]` **exactly as S1's cards do**. Constraints: HA state is capped at 255 chars (so JSON goes in attributes with a dummy state), and large attributes bloat the recorder database (**the sensor must be excluded from recorder**). Best when recipes change rarely — they do.
- **Option B — response-returning `rest_command`.** The card calls an HA service on demand and receives recipe JSON in the response (`hass.callService(domain, service, data, target, false, true)` — `returnResponse: true` is a verified parameter). No 255-char limit, no recorder storage, always fresh, key still server-side. More moving parts.

**~~Recommendation, to be confirmed by measurement: Option A.~~ — SUPERSEDED (see the 2026-08-10 amendment above). Measurement rejected whole-library Option A; the hybrid keeps A only for the recipe list.** The reasoning below still explains *why* A's shape is worth keeping for LIST: it collapses S2 back into the proven S1 shape — the card's data access becomes `hass.states[entity].attributes`, identical to `grocy-mealplan-card`. The novelty is then a little `packages/` YAML rather than new card mechanics, which is the lower-risk trade. Option B wins only if the real payload proves too large for attributes, or if on-open freshness turns out to matter.

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

### 4.2 Ingredients — AMENDED 2026-08-10: `/objects/recipes_pos_resolved`

> **⚠️ AMENDMENT (2026-08-10).** OQ-S2-3 was resolved on 2026-08-07 and the answer is **neither branch this section contemplated.** **Grocy ships `GET /api/objects/recipes_pos_resolved`, an endpoint this spec never found.** It does the join server-side. The original `recipes_pos` contract below is superseded.
>
> **What the resolved endpoint returns per ingredient row** (findings §4):
> - **`product_name`** — the join, already done. ✅
> - **`recipe_amount`** — **already scaled server-side.** ✅ Verified on Weeknight Tacos at its 4→6 factor: `1.5 → 2.25`, `12 → 18`, `0.25 → 0.375`. Grocy applies the factor itself.
> - **`qu_id`** — still a bare int. **No unit name.** ❌
>
> **The unit lookup is still required.** `/objects/quantity_units` (6 rows, ~900 B, static and cacheable) maps ids → names: `{2: Piece, 3: Pack, 4: Pound, 5: Tablespoon, 6: Cup, 7: Gram}`. Fetched once per card lifetime (§2.1).
>
> **This was double-checked.** An earlier probe reported a unit name present on the resolved row; that was a **false positive from a substring match on `only_check_single_unit_in_stock`**. A full key dump confirms there is genuinely no unit name — the lookup is not optional.
>
> **`/api/recipes/{id}/fulfillment` was evaluated and rejected** as the alternative: it returns a flat `product_names_comma_separated` string, useless for per-ingredient rows.
>
> **Two consequences:**
>
> 1. **This fixes a CONFIRMED LIVE DEFECT.** The shipped `parseIngredients` reads `r.name` / `r.unit`, **which exist on no Grocy payload** — every live row renders `"(unknown)"` with a blank unit (findings §6). The fail-safes below were doing exactly their job; the input was simply wrong.
> 2. **Client-side scaling becomes redundant for display**, since `recipe_amount` arrives pre-scaled. **`scaleIngredients` is NOT deleted** — see the guard note in §4.3.
>
> **Amended contract:**
>
> - **`parseIngredients(raw, recipeId, unitsById)` → `IngredientRow[]`**, `IngredientRow = { id, name, amount, unit }` — **the row shape is unchanged**, so every downstream consumer (DETAIL view, `scaleIngredients`) is untouched. This is the "costs one function, not the slice" outcome §6 planned for.
>   - `name` ← `product_name`, fail-safing to `"(unknown)"`.
>   - `amount` ← `recipe_amount` (**pre-scaled**), fail-safing per §4.3's non-numeric rule.
>   - `unit` ← `unitsById[qu_id]`, fail-safing to `""` when the id is absent or the lookup hasn't loaded.
>   - **Float noise crosses the wire.** Shortbread butter (0.333 lb × 1.5) comes back from Grocy as **`0.49950000000000006`** — server-side scaling does not spare us the rounding. §4.3's 2dp rounding is load-bearing against live data and must be applied to `recipe_amount` on the way in.

**Original `recipes_pos` contract (superseded — retained for the fallback path):**

Expected per row: `id`, `recipe_id`, `product_id`, `amount`, `qu_id`, optional `note`. **Confirmed exactly right at Tier-2** — but these are IDs, not names, and raw `recipes_pos` carries no `product_name`. Rendering "2 cups Flour" from *this* endpoint would require joining → `products` → `quantity_units` card-side. The resolved endpoint above removes that need.

### 4.3 `scaleIngredients` — the one real pure function

> **⚠️ AMENDED 2026-08-11 — the "non-numeric `amount`" analysis below is EMPIRICALLY WRONG.** This section's pass-through/blank collision (and its "a pinch renders as a blank quantity" conclusion) assumed a text amount arrives as a **string in `recipe_amount`**. **It cannot.** Verified against live Grocy 4.6.0: posting `amount: "a pinch"` **coerces it to `0`** and the text is lost. Grocy stores free-text amounts in a separate **`variable_amount`** column, surfaced on the resolved endpoint as **`recipe_variable_amount`**.
>
> **So the documented "blank quantity" behavior never occurs.** Left unhandled, such a row would render **`0 Pound Salt`** — a *wrong quantity* on a cooking screen, strictly worse than a blank.
>
> **Implemented 2026-08-11:** `parseIngredients` prefers a non-empty, trimmed `recipe_variable_amount` over the numeric `recipe_amount` (`pickAmount` in `shared.ts`), and the DETAIL render shows a string amount **verbatim** while **suppressing the unit** — `"a pinch Pound Salt"` reads as nonsense, so a prose amount carries the whole quantity by itself. A variable amount is **never scaled**: it is prose, and Grocy does not scale it either.
>
> **`formatAmount` is still NOT modified** — it is shared with S1's shopping card. The render layer branches on `typeof amount === "string"` before calling it.

> **⚠️ AMENDED 2026-08-10 — display-redundant, but DO NOT DELETE IT.** `recipes_pos_resolved` pre-scales `recipe_amount` server-side (§4.2), so this function no longer runs on the DETAIL render path. It is **retained deliberately**, for three reasons:
> 1. **It is the hook for adjustable servings** (§5.3, §8). The moment a +/− control lands, Grocy's own `desired_servings` is the wrong factor and the client must scale — this function already takes `desiredServings` as a parameter precisely for that.
> 2. **It is the tested fallback** if the resolved endpoint is unavailable on a given Grocy version.
> 3. **Its 12 tests are the slice's best-covered contract.** Deleting it discards them for no gain.
>
> **Its rounding rule still applies on the live path** — see §4.2: Grocy's server-side scaling emits float noise (`0.49950000000000006`), so 2dp rounding must be applied to `recipe_amount` regardless of who did the multiplying. **Do not let "scaling moved server-side" be read as "rounding is no longer needed."**

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

## 6. Open questions — ALL FOUR RESOLVED 2026-08-07

> **⚠️ STATUS (2026-08-10): every S2 OQ below is CLOSED**, probed against a live Grocy **4.6.0** on 2026-08-07. Full write-up: `docs/session-state/2026-08-07-grocy-tier2-s2-findings.md`. Two answers overturned locked decisions and produced the §2.1 and §4.2 amendments. **The original text of each OQ is retained below for provenance; the verdict is stated first.**
>
> | OQ | Verdict | Effect |
> |---|---|---|
> | **S2-1** transport | **Option A rejected at library scale** | §2.1 amended → hybrid |
> | **S2-2** field shapes | **NO DRIFT** — fixtures were exactly right | none; fixtures stand |
> | **S2-3** the join | **`recipes_pos_resolved`** — neither contemplated branch | §4.2 amended; fixes live defect |
> | **S2-4** HTML instructions | **Yes, inconsistently** — already handled | none; `stripTags` validated |
>
> **S2-2 deserves a note:** the spec warned these names were "weaker evidence than S1's" and predicted drift. **There was none** — `parseRecipes` ran against the live payload unmodified and produced correct output for all 4 recipes. The provisional fixtures were right.
>
> **S2-4 likewise needs no change:** `description` is HTML *sometimes* (`<p>` on two recipes, `<ol><li>` on one, **bare plain text** on a fourth), which is exactly the mix §5.4 designed for. Two sub-findings: **Grocy decodes entities on write** (posted `&amp;`/`&deg;` came back as `&`/`°`), making `decodeEntities`' fixed map largely moot in practice; and the **bare-angle-bracket `stripTags` fix was vindicated against real data** — Shortbread's `Cool if temp <200 and time >5 min` survived intact, where the pre-fix regex would have silently deleted it.
>
> **Still unproven, and NOT an OQ this list ever framed:** all 4 test recipes had `picture_file_name: null`, so **the LIST view's picture-present branch has never met real data** and the `<img src="/api/files/recipepictures/…">` fetch is unexercised. Carried forward to the next Tier-2 session (§8).

**Original open questions (for provenance):**

- **OQ-S2-1 — Option A (rest sensor) vs Option B (rest_command).** Resolve by **measuring** the real `/objects/recipes` payload against HA's attribute and recorder limits. Recommendation is A (§2.1). Both are CORS-free and key-safe, so this is a sizing decision, not a safety one. — **RESOLVED: measurement rejected whole-library A; hybrid adopted.**
- **OQ-S2-2 — the `recipes` / `recipes_pos` field shape.** Weaker evidence than S1's OQ-1 had (§4). Confirm every field name against the live instance and correct the fixtures. — **RESOLVED: no drift, no correction needed.**
- **⚠️ OQ-S2-3 — where the product/unit join happens. This is the one OQ with a DESIGN-LEVEL fallback, not just a fixture correction.** HA-side pre-joined payload (preferred — card stays dumb) vs `/recipes/{id}/fulfillment` if it pre-resolves names.

  **Why it is different from the others:** OQ-S2-1/2/4 resolve by correcting fixtures or config. OQ-S2-3 can invalidate a function that will already be TDD'd — §4.2 commits `parseIngredients` to receiving resolved `{id, name, amount, unit}` rows. If Tier-2 shows the pre-joined payload isn't achievable, that is a redesign plus new lookup machinery, not a rename.

  **Stated fallback (so the surprise costs one function, not the slice):** `parseIngredients` gains a second argument — product and quantity-unit lookup maps — and performs the join card-side, emitting the same `IngredientRow` shape. The row contract and every downstream consumer stay unchanged; only that one function's signature and internals move.

  **Sequencing consequence for the plan:** `scaleIngredients` is **join-independent** — it operates on `IngredientRow` regardless of where `name`/`unit` came from. **The plan must TDD `scaleIngredients` before `parseIngredients`**, so a Tier-2 surprise cannot strand the slice's primary pure function.

  — **RESOLVED: the surprise landed exactly where this OQ predicted, and the mitigation worked.** The answer was a third option (`recipes_pos_resolved`), but the blast radius was what §6 planned for: **one function's signature and internals, row contract unchanged.** The sequencing rule paid off — `scaleIngredients` and `stripTags` were both TDD'd first and both survived untouched.
- **OQ-S2-4 — does `description` actually contain HTML in practice?** §5.4 assumes yes based on Grocy's editor. If real recipes carry plain text, `stripTags` becomes a harmless no-op and nothing changes. Confirm by eye at Tier-2. — **RESOLVED: yes, inconsistently. No change required.**

**~~Shared prerequisite~~ — PARTIALLY SPENT (2026-08-10).** ~~All four need Docker + a live Grocy — the same gate blocking S1's Task 10. Standing that up once resolves S1's OQ-1/2/3 and S2's OQ-S2-1..4 together.~~

**The "one joint S1+S2 Tier-2 session" plan is no longer available.** The 2026-08-07 session stood up Grocy and resolved **S2's four OQs only**. **S1's OQ-1/2/3 remain open** and now need a session of their own, because they additionally require **a throwaway dev-HA with HACS + the grocy integration** — which was never stood up. The Grocy half of that cost is already paid (test data persists in the gitignored bind dir), so S1 Task 10 now costs only the dev-HA stand-up. **Do not schedule S2 work expecting it to resolve S1's OQs.**

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

### Added 2026-08-10 (from the Tier-2 amendments)

- **⚠️ The picture path is UNPROVEN against live data.** All 4 test recipes had `picture_file_name: null`, so the LIST view's picture-forward branch (§5.1) and the `<img src="/api/files/recipepictures/…">` fetch have **never run against a real image**. `parseRecipes` builds the URL from the filename and that logic is straightforward, but the fetch itself — path shape, auth behavior, whether the API key is needed on an `<img>` request — is untested. **Upload one image to a test recipe at the next Grocy session.**
- **The list sensor has a ceiling of its own, roughly 3× further out.** The hybrid's LIST payload is ~8 KB at 25 recipes against ~16 KB — comfortable. At **50 recipes it is ~17 KB and breaches**. Same silent-truncation failure mode as the original Option A, just at a larger library. If this household's recipe count approaches ~40, move LIST to on-demand fetch too (full Option B). **Not a v1 concern; a tripwire to remember.**
- **`quantity_units` byte size is cited inconsistently in the source docs** — the findings say ~944 B in one place and the handoff ~861 B. Both are "small and static," so nothing turns on it, but **re-measure rather than trusting either number** if it ever becomes load-bearing.
- **Grocy's `desired_servings` is write-ignored on POST, settable via a follow-up `PUT`** (HTTP 204). Affects **test-data seeding only**, not the card — but any future seeding script must PUT after POST or every recipe silently gets `base_servings` as its desired value.
- **Unit-conversion integrity is enforced on `recipes_pos` writes.** An ingredient whose `qu_id` is neither the product's `qu_id_stock` nor a defined conversion fails with `SQLSTATE[23000] … doesn't have a related conversion`. **Four of ten seed rows hit this.** Seeding scripts must use `qu_id_stock` or define conversions first.

### Pre-existing

- **Recipe authoring stays in Grocy's UI.** S2 is a read/browse surface. Authoring needs `add_generic`/`update_generic`, which is both clunky and against the read-first posture.
- **Adjustable servings** — deferred (§5.3); `scaleIngredients` is already parameterized for it.
- **Formatted instructions** — deferred (§5.4); revisit if plain text reads badly against real recipes.
- **Meal-plan → recipe link.** S1's `grocy-mealplan-card` renders recipe *names* from nested `recipe.name`; a tap-through from a planned meal to its recipe detail is an obvious future connection. **Out of S2 scope** (it couples two cards and needs a shared view-state story), but worth noting before either card's internals harden.
- **Dashboard placement** — where `grocy-recipe-card` sits on `kitchen.yaml` is a plan/deploy concern, not a design one. Note the same clobber risk S1 recorded: this branch's `kitchen.yaml` is older than the live Pi's copy on `feat/hardware-deploy`.
