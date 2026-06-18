# KitchenCOM — COLD-OPEN (2026-06-18): ChoreOps execution paused mid-config

**THIS IS THE CURRENT COLD-OPEN.** Read end-to-end before acting. Supersedes `2026-06-15-pi-deployment-phaseB-handoff.md` for "what's live" and continues from it. A fresh session should be able to resume from THIS file + the artifacts it names with absolute paths.

---

## 0. ⚠️ READ FIRST — environment is NOT normal right now

- **Running on a LOANER Mac.** The primary Mac's monitor broke (~1 week out, from ~2026-06-17). `___Code_DEV/` was copied to this loaner. Full new-laptop setup steps: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-06-17-new-laptop-setup-handoff.md` (UNTRACKED — created by the setup session; commit or keep as needed).
- **The Pi (`kitchencom`, `192.168.1.225`) is UNREACHABLE as of 2026-06-18** (`ssh: Host is down` / no ping / not in arp). Likely causes, check in order tomorrow:
  1. **This loaner Mac may not be on the home LAN** — the Pi is at home on `192.168.1.x`. If you're not on that network, you can't reach it (expected). Confirm `ipconfig getifaddr en0` shows a `192.168.1.x` address.
  2. **macOS Local Network permission** — Claude's Bash tool needs VS Code granted Local Network access (System Settings → Privacy & Security → Local Network → Visual Studio Code ON), or it gets "no route to host" to the Pi even on the right network. This was granted on the OLD Mac; the loaner needs it re-granted. See memory `pi-ssh-access-from-claude.md`.
  3. **Pi powered off / new DHCP IP** — if on the home LAN with permission granted and still unreachable, the Pi may be off or moved IP. Re-discover: `ssh kitchencom 'hostname -I'` won't work; instead find it via the router or `arp -a | grep -i 2c:cf:67:e2:f2:67` (the Pi's MAC). Update `~/.ssh/config` Host kitchencom HostName if the IP changed.
- **The SSH key + config may need re-checking on the loaner:** `~/.ssh/id_kitchencom` + `~/.ssh/config` Host `kitchencom` (→ 192.168.1.225, user garrettdehart). If `___Code_DEV` was copied but `~/.ssh` was not, re-copy the key + re-add the config alias + the passwordless-sudo is already set ON THE PI (`/etc/sudoers.d/010_garrettdehart-nopasswd`), so only the laptop side needs the key.

## 1. WHERE HEAD IS
- **Branch `feat/choreops-chores`, HEAD = `26c5fd7`**, 3 ahead of `origin/main`, UNPUSHED. Clean tree except the untracked new-laptop handoff (and this file).
- Commit arc on this branch: `6cb7838` (spec+research) → `4a133e4` (plan+spec amendment) → `26c5fd7` (pin 1.0.7).
- **Branch divergence map (4 feature branches, all unpushed, share this checkout — CONCURRENT-SESSION HAZARD, verify `git branch --show-current` before every commit):**
  - `feat/choreops-chores` (26c5fd7, 3 ahead) — **active slice, this cold-open.**
  - `feat/hardware-deploy` (0db011f, 7 ahead) — the Pi deployment + kiosk + weather/todo work. NOT merged. **The live Pi runs THIS branch's dashboard** (weather=weather.forecast_home, Groceries/Chores todo headings). choreops branched off `main` so it LACKS that work — see §4 carry-forward.
  - `feat/grocy-chores` (8c559d7, in `.worktrees/grocy-chores`) — other session's Grocy work; SUPERSEDED for chores by ChoreOps (Grocy may do pantry/shopping later). Don't build chores there.
  - `feat/audio-music` (0cdc0f5) — empty placeholder slice.
- `main` = `origin/main` = `0cdc0f5`.

## 2. WHAT'S LIVE ON THE PI (verified 2026-06-15, pre-loaner; UNVERIFIED today since Pi unreachable)
- HA **2026.6.3** in Docker (`:stable`), Python 3.14.5, Wayland/labwc kiosk auto-booting to the kitchen dashboard.
- Dashboard cards live: clock, **weather (Met.no `weather.forecast_home`)**, **Groceries + Chores todo lists (with headings)**, voice button (assist, not yet wired), screensaver card.
- **HACS installed + authed** (GitHub device-auth done). Frontend cards **button-card + auto-entities** installed, registered, serving 200.
- **ChoreOps 1.0.7 installed via HACS, loaded clean** (custom_components/choreops). Load-bearing mechanics verified IN the installed 1.0.7: `button.kc_`/`calendar.kc_` prefixes, `cod-` dashboard url prefix, Dashboard Generator in options_flow+dashboard_builder, python-dateutil dep, templates user-gamification-premier-v1 + admin-shared-v1 present.
- **ChoreOps is NOT yet configured** — no `choreops` config entry, 0 `kc_` entities. Config (profiles/chores/gamification/dashboard) was the next step when we paused.

## 3. NEXT MOVE — literal first actions tomorrow
1. **Re-establish Pi access** (see §0). Gate: `ssh kitchencom 'echo UP'` returns UP. If not, work the §0 checklist. DO NOT proceed until the Pi is reachable.
2. **Resume the plan at Task 6** — plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-15-choreops-chores.md`. Spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-06-15-choreops-chores-design.md`. We are MID-Task-6 (was about to guide the user to add the ChoreOps integration + create 2 parents + 2 kids profiles). Tasks 1–5 DONE.
3. Remaining plan tasks: **6** (integration + 4 profiles, HUMAN-GATED UI) → **7** (chores + full gamification seed, UI) → **8** (run Dashboard Generator → `cod-chores`, UI) → **9** (replace todo.chores card with nav button — SEE §4) → **10** (delete orphaned local_todo Chores list) → **11** (claim→approve smoke test) → **12** (commit + handoff).
4. **Execution model:** this is deployment/config, NOT TDD code. Agent runs SSH/verification via `ssh kitchencom`; GUIDES the user through all ChoreOps browser-UI steps (HA at `http://192.168.1.225:8123`), verifying via `.storage` inspection after each. Always verify entities via **`kc_` / registry, NEVER `choreops_*`**. `check_config` before every HA restart.

## 4. CARRY-FORWARDS / LATENT ISSUES
- **DASHBOARD CLOBBER RISK (Task 9):** `feat/choreops-chores` branched off `main`, so its `homeassistant/dashboards/kitchen.yaml` is the OLD version (placeholders `weather.home`, `todo.chores`, no headings). The LIVE Pi runs `feat/hardware-deploy`'s newer kitchen.yaml (weather wired, headings). **When Task 9 edits kitchen.yaml here and deploys it, you MUST re-apply the weather (`weather.forecast_home`) + Groceries/Chores headings, or you'll regress the live dashboard.** Mitigation: before Task 9, diff `git show feat/hardware-deploy:homeassistant/dashboards/kitchen.yaml` against this branch's copy and merge the deltas. (User chose "keep off main, merge later" — reconcile at merge time.)
- **Version drift (resolved):** ChoreOps pinned 1.0.7 (latest published HACS release; 1.0.8 was an untagged snapshot in `reference/ChoreOps-main`). Installed 1.0.7 mechanics verified. Don't re-chase 1.0.8.
- **Branch sprawl:** 4 unpushed feature branches off main, none merged. Eventually: merge hardware-deploy (the real Pi work) to main, then rebase/merge choreops. Consider opening PRs.
- **Pi reachability is itself a carry-forward** until confirmed on the loaner.

## 5. MEMORY ENTRIES THAT APPLY (dir: `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`)
- `pi-ssh-access-from-claude.md` — `ssh kitchencom` passwordless; **macOS Local Network permission for VS Code** (the §0.2 gotcha). Pi MAC for re-discovery: `2c:cf:67:e2:f2:67`.
- `choreops-templates-hand-vendored.md` — ChoreOps does NOT auto-generate... **CORRECTION: it DOES, via the options-flow Dashboard Generator → HA storage `cod-chores`.** (This memory's title is now misleading — the deeper trace during planning overturned it; see spec §2.1. Update/replace this memory tomorrow.) Still-true parts: kc_ prefix, needs button-card + auto-entities.
- `pi-kiosk-wayland-labwc.md` — kiosk = chromium via labwc autostart.
- `hardware-deployment-phase-live.md`, `kitchencom-github-remote.md` (remote: `NewLexicon/KitcheCom.git` — repo name typo'd), `concurrent-sessions-branch-hazard.md`.

## 6. PROCESS STATE
- Brainstorm → spec (reviewed clean) → plan (reviewed clean, first-pass) → subagent-driven-development execution ALL DONE through Task 5. Skill in use: subagent-driven-development (adapted: deployment work, agent drives SSH + guides UI, gates = verification not pytest).
- Review-depth calibration audit trail lives in global `~/.claude/CLAUDE.md`.
