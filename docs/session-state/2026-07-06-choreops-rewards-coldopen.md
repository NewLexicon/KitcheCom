# KitchenCOM — COLD-OPEN (2026-07-06): chores done, next = rewards/gamification

**THIS IS THE CURRENT COLD-OPEN.** Read end-to-end before acting. Supersedes `2026-07-02-choreops-gamification-coldopen.md`. A fresh session should resume from THIS file + the artifacts it names with absolute paths.

---

## 0. ⚠️ READ FIRST — live environment state

- **Pi reachability depends on being on the HOME LAN.** The Pi is `kitchencom` = **`192.168.1.234`** (reserved — see below). Gate before any Pi work: `ipconfig getifaddr en0` must show `192.168.1.x`, then `ssh kitchencom 'echo UP'` → UP.
- **⚡ 2026-08-05 (work office): Pi VERIFIED WORKING but POWER-STARVED — do not repeat.** Pi was powered from a **laptop-dock USB-C port** (no 27W brick on hand). It boots and idles fine but **browns out under load**: 3 drops in ~40min, each correlated with actual traffic (concurrent SSH, browser loading HA). One was a confirmed hard reboot (`up 0 min`); the others killed the ethernet link with the Pi still running. `throttled=0x0` is **not** reassuring here — the counter resets at boot. **The 27W brick is mandatory, not a preference.** User is bringing it 2026-08-06 to retry.
- **Direct-ethernet fallback WORKS (proven 2026-08-05)** when there's no home LAN — Mac↔Pi patch cable, no DHCP needed. `~/.ssh/config` now has **`Host kitchencom-eth`** → `fe80::2ecf:67ff:fee2:f266%%en22`. **Note the doubled `%%`** — a single `%` breaks SSH config parsing (`percent_expand: unknown key %e`). Backup of pre-edit config: `~/.ssh/config.bak.20260805`. Browser URL on that link = **`http://kitchencom.local:8123`** (mDNS; the `.234` address does NOT work there). Pi ethernet MAC = `2c:cf:67:e2:f2:66` (wifi MAC is `...:67` — one digit apart, same board). Gotcha: `ping6` to the scoped literal fails with "nodename nor servname" even while SSH works — a local resolver quirk, ignore it; use `ping6 -I en22 ff02::1` to see who's on the link. Interface name (`en22`) may differ per dock/port.
- **Pi clock drifts on the direct link** — read `2026-07-07` on 2026-08-05 (no NTP without internet). Harmless for content entry; self-corrects at home.
- **Pi IP is RESERVED at `192.168.1.234`** (Fixed Allocation on the AT&T gateway `http://192.168.1.254` → Home Network → IP Allocation; MAC `2c:cf:67:e2:f2:67`). `~/.ssh/config` Host `kitchencom` → `.234`. It will NOT DHCP-drift again. HA URL = **`http://192.168.1.234:8123`** (plan/spec docs still say `.225` — mentally substitute).
- **✅ KIOSK FULLY WORKING + STABLE.** Pi on its own **27W USB-C brick** (ViewSonic on its OWN power; Pi micro-HDMI→ViewSonic HDMI for video). `vcgencmd get_throttled` = `0x0`. Dashboard shows + holds. Kiosk login = persistent password session ("Keep me logged in" refresh token). Kiosk is reboot-proof (wait-for-HA + respawn). **Do NOT power the Pi from the ViewSonic over USB-C** — it browns out and crash-loops (memory `pi-power-and-kiosk-login.md`).
- **Input:** Logitech G203 mouse + G.SKILL KM250 keyboard plugged into the Pi work. **No touchscreen** (likely a display-only ViewSonic; need model# to confirm). Mouse/kbd suffice for the smoke test.

## 1. WHERE HEAD IS
- **This checkout: branch `feat/choreops-chores`, HEAD = `177dfe8` (bonuses/penalties + achievements/badges entry sheets), 14 ahead of `origin/main`.**
- Session commit arc (choreops branch): `9438094` (profiles+blueprint) → `b74f9c2` (fixup) → `ed0d6f3` (kiosk online) → `f651930` (chores corrected) → `d208a60` (prior cold-open) → `751ac63` (fixup) → `3942520` (reward entry sheet) → `8662184` (cold-open refresh) → `797499d` (fixup) → `177dfe8` (remaining 4 entry sheets).
- **2026-07-22 session (offline, Pi powered down):** drafted the reward store as a type-and-go entry sheet. **Nothing entered on the Pi yet.**
- **2026-08-05 session (work office, Pi power-starved):** connected via direct ethernet, verified the Pi is healthy, **captured the pre-entry baseline (see §2)**, took a backup, then drafted the remaining 4 content sheets offline when the link proved too unstable for entry. **Still nothing entered on the Pi.**
- **`feat/hardware-deploy` = `b5f712e`, 8 ahead** — Pi deploy + kiosk. The LIVE Pi kiosk runs THIS branch's `deploy/kiosk/start-kiosk-wayland.sh`. Still NOT merged.
- **Branch map (concurrent-session hazard — verify `git branch --show-current` before EVERY commit):**
  - `feat/choreops-chores` (this checkout) — **active slice.**
  - `feat/hardware-deploy` (b5f712e) — Pi/kiosk work; live Pi runs its kiosk script.
  - `feat/grocy-chores` (**`c1c456e`** as of 2026-07-22, was `8c559d7` — the other session ADVANCED it; in `.worktrees/grocy-chores`) — other session's Grocy work; superseded for chores.
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
- **Seed content still present to RETUNE, not recreate:** rewards `Treat`+`Cash`, bonus `Cheerful`, penalty `Demerit`, badge `Week Winner`, achievement `Perfect Week`.
- **📊 PRE-ENTRY BASELINE — captured live 2026-08-05, verified against `.storage/choreops`:**
  - **141 choreops entities** (button 94, sensor 40, select 3, calendar 2, datetime 2).
  - Content counts: users **4** · chores **11** · rewards **2** · bonuses **1** · penalties **1** · badges **1** · achievements **1** · challenges **0**.
  - **Each reward generates 8 entities** (3 buttons + 1 sensor, × 2 kids). So after the 14 reward adds expect **141 + 112 = 253**.
  - **Backup on the Pi before any entry:** `/config/.storage/choreops/choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5.bak-prerewards-20260805` (36418 bytes).
  - ⚠️ `.storage/choreops` is a **directory**, not a file. Live data file is `choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5`; the rest are `.bak-*` / `*_recovery` snapshots. Content collections are **dicts keyed by ID**, not lists — iterate `.values()`.

## 3. NEXT MOVE — literal first actions next session
1. **Gate: get on the home LAN + Pi reachable** (§0). `ssh kitchencom 'echo UP'` → UP before any Pi work.
2. **Build the REWARD STORE — the decisions are already made.** Work straight from the entry sheet: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-22-choreops-reward-store-entry-sheet.md` (drafted 2026-07-22 offline; 16 rewards = 2 seed retunes + 14 adds, with exact names/costs/descriptions/icons + verification commands). Blueprint background: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-07-02-choreops-gamification-blueprint.md` §2. User does entry in their **Mac browser** at `http://192.168.1.234:8123` (real keyboard) — Settings → Devices & Services → ChoreOps → Configure → Manage Rewards.
   - **Key schema facts (verified against `reference/ChoreOps-main`, v1.0.8):** the reward form is exactly 6 fields — Name (req, unique-checked), Description, Labels, Cost (req), Icon, Assigned Users. **No cooldown/limit field exists.** Seed `treat`/`cash` must be **EDITED not re-added** (duplicate names rejected). Assigned Users pre-fills to all gamified users = Rowan+Wystan — leave untouched.
   - **Verify via `.storage/choreops/` (data.rewards) + `platform=choreops` entity counts** — commands are in §5 of the entry sheet. **Pre-entry baseline is already captured — see §2 (141 entities → expect 253).** Backup already taken (§2); take a fresh one if anything has changed since.
   - **Sheet §0 pre-flight says `http://192.168.1.234:8123`** — correct on the home LAN. On the direct-ethernet fallback use **`http://kitchencom.local:8123`** instead (§0).
   - **Sheet §3's heading said "18 new rewards"; corrected to 14** (the tables always held 14; the §2 total line always said 14).
3. **Then work the remaining 2 sheets, IN THIS ORDER — all decisions are pre-made, drafted + schema-verified 2026-08-05:**
   - **Bonuses + Penalties:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-05-choreops-bonuses-penalties-entry-sheet.md` (1 retune + 3 adds; 1 retune + 1 add). ⚠️ **Type penalty points POSITIVE** — the form negates internally (`min=0` rejects `-5`). No Assigned Users field on either form.
   - **Achievements THEN Badges:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-05-choreops-achievements-badges-entry-sheet.md` (3 adds; 1 retune + 5 adds).
   - **⚠️ ORDER CORRECTION vs. blueprint:** blueprint §build-order step 5 says "Badges + Achievements" together — **wrong**. Achievement-linked badges require an existing achievement (`vol.Required`), so Streak Master blocks on 7-Day Streak. **Achievements first.**
   - **⚠️ SCOPE DEVIATION:** blueprint's "Early Bird — morning chores before 9am" is **not buildable** (no time-of-day condition in any of the 3 achievement types). Substituted **Early Riser** (5-day `chore_streak` on Brush Teeth). Before-9am semantics would need an HA automation outside ChoreOps — undecided, out of scope.
   - Badge form fields **vary by badge type** (8 `INCLUDE_*` sets, `const.py:4016-4069`) — the sheet §3 has the resolved field matrix so you don't hunt for fields that never render.
4. **THEN Task 8** — Dashboard Generator (needs all chores/rewards/etc to exist first). Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-06-15-choreops-chores.md`. **In Task 8, select ONLY Rowan+Wystan as dashboard users** (excludes parents' stale entities — see §4). **Correct every `kc_` grep to `platform=choreops`.**
5. Remaining plan tasks: **9** (swap kitchen.yaml chores card for `/cod-chores` nav button — CLOBBER RISK §4) → **10** (delete orphaned local_todo Chores) → **11** (claim→approve smoke test via mouse/kbd) → **12** (commit + handoff).

## 4. CARRY-FORWARDS / LATENT ISSUES
- **STALE PARENT ENTITIES (new 2026-07-04, benign):** the direct storage-edit that made parents approvers-only did NOT tear down their chore/point entities (garrett/rebecca still have ~27 choreops entities incl. points/badges/claim_chore_fishy). ChoreOps only fully regenerates entities via its options-flow UI, not on hand-edited-JSON reload. **Harmless** — Task 8 picks only Rowan+Wystan so they never render. To clean the registry: ChoreOps → Edit User → Garrett → Save (and Rebecca) regenerates from the new flags.
- **DASHBOARD CLOBBER RISK (Task 9), UNCHANGED:** `feat/choreops-chores`'s `homeassistant/dashboards/kitchen.yaml` is OLD (placeholders `weather.home`, `todo.chores`, no headings). The LIVE Pi runs `feat/hardware-deploy`'s newer kitchen.yaml (weather=`weather.forecast_home`, Groceries/Chores headings). Before Task 9: `git show feat/hardware-deploy:homeassistant/dashboards/kitchen.yaml` and merge the weather+headings deltas, or you'll regress the live dashboard.
- **PI HA CONFIG DRIFT (Pi-side only):** `/config/configuration.yaml` on the Pi = default password auth (no auth_providers block). Backup on Pi: `configuration.yaml.bak.20260702`. Not in the repo (choreops branch doesn't own the HA config deploy). Reconcile at merge if desired.
- **🚩 PREFIX: installed ChoreOps 1.0.7 uses `choreops` prefix, NOT `kc_`.** Plan/spec still say `kc_`. Verify entities via `platform=choreops` in `.storage/core.entity_registry`, never the `kc_` substring (returns 0).
- **✅ FULL ChoreOps SOURCE IS VENDORED LOCALLY at `/Users/jdehart1/___Code_DEV/KitchenCOM/reference/ChoreOps-main/`** (found 2026-07-22). **Read form schemas / valid enums / validation rules from here instead of guessing or waiting on the Pi** — this is how the reward entry sheet was built with the Pi down. Useful entry points: `custom_components/choreops/helpers/flow_helpers.py` (all `build_*_schema` + `validate_*_inputs`), `options_flow.py` (step wiring + pre-fill defaults), `const.py` (every `DATA_*` / `DEFAULT_*` / enum). **⚠️ Vendored copy is v1.0.8; the Pi runs v1.0.7** — treat it as near-authoritative but confirm against the live form if a field looks unfamiliar.
- **⚠️ SHELL-CWD TRAP (bit this session):** `reference/ChoreOps-main/` is a **nested git repo**, and Bash cwd persists between calls. A `cd` into it followed by `git branch --show-current` reports a branch name that can coincide with the outer repo's — an easy way to commit to the wrong place. **Use absolute paths for git commands, or `cd` back to the repo root first.**
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
