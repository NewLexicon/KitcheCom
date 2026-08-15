# KitchenCOM — COLD-OPEN (2026-08-15): dev-rig rehearsal, JSON-import path found

**THIS IS THE CURRENT COLD-OPEN.** Read end-to-end before acting. Supersedes `2026-07-06-choreops-rewards-coldopen.md`. A fresh session resumes from THIS file + the artifacts it names by absolute path.

---

## 0. ⚠️ READ FIRST — what changed since the last cold-open

Three corrections to the 2026-07-06 doc, all verified this session:

1. **`feat/hardware-deploy` NO LONGER EXISTS.** The old §4 said to run `git show feat/hardware-deploy:homeassistant/dashboards/kitchen.yaml` before Task 9 — **that command now fails** (`fatal: bad revision`). Moot as of the merge below: the newer kitchen.yaml (`weather.forecast_home`, Groceries/Chores headings) is now **in the working tree** at `homeassistant/dashboards/kitchen.yaml`. Just edit it.
2. **✅ `main` MERGED IN 2026-08-15 — this branch is now 0 behind.** It had been 128 behind (the shopping-list + Google Calendar arc: `912b1ed` calendar, `2119d98` Grocy intval fix, head `5d877f4`). Merge commit `18d8cd0`. Both conflicts were v1.0.7-vs-v1.0.8 in the plan + spec; **resolved to 1.0.7** — what the Pi actually runs (`ccpk1/ChoreOps` tags top out at 1.0.7; the vendored 1.0.8 is an untagged snapshot HACS can't install). Old doc said `main = 0cdc0f5` — stale.
3. **The Pi is NOT required for the next phase.** A dev-HA rig runs ChoreOps locally. See §3.

**Pi state (unchanged, still true):** unreachable as of 2026-08-15. Reserved at `192.168.1.234`, gate with `ipconfig getifaddr en0` → `192.168.1.x` then `ssh kitchencom 'echo UP'`. **The 27W brick is mandatory** — a laptop dock browns it out under load (3 drops in 40min on 2026-08-05). Never power it from the ViewSonic.

## 1. WHERE HEAD IS

- **Branch `feat/choreops-chores`, HEAD = `eca19df`, 24 ahead / 0 BEHIND `origin/main`** (incl. the fix-up commit on top). Clean tree.
- This session's arc: `238599f` (prior fixup) → `88033b4` (reward-sheet rehearsal findings) → `07db4d8` (this cold-open) → `12c526f` ("3 SERVICES" resolved) → `18d8cd0` (merge `origin/main`, 128 behind → 0) → **`eca19df`** (content generator, round-trip verified).
- **Branch map (verify `git branch --show-current` before EVERY commit — concurrent-session hazard):**
  - `feat/choreops-chores` — **this checkout, active slice.**
  - `main` — checked out in worktree `.worktrees/main-merge` (= `origin/main` = `5d877f4`). **Merged into this branch 2026-08-15.**
  - `.worktrees/grocy-chores` — **detached HEAD** at `f2e561c`.
  - `feat/hardware-deploy`, `feat/audio-music` — **GONE.**

## 2. WHAT'S DONE

- **ChoreOps Tasks 1–7 DONE on the Pi.** Integration 1.0.7, HACS + button-card + auto-entities, 4 profiles (Rowan 12 + Wystan 8 gamified; Garrett + Rebecca approvers-only), **11 chores**, economy 1 pt = $0.10, parent-approve everywhere.
- **Pi baseline (2026-08-05):** 141 choreops entities · 4 users · 11 chores · 2 rewards · 1 bonus · 1 penalty · 1 badge · 1 achievement. Backup at `/config/.storage/choreops/choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5.bak-prerewards-20260805`.
- **NOTHING has been entered on the Pi since.** The 5 content entry sheets are drafted but untyped there.
- **2026-08-15 (this session): rehearsed rewards on the DEV RIG.** 5 rewards entered, mechanics proven, JSON-import path discovered. Findings folded into the reward sheet (`88033b4`).

## 3. 🆕 THE DEV-HA RIG — how to work with the Pi down

**A full ChoreOps install runs locally.** This is the main unlock.

- **Start:** open Docker Desktop, then
  `docker compose -f /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/deploy/homeassistant/docker-compose.ha-dev.yml up -d`
- **URL: `http://localhost:8124`** (8124 deliberately — never collides with the Pi's 8123).
- **Config dir:** `/Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/deploy/homeassistant/dev-config/` (gitignored).
- Has ChoreOps **1.0.8**, HACS, button-card, auto-entities, and **Rowan + Wystan** already created.
- **Verify by reading storage, never the UI:** live file is `dev-config/.storage/choreops/choreops_data_01M01GJ0HV7DPPVVFB4HV7BR3E` (siblings are `.bak-*`/`_recovery`). Entity count = grep `platform=choreops` in `dev-config/.storage/core.entity_registry`.
- **Backup taken this session:** `choreops_data_01M01GJ0HV7DPPVVFB4HV7BR3E.bak-prerewards-20260815`.
- **⚠️ Its icon picker has NO SEARCH BOX** — the rig is pinned to `home-assistant:2025.7` (compose line 24). ChoreOps calls HA's stock `IconSelector()`, so this is an **HA-version artifact that does NOT reproduce on the Pi**. Don't debug it there. Enter junk icons or none.

**Rehearsal facts proven (dev rig, 5 rewards, 41 → 81 entities):**
- **Exactly 8 entities per reward** — 1 sensor + 3 buttons (claim/approve/disapprove) × 2 kids.
- Assigned Users pre-fill lands **2 users** untouched — §4 of the sheet is safe.
- **Slashes, parens and bare `$` in names slug safely** (`Day Out/Special Trip` → `day_out_special_trip`). The em-dash `—` remains **untested**; the sheet now says use ASCII.

## 4. NEXT MOVE — literal first actions

**Recommended path: build ALL content offline on the dev rig, then import to the Pi as one JSON paste.**

1. **Verify the import round-trip (highest value, no Pi needed).** Confirmed this session: ChoreOps' `validate_backup_json` **PASSES** the dev rig's raw storage file as-is (Store format v1; all 8 entity keys). The paste step accepts diagnostic, Store, **and raw storage** formats — so no special export is needed, the storage file itself is pasteable.
   - Code: `reference/ChoreOps-main/custom_components/choreops/config_flow.py:469` (`async_step_paste_json_input`), validator at `helpers/backup_helpers.py:543`.
   - **⚠️ CONSTRAINT: paste lives in the CONFIG flow, not the options flow** (`config_flow.py:64-69`). It only runs when **adding** the integration, and it **OVERWRITES** the whole storage file — it does not merge. On the Pi: **back up → delete the ChoreOps entry → re-add → paste.**
   - **Version gap is low-risk:** `schema_version` is absent from the 1.0.8 file and the validator treats it as optional/migratable, so 1.0.7 has nothing to reject. A `normalize_bonus_penalty_apply_shapes` pass runs on paste.
   - **✅ ROUND-TRIP VERIFIED 2026-08-15 on the dev rig.** Generator at `/Users/jdehart1/___Code_DEV/KitchenCOM/deploy/choreops-content/gen_content.py` (+ README) builds the whole content set from the 3 entry sheets. Loaded it, restarted HA: content survived (**16 rewards · 4 bonuses · 2 penalties · 3 achievements · 6 badges**) and **236 choreops entities** generated, up from 81. Semantics verified, not just storage: penalties stored **negative** (−5/−2), all 6 badge types round-tripped, `Streak Master` resolved `associated_achievement` → the real `7-Day Streak` id (not dangling), and per-achievement progress sensors generated for each type.
   - **Bonus:** writing JSON directly sets icons correctly with no picker — sidesteps §3's icon problem entirely.
   - **⚠️ ONE OPEN ITEM for the Pi run:** the dev rig has only 3 chores, so `Early Riser`'s `Brush Teeth` lookup fails there and the script leaves `selected_chore_id` **empty** (it warns loudly rather than inventing an id). The Pi has all 11 chores, so it should resolve — **but if the WARNING fires on the Pi, stop**: that achievement would silently never track.
2. **✅ CONTENT IS BUILT — as JSON, not typed.** All three sheets are transcribed into `deploy/choreops-content/gen_content.py` and verified on the dev rig (see step 1). The sheets below remain the decision-of-record; consult them only to change content or to type manually as a fallback:
   - Rewards: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-22-choreops-reward-store-entry-sheet.md` (**read §5a REHEARSAL FINDINGS first**)
   - Bonuses + Penalties: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-05-choreops-bonuses-penalties-entry-sheet.md` — ⚠️ type penalty points **POSITIVE**, the form negates internally.
   - Achievements THEN Badges: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-05-choreops-achievements-badges-entry-sheet.md` — ⚠️ **achievements first**; achievement-linked badges need the achievement to exist (blueprint's "Badges + Achievements together" is wrong).
3. **Then Task 8** — Dashboard Generator, runnable on the dev rig. Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-15-choreops-chores.md`. **Select ONLY Rowan + Wystan** (excludes stale parent entities, §5). Correct every `kc_` grep to `platform=choreops`.
4. **Pi tasks when it returns:** import the JSON → icon pass → Task 9 (nav button) → 10 (delete orphaned local_todo) → 11 (claim→approve smoke test) → 12 (commit + handoff).

## 5. CARRY-FORWARDS / LATENT ISSUES

- **✅ "3 SERVICES" vs 1 config entry — RESOLVED 2026-08-15, benign.** HA's integration card counts **devices**, not integrations. ChoreOps registers one `entry_type: service` device per user plus one system device — Rowan / Wystan / System — all sharing the single config entry `01M01GJ0HV7DPPVVFB4HV7BR3E`. Same pattern as HACS ("2 SERVICES", one entry). `deleted_devices` is **empty**, so nothing orphaned survived the 2026-08-14 failed setups. **No cleanup needed, and no duplicate entries to trip the JSON import.** Useful derived check: after importing on the Pi (4 users) expect **5** choreops devices.
- **✅ Task 9 clobber risk — GONE, resolved by the merge.** `homeassistant/dashboards/kitchen.yaml` in the working tree is now **main's newer version** (`weather.forecast_home`, Groceries/Chores headings) — verified post-merge. No `git show` recovery dance, no deltas to hand-merge. Task 9 edits this file directly.
- **✅ 128-behind-`main` — RESOLVED 2026-08-15** via merge `18d8cd0` (see §0.2). Branch is **0 behind**. Note this branch carries **no code** — it is docs-only; all code in the tree came from main.
- **STALE PARENT ENTITIES (Pi, benign):** garrett/rebecca still own ~27 choreops entities from before they became approvers-only. Harmless — Task 8 selects only the kids. To clean: ChoreOps → Edit User → Save for each.
- **🚩 PREFIX:** installed ChoreOps uses **`choreops`**, NOT `kc_`. Plan/spec docs still say `kc_` — that grep returns 0.
- **✅ SOURCE VENDORED at `/Users/jdehart1/___Code_DEV/KitchenCOM/reference/ChoreOps-main/`** (v1.0.8; Pi runs 1.0.7). Read schemas/enums here instead of guessing: `helpers/flow_helpers.py` (`build_*_schema`), `options_flow.py`, `const.py`.
- **⚠️ SHELL-CWD TRAP:** `reference/ChoreOps-main/` is a **nested git repo** and Bash cwd persists between calls — a `cd` there then `git commit` can hit the wrong repo. Use absolute paths or `cd` back to root first.
- **Pi HA config drift:** `/config/configuration.yaml` on the Pi is default password auth; backup `configuration.yaml.bak.20260702`. Not in the repo.

## 6. MEMORY ENTRIES THAT APPLY

Dir: `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`

- `dev-ha-rig-for-offline-choreops.md` — **(new this session)** the 8124 rig + the icon-search version artifact.
- `pi-ssh-access-from-claude.md` — `.234` reserved, MAC-rediscovery, gateway reservation.
- `pi-power-and-kiosk-login.md` — 27W brick mandatory; kiosk login = "keep me logged in".
- `pi-direct-ethernet-fallback.md` — `kitchencom-eth`, the `%%` escaping gotcha, `kitchencom.local:8123`.
- `choreops-source-vendored-locally.md`, `choreops-templates-hand-vendored.md` (prefix is `choreops`), `pi-kiosk-wayland-labwc.md`, `concurrent-sessions-branch-hazard.md`, `kitchencom-github-remote.md` (remote name typo'd `KitcheCom`).

## 7. PROCESS STATE

- subagent-driven-development adapted for deployment: gates are empirical verification (storage reads, entity counts), not pytest. Tasks 1–7 done; gamification content in progress; Task 8 next.
- **Tooling note:** nested-SSH quoting is fragile — write probe scripts to a file, `scp` to the Pi, `docker cp` into the container, then run. Don't inline heredocs with regex/quotes.
- **Self-referential fixup:** DONE 2026-08-15 — §1 HEAD points at `eca19df` (content generator) with the fix-up commit on top (24 ahead, 0 behind).
