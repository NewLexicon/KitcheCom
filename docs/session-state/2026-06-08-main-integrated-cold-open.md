# KitchenCOM — Cold-Open: main integrated (PRs #1/#2/#3 merged) + grocy-chores in-flight

**Date:** 2026-06-08
**This is the current cold-open.** Supersedes `2026-06-08-screensaver-merged-cold-open.md`, `2026-06-08-screensaver-rendering-shipped-handoff.md`, and `2026-06-08-screensaver-followups-execution-handoff.md` (all describe earlier, now-merged states). Read this end-to-end before acting.

---

## 0. WHERE THINGS STAND

- **`main` HEAD = `ab12294`** ("Merge pull request #3…"). Local `main` = `origin/main` (0/0 synced). Clean tree.
- **THREE slices merged to main:**
  - PR #1 — Screensaver card rendering (idle overlay, Ken-Burns photo loop, fallback, media_source browse→resolve).
  - PR #2 (`7f93e3e`) — Calendar-by-voice intent_script (C-4): `homeassistant/packages/calendar.yaml` + `.calendar-verify.py` + `deploy/CALENDAR_VOICE.md`.
  - PR #3 (`ab12294`) — Screensaver follow-ups: query-fix + shuffle-bag + nested-album recursion + Ken-Burns intensity knob.
- **No open PRs.** Both #2/#3 feature branches deleted (local+remote).
- **Empirical (verified on merged main):** from `custom_cards/screensaver-card/`: `npm run typecheck` 0; `npm test` **50 passed**; `npm run build` emits `dist/`. `python3 -m yamllint -c .yamllint homeassistant/` exit 0. `python3 homeassistant/packages/.calendar-verify.py` → OK.

## 1. ⚠️ ACTIVE IN-FLIGHT BRANCH — `feat/grocy-chores` (another session)

**A concurrent session is actively building a Grocy-chores slice.** `main` is NOT the whole story.

- **Branch `feat/grocy-chores`:** 3 commits ahead of `main`, 0 behind — **rebased directly onto current main `ab12294`** (verified: merge-base == main HEAD). Commits: `a2c00cd` spec → `67e8540` plan → `7aae13f` Task-1 scaffold.
- **Worktree:** `.worktrees/grocy-chores` (dedicated, to avoid the shared-checkout collision hazard — see §4).
- **Status:** Task 1 (scaffold `custom_cards/grocy-chores-card/`) DONE. **Tasks 2–11 PENDING.** Stuck on Task 2 (capture real `sensor.grocy_chores` field shape) — the eval Grocy container was empty; being recreated with `GROCY_MODE=demo`; that recreate is blocked by the destructive-command guard, awaiting a manual user run.
- **The architectural pivot (project-level, decided with the user):** adopt **Grocy as KitchenCOM's household-ops backend** (chores now; stock/recipes/shopping/meals later — one shared data model). Grocy runs as a **headless Docker service**; its native UI is NOT shown on the kitchen screen (user liked the function, rejected the CSS). KitchenCOM presents Grocy data via **HA custom cards in the existing theme**. Chores = slice 1 (cheapest domain to prove the pipeline).
- **This relaxes the parent spec's §6b "zero custom Python" boundary:** the **Grocy HACS integration is third-party Python**, installed at runtime via HACS. Repo `custom_components/` stays empty. Deliberate, user-approved.
- **Source-verified facts (from their spec, worth knowing):** chores surface as ONE `sensor.grocy_chores` count-sensor with a `chores[]` attribute array (NOT per-chore entities) → a custom card is required; `execute_chore` needs `chore_id` + `done_by`; Grocy config-flow port is **9283** (not the integration's 9192 default).
- **Local side-effect:** a Grocy Docker container (`grocy`, port 9283) + Docker Desktop are now installed on this Mac (admin-installed this session) — the disposable eval/Tier-2 instance.

**DO NOT** start competing chores/Grocy work or touch `custom_cards/grocy-chores-card/` or the grocy spec/plan — that session owns it.

## 2. WHAT'S BUILT ON MAIN (the integrated product)
- **Foundation:** `homeassistant/configuration.yaml` keystone (storage-mode lovelace + registered yaml snapshot), theme, `deploy/` (kiosk systemd unit + INSTALL.md).
- **Dashboard** `homeassistant/dashboards/kitchen.yaml` (Layout-B snapshot): clock, weather-forecast, calendar, two todo-list cards, voice button (`action: assist`), and `custom:screensaver-card`. Standard HA cards (phone-editable) + the one custom card.
- **Screensaver card** `custom_cards/screensaver-card/` (Lit/TS, 50 tests): idle-reactive overlay, media_source browse→lazy-resolve (re-resolve on expiry, I-7), Ken-Burns + crossfade, gradient+clock fallback, shuffle-bag, bounded nested recursion (depth 3 / 50 folders, generation-token-guarded), Ken-Burns intensity knob, query-string-safe.
- **Packages:** `screensaver.yaml` (idle automation), `calendar.yaml` (KitchenAddCalendarEvent intent_script).

## 3. NEXT MOVES (candidate slices, each its own brainstorm→spec→plan→subagent-driven→finish)
- **Chores/Grocy** — IN PROGRESS on `feat/grocy-chores` (don't duplicate). The Grocy pivot means future household-ops domains (stock, shopping, recipes, meal-plan) become follow-on Grocy slices.
- **Hardware deployment (BLOCKED on Pi 5 arrival)** — the largest remaining bucket; nothing Mac-verifiable. `deploy/INSTALL.md` Phases A–E + carry-forwards: M-12 kiosk auth (long-lived token vs trusted_networks), M-10 touch→`input_button.kitchen_activity` bridge, M-8 Pi-5 codec validation, Bookworm `chromium` binary, boot-to-desktop autologin, repoint kiosk HA_URL to live dashboard, register `/local/screensaver-card.js` + the grocy card resources, replace placeholder entity ids (`calendar.family`, `weather.home`, `todo.*`), confirm `local_todo` canonical + Google Tasks mirror (M-2).
- **Voice pipeline (mostly hardware/live)** — Assist STT→conversation→TTS config + the answer-vs-action system prompt; deferred because it can't be verified without live mic + Gemini API key.
- **Small v2 polish** — offline stale-data degrade (C-3 v2), shuffle no-immediate-repeat-on-reshuffle, screensaver per-type durations / google_photos source / in-card upload (all explicitly deferred).

## 4. ⚠️ CONCURRENT-SESSION HAZARD (recurring — read before any git write)
Multiple sessions share this checkout. **The shared checkout was repeatedly switched out from under the screensaver session** (found parked on `feat/grocy-chores` and on `main` at unexpected times, once right before a push). No work was lost (caught each time by verifying ground truth), but it's real. **Before EVERY commit/push: `git branch --show-current` and confirm it's the branch you intend.** The grocy session now works in a dedicated worktree (`.worktrees/grocy-chores`) to reduce this. Memory note: `concurrent-sessions-branch-hazard.md`.

## 5. PROJECT FACTS
- Remote: `git@github.com:NewLexicon/KitcheCom.git` (SSH, NewLexicon). Repo name typo'd `KitcheCom` (missing the "n") — memory `kitchencom-github-remote.md`.
- Reference HA source: `reference/core-dev/` + `reference/frontend-dev/` (gitignored; source-verify load-bearing claims against it).
- Process discipline (holding across all slices): brainstorm (reviewer-pass per section) → spec (+review loop) → writing-plans (+review loop) → subagent-driven-development (fresh subagent/task, two-stage spec+quality review, fold findings, source-verify) → finishing-a-development-branch. Review-depth calibration: trivial=1 proportional review; real-logic/code-ship=full two-stage; load-bearing fixes=re-review.
