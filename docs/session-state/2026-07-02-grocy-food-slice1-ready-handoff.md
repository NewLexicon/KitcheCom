# Cold-open handoff — Grocy Food-Ops (S2 COMPLETE: plan + Tier-2 + the HA gate)

**Date:** 2026-07-02 (last refreshed **2026-08-11**, after the HA gate closed)
**Branch:** `feat/grocy-chores` (in the worktree `.worktrees/grocy-chores`)
**Status (two threads, at DIFFERENT gates):**
1. **S1 (meal-plan + shopping cards): Tasks 1–9 shipped 2026-08-05. Task 10 (Tier-2) STILL NOT RUN.** It needed a dev-HA container — **one now exists** (`deploy/homeassistant/`), so this is newly unblocked. **S1's OQ-1/2/3 remain open** (they additionally need HACS + the grocy integration). **Task 11 deliberately DEFERRED** (§5).
2. **S2 (recipe card): COMPLETE.** All 9 plan tasks done, Tier-2-verified against live Grocy 4.6.0, **and the transport verified inside a real HA 2025.7 on 2026-08-11.** The `"(unknown)"` defect is fixed; the CRITICAL LIST-sensor defect is **resolved** (§4.0); text amounts fixed, pictures scoped out. 92 tests green, typecheck clean.

## ▶ START HERE (2026-08-11 — S2's last gate is CLOSED)

**All 9 plan tasks are DONE and the HA gate is CLOSED. No known blocker remains on S2.**

**Empirical state:** 92 tests / 13 files passing, typecheck 0 errors, build clean, all local imports carry `.js`.

**The HA gate that was owed is now closed.** Both source-read assumptions are confirmed against a running HA:
- **`{{ recipe_id }}` templating WORKS** — `recipe_id` 1 vs 2 returned 3 rows each with distinct ids `[1]` / `[2]`. Had templating failed, both would have returned all 10 rows.
- **`returnResponse` shape is as coded** — `service_response` = `{content, status}`; `content` is the array the card reads.
- Recipe 1 renders end-to-end through HA as `2.25 Pound Ground beef` / `18 Piece Tortillas`.

**What is still NOT covered** (be precise about this — do not overclaim S2 as shipped):
- **The card has never been SEEN rendering in an HA dashboard.** The dashboard is **already built and waiting** (see next move); the render could not be confirmed because the automation browser nulls `customElements`, so no HA dashboard renders in it. Zero console errors, and `/local/recipe-card.js` served 200 — nothing points at a card defect, but nobody has looked at it. Rendering is separately covered by the demo harness (0 console errors, 2026-08-10).
- The card's **WebSocket** `callService` path specifically — verified over REST; both share the same service layer and envelope.

**Next move — pick one:**
- **⭐ Look at the dashboard in a NORMAL browser — ~2 minutes.** Open `http://localhost:8124/lovelace/recipes`, login `dev` / `devdevdev`. **The resource is registered and the dashboard is built** — nothing to configure. Expect 4 tiles; click one for pre-scaled ingredients. **Do not retry this with the `browser-automation` skill** — it uses patchright, which nulls `customElements` and cannot render any HA frontend (details in the HA-gate doc §6a).
- **S1 Task 10 (Tier-2)** — newly unblocked by the same dev-HA.
- **Merge** — see §5 / `superpowers:finishing-a-development-branch`.

**Read, in order:**
1. **The HA gate result (newest):** `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/session-state/2026-08-11-ha-gate-verification.md`
2. **What Tier-2 found:** `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/session-state/2026-08-11-grocy-tier2-verification.md`
3. **The spec — §2.1 was amended TWICE; read the 2026-08-11 block, not the 2026-08-10 one beneath it:** `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md`
4. The plan (all tasks complete; kept for provenance): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/plans/2026-08-10-grocy-s2-resolved-switch.md`

**⚠️ The repo's `homeassistant/configuration.yaml` is a MERGE FRAGMENT** with no `default_config:` (`homeassistant/README.md:24-26`). Mounted alone as an HA `/config` it produces an HA with **no `rest_command` service at all**. Any future dev-HA must use `deploy/homeassistant/dev-configuration.yaml` (fragment + `default_config:`), which `dev-setup.sh` handles. Do not "fix" the fragment — the Pi needs it as-is.

**Both containers are UP.**
- **Grocy** — `localhost:9283`, admin/admin, 4-recipe test data. Teardown: `docker compose -f deploy/grocy/docker-compose.grocy.yml down`
- **dev-HA** — `localhost:8124`, throwaway login `dev` / `devdevdev`. Teardown: `docker compose -f deploy/homeassistant/docker-compose.ha-dev.yml down`

Both persist data in gitignored dirs, so teardown is safe. To rebuild the dev-HA from scratch, delete `deploy/homeassistant/dev-config/` and re-run `dev-setup.sh` (needs `GROCY_API_KEY` — see that doc §7).

## 4.0 ✅ RESOLVED 2026-08-11 — the LIST sensor defect

**Was:** `sensor.grocy_recipes` emitted no attributes, so LIST showed "No recipes" forever and DETAIL was unreachable.

**Confirmed live:** `GET /api/objects/recipes` returns a **bare JSON array**, and HA's `parse_json_attributes` (`components/rest/util.py:28-31`) takes `json_dict[0]` of a list, then extracts named keys only if that is a dict — so it yielded the first *recipe*, which has no `recipes` key. No jsonpath expression works (`$` returns `False` on an array under HA's pinned `jsonpath==0.82.2`).

**Fixed by migrating LIST to `rest_command.grocy_recipe_list`** (`3c7bef4`, `d6f6f7c`). The sensor and its `recorder:` exclude are deleted. Verified end-to-end: the exact 1,334-byte bare array that broke the sensor now produces 4 recipe tiles through the fetch path.

### Everything else that changed 2026-08-11 (all live-verified)

- **The `"(unknown)"` defect is VERIFIED FIXED against real data** — renders `2.25 Pound Ground beef`, `18 Piece Tortillas`.
- **NEW: text amounts.** `recipe_amount` is **never** non-numeric — posting text coerces it to `0`. Grocy stores free text in `variable_amount`. Left unhandled a row rendered `0 Pound Salt` (a *wrong quantity*, worse than the blank the spec documented). Fixed in both parse and render layers; now renders `a pinch Salt` with the unit suppressed.
- **NEW: pictures are DISABLED in v1.** The files API needs a base64-encoded filename **and** the API key, which `<img src>` cannot send. The query-param form works but would leak a full read+write key into the DOM — rejected. Tiles use the placeholder. §5.1's picture branch is dead code until an HA-side image proxy or a scoped read-only key exists.

> This is a feature-branch handoff, not the project-wide cold-open. The formal `docs/session-state/README.md` cold-open describes main; this file covers the `feat/grocy-chores` work-arc. Post-merge, rewrite the project cold-open from main's perspective.

---

## 1. Where is HEAD?

- **HEAD:** `ef4d0a9` — `docs: refresh cold-open — HA gate closed, S2 has no known blocker`, **plus the fix-up commit that set this line.** Last **card-code** commit is still `759b905` (pictures disabled); the HA gate needed no code change.
- **Branch:** `feat/grocy-chores`, in worktree `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores`
- **Ahead of main:** **78** commits (77 at `ef4d0a9`, +1 for the fix-up). Worktree clean.

### 2026-08-11 (later) — the HA gate
- `6962635` — **dev-HA harness + the gate result.** `{{ recipe_id }}` templating and the `returnResponse` shape both CONFIRMED inside HA 2025.7. Adds `deploy/homeassistant/` (compose + `dev-configuration.yaml` + `dev-setup.sh`); no card code changed. Found that the repo's `configuration.yaml` is a merge fragment with no `default_config:`.

### 2026-08-11 — Tier-2 verification + the fixes it forced, newest first
- `98500c6` — picture-path probe recorded: **disabled in v1** (base64 filename + API key that `<img src>` can't send; query-param key would leak a full read+write key)
- `759b905` — **FIX**: `pictureUrl` always null; tiles use the tested placeholder
- `781fdc0` — INSTALL: no sensor to look for, card takes no `entity`
- `a6e4f6d` — spec §2.1 (fully on-demand) + §4.3 (text amounts) amended
- `d6f6f7c` — **drops the impossible sensor**, adds `grocy_recipe_list`
- `3c7bef4` — **FIX (§4.0)**: LIST fetches on demand instead of reading a sensor
- `2eae1bf` — **FIX**: DETAIL renders text amounts instead of blanking them
- `e3632a8` — **FIX**: read text amounts from `variable_amount`, not `recipe_amount`
- `dc1ceb2` — Tier-2 findings: defect fixed live, §4.0 confirmed, text-amount finding

### 2026-08-10 session 2 — plan executed (Tasks 1–8), newest first
Executed under `superpowers:subagent-driven-development`. **All code below is committed and green.**
- `ee8b237` — **FIX (review)**: self-healing unit-map cache (a transient failure no longer latches an empty map for the card's lifetime) + monotonic `_fetchSeq` token (closes a `1→2→1` stale-overwrite race that showed the wrong recipe's quantities)
- `c0c152f` — **documents the §4.0 CRITICAL defect** in the YAML; the defect itself is NOT fixed
- `de73545` — Task 8: demo harness answers both rest_commands, **browser-verified** (0 console errors)
- `ffc8bac` — Task 7: INSTALL Phase B2 secrets
- `c8fbb1e` — Task 6: hybrid HA package (list sensor + 2 rest_commands)
- `3cf041b` — Tasks 4+5: on-demand ingredient fetch; removes the double-scale
- `833f963` — **FIX (review)**: prototype-chain guard on the unit lookup (a `qu_id` of `"constructor"` rendered `[native code]` on screen)
- `d9fe333` — **Task 3: THE DEFECT FIX** — `parseIngredients` reads `recipes_pos_resolved`
- `508516c` — Task 2: `buildUnitMap`
- `3af93f2` — Task 1: captured-shape fixtures replacing the invented ones

**Review found 3 real defects the implementers' self-reviews passed** (prototype-key rendering, unit-map poisoning, the stale-fetch race) — plus the §4.0 CRITICAL, which review caught and which no test could have.

### 2026-08-10 session 1 — spec amendment + plan (no code)
- `f867130` — spec §2.1 (hybrid transport) + §4.2 (resolved endpoint) amended; plan added; two stale claims in the findings file corrected.
- `91e1365` — corrected `roundAmount`'s return type in the plan (would have failed the build with TS2322).

**Transport decision made this session (it was NOT in the findings):** the findings established only that Option A *fails*. The replacement chosen was **hybrid** — thin list sensor for LIST, per-recipe `rest_command` for DETAIL — over full-Option-B (rejected: puts a loading state on the primary kitchen view and abandons S1's card pattern for no measured gain) and cap-the-library (rejected: the cap is ~5–8 recipes and breaching it truncates silently).

**Two errors found in the inherited docs while working, both corrected in `f867130`:**
1. The findings' §8 pointed at a plan path that **was never written**. The plan now exists, dated 2026-08-10.
2. The findings' §9 said the container was **left running**. It is not — Docker Desktop is down.

### 2026-08-07 — Tier-2 probing session (no code)
Stood up Grocy 4.6.0 in Docker, authored 4 recipes / 10 ingredient rows, and probed the four S2 open questions against live data. **Findings: `docs/session-state/2026-08-07-grocy-tier2-s2-findings.md`** — read it before acting; §4 below is only the summary.

### S2 execution arc — 2026-08-06, newest first (Tasks 1–8, plus spec + plan)
Executed under `superpowers:subagent-driven-development`: a fresh implementer per task, then spec-compliance and code-quality review. **Four tasks required post-review fixes — all four were real defects caught by review, not cosmetic.**
  - `1bd9230` — Task 8: Option-A rest sensor (`homeassistant/packages/grocy_recipes.yaml`) + INSTALL Phase B2 step 7
  - `246111f` — Task 7: demo harness extended, **browser-verified**
  - `4a8c5f5` — **FIX**: "Recipe not found" was a dead end with no focusable escape (keyboard-only screen) + `_open` id guard
  - `8190aa8` — Task 6: `grocy-recipe-card` element (LIST + DETAIL)
  - `60d527d` — **FIX**: `parseIngredients` returned phantom `"(unknown)"` rows when `recipeId` was unresolved
  - `e28bae7` — Task 5: `parseIngredients`
  - `a788bcd` — Task 4: `parseRecipes`
  - `7150fe5` — **FIX**: `stripTags` silently deleted prose between a bare `<` and `>` (data loss); entities undecoded
  - `249ea74` — Task 3: `stripTags`
  - `4b962da` — **FIX**: `scaleIngredients` emitted literal `"Infinity"` on overflow; null rows became `{}`
  - `0f121b0` — Task 2: `scaleIngredients`
  - `48e688d` — Task 1: provisional fixtures
  - `1f40a2b` — the S2 plan · `103e87b` + `bda8e0f` — the S2 spec (written and reviewer-folded same day)
- **Slice 1 execution arc — 2026-08-05, newest first (Tasks 1–9):**
  - `4b07f20` — Task 9: Grocy compose + INSTALL Phase B2 + gitignore for runtime state
  - `d0d1174` — Task 8: offline demo harness **+ the `./shared.js` build fix** (see §2)
  - `7ec5496` — Task 7: `grocy-shopping-card` (guarded check-off)
  - `2b3c147` — Task 6: `grocy-mealplan-card` (read-only)
  - `6082433` — Task 5: `canCheckOff` + `buildRemovePayload`
  - `605f3f1` — Task 4: `parseMeals` (open-set default branch)
  - `da8f38e` — Task 3: `parseShoppingItems` + `formatAmount`
  - `3bd36d8` — Task 2: provisional fixtures
  - `17c048a` — Task 1: scaffold rename → `grocy-food-card`
- **Prior arc (planning, 2026-07-02/04):** `c1c456e` (fix-up) → `6b43d75` → `42aa689` (S2 design presented) → `d60c8e2` → `1e69370` → `af31ed5` → `7da1ce7` → `972f9cc` (this file created) → `6301e5a` (S1 plan) → `ca9ae54` (S1 spec) → `c4f7944` (roadmap) → `8c559d7` (Pi bring-up).

**⚠️ Concurrent-session hazard (memory: `concurrent-sessions-branch-hazard.md`):** the OTHER window shares the SAME repo's main checkout, currently on `feat/choreops-chores`. This Slice 1 work is isolated in the WORKTREE on `feat/grocy-chores`. **Before ANY commit, run `git branch --show-current` and confirm it says `feat/grocy-chores`.** Every task command in the plan `cd`s into the worktree — stay there.

---

## 2. Empirical state (re-verified 2026-08-07)

> **Re-run on 2026-08-07:** `npm test` → **54 passed (7 files)**; `npm run typecheck` → **clean**. Unchanged from 2026-08-06 because no code shipped. **The tests passing does NOT mean the card works against real data** — see the live defect in §4.1.


Package is `custom_cards/grocy-food-card/`. All commands below run from that directory.

- **Tier-1 tests: 54 passing across 7 files** (`npx vitest run`) — S1: `shopping-parse` (6), `mealplan-parse` (7), `checkoff` (3). S2: `scale-ingredients` (12), `strip-tags` (11), `recipe-parse` (7), `ingredient-parse` (8).
- **Typecheck: clean** (`npm run typecheck` → 0 errors).
- **Build: clean** — emits `dist/shared.js`, `dist/mealplan-card.js`, `dist/shopping-card.js`, `dist/recipe-card.js`.
- **All three cards browser-verified** (2026-08-06), 0 console errors / 0 failed requests. Recipe card specifics: LIST shows 2 real-`<button>` tiles with placeholder thumbs; DETAIL shows `2.25 lb Ground beef` and `18 Tortillas` (correct ×1.5 scaling from base 4 → desired 6), `Salt` with a blank quantity (the documented `"a pinch"` limitation), and two-line instructions with computed `white-space: pre-line`. **Keyboard fully works**: tile focuses → Enter and Space open DETAIL; back focuses → Enter returns to LIST.

### ⚠️ S2's four accepted v1 limitations (documented, NOT defects)
1. A **string amount** (`"a pinch"`) renders as a **blank quantity** with the name intact. `scaleIngredients` passes it through; `formatAmount` blanks it.
2. **Extreme overflow** falls back to the original unscaled amount. (Correction to an earlier note: the fix removed literal `"Infinity"`; scientific-notation rendering of huge finite numbers is inherited, untouched S1 `formatAmount` behavior.)
3. **Unmapped HTML entities** (`&frac12;`, numeric `&#8212;`) pass through literally. `decodeEntities` is a small fixed map by design, not a general decoder. — **2026-08-07: largely MOOT.** Grocy's API decodes entities on write (posted `&amp;`/`&deg;` came back as `&`/`°`), so the fixed map is rarely exercised.
4. ~~Ingredients render empty until OQ-S2-3 is settled.~~ — **2026-08-07: this is now a CONFIRMED LIVE DEFECT, not a pending limitation.** `parseIngredients` reads `r.name`/`r.unit`, which **exist on no Grocy payload**; every live row returns `"(unknown)"` with a blank unit. Fix is part of the §4.1 amendment.
- **Browser-verified 2026-08-05** — both cards render, **0 console errors / 0 failed requests**. Meal rows `Wed Tacos` / `Thu Leftovers night` / `Thu Dinner` (the section row proves the open-set default branch); shopping rows `2 Eggs` / `1.5 Milk` / `1 (unnamed)` (integer-float strip, non-integer passthrough, nested-name fail-safe). **Guard confirmed:** 3 ✓ buttons with `shopping_list_id` set, **0** without it.
- **Docker: still NOT running** on the Mac (verified 2026-08-05 — CLI present at `/usr/local/bin/docker`, daemon down). **This gates Tier-2 (Task 10).**
- `dist/` is **gitignored** repo-wide (`.gitignore:24`) — same convention as `screensaver-card`. It must be rebuilt on any machine that installs the card; INSTALL Phase B2 step 5 says so.

### ⚠️ Build fix made during Task 8 — NOT in the plan, applies to any future multi-module card

`tsc` emits local import specifiers **verbatim**, so `import … from "./shared"` reached the browser extensionless, `GET /dist/shared` 404'd, and the demo page rendered **blank**. `moduleResolution: "bundler"` (tsconfig.json:6) permits the extensionless form on the assumption a bundler resolves it — this package runs raw `tsc` output with **no bundler**.

**Fix:** write `./shared.js` in the TypeScript source (both card files). `tsc` resolves that to the `.ts` and emits it unchanged.

**Why the plan couldn't have caught it:** the inherited `screensaver-card` scaffold is a **single file with no local imports**. `grocy-food-card` is the first multi-module card in this repo. Any future card that splits code across modules will hit the same thing.

### Verification method note (for whoever runs the demo next)

`demo/index.html` **cannot be opened over `file://`** — ES modules are CORS-blocked on that scheme and the page silently renders nothing. Serve it over HTTP instead:
```bash
cd custom_cards/grocy-food-card && npm run build && python3 -m http.server 8777
# then open http://localhost:8777/demo/index.html
```

### What is NOT verified (do not overclaim)

- **Check-off click-through was never exercised.** The headless harness could not reach `customElements`/`setConfig` in its evaluate context. The click path is thin glue over the unit-tested `buildRemovePayload`; real confirmation is Task 10 / OQ-2 regardless.
- **Every Grocy field name remains a provisional guess** from pygrocy source (OQ-1). A green suite means "the builders are internally consistent," **not** "check-off works" (spec §3.3).

---

## 3. What just shipped and why

### 2026-08-05 session — S1 Tasks 1–9 executed

Executed under `superpowers:executing-plans`, one commit per task, following the plan's literal steps. TDD tasks (3/4/5) each had the RED failure verified before implementing.

- **Chunk 1** (Tasks 1–2): scaffold renamed via `git mv` (history preserved); provisional fixtures written.
- **Chunk 2** (Tasks 3–5): the three pure-function pairs, 16 tests.
- **Chunk 3** (Tasks 6–8): both Lit elements + the demo harness. **Task 8 surfaced the `./shared.js` build bug** (§2) — the demo caught a defect that tests could not, because vitest resolves modules through its own bundler and never exercises the browser's resolution path.
- **Chunk 4 partial** (Task 9): compose fragment + INSTALL "Phase B2", authored self-contained per preserve-then-point.

**Deviations from the plan, all recorded in commit bodies:**
1. `mealplan-card.ts` drops `nothing` from its lit import (unused there — the element has no conditional-render site). `noUnusedLocals` is off so it would have compiled either way; tidiness, not a fix.
2. The `./shared.js` extension fix (§2) — a real bug fix, not a preference.
3. INSTALL Phase B2 goes beyond the plan's step list: it spells out that `dist/` must be built on the installing machine and that **all three** emitted files must be copied (`shared.js` is imported at runtime but is NOT registered as a resource), plus documents `shopping_list_id` and its read-only fallback.
4. Added `deploy/grocy/grocy-config/` to `.gitignore` — the compose bind-mount creates it at runtime for Grocy's SQLite db + uploads.

**Task 11 deferred deliberately** (not blocked): its Step 2 writes `shopping_list_id: "1"` into `homeassistant/dashboards/kitchen.yaml` while OQ-3 is unresolved, and that file carries a known clobber risk (§5).

### 2026-07-02/04 sessions — the planning arc

The user pivoted Grocy's role. **Chores moved to ChoreOps** (separate HACS integration, the other window's work). Grocy now owns the **food domain**. Three docs were produced through a full brainstorming → writing-plans cycle, with the user acting as reviewer across three review rounds (all catches folded):

1. **Roadmap** (`c4f7944`) — 6-slice food-ops program. **Two hard walls, source-verified:** (a) no retailer permits programmatic ORDER SUBMISSION — Kroger builds a cart via `PUT /v1/cart/add` but you tap "place order" yourself; (b) **Amazon is out** — no official cart API, AI-agent-policy blocks bots. **Kroger only.**
2. **Slice 1 spec** (`ca9ae54`) — meal-plan (read-only) + shopping-list (check-off) cards.
3. **Slice 1 plan** (`6301e5a`) — 11 tasks, 5 chunks.

**Discipline-rule firings this session:** source-verification (read the grocy integration + pygrocy + Kroger/Amazon APIs before locking design — caught "no `todo` platform", "meal-plan `type` is an open set", "no order-submission on any retailer"); receiving-code-review (3 rounds, verified-before-accepting, no performative agreement); the preserve-then-point fix (Task 9 authors compose/INSTALL self-contained rather than pointing into the superseded chores spec).

---

## 4. The next move (literal first action)

### 4.1 ⚠️ Two S2 design decisions are now invalidated — amend the spec BEFORE writing code

The 2026-08-07 Tier-2 probe resolved all four S2 OQs. Two answers **contradict decisions the spec locked in**, so this is a spec amendment, not a patch:

1. **Ingredient source → `recipes_pos_resolved`.** The spec's §4.2 assumed a join had to be built (HA-side or card-side). **Grocy ships `GET /api/objects/recipes_pos_resolved`, which the spec never found.** It returns `product_name` already joined **and `recipe_amount` already scaled server-side** (verified: Tacos 1.5→**2.25**, 12→**18**, 0.25→**0.375** at the 4→6 factor). Consequences: it **fixes the live `"(unknown)"` defect**, and it makes **client-side `scaleIngredients` redundant for display**. It does **not** carry unit names — `qu_id` is still a bare int, so a `quantity_units` lookup is still required (6 rows, **861 bytes**, static and cacheable; ids→names `{2:Piece, 3:Pack, 4:Pound, 5:Tablespoon, 6:Cup, 7:Gram}`).
   - **Verified again 2026-08-07 at cold-open time.** An earlier probe of mine falsely reported a unit name on the resolved row — that was a substring false-positive on `only_check_single_unit_in_stock`. A full key dump confirms **there is no unit name**; the lookup is genuinely needed.
   - **Do not delete `scaleIngredients`.** It stays the tested fallback and is still needed if a future slice adds on-screen servings adjustment (spec §5.3 explicitly parameterized it for that).

2. **Transport → Option A does not scale.** Measured 6.4 KB for 4 recipes/10 ingredients; extrapolation puts a **25-recipe library at ~85 KB against an HA attribute ceiling of ~16 KB — ~5× over**. The Task 8 rest sensor works on a toy dataset and **degrades quietly** (truncated/dropped attribute, no loud error). Mitigation is verified: **`?query[]=recipe_id=N` server-side filtering works** (5,084 B unfiltered → 1,526 B for one recipe), which makes an on-demand per-recipe fetch practical.

**These two interact — do not fix the join before the transport is settled, or the fix gets redone.**

> **✅ RESOLVED 2026-08-10 — steps 1–3 below are DONE.** The spec is amended and the plan is written. The findings file's §8 pointed at `…2026-08-07-grocy-s2-resolved-switch.md`, which never existed; the real plan is **`docs/superpowers/plans/2026-08-10-grocy-s2-resolved-switch.md`** (dated for the day it was actually written). Both docs carry correction notes.

**Sequence — where it now stands:**
1. ~~Read the findings file end-to-end.~~ **DONE 2026-08-10.**
2. ~~Amend `2026-07-02-grocy-recipe-card-design.md` §4.2 and §2.1.~~ **DONE — `f867130`.**
3. ~~Write the plan.~~ **DONE — 9 tasks, `f867130`.**
4. **← YOU ARE HERE: execute the plan.** Start at Task 1 under `superpowers:subagent-driven-development`.

**What the plan does, in one line each:** T1 replaces the fiction fixtures with captured live shapes · T2 adds `buildUnitMap` · T3 re-points `parseIngredients` at `recipes_pos_resolved` (**this is the task that fixes the live defect**) · T4 removes the now-double scaling · T5 adds the on-demand fetch path · T6 rewrites the HA package as the hybrid · T7 documents the three secrets · T8 teaches the demo harness the fetch · T9 verifies against live Grocy.

### 4.2 S1 Task 10 is still unrun — and now needs its own session

The old "do both in one Docker session" advice is **spent**: the Grocy half is done, but S1 Task 10 additionally needs **a throwaway dev-HA with HACS + the grocy integration**, which was never stood up. **S1's OQ-1/2/3 remain open.** OQ-2 in particular (does check-off want `id` or `product_id`?) can only be proven by pressing ✓ and watching the row vanish in Grocy's UI.

**The Grocy container is already up with test data**, so S1 Task 10 now only costs the dev-HA stand-up. Detail retained below.

### 4.3 Read first (absolute paths)

- **THE PLAN — start here, execute Task 1:** `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/plans/2026-08-10-grocy-s2-resolved-switch.md`
- S2 spec (**AMENDED** — read the §2.1/§4.2 amendment blocks, not the superseded text below them): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md`
- Findings (the empirical basis; needed only to re-derive a number): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/session-state/2026-08-07-grocy-tier2-s2-findings.md`
- S2 plan (Tasks 1–8 done; Chunk 6 = Task 9): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/plans/2026-08-05-grocy-food-slice2.md`
- The shipped Option-A sensor (the thing §4.1.2 changes): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/homeassistant/packages/grocy_recipes.yaml`
- The defective parse fn: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/custom_cards/grocy-food-card/src/shared.ts`

**Below is S1 Task 10's detail, retained verbatim:**

**Read first (absolute paths):**
- Plan — **Task 10 is at lines 663–692**: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/plans/2026-07-02-grocy-food-slice1.md`
- Slice 1 spec (§3.3 tier boundary, §5 the three OQs): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-food-slice1-design.md`
- Roadmap: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-food-ops-roadmap.md`
- Compose fragment (written 2026-08-05): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/deploy/grocy/docker-compose.grocy.yml`
- Install steps (Phase B2, written 2026-08-05): `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/deploy/INSTALL.md`

**Mandatory pre-flight:** confirm `git branch --show-current` == `feat/grocy-chores` before ANY commit (§1 hazard). The other window shares the main checkout.

**Task 10 in four moves** (plan has the detail):
1. `docker compose -f deploy/grocy/docker-compose.grocy.yml up -d` → `http://localhost:9283`, admin/admin, create an API key, add ≥2 shopping items + ≥1 meal (a recipe AND a note).
2. Stand up a throwaway dev-HA with HACS + the grocy integration. **Config flow: URL `http://host.docker.internal`, Port `9283`** (not the 9192 default).
3. **OQ-1** — compare the live `attributes.meals[]` / `attributes.products[]` against the fixtures in `custom_cards/grocy-food-card/test/fixtures/`. If they drift, correct fixtures **and** the parse functions, re-run `npx vitest run`.
4. **OQ-2/OQ-3** — register the built resources, add both cards, press ✓, confirm removal in Grocy's own UI. If it 500s, correct `buildRemovePayload`/`canCheckOff` + the Task 5 test to the real contract.

**Then Task 11** (plan lines 698–736) — deferred this session; see §5 before running its Step 2.

> **The S2 "awaiting user approval / no spec yet" block that used to sit here is DELETED as of 2026-08-07.** It was stale: the design was approved 2026-08-05, the spec and plan were written, and Tasks 1–8 shipped 2026-08-06. Ignore any older copy of it.

---

## 4.5 Reconnecting to the live Grocy (⚠️ NOT running — needs a manual Docker start)

> **⚠️ CORRECTED 2026-08-10.** This section previously said the container was still up. **It is not** — `docker info` fails; Docker Desktop is down. **The test data is safe**: it lives on disk in the gitignored bind dir `deploy/grocy/grocy-config/`, so `up -d` restores the 4 recipes rather than rebuilding them.
>
> **Step 0 is manual: start Docker Desktop by hand.** It is a GUI app — an agent session cannot launch it. Everything below assumes the daemon is reachable.

The data on disk: 4 recipes, 10 ingredient rows, 8 products, 6 quantity units, covering prose instructions, `<ol><li>` instructions, fractional amounts, and a plain-text description.

```bash
# 0. Start Docker Desktop by hand FIRST, then:
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
docker info >/dev/null 2>&1 || echo "daemon still down — start Docker Desktop"
docker compose -f deploy/grocy/docker-compose.grocy.yml up -d
# http://localhost:9283 — admin/admin
```

**API key** (already created; don't make a new one):
```bash
sqlite3 deploy/grocy/grocy-config/data/grocy.db "select api_key from api_keys;"
```

**Two gotchas that cost time on 2026-08-07:**
- The **`Add` button on `/manageapikeys` is `href="#"` and JS-driven — it does not fire under browser automation.** The working route is `GET /manageapikeys/new`.
- **Unit-conversion integrity is enforced on `recipes_pos` writes.** An ingredient whose `qu_id` is neither the product's `qu_id_stock` nor a defined conversion fails with `SQLSTATE[23000] ... doesn't have a related conversion`. Four of ten seed rows hit this. Any seeding script must use `qu_id_stock` or define conversions first.
- Also: **`desired_servings` is ignored on POST** but settable via a follow-up `PUT` (204). Affects seeding only, not the card.

**Teardown when truly done:** `docker compose -f deploy/grocy/docker-compose.grocy.yml down`. The bind dir `deploy/grocy/grocy-config/` persists (gitignored) and holds the test data.

---

## 5. Carry-forwards (deferred gates / latent risks)

### New 2026-08-11 (Tier-2)
- **⚠️ OWED: verify inside a real Home Assistant.** The `rest_command` → Grocy round-trip is confirmed only at the Grocy end. HA's `{{ recipe_id }}` templating and `returnResponse` delivery are **source-read, never executed**. This is the last gate before S2 can be called shipped.
- **Pictures are dead code in v1** (§5.1's picture-forward tile). Needs an HA-side image proxy or a scoped read-only Grocy key. `RecipeRow.pictureUrl` keeps `string | null` so re-enabling needs no contract change.
- **A Grocy 401 looks like success to the card** — HA's `rest_command` only logs on ≥400 and still returns the parsed body. Code degrades safely to `[]`, but cannot tell the operator "no ingredients" from "bad API key". `response.status` is the only signal.
- **LIST no longer survives a Grocy outage.** Nothing is cached in HA state any more, so an outage shows "No recipes" rather than stale tiles. Accepted trade-off — it was the only transport that works at all.
- **`test/recipe-render-amount.test.ts` and `test/recipe-fetch-race.test.ts` MIRROR card logic** rather than driving the Lit element (vitest runs `environment: "node"`, no DOM library). **If `_open` or the DETAIL `<li>` changes, update those mirrors** or they silently stop testing reality.

### Resolved 2026-08-10 session 2 (superseded by the above)
- ~~**CRITICAL: the LIST sensor is broken.**~~ **FIXED 2026-08-11** — see §4.0.
- **`scaleIngredients` is now OFF the render path but deliberately retained** — tested fallback + the hook for the deferred on-screen servings control. 12 tests still cover it. Do not delete it as "dead code".
- **`test/recipe-fetch-race.test.ts` MIRRORS `_open`'s logic** rather than driving the Lit element, because vitest runs `environment: "node"` with no DOM library installed. **If `_open` changes, that mirror must change too** or the tests silently stop testing reality.
- **The demo harness now fakes `callService`** with a 120ms delay so the loading state is visible. Recipe 2 gained ingredients incl. the float-noise value that proves 2dp rounding.
- **HA `rest_command` does NOT raise on non-2xx** (verified against `reference/core-dev/homeassistant/components/rest_command/__init__.py:187-196`): a ≥400 status only logs a warning, then the body is still parsed and returned. So a Grocy **401 arrives looking like success**, with an error *object* where an array was expected. **Our code already degrades safely** — `fetchIngredients` guards on `Array.isArray(content)` and `fetchUnitMap` routes through `buildUnitMap` (which returns `{}` for non-arrays); both verified against a real 401 body and an HTML 500 page. **No fix needed, but do not assume a failed fetch throws** — it does not, and `response.status` is the only signal. Relevant if Task 9 sees an empty list and needs to tell "no ingredients" from "bad API key".
- **The pre-encoded `%5B%5D` in `grocy_recipe_ingredients_url` is CORRECT as committed — do not "fix" it.** A background agent claimed yarl double-encodes it under `skip_url_encoding: false` (HA's default). **Tested directly and that is wrong:** `URL(u, encoded=False)` leaves `%5B%5D`/`%3D` intact — no `%25` escaping. Two independent checks agree. (The raw `?query[]=` form also works, since yarl encodes it to the same thing; either is fine, so there is no reason to change it.)
- **Verified fixed this session:** the `"(unknown)"` defect (real Grocy rows now render `2.25 Pound Ground beef`), double-scaling, prototype-key rendering, unit-map poisoning, and the `1→2→1` stale-fetch race — the last confirmed with a control test showing the pre-fix logic corrupts under the same scenario.

### New 2026-08-10 session 1 (docs)
- **⚠️ The live `"(unknown)"` ingredient defect is STILL SHIPPED.** The spec now describes the fix and the plan sequences it, but **no code has changed** — the card on `feat/grocy-chores` still reads `r.name`/`r.unit` and would render every ingredient as `"(unknown)"` against real Grocy. **Do not merge this branch believing S2 works.** Plan Task 3 is the fix.
- **The fixtures encode the very fiction that hid the defect.** `test/fixtures/recipes-pos.json` invents pre-joined `name`/`unit` keys, so 54 tests pass green over data Grocy never returns. Plan Task 1 replaces them with captured shapes **before** any behavior changes — deliberately, so the tests can't keep passing against a fiction.
- **The list sensor has a ceiling of its own** at ~50 recipes (~17 KB vs the ~16 KB attribute cap) — same silent-truncation failure mode as the original Option A, just further out. Tripwire: if the household passes ~40 recipes, move LIST to on-demand fetch too. Recorded in spec §8.
- **`quantity_units` byte size is cited inconsistently** — findings §4 says ~944 B, the old handoff said 861 B. Nothing turns on it (both are "small and static"), but re-measure rather than trusting either if it ever matters.

### New 2026-08-07 (status updated 2026-08-10)
- ~~The `recipes_pos_resolved` switch + transport rework are UNWRITTEN work.~~ **RESOLVED 2026-08-10** — spec amended (§2.1, §4.2) and the 9-task plan written at `docs/superpowers/plans/2026-08-10-grocy-s2-resolved-switch.md`. **The code itself is still unwritten** — that is now plan execution, not design work.
- **The picture path is STILL unproven against live data.** All 4 test recipes had `picture_file_name: null`, so the LIST view's picture-forward branch and the `<img src="/api/files/recipepictures/…">` fetch were never exercised. **Upload an image to a test recipe** during the next Grocy session — this is now **plan Task 9 Step 3**, which also checks whether that fetch needs an API key (an `<img src>` cannot send a header, so if it does, the picture path needs a rethink).
- **`scaleIngredients` becomes display-redundant but must NOT be deleted** — `recipes_pos_resolved` pre-scales, but the function stays the tested fallback and is the hook for the deferred on-screen servings control (spec §5.3).
- **S1's three OQs are still open** and now need a dev-HA session of their own (§4.2). The old "one joint Tier-2 session" plan is spent.
- **The old `docs/session-state/2026-08-07-grocy-tier2-s2-findings.md` was untracked** at the time of this refresh — it is committed as part of this close-out.

### Pre-existing
- **Task 10 (Tier-2) is the one blocked gate.** Needs Docker running + a fresh Grocy container + a dev-HA on the Mac. It resolves three OQs that everything downstream trusts:
  - **OQ-1** — the live sensor field names may DRIFT from the provisional pygrocy-derived fixtures (integration `as_dict()` mapper may flatten/rename/camelCase; `day`'s serialized form unconfirmed). If drifted → correct fixtures + parse fns + re-run suite. **Tests are written NOT to over-fit** to guessed keys.
  - **OQ-2** — whether `remove_product_in_shopping_list` wants the entry `id` or `product_id`.
  - **OQ-3** — where the shopping-list id comes from (config field? sensor attr? default `1`?). Gates `canCheckOff`; if unresolved the card renders read-only and check-off silently never works.
  - **Tier boundary (spec §3.3):** a green Tier-1 suite for `buildRemovePayload` proves "builder is internally consistent," NOT "check-off works." Only Task 10's live removal proves the round-trip.
- **Latent-until-Task-10:** the dashboard swap in Task 11 hardcodes `shopping_list_id: "1"` with a comment to confirm at Tier-2. If OQ-3 resolves to a different source, fix the dashboard too. **This is why Task 11 was deferred 2026-08-05** rather than executed alongside 1–9.
- **⚠️ `kitchen.yaml` CLOBBER RISK (new note 2026-08-05, applies to Task 11 Step 2).** This branch's `homeassistant/dashboards/kitchen.yaml` is OLDER than the one the live Pi runs — the Pi runs `feat/hardware-deploy`'s version (weather `weather.forecast_home`, Groceries/Chores headings). **Before running Task 11 Step 2, diff against it:** `git show feat/hardware-deploy:homeassistant/dashboards/kitchen.yaml` and merge the deltas, or the live dashboard regresses. (Same hazard is recorded in the ChoreOps branch's cold-open.)
- **INSTALL.md kiosk drift (pre-existing, not introduced here).** This branch's `deploy/INSTALL.md` Phase D still documents the old `start-kiosk.sh` + systemd approach; the live Pi runs the **Wayland/labwc** kiosk from `feat/hardware-deploy` (`deploy/kiosk/start-kiosk-wayland.sh`). The 2026-08-05 Phase B2 addition did not touch Phase D. Reconcile whenever these branches merge.
- **`npm audit` reports 1 high-severity advisory (postcss)** in `grocy-food-card`, reached transitively via `vitest → vite → postcss`. **Dev-only** — `npm ls postcss --omit=dev` is empty, so nothing reaches the built card. Inherited from the screensaver scaffold, not introduced by this slice. Worth a separate dependency-hygiene pass across **both** card packages; deliberately not fixed inside a task whose plan said "leave all other fields unchanged."
- **Multi-module card gotcha (new 2026-08-05):** any future card that splits code across modules must use explicit `.js` extensions in local imports — see §2. The screensaver single-file pattern hides this.
- **Pi-blocked:** Tier-3 (on-kitchen-screen) is out of scope for Slice 1 — deferred to the hardware phase.
- **CLAUDE.md pointer deferral:** per the global cold-open rule's branch-guardrail clause, the pointer to this handoff / the formal cold-open belongs on main post-merge, not on this feature branch. This handoff is self-discoverable under `docs/session-state/`.

---

## 6. Memory-layer entries that apply

Memory dir (OUTSIDE the repo): `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`

- `concurrent-sessions-branch-hazard.md` — **most relevant.** Two windows, one checkout; verify branch before every commit. (This work is worktree-isolated on `feat/grocy-chores`.)
- `kitchencom-github-remote.md` — origin is `NewLexicon/KitcheCom.git` (repo name typo'd, missing the "n").
- `choreops-templates-hand-vendored.md` — ChoreOps DOES auto-generate dashboards; entity prefix is `choreops` NOT `kc_`. Relevant to the OTHER window; confirms chores are ChoreOps-owned (why Grocy pivoted to food).
- `hardware-deployment-phase-live.md`, `pi-ssh-access-from-claude.md`, `pi-kiosk-wayland-labwc.md` — Pi context; relevant only to the deferred Tier-3.

---

## 7. Session-close verification

### 2026-08-10 session 2 (plan execution)

- **78 tests / 11 files passing; typecheck 0 errors; build clean; all 3 emitted local imports carry `.js`** (the blank-card regression guard) — all re-run at close.
- **Tasks 1–8 committed; Task 9 NOT run** (Docker down — `docker info` fails).
- **Outer checkout verified clean and still on `feat/choreops-chores`** — worktree isolation held all session.
- **⚠️ Reported honestly: S2 does NOT work on-screen yet** because of §4.0, despite every gate being green. That gap is exactly what the plan warned about — a green suite over a config no test exercises.

### 2026-08-10 session 1 (docs only, no code)

Every claim below was run at close, not carried forward:

- **HEAD** `928b048` + its fix-up commit; **branch** `feat/grocy-chores`; **ahead of main 75** — `git`-verified.
- **Plan reviewed and one real defect fixed (`91e1365`).** Task 3's `roundAmount` was drafted returning `unknown`, which is unassignable to `IngredientRow.amount` (`number | string`) under `strict: true` — it would have failed the build at TS2322. Both forms were compiled against the project to confirm. **Runtime behavior was identical, so no test could have caught it**; Task 3 Step 4 now runs typecheck as an explicitly separate gate.
- **Worktree clean** (`git status --short` empty).
- **54 tests / 7 files passing; typecheck 0 errors** — re-run at close and **unchanged, because no code was touched.** The 62-test figure in the plan is a *prediction* for post-Task-3, not a current measurement.
- **Every file path cited in the plan `ls`-verified to exist** (10 paths).
- **Docker daemon confirmed DOWN** (`docker info` fails) — which is how the "container still running" claim in two inherited docs was caught and corrected.
- **Not done, deliberately: any code change.** This session amended the spec and wrote the plan. The live `"(unknown)"` defect is still shipped.
- **Self-review of the plan caught three of its own defects before commit:** an invalid TypeScript line in a test block, a wrong test-count arithmetic (66 → 62), and a missing task — the demo harness's `callService` stub returns `undefined`, so without a task for it every demo recipe would have rendered "No ingredients" and Task 9's render check would have been misleading.

### 2026-08-06 (retained)

- **HEAD** `0d3d2fd` (that refresh) + its fix-up commit; **branch** `feat/grocy-chores`; **ahead of main 43** — all `git`-verified.
- **Worktree clean** (`git status --short` empty).
- **54 tests / 7 files**; **typecheck 0 errors**; **build emits 4 files** — all re-run at close.
- **Every emitted local import carries `.js`** — `grep 'from "./shared' dist/*.js` across all three cards. This is the Slice-1 blank-card regression guard.
- **All three cards browser-verified** over `http://localhost:8778`, 0 console errors / 0 failed requests.
- **Other window still on `feat/choreops-chores`** and clean — worktree isolation held across the entire session.
- **Docker still down** (`docker info` fails; CLI present at `/usr/local/bin/docker`) — both Tier-2 tasks remain blocked.
- **S2 spec and plan now EXIST** — `docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md` and `docs/superpowers/plans/2026-08-05-grocy-food-slice2.md`, both `ls`-verified. (Superseding the prior note that the spec was gated on approval — approval was given 2026-08-05.)
- **Final whole-slice review: 0 findings at any severity.** Spec coverage complete; all four fix cycles left the code internally consistent.
- **Not executed: S1 Task 10, S1 Task 11, S2 Task 9** — the two Task-10/9 items are Docker-blocked; Task 11 is deferred by choice (§5).

### Process note — subagent-driven-development earned its cost on S2
Four of the eight tasks required post-review fixes, and **all four were real defects that the implementer's own self-review had passed**: literal `"Infinity"` rendering, silent prose deletion between bare `<`/`>`, phantom ingredient rows, and a keyboard dead-end with no escape. Each was caught by an independent reviewer probing adversarially rather than reading the code, and each was verified by the controller before dispatching a fix. On a slice this small, per-task review found roughly one real defect per two tasks.
