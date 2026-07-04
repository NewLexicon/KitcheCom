# Cold-open handoff — Grocy Food-Ops (S1 ready to execute; S2 UX design presented)

**Date:** 2026-07-02 (last refreshed 2026-07-04)
**Branch:** `feat/grocy-chores` (in the worktree `.worktrees/grocy-chores`)
**Status (two parallel threads):**
1. **S1 (meal-plan + shopping cards):** design + plan complete and committed. **Execution NOT started** — paused for the user's HA auto-restart + ChoreOps work in another window + Docker being down (Tier-2 gate). Resume by executing the plan from Task 1.
2. **S2 (recipe card):** architecture de-risked (roadmap §8) + **UX design fully presented, awaiting user approval** — NO spec written yet (brainstorming HARD-GATE). Resume by getting design approval, then writing the spec. See §8 of this handoff for the locked decisions.

**The immediate next action depends on what the user wants:** execute S1 (Task 1 = `git mv` scaffold rename) OR approve the S2 UX design so its spec can be written. Both are teed up; neither is blocked on the other except that S2 impl must not start until S1 executes.

> This is a feature-branch handoff, not the project-wide cold-open. The formal `docs/session-state/README.md` cold-open describes main; this file covers the `feat/grocy-chores` work-arc. Post-merge, rewrite the project cold-open from main's perspective.

---

## 1. Where is HEAD?

- **HEAD:** `42aa689` — `docs: cold-open — S2 UX design presented, awaiting approval` (this handoff refresh will land a fix-up on top)
- **Branch:** `feat/grocy-chores`, in worktree `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores`
- **Ahead of main:** 13 commits (14 after this refresh's fix-up). Worktree clean.
- **Recent arc (newest first):**
  - `42aa689` — cold-open: S2 UX design presented, awaiting approval
  - `d60c8e2` — cold-open: S2 UX brainstorm paused at touch fork
  - `1e69370` — cold-open refresh: S2 groundwork + HEAD fix-up
  - `af31ed5` — S2 recipe-repository pre-brainstorm groundwork (roadmap §8)
  - `7da1ce7` — cold-start sanity-check fix-ups
  - `972f9cc` — cold-open handoff (this file, created)
  - `6301e5a` — Slice 1 implementation plan
  - `ca9ae54` — Slice 1 design spec
  - `c4f7944` — food-ops roadmap (umbrella)
  - `8c559d7` — (prior) Pi hardware bring-up handoff

**⚠️ Concurrent-session hazard (memory: `concurrent-sessions-branch-hazard.md`):** the OTHER window shares the SAME repo's main checkout, currently on `feat/choreops-chores`. This Slice 1 work is isolated in the WORKTREE on `feat/grocy-chores`. **Before ANY commit, run `git branch --show-current` and confirm it says `feat/grocy-chores`.** Every task command in the plan `cd`s into the worktree — stay there.

---

## 2. Empirical state (verified 2026-07-02)

- **Tier-1 tests:** NONE exist yet. The card scaffold (`custom_cards/grocy-chores-card/`) is **config-only** — `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `package-lock.json`. No `src/`, `test/`, or `demo/`. `node_modules/` IS installed. (Task 1 renames the dir to `grocy-food-card/`; Tasks 3–5 create the first tests.)
- **Typecheck/build:** nothing to check yet (no `src/`).
- **Docker:** NOT running on the Mac at session time; old `grocy-eval` container state unknown. **This gates all of Tier-2 (Task 10).**
- **No known-benign drift.** Clean tree, clean baseline.

---

## 3. What just shipped and why (this session)

The user pivoted Grocy's role. **Chores moved to ChoreOps** (separate HACS integration, the other window's work). Grocy now owns the **food domain**. Three docs were produced through a full brainstorming → writing-plans cycle, with the user acting as reviewer across three review rounds (all catches folded):

1. **Roadmap** (`c4f7944`) — 6-slice food-ops program. **Two hard walls, source-verified:** (a) no retailer permits programmatic ORDER SUBMISSION — Kroger builds a cart via `PUT /v1/cart/add` but you tap "place order" yourself; (b) **Amazon is out** — no official cart API, AI-agent-policy blocks bots. **Kroger only.**
2. **Slice 1 spec** (`ca9ae54`) — meal-plan (read-only) + shopping-list (check-off) cards.
3. **Slice 1 plan** (`6301e5a`) — 11 tasks, 5 chunks.

**Discipline-rule firings this session:** source-verification (read the grocy integration + pygrocy + Kroger/Amazon APIs before locking design — caught "no `todo` platform", "meal-plan `type` is an open set", "no order-submission on any retailer"); receiving-code-review (3 rounds, verified-before-accepting, no performative agreement); the preserve-then-point fix (Task 9 authors compose/INSTALL self-contained rather than pointing into the superseded chores spec).

---

## 4. The next move (literal first action)

**Execute the Slice 1 plan, starting at Task 1.** Recommended sub-skill: `superpowers:subagent-driven-development` (fresh subagent per task, review between). The user chose to defer execution to a dedicated session.

**Read first (absolute paths):**
- Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/plans/2026-07-02-grocy-food-slice1.md`
- Slice 1 spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-food-slice1-design.md`
- Roadmap: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/docs/superpowers/specs/2026-07-02-grocy-food-ops-roadmap.md`
- Proven card pattern to mirror: `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores/custom_cards/screensaver-card/src/screensaver-card.ts` (registration footer at :347; `HassLike` type at :11)

**Task 1 is `git mv custom_cards/grocy-chores-card → custom_cards/grocy-food-card` — it MUST be first; every later path depends on `grocy-food-card/` existing.**

**Mandatory pre-flight:** confirm `git branch --show-current` == `feat/grocy-chores` before the first commit (§1 hazard).

**Executable now (no Docker):** Tasks 1–9 (scaffold rename, provisional fixtures, all Tier-1 TDD, both Lit cards, demo, deploy-doc authoring) + Task 11 (supersession/dashboard/boundary). **Blocked until Docker up:** Task 10 (Tier-2 live round-trip).

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
- **Latent-until-Task-10:** the dashboard swap in Task 11 hardcodes `shopping_list_id: "1"` with a comment to confirm at Tier-2. If OQ-3 resolves to a different source, fix the dashboard too.
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

## 7. Session-close verification (done before reporting)

- HEAD SHA (`972f9cc` after the fix-up commit), branch (`feat/grocy-chores`), ahead-count (8) — all `git`-verified.
- Tier-1 baseline (no tests yet, scaffold config-only) — `ls`-verified.
- All four "read first" absolute paths exist (roadmap, spec, plan committed this session; screensaver-card pre-existing).
- Docker-not-running — verified (`docker ps` failed, no daemon).
