# KitchenCOM — Cold-Open: Screensaver Rendering MERGED, main clean, next slice open

**Date:** 2026-06-08 (session "KitchenCOM 2")
**This file is the cold-open briefing.** A fresh session reads this end-to-end before doing anything. It supersedes `2026-06-08-screensaver-rendering-shipped-handoff.md` (that doc described the PR while it was *open*; the PR is now merged).

---

## 0. WHERE THINGS STAND (read first)

- **`main` HEAD = `45f38c5`** (this cold-open doc). Local `main` and `origin/main` are in sync after the final push (0 ahead / 0 behind).
- **Commit arc since last session:**
  - `1bad1eb` — **merge commit of PR #1** (`feat/screensaver-rendering` → `main`): the full screensaver card rendering slice (idle-fade overlay, Ken-Burns photo loop, fallback, media_source browse→resolve). 15 commits, +416/-7 across 11 files.
  - `dc3b9e7` — post-merge hygiene: gitignore `.playwright-mcp/` scratch dir.
  - `45f38c5` — this cold-open doc (HEAD line points here per the self-referential fix-up rule).
- **PR #1 is MERGED** (mergedAt 2026-06-08T13:40:32Z). Remote branch `feat/screensaver-rendering` DELETED. URL: https://github.com/NewLexicon/KitcheCom/pull/1
- **No open PRs. No other branches** (local or remote) — only `main`. **One worktree** (the main checkout). Two stale empty pre-created branches (`feat/voice-pipeline`, `feat/calendar-intent`) were found and deleted this session; don't be surprised they're gone.
- **Remote:** `origin` = `git@github.com:NewLexicon/KitcheCom.git` (SSH, NewLexicon). Repo name is `KitcheCom` (typo — missing the "n"; memory `kitchencom-github-remote.md`).

## 1. EMPIRICAL STATE (verified this session, on `main` at `dc3b9e7`)

Run from `/Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card/` (node_modules present on main):
- `npm run typecheck` → 0 errors (tsc --noEmit -p tsconfig.test.json)
- `npm test` → **7 test files, 33 tests passed** (vitest)
- `npm run build` → emits `dist/screensaver-card.js` (10 KB)
- `yamllint homeassistant/` → not run this session (`yamllint` not on PATH in this shell; was clean in the merged PR's prior session). Known-benign drift, not a regression.

## 2. WHAT JUST SHIPPED & WHY (this session)

The user chose **"merge PR #1 first"** over the cold-open's recommended concurrent-build strategy. Rationale: merging unblocks screensaver follow-ups (slice C) and removes the conflict-map complexity entirely — every future slice now branches off a `main` that already contains the screensaver code, so the whole concurrent-worktree conflict apparatus is moot.

Actions taken, in order:
1. Verified PR #1 merged cleanly into current `main` (merge-tree: no textual conflicts; only commit main had beyond the PR was the cold-open doc itself).
2. Ran full verification on the PR branch (typecheck 0, 33 tests, build OK) — did NOT trust the handoff's claim.
3. `gh pr merge 1 --merge --delete-branch` — merge succeeded; remote branch deleted; local-branch delete failed (worktree held it) and was cleaned up manually.
4. Fast-forwarded local `main`, removed `.worktrees/screensaver-rendering`, deleted merged local branch.
5. Cleaned up 2 stale empty worktree-branches (`voice-pipeline`, `calendar-intent`) the prior session had pre-created but never built in.
6. Deleted stray session debris (`screensaver-active.png`, `.playwright-mcp/`); gitignored `.playwright-mcp/`; committed + pushed.

No discipline-rule firings of note — this was a merge+cleanup session, not a creative slice. Verification-before-completion was honored (ran the suite before asserting mergeable).

## 3. NEXT MOVE (literal first action for the next session)

The next session starts a **new creative slice off `main` at `dc3b9e7`**. The conflict map is GONE — main has the screensaver code, so any new branch off main is safe. Candidate slices (each its own brainstorm → spec → plan → subagent-driven-development → finish cycle):

- **A. Voice Pipeline config** (still the highest-value next pick). Wire HA Assist per design spec §3: the verified TWO-call pipeline (Gemini STT → conversation w/ tools → Gemini TTS), answer-vs-action system prompt, expose `todo`/`calendar` entities to the Gemini conversation agent (C-1-verified function-calling path). Mostly new HA YAML in `homeassistant/packages/voice.yaml`. **Caveat:** can't be fully verified without live HA + mic + Gemini API key — scope it honestly as "author config + validate YAML," live verification deferred to hardware. Source: parent design `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` §3 + §9.
- **B. Calendar-by-voice (C-4) intent_script.** New `intent_script` package (HA config/YAML) for calendar event creation. Calendar has NO built-in add intent — only `CREATE_EVENT_SERVICE` (cite verified prior session at `reference/core-dev/homeassistant/components/calendar/__init__.py:224`). New package file. Mild conceptual dependency on the voice slice.
- **C. Screensaver follow-ups (NOW UNBLOCKED by the merge).** Deferred knobs: shuffle/randomization, nested-album recursion, per-type durations, configurable Ken-Burns intensity, cloud (`google_photos`) source, in-card upload UI. Plus the `selectDisplayMode` query-string-stripping deferred note. These edit `custom_cards/screensaver-card/src/screensaver-card.ts` — fine now that it's on main.
- **D. Hardware deployment (BLOCKED on Pi 5 arrival).** `deploy/INSTALL.md` Phases A–E. Hardware TODOs: M-12 kiosk auth, M-10 touch→`input_button.kitchen_activity` bridge, M-8 Pi-5 codec validation, Bookworm chromium binary, boot-to-desktop autologin, repoint kiosk HA_URL, register `/local/screensaver-card.js` resource, replace placeholder entity ids, confirm `local_todo` canonical + Google Tasks mirror (M-2).

**First action:** ask the user which slice (A/B/C), then `git worktree add .worktrees/<slice> -b feat/<slice>` off main (or just work on main for a small slice), then **brainstorm** (process discipline — do not skip).

## 4. CARRY-FORWARDS / LATENT ITEMS

- **`yamllint` not on PATH** in the default shell — if a slice touches HA YAML, install/locate it (prior sessions had it via a venv) before claiming YAML is clean. Mitigation: HA itself validates config on load.
- **Hardware-phase TODOs (slice D)** are all blocked on Pi 5 hardware; tracked in `deploy/INSTALL.md`.
- **Zero-custom-Python boundary** still holds: prefer HA config/YAML over `custom_components/` Python unless proven necessary (slice B's intent_script is config, not Python).

## 5. PROCESS DISCIPLINE THAT'S BEEN WORKING (keep doing)

- Every creative slice: **brainstorm (reviewer-pass per section) → spec (+ review loop) → writing-plans (+ review loop) → subagent-driven-development (fresh subagent per task, two-stage spec+quality review, fold findings) → finishing-a-development-branch.**
- **Source-verify load-bearing claims against `reference/core-dev`** rather than memory — caught C-2/C-3/C-4 (design) + concurrency bugs (impl).
- **Review-depth calibration** (per global CLAUDE.md): trivial tasks one proportional review; code-ship tasks full two-stage; load-bearing fixes re-reviewed after fold.
- TDD for pure functions; thin glue verified by manual/browser check when DOM testing isn't worth the deps.

## 6. KEY ARTIFACTS (absolute paths)

- Parent design spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md`
- Screensaver design spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-06-08-screensaver-card-rendering-design.md`
- Screensaver plan (now built+merged): `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-08-screensaver-card-rendering.md`
- Foundation cold-open (project-wide architecture): `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-06-07-ha-pivot-architecture-locked.md`
- Prior (now-superseded) handoff: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-06-08-screensaver-rendering-shipped-handoff.md`
- Reference HA source (gitignored, on disk at MAIN checkout only): `/Users/jdehart1/___Code_DEV/KitchenCOM/reference/core-dev/` and `reference/frontend-dev/`
- Memory dir: `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/` — relevant entry: `kitchencom-github-remote.md` (origin is `NewLexicon/KitcheCom.git`, repo-name typo).
