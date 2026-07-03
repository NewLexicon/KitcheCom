# Cold-open handoff — Grocy Food-Ops Slice 1 ready to execute

**Date:** 2026-07-02
**Branch:** `feat/grocy-chores` (in the worktree `.worktrees/grocy-chores`)
**Status:** Design + plan complete and committed. **Execution NOT started.** Paused deliberately — the user is doing HA auto-restart + ChoreOps work in another window; Slice 1 execution resumes when that's done.

> This is a feature-branch handoff, not the project-wide cold-open. The formal `docs/session-state/README.md` cold-open describes main; this file covers the `feat/grocy-chores` work-arc. Post-merge, rewrite the project cold-open from main's perspective.

---

## 1. Where is HEAD?

- **HEAD:** `6301e5a` — `docs(plan): Grocy food-ops Slice 1 implementation plan`
- **Branch:** `feat/grocy-chores`, in worktree `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores`
- **Ahead of main:** 7 commits. Worktree clean (no uncommitted changes).
- **Recent arc (this session added the top 3):**
  - `6301e5a` — Slice 1 implementation plan
  - `ca9ae54` — Slice 1 design spec
  - `c4f7944` — food-ops roadmap (umbrella)
  - `8c559d7` — (prior) Pi hardware bring-up handoff
  - `7aae13f` — (prior) scaffold `grocy-chores-card` package

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

- HEAD SHA (`6301e5a`), branch (`feat/grocy-chores`), ahead-count (7) — all `git`-verified above.
- Tier-1 baseline (no tests yet, scaffold config-only) — `ls`-verified.
- All four "read first" absolute paths exist (roadmap, spec, plan committed this session; screensaver-card pre-existing).
- Docker-not-running — verified (`docker ps` failed, no daemon).
