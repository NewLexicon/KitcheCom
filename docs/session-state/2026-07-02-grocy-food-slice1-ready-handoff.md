# Cold-open handoff — Grocy Food-Ops (S1 + S2 offline work COMPLETE; both blocked on the same Docker gate)

**Date:** 2026-07-02 (last refreshed **2026-08-06**)
**Branch:** `feat/grocy-chores` (in the worktree `.worktrees/grocy-chores`)
**Status (two threads, both now at the same gate):**
1. **S1 (meal-plan + shopping cards): Tasks 1–9 shipped 2026-08-05.** Both cards build and render (browser-verified). **Task 10 (Tier-2) BLOCKED on Docker. Task 11 deliberately DEFERRED** (§5).
2. **S2 (recipe card): design approved + spec + plan + Tasks 1–8 ALL SHIPPED 2026-08-06.** The month-old brainstorming gate was cleared by user approval; spec written and reviewer-folded, 9-task plan written, then Tasks 1–8 executed under subagent-driven-development. **54 tests green, typecheck clean, browser-verified. Task 9 (Tier-2) BLOCKED on the same Docker gate.**

**The immediate next action: start Docker and run ONE joint Tier-2 session** covering S1 Task 10 + S2 Task 9 together (§4). Standing up Grocy once resolves all seven open questions — S1's OQ-1/2/3 and S2's OQ-S2-1..4. **Do not schedule them separately; the stand-up cost would be paid twice for no benefit.**

**Nothing meaningful is left to do offline on this branch.** Both slices' non-Docker work is complete.

> This is a feature-branch handoff, not the project-wide cold-open. The formal `docs/session-state/README.md` cold-open describes main; this file covers the `feat/grocy-chores` work-arc. Post-merge, rewrite the project cold-open from main's perspective.

---

## 1. Where is HEAD?

- **HEAD:** `0d3d2fd` — `docs: refresh handoff — S2 Tasks 1-8 shipped` (this file) **+ this refresh's fix-up commit on top.** Last code commit was `1bd9230` (S2 Task 8).
- **Branch:** `feat/grocy-chores`, in worktree `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores`
- **Ahead of main:** **43** commits. Worktree clean.

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

## 2. Empirical state (verified 2026-08-06)

Package is `custom_cards/grocy-food-card/`. All commands below run from that directory.

- **Tier-1 tests: 54 passing across 7 files** (`npx vitest run`) — S1: `shopping-parse` (6), `mealplan-parse` (7), `checkoff` (3). S2: `scale-ingredients` (12), `strip-tags` (11), `recipe-parse` (7), `ingredient-parse` (8).
- **Typecheck: clean** (`npm run typecheck` → 0 errors).
- **Build: clean** — emits `dist/shared.js`, `dist/mealplan-card.js`, `dist/shopping-card.js`, `dist/recipe-card.js`.
- **All three cards browser-verified** (2026-08-06), 0 console errors / 0 failed requests. Recipe card specifics: LIST shows 2 real-`<button>` tiles with placeholder thumbs; DETAIL shows `2.25 lb Ground beef` and `18 Tortillas` (correct ×1.5 scaling from base 4 → desired 6), `Salt` with a blank quantity (the documented `"a pinch"` limitation), and two-line instructions with computed `white-space: pre-line`. **Keyboard fully works**: tile focuses → Enter and Space open DETAIL; back focuses → Enter returns to LIST.

### ⚠️ S2's four accepted v1 limitations (documented, NOT defects)
1. A **string amount** (`"a pinch"`) renders as a **blank quantity** with the name intact. `scaleIngredients` passes it through; `formatAmount` blanks it.
2. **Extreme overflow** falls back to the original unscaled amount. (Correction to an earlier note: the fix removed literal `"Infinity"`; scientific-notation rendering of huge finite numbers is inherited, untouched S1 `formatAmount` behavior.)
3. **Unmapped HTML entities** (`&frac12;`, numeric `&#8212;`) pass through literally. `decodeEntities` is a small fixed map by design, not a general decoder.
4. **Ingredients render empty** until OQ-S2-3 is settled and a second `rest` entry is added.
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

**Start Docker Desktop, then run ONE joint Tier-2 session covering S1 Task 10 AND S2 Task 9.** One Grocy stand-up resolves all seven open questions across both slices. Doing them separately pays the stand-up cost twice.

- **S1 Task 10** — plan `docs/superpowers/plans/2026-07-02-grocy-food-slice1.md`, lines 663-692. Resolves OQ-1 (sensor field shapes), OQ-2 (check-off entry id), OQ-3 (shopping-list id).
- **S2 Task 9** — plan `docs/superpowers/plans/2026-08-05-grocy-food-slice2.md`, Chunk 6. Resolves OQ-S2-1 (measure the payload → confirm Option A vs B), OQ-S2-2 (recipe field shapes), OQ-S2-3 (**where the ingredient join happens** — the one with a design-level fallback), OQ-S2-4 (is `description` really HTML).
- **Author test recipes covering:** one with a picture, one without, one with fractional amounts, and instructions entered as a **numbered list** so the `<ol><li>` path is exercised against real editor output.

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

**If Docker is unavailable:** there is no meaningful offline work left on this branch. S2 needs the user's design approval (§4 S2 block below), not code.

**S2 (recipe repository) is pre-de-risked** — roadmap §8 (`docs/superpowers/specs/2026-07-02-grocy-food-ops-roadmap.md`) holds source-verified groundwork: the HA integration has NO recipe sensor, so S2 proxies Grocy REST through HA (Option A rest-sensor mirrors the S1 card shape, or Option B response-returning rest_command — A-vs-B is OQ-S2-1, resolved at S2 impl by measuring live payload size). The S2 spec brainstorm (recipe-card UX) still needs the user in the loop; do NOT write the S2 spec without them. Don't start S2 until S1 executes.

**S2 UX brainstorm — DESIGN PRESENTED, awaiting user approval (2026-07-02).** The full UX design has been laid out (5 sections) and is waiting on the user's OK before the spec is written. NO SPEC WRITTEN YET (brainstorming HARD-GATE). **Decisions locked from the brainstorm:**
- **Touch:** screen IS touch-capable; touch temporarily cable-blocked → **touch-first design, degrade gracefully** to a usable no-touch view for now.
- **Purpose:** BOTH — browse-list → tap → cook-reference detail (full recipe experience).
- **Two views:** LIST = recipe grid, handles BOTH picture-forward (`picture_file_name` present) and text fallback (absent). DETAIL = picture + name + servings + scaled ingredients + instructions (from recipe `description` field).
- **Ingredients:** SCALED to servings = `recipes_pos.amount × (desired_servings / base_servings)`, v1 uses recipe's `desired_servings`. This is the one real **pure function** (Tier-1 TDD target). Adjustable servings (touch +/−) deferred (YAGNI).
- **Fields:** handle-both picture/text (resolved on best-judgment while user away — robust default, not a preference guess; picture-emphasis is an impl observation vs live data).
- **Testing:** same 3 tiers as S1.

**New source-finding this session:** pygrocy has NO recipe-ingredient model → `recipes_pos` is raw Grocy REST (`product_id` + `qu_id` + `amount` as IDs, NOT names). So the HA-proxy layer likely fetches + **joins** recipes/recipes_pos/products/quantity_units, OR uses `/recipes/{id}/fulfillment` if it pre-resolves. That join = **OQ-S2-2**, confirmed at impl. Pictures via `<img src=/api/files/recipepictures/...>` (not CORS-gated).

**Resume:** re-present the 5-section design (or read it from this handoff), get user approval, then write spec to `docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md`, self-review, spec-review gate, writing-plans. Task tracker: #9 done (queue complete); #10 = present-design/write-spec (in progress). Do NOT start S2 impl until S1 executes.

---

## 5. Carry-forwards (deferred gates / latent risks)

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

## 7. Session-close verification (re-verified 2026-08-06)

Every number below was re-run at session close, not carried forward:

- **HEAD** `0d3d2fd` (this refresh) + its fix-up commit; **branch** `feat/grocy-chores`; **ahead of main 43** — all `git`-verified.
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
