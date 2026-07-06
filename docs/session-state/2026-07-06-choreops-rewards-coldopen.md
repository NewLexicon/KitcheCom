# KitchenCOM — COLD-OPEN (2026-07-06): chores done, next = rewards/gamification

**THIS IS THE CURRENT COLD-OPEN.** Read end-to-end before acting. Supersedes `2026-07-02-choreops-gamification-coldopen.md`. A fresh session should resume from THIS file + the artifacts it names with absolute paths.

---

## 0. ⚠️ READ FIRST — live environment state

- **Pi reachability depends on being on the HOME LAN.** The Pi is `kitchencom` = **`192.168.1.234`** (reserved — see below). As of 2026-07-06 the Mac is on a DIFFERENT network (`10.250.4.216`, not `192.168.1.x`), so the Pi is UNREACHABLE right now — **this is expected (not-at-home), NOT a fault.** Gate before any Pi work: `ipconfig getifaddr en0` must show `192.168.1.x`, then `ssh kitchencom 'echo UP'` → UP. If on the home LAN and still down, THEN it's power/hardware (§4).
- **Pi IP is RESERVED at `192.168.1.234`** (Fixed Allocation on the AT&T gateway `http://192.168.1.254` → Home Network → IP Allocation; MAC `2c:cf:67:e2:f2:67`). `~/.ssh/config` Host `kitchencom` → `.234`. It will NOT DHCP-drift again. HA URL = **`http://192.168.1.234:8123`** (plan/spec docs still say `.225` — mentally substitute).
- **✅ KIOSK FULLY WORKING + STABLE.** Pi on its own **27W USB-C brick** (ViewSonic on its OWN power; Pi micro-HDMI→ViewSonic HDMI for video). `vcgencmd get_throttled` = `0x0`. Dashboard shows + holds. Kiosk login = persistent password session ("Keep me logged in" refresh token). Kiosk is reboot-proof (wait-for-HA + respawn). **Do NOT power the Pi from the ViewSonic over USB-C** — it browns out and crash-loops (memory `pi-power-and-kiosk-login.md`).
- **Input:** Logitech G203 mouse + G.SKILL KM250 keyboard plugged into the Pi work. **No touchscreen** (likely a display-only ViewSonic; need model# to confirm). Mouse/kbd suffice for the smoke test.

## 1. WHERE HEAD IS
- **This checkout: branch `feat/choreops-chores`, HEAD = `d208a60` (this cold-open) + a fixup commit on top, 10 ahead of `origin/main`.**
- Session commit arc (choreops branch): `9438094` (profiles+blueprint) → `b74f9c2` (fixup) → `ed0d6f3` (kiosk online) → `f651930` (chores corrected) → `d208a60` (this cold-open).
- **`feat/hardware-deploy` = `b5f712e`, 8 ahead** — Pi deploy + kiosk. The LIVE Pi kiosk runs THIS branch's `deploy/kiosk/start-kiosk-wayland.sh`. Still NOT merged.
- **Branch map (concurrent-session hazard — verify `git branch --show-current` before EVERY commit):**
  - `feat/choreops-chores` (this checkout) — **active slice.**
  - `feat/hardware-deploy` (b5f712e) — Pi/kiosk work; live Pi runs its kiosk script.
  - `feat/grocy-chores` (8c559d7, in `.worktrees/grocy-chores`) — other session's Grocy work; superseded for chores.
  - `feat/audio-music` — empty placeholder.
- `main` = `origin/main` = `0cdc0f5`.

## 2. WHAT'S DONE (ChoreOps deployment)
- **Tasks 1–7 DONE + verified.** Integration installed (1.0.7), HACS + button-card + auto-entities, 4 profiles.
- **PROFILES (final state after 2026-07-04 edits):**
  - **Rowan (12), Wystan (8)** — kids: `can_be_assigned`+gamified, no approve.
  - **Garrett, Rebecca** — **approvers ONLY** (`can_be_assigned=false`, `enable_gamification=false`, `can_approve=true`, `can_manage=true`, HA-linked). Changed 2026-07-04 per user: parents don't do chores/earn points, just approve.
- **CHORES DONE + verified — 11 chores** (user entered 12 via Mac browser, corrected via direct storage edit; detail: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-04-choreops-chores-correction-plan.md`):
  - Fishy(dog) 3/both-kids/daily/rotation · Feed Cats 2/Rowan/daily · Cook Dinner 10/Rowan/daily · Set the Table 3/both/daily/rotation · Brush Teeth 2/both/daily/independent · Plants 3/both/daily/rotation · Wash Dishes 5/both/daily/rotation · Trash 5/both/weekly/rotation · Recycling 5/both/weekly/rotation · Laundry 3/both/weekly/rotation · Clean Room 3/both/weekly/rotation.
  - Economy: **1 pt = $0.10**. Approvals: parent-approve (auto_approve=false everywhere).
- **Seed content still present to RETUNE, not recreate:** rewards `treat`+`cash`, bonus `cheerful`, penalty `demerit`.

## 3. NEXT MOVE — literal first actions next session
1. **Gate: get on the home LAN + Pi reachable** (§0). `ssh kitchencom 'echo UP'` → UP before any Pi work.
2. **Build the REWARD STORE** (next blueprint section). Blueprint: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md` §2. User does entry in their **Mac browser** at `http://192.168.1.234:8123` (real keyboard) — Settings → Devices & Services → ChoreOps → Configure → Add Reward. Retune existing `treat`/`cash`; add screen-time (15/30/60min), cash-out tiers ($1/$5/$10/$20 = 10/50/100/200 pts), privileges (stay-up-late, pick-dinner, friend-over, activities), treats/items. **Verify each via `.storage/choreops/` (data.rewards) + `platform=choreops` entity counts.**
3. **Then Bonuses** (retune `cheerful`, add Great-Attitude/Helped-Sibling/Initiative) → **Penalties** (retune `demerit`, add Reminder-Needed; keep light) → **Badges** (all 5 types: daily/cumulative/periodic/special/achievement-linked) → **Achievements** (Perfect Week ships; add 7-Day-Streak/Chore-Champion/Early-Bird). All per blueprint §3–6.
4. **THEN Task 8** — Dashboard Generator (needs all chores/rewards/etc to exist first). Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-15-choreops-chores.md`. **In Task 8, select ONLY Rowan+Wystan as dashboard users** (excludes parents' stale entities — see §4). **Correct every `kc_` grep to `platform=choreops`.**
5. Remaining plan tasks: **9** (swap kitchen.yaml chores card for `/cod-chores` nav button — CLOBBER RISK §4) → **10** (delete orphaned local_todo Chores) → **11** (claim→approve smoke test via mouse/kbd) → **12** (commit + handoff).

## 4. CARRY-FORWARDS / LATENT ISSUES
- **STALE PARENT ENTITIES (new 2026-07-04, benign):** the direct storage-edit that made parents approvers-only did NOT tear down their chore/point entities (garrett/rebecca still have ~27 choreops entities incl. points/badges/claim_chore_fishy). ChoreOps only fully regenerates entities via its options-flow UI, not on hand-edited-JSON reload. **Harmless** — Task 8 picks only Rowan+Wystan so they never render. To clean the registry: ChoreOps → Edit User → Garrett → Save (and Rebecca) regenerates from the new flags.
- **DASHBOARD CLOBBER RISK (Task 9), UNCHANGED:** `feat/choreops-chores`'s `homeassistant/dashboards/kitchen.yaml` is OLD (placeholders `weather.home`, `todo.chores`, no headings). The LIVE Pi runs `feat/hardware-deploy`'s newer kitchen.yaml (weather=`weather.forecast_home`, Groceries/Chores headings). Before Task 9: `git show feat/hardware-deploy:homeassistant/dashboards/kitchen.yaml` and merge the weather+headings deltas, or you'll regress the live dashboard.
- **PI HA CONFIG DRIFT (Pi-side only):** `/config/configuration.yaml` on the Pi = default password auth (no auth_providers block). Backup on Pi: `configuration.yaml.bak.20260702`. Not in the repo (choreops branch doesn't own the HA config deploy). Reconcile at merge if desired.
- **🚩 PREFIX: installed ChoreOps 1.0.7 uses `choreops` prefix, NOT `kc_`.** Plan/spec still say `kc_`. Verify entities via `platform=choreops` in `.storage/core.entity_registry`, never the `kc_` substring (returns 0).
- **Pi power:** never power the Pi 5 from the ViewSonic. Own 27W brick only.
- **Branch sprawl:** 4 unpushed branches. Eventually merge hardware-deploy → main, then choreops. Consider PRs.

## 5. MEMORY ENTRIES THAT APPLY (dir: `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`)
- `pi-ssh-access-from-claude.md` — IP `.234` (reserved) + MAC-rediscovery + gateway-reservation steps.
- `pi-power-and-kiosk-login.md` — **(2026-07-02)** Pi needs own 27W brick (ViewSonic USB-C = brownout crash-loop); kiosk login = one-time "keep me logged in" (trusted_networks can't auto-auth a kiosk).
- `choreops-templates-hand-vendored.md` — ChoreOps DOES auto-generate dashboards (cod-chores); **corrected: prefix is `choreops` NOT `kc_`**; needs button-card + auto-entities.
- `pi-kiosk-wayland-labwc.md` — kiosk = chromium via labwc autostart; now reboot-proof.
- `hardware-deployment-phase-live.md`, `kitchencom-github-remote.md` (remote `NewLexicon/KitcheCom.git` — name typo'd), `concurrent-sessions-branch-hazard.md`.

## 6. PROCESS STATE
- subagent-driven-development adapted for deployment (agent drives SSH/`.storage` verification, guides UI, gates = verification not pytest). Tasks 1–7 DONE. Building gamification content (rewards next) before Task 8.
- **Tooling note:** nested-SSH quoting is fragile — write probe/edit scripts to a file, `scp` to Pi, `docker cp` into the `homeassistant` container, run. Don't inline heredocs with regex/quotes.
- **Self-referential fixup:** DONE — §1 HEAD points at `d208a60` (this cold-open) with this fixup commit on top (10 ahead).
