# KitchenCOM — Session State / Cold-Open: Screensaver Rendering Shipped (PR open) + Next-Steps Plan

**Date:** 2026-06-08
**This file is the cold-open briefing.** A fresh session (or a concurrent worktree) should read this end-to-end before doing anything.

---

## 0. WHERE THINGS STAND (read first)

- **`main` HEAD = `46904be`** ("Add screensaver render plan…"). `main` has NOT advanced for the screensaver *implementation* — that's on a branch in an open PR.
- **Open PR #1:** `feat/screensaver-rendering` → `main` — the screensaver card rendering slice (idle-fade overlay, Ken-Burns photo loop, fallback, media_source browse→resolve). **OPEN, not merged.** URL: https://github.com/NewLexicon/KitcheCom/pull/1 . Branch HEAD `a753544`, 15 commits, all reviewed, 33 tests green, manually browser-verified.
- **Worktree still live:** `.worktrees/screensaver-rendering` (branch `feat/screensaver-rendering`) — kept open while the PR is reviewed.
- **Remote:** `origin` = `git@github.com:NewLexicon/KitcheCom.git` (SSH, NewLexicon). Repo name is `KitcheCom` (typo — missing the "n"; see memory `kitchencom-github-remote.md`).
- **Empirical state of the screensaver branch (verified):** `npm run typecheck` 0; `npm test` 33 passed; `npm run build` emits `dist/screensaver-card.js`; `yamllint homeassistant/` 0; live browser check passed (overlay renders, photo decodes w/ Ken-Burns, clock ticks, idle toggle off→on cleanly restarts).

## 1. ⚠️ CONCURRENT-WORKTREE CONFLICT MAP (the load-bearing section)

The user wants to open ANOTHER worktree to build a next slice **concurrently with the open screensaver PR**. A new branch off `main` will NOT contain the screensaver component (it's only on the PR branch). **Conflict risk = does the next slice edit a file the screensaver PR also changed?**

Files the screensaver PR (`feat/screensaver-rendering`) touches — AVOID editing these in a concurrent branch:
- `custom_cards/screensaver-card/src/screensaver-card.ts` (heavily — pure fns + Lit component)
- `custom_cards/screensaver-card/test/*` (added test files)
- `custom_cards/screensaver-card/tsconfig.json`, `tsconfig.test.json`, `package.json`, `demo/`
- `homeassistant/dashboards/kitchen.yaml` (added the `custom:screensaver-card` entry)
- `.gitignore` (the `.claude-flow/` depth fix — minor, low conflict risk)

Files the screensaver PR does NOT touch — SAFE to build concurrently:
- `homeassistant/packages/voice.yaml` (does not exist yet — voice slice would CREATE it)
- A NEW `custom_components/` dir (calendar intent_script lives in config/packages, not here)
- `homeassistant/packages/calendar.yaml` or intent_script package (new file)
- `deploy/` (mostly — INSTALL.md is shared; coordinate if both edit it)

**Recommended concurrent slice (lowest conflict): the Voice Pipeline config slice** — it creates NEW files (`packages/voice.yaml`, Assist config) and does not touch `screensaver-card.ts` or `kitchen.yaml`. See §2.

**AVOID concurrently:** any slice that edits `kitchen.yaml` (dashboard) or `screensaver-card.ts` — wait for PR #1 to merge first, OR rebase onto the PR branch instead of `main`.

## 2. NEXT-STEPS PLAN (candidate slices, each its own spec→plan→build cycle)

Ordered by a mix of value and concurrent-safety. Each is independent; pick per priority + the conflict map above.

### A. Voice Pipeline config slice  ⭐ BEST concurrent pick
- **What:** Wire HA Assist per design spec §3 — the verified TWO-call pipeline (Gemini STT → conversation w/ tools → Gemini TTS). System prompt for answer-vs-action. Expose `todo`/`calendar` entities to the Gemini conversation agent (the C-1-verified function-calling path). Mostly HA YAML config in a NEW `homeassistant/packages/voice.yaml`.
- **Conflict-safe?** YES — new file, doesn't touch screensaver files or kitchen.yaml.
- **Caveat:** hard to FULLY verify without a live HA instance + mic + Gemini API key — so this slice is "author the config + document the wiring + validate YAML," with live verification deferred to hardware. Brainstorm should scope this honestly.
- **Source basis:** parent design `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` §3 + §9 (C-1 function-calling chain verified in `reference/core-dev`).

### B. Calendar-by-voice (C-4) intent_script slice
- **What:** A custom `intent_script` (HA config/YAML) for calendar event creation. Calendar has NO built-in add intent — only `CREATE_EVENT_SERVICE` (`reference/core-dev/homeassistant/components/calendar/__init__.py:224`). New package file.
- **Conflict-safe?** YES if it's a new `packages/calendar.yaml` / intent_script file. Mild dependency on the voice slice conceptually (the intent is invoked by voice), but the config is independent.
- **Note:** first slice likely to need real HA intent_script wiring; still config, not `custom_components/` Python (per the zero-custom-Python boundary unless proven necessary).

### C. Screensaver follow-ups (AFTER PR #1 merges)
- Deferred from the rendering slice (do NOT start concurrently — they edit screensaver-card.ts):
  - Shuffle/randomization, nested-album recursion, per-type durations, configurable Ken-Burns intensity, cloud (`google_photos`) source, in-card upload UI.
  - The `selectDisplayMode` query-string-stripping deferred note (only matters if media_source URLs with query strings get wired in).

### D. Hardware deployment (BLOCKED on Pi 5 arrival)
- Follow `deploy/INSTALL.md` Phases A–E. Hardware-phase TODOs: M-12 kiosk auth, M-10 touch→`input_button.kitchen_activity` bridge, M-8 Pi-5 codec validation, Bookworm `chromium` binary, boot-to-desktop autologin, repoint kiosk `HA_URL` to live dashboard, register `/local/screensaver-card.js` resource, replace placeholder entity ids, confirm `local_todo` canonical + Google Tasks mirror (M-2).

## 3. HOW TO START A CONCURRENT WORKTREE (mechanics)

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM            # main checkout
git worktree add .worktrees/<slice-name> -b feat/<slice-name>   # branches off main HEAD 46904be
# .worktrees/ is gitignored; .claude-flow/ gitignored at any depth.
# In the new worktree, follow the standard flow: brainstorm → writing-plans → subagent-driven-development → finishing-a-development-branch.
```
- **Branch off `main`** for conflict-safe slices (A, B).
- If a slice MUST touch screensaver files, branch off `feat/screensaver-rendering` instead (or wait for merge).
- Each worktree gets its own `npm install` in `custom_cards/screensaver-card/` if it runs card tests (node_modules is gitignored, not shared).

## 4. PROCESS DISCIPLINE THAT'S BEEN WORKING (keep doing)

- Every creative slice: **brainstorm (with reviewer-pass per section) → spec (+ spec-review loop) → writing-plans (+ plan-review loop) → subagent-driven-development (fresh subagent per task, two-stage spec+quality review, fold findings) → finishing-a-development-branch.**
- **Source-verify load-bearing claims against `reference/core-dev`** rather than memory — this caught C-2/C-3/C-4 (design) and 2 concurrency bugs + I-7 (implementation). It keeps earning its keep.
- **Review-depth calibration:** trivial/declarative tasks get one proportional review; real-logic/code-ship tasks get full two-stage; load-bearing fixes (e.g. concurrency) get a re-review after the fold.
- TDD for all pure functions; thin glue verified by a manual/browser check (decision A) when DOM testing isn't worth the deps.

## 5. KEY ARTIFACTS (absolute paths)

- Parent design spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md`
- Screensaver design spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-06-08-screensaver-card-rendering-design.md`
- Screensaver plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-08-screensaver-card-rendering.md`
- Foundation cold-open (project-wide state): `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-06-07-ha-pivot-architecture-locked.md`
- Reference HA source (gitignored, on disk at MAIN checkout only): `/Users/jdehart1/___Code_DEV/KitchenCOM/reference/core-dev/` and `reference/frontend-dev/`
- Memory: `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/` (see `kitchencom-github-remote.md`)
