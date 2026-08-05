# Cold-open handoff — Grocy Food-Ops (S1 Tasks 1–9 SHIPPED; Task 10 Docker-blocked; S2 UX design presented)

**Date:** 2026-07-02 (last refreshed **2026-08-05**)
**Branch:** `feat/grocy-chores` (in the worktree `.worktrees/grocy-chores`)
**Status (two parallel threads):**
1. **S1 (meal-plan + shopping cards): Tasks 1–9 EXECUTED AND COMMITTED 2026-08-05.** Both cards build and render (browser-verified); 16 Tier-1 tests green; typecheck clean; deploy wiring authored. **Task 10 (Tier-2 live round-trip) remains BLOCKED on Docker** — it is the gate that resolves OQ-1/2/3. **Task 11 deliberately DEFERRED** (its dashboard edit hardcodes an OQ-3-dependent value — see §5).
2. **S2 (recipe card):** architecture de-risked (roadmap §8) + **UX design fully presented, awaiting user approval** — NO spec written yet (brainstorming HARD-GATE). Unchanged since 2026-07-02.

**The immediate next action:** start Docker and run **Task 10** (§4). If Docker isn't available, the remaining offline work on this branch is thin — S2 needs user design approval, not code.

> This is a feature-branch handoff, not the project-wide cold-open. The formal `docs/session-state/README.md` cold-open describes main; this file covers the `feat/grocy-chores` work-arc. Post-merge, rewrite the project cold-open from main's perspective.

---

## 1. Where is HEAD?

- **HEAD:** `b6d3d06` — `docs: refresh S1 handoff — Tasks 1-9 shipped, Task 10 next (Docker-gated)` (this file) **+ this refresh's fix-up commit on top.** Last code commit was `4b07f20` (Task 9).
- **Branch:** `feat/grocy-chores`, in worktree `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores`
- **Ahead of main:** **26** commits. Worktree clean.
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

## 2. Empirical state (verified 2026-08-05)

Package is now `custom_cards/grocy-food-card/` (renamed from `grocy-chores-card` in Task 1). All commands below run from that directory.

- **Tier-1 tests: 16 passing across 3 files** (`npx vitest run`) — `shopping-parse.test.ts` (6), `mealplan-parse.test.ts` (7), `checkoff.test.ts` (3).
- **Typecheck: clean** (`npm run typecheck` → 0 errors).
- **Build: clean** (`npm run build` → emits `dist/shared.js`, `dist/mealplan-card.js`, `dist/shopping-card.js`).
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

**Start Docker Desktop, then execute Task 10 (Tier-2 live round-trip).** It is the only thing standing between this slice and "verified working," and it resolves all three OQs at once.

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

## 7. Session-close verification (re-verified 2026-08-05)

Every number below was re-run at session close, not carried forward from memory:

- **HEAD** `b6d3d06` (this refresh) + its fix-up commit; **branch** `feat/grocy-chores`; **ahead of main 26** — all `git`-verified.
- **Worktree clean** (`git status --short` empty).
- **Tier-1: 16 tests passing / 3 files** (`npx vitest run`); **typecheck 0 errors**; **build emits 3 files** — all re-run at close.
- **Demo browser-verified** over `http://localhost:8777` — 0 console errors, 0 failed requests; guard confirmed (3 ✓ buttons with list id, 0 without).
- **Other window still on `feat/choreops-chores`** and clean — worktree isolation held across the whole session.
- **Docker still down** (`docker info` fails; CLI present) — Task 10 remains blocked.
- **S2 recipe spec (`2026-07-02-grocy-recipe-card-design.md`) still does NOT exist** — `ls`-verified (correct: awaiting user approval, brainstorming HARD-GATE).
- **Task 10 + Task 11 are the only S1 tasks not executed** — 10 blocked, 11 deferred by choice (§5).
