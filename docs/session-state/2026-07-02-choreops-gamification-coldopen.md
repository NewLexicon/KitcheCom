# KitchenCOM — COLD-OPEN (2026-07-02): ChoreOps profiles done, building gamified chore system

**THIS IS THE CURRENT COLD-OPEN.** Read end-to-end before acting. Supersedes `2026-06-18-choreops-execution-coldopen.md`. A fresh session should resume from THIS file + the artifacts it names with absolute paths.

---

## 0. ⚠️ READ FIRST — live environment state

- **Mac is on the home LAN** (`192.168.1.180`, en0). The loaner-Mac / not-on-LAN worry from the 2026-06-18 cold-open is RESOLVED — this Mac reaches the Pi fine when the Pi is powered.
- **Pi IP CHANGED + is now RESERVED.** The Pi jumped DHCP `192.168.1.225` → **`192.168.1.234`**. `~/.ssh/config` Host `kitchencom` HostName updated to `.234` (done this session). The IP is now a **Fixed Allocation** on the AT&T gateway (`http://192.168.1.254` → Home Network → IP Allocation; MAC `2c:cf:67:e2:f2:67`), verified to survive a lease renewal. It will NOT drift again. HA URL is now **`http://192.168.1.234:8123`** everywhere (plan/spec docs still say `.225` — mentally substitute).
- **⚠️ THE PI IS POWERED OFF as of session end 2026-07-02.** It went unreachable (`Host is down`, 100% ping loss, did not return in 2+ min) right after the user was rewiring USB-C. **Almost certainly a POWER problem:** the user tried to power the Pi 5 from the ViewSonic monitor over USB-C, which cannot deliver the Pi 5's required 5V/5A (27W). **First action next session: confirm the Pi is back on its proper 27W USB-C brick (ViewSonic powered separately), then `ping 192.168.1.234` / `ssh kitchencom 'echo UP'`.** Nothing is lost — HA + ChoreOps data live on the SD card; the kiosk auto-launches on boot now (see §4).

## 1. WHERE HEAD IS
- **This checkout is on branch `feat/choreops-chores`, HEAD = `c83eef6`** (pre-this-session's-doc-commits), 4 ahead of `origin/main`. A close-out commit lands after this doc (see §6 self-ref fixup).
- **A SECOND commit landed on `feat/hardware-deploy` this session:** `b5f712e` "fix(kiosk): make Wayland kiosk reboot-proof (wait-for-HA + respawn)". That branch is now **8 ahead** of origin/main (was 7). See §3.
- **Branch map (concurrent-session hazard — verify `git branch --show-current` before EVERY commit):**
  - `feat/choreops-chores` (this checkout) — **active slice, this cold-open.**
  - `feat/hardware-deploy` (now `b5f712e`, 8 ahead) — Pi deploy + kiosk. The LIVE Pi kiosk runs THIS branch's `deploy/kiosk/start-kiosk-wayland.sh` (updated this session). Still NOT merged.
  - `feat/grocy-chores` (8c559d7, in `.worktrees/grocy-chores`) — other session's Grocy work; superseded for chores.
  - `feat/audio-music` — empty placeholder.
- `main` = `origin/main` = `0cdc0f5`.

## 2. WHAT HAPPENED THIS SESSION (2026-07-02)
- **Re-established Pi access** — diagnosed the DHCP IP jump (.225→.234), fixed ssh config, RESERVED the IP on the gateway (won't drift again).
- **Tasks 6 & 7 DONE + verified** — all 4 ChoreOps profiles exist in `.storage/choreops/`:
  - **Rowan, Wystan** (kids): `can_be_assigned`+gamified, `can_approve=False`.
  - **Garrett, Rebecca** (parents): `can_be_assigned`+`can_approve`+`can_manage`+gamified, **HA-linked** (`ha_user_id` set). Dual-capability: do chores AND approve.
  - Seed content exists: chore `trash`, rewards `treat`+`cash`, bonus `cheerful`, penalty `demerit`, gamification on. **107 ChoreOps entities** (rowan 28, wystan 28, garrett 23, rebecca 23, system 5).
- **🚩 CRITICAL PREFIX CORRECTION:** installed ChoreOps **1.0.7 uses the `choreops` prefix, NOT `kc_`.** Entities are `sensor.rowan_choreops_points`, `button.wystan_choreops_claim_chore_trash`, etc. **The plan/spec/memory all say `kc_` and "never check choreops_*" — that is WRONG for installed 1.0.7.** Every downstream verification grep (plan Tasks 8/10/11) must use `platform=choreops` (from `.storage/core.entity_registry`), NOT the `kc_` substring. The plan's greps will silently return 0 if run as-written.
- **Kiosk made reboot-proof** — `feat/hardware-deploy` commit `b5f712e`. The kiosk had wandered to the HA docs site + wouldn't auto-relaunch after reboot. Fix in `deploy/kiosk/start-kiosk-wayland.sh`: (1) wait-for-HA (poll until 200) before launch, (2) supervisor while-loop respawns chromium on exit + clears crash flag. VERIFIED via kill-respawn AND a full reboot (kiosk auto-returned to `kitchen-snapshot`). Deployed to Pi at `/home/garrettdehart/kitchencom/deploy/kiosk/start-kiosk-wayland.sh`.
- **Gamification blueprint DRAFTED** (not yet entered) — `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md`. Full chore/reward/badge/achievement/bonus/penalty design, economy 1pt=$0.10, cash-out tiers. **Awaiting user sign-off + real ages.**

## 3. NEXT MOVE — literal first actions next session
1. **Get the Pi powered + reachable** (§0). Gate: `ssh kitchencom 'echo UP'` → UP. If down, it's the power issue — Pi needs its own 27W brick, ViewSonic powered separately, Pi micro-HDMI→ViewSonic HDMI for video. Do NOT proceed until reachable.
2. **Resume building the gamified chore system** — the user's stated priority is fine-tuning chores/rewards/badges BEFORE generating the dashboard. Open the blueprint: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md`. Get user sign-off + real ages (assumed Rowan older). Then GUIDE the user through the ChoreOps options-flow UI (Settings → Devices & Services → ChoreOps → Configure) to enter chores → rewards → bonuses → penalties → badges → achievements, in that order. Verify each via `.storage/choreops/` + `platform=choreops` entity counts.
3. **THEN plan Task 8** — Dashboard Generator (needs all identities/chores/rewards to exist first). Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-15-choreops-chores.md`. **Correct every `kc_` grep to `platform=choreops` as you go.**
4. Remaining plan tasks after 8: **9** (swap kitchen.yaml chores card for `/cod-chores` nav button — see §4 clobber risk) → **10** (delete orphaned local_todo Chores) → **11** (claim→approve smoke test, now doable via the plugged-in mouse/keyboard) → **12** (commit + handoff).
5. **Execution model:** deployment/config, NOT TDD. Agent drives SSH/`.storage` verification + GUIDES user through browser UI. Nested-SSH quoting is fragile — write probe scripts to a file + `scp` + `docker cp` into the container rather than inline heredocs (learned this session).

## 4. CARRY-FORWARDS / LATENT ISSUES
- **DASHBOARD CLOBBER RISK (Task 9), UNCHANGED:** `feat/choreops-chores`'s `homeassistant/dashboards/kitchen.yaml` is the OLD version (placeholders `weather.home`, `todo.chores`, no headings). The LIVE Pi runs `feat/hardware-deploy`'s newer kitchen.yaml (weather=`weather.forecast_home`, Groceries/Chores headings). When Task 9 edits + deploys kitchen.yaml, MUST re-apply the weather + headings or regress the live dashboard. Mitigation: `git show feat/hardware-deploy:homeassistant/dashboards/kitchen.yaml` and merge deltas first.
- **TOUCH INPUT:** the ViewSonic has **no working touch** (no touchscreen HID detected on the Pi). BUT a **Logitech G203 mouse + G.SKILL KM250 keyboard ARE plugged into the Pi and working** — so the kitchen screen IS controllable, and the Task 11 smoke test is unblocked. Touch is a nice-to-have: ViewSonic touch runs over a **USB-A** cable (monitor's touch/USB port → Pi USB-A), NOT USB-C (Pi 5's only USB-C is power). If pursuing touch later, plug that USB-A cable and verify a touch event device appears in `/proc/bus/input/devices`, then calibrate.
- **PI POWER (new, active):** do NOT power the Pi 5 from the ViewSonic over USB-C — insufficient current, causes brownout/shutdown (the session-end outage). Pi needs its own 27W supply.
- **CLI USB-C confusion resolved:** user thought they needed USB-C Pi→monitor for touch; they don't. Video = HDMI (working: `card1-HDMI-A-1 connected`). Power = Pi's own USB-C brick. Touch = USB-A.
- **Version drift (resolved):** ChoreOps pinned 1.0.7. Don't chase 1.0.8.
- **Branch sprawl:** 4 unpushed feature branches, none merged. Eventually merge hardware-deploy → main, then choreops. Consider PRs.

## 5. MEMORY ENTRIES THAT APPLY (dir: `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`)
- `pi-ssh-access-from-claude.md` — **UPDATED this session** with new IP `.234` + MAC-rediscovery procedure + AT&T-gateway reservation steps. `ssh kitchencom` passwordless. Local Network permission gotcha (§0.2 of old cold-open) did NOT recur this session.
- `choreops-templates-hand-vendored.md` — title misleading (ChoreOps DOES auto-generate dashboards). **STILL NEEDS the `kc_`→`choreops` prefix correction folded in** (the plan/spec/this-memory all carry the wrong `kc_` claim). Update next session.
- `pi-kiosk-wayland-labwc.md` — kiosk = chromium via labwc autostart. **Now reboot-proof** (respawn loop + wait-for-HA), per `b5f712e`.
- `hardware-deployment-phase-live.md`, `kitchencom-github-remote.md` (remote `NewLexicon/KitcheCom.git` — name typo'd), `concurrent-sessions-branch-hazard.md`.

## 6. PROCESS STATE
- subagent-driven-development (adapted for deployment: agent drives SSH, guides UI, gates = `.storage` verification not pytest). Tasks 1–7 DONE. Building gamification content before Task 8.
- **Self-referential fixup pending:** this close-out commit can't know its own SHA. After committing, update §1 HEAD line to the close-out SHA + branch-ahead 4→5, commit as "cold-start sanity-check fix-ups".
