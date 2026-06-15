# ChoreOps Chores Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install ChoreOps as KitchenCOM's gamified chore system on the live Pi, configured for 2 parents + 2 kids with full gamification, surfaced via a home-screen link to ChoreOps' generated dashboard on the Wayland kiosk.

**Architecture:** ChoreOps is a HACS-managed HA custom integration on the Pi (HA 2026.6.3 in Docker, reachable via `ssh kitchencom`). It generates its own multi-view Lovelace dashboard (`cod-chores`) into HA storage via its options-flow Dashboard Generator (NOT hand-vendored YAML — the templates are un-renderable Jinja). The kitchen home dashboard stays the kiosk default; the placeholder `todo.chores` card is replaced with a navigation button to `/cod-chores`. We version-control the generation *procedure* (this plan + runbook), not the generated artifact.

**Tech Stack:** Home Assistant (Docker), HACS, ChoreOps v1.0.7 (`custom_components/choreops`), `button-card` + `auto-entities` frontend cards, labwc/Wayland kiosk, `ssh kitchencom`.

**Spec:** `docs/superpowers/specs/2026-06-15-choreops-chores-design.md`

**Version note (2026-06-15, during execution):** Pinned to **1.0.7** — the latest PUBLISHED HACS release (`ccpk1/ChoreOps` tags top out at 1.0.7; the `reference/ChoreOps-main` copy's `1.0.8` is an untagged snapshot ahead of release, not installable via HACS). The installed 1.0.7 was verified to carry identical load-bearing mechanics (kc_ prefix, `cod-` url prefix, Dashboard Generator in options_flow + dashboard_builder, python-dateutil dep, both templates present) — the plan transfers cleanly.

**CRITICAL non-regression facts (from spec §2):**
- ChoreOps DOES auto-generate dashboards (options-flow Dashboard Generator → HA storage `cod-chores`). Do NOT hand-vendor the `dashboards/templates/*.yaml` — they are raw Jinja (`<< user.name >>`), un-renderable as static YAML.
- Entity prefix is **`kc_`** (`button.kc_*`, `sensor.kc_*`) — NOT `choreops_*`. Verify against `kc_` or the entity registry.
- Needs BOTH `button-card` AND `auto-entities` registered before generating, or the dashboard renders empty.
- ChoreOps pip-installs `python-dateutil>=2.9.0` on load (not "self-contained").

**Human-gated steps (require the user):** HACS GitHub device-auth; all ChoreOps options-flow UI config (assignees, chores, gamification seed, Dashboard Generator) is done in the HA browser UI, not via SSH. The agent drives SSH/file/verification steps and *guides* the user through UI steps.

---

## Chunk 1: Branch + pre-flight

### Task 1: Create the implementation branch

**Files:** none (git only)

- [ ] **Step 1: Verify current branch + clean state**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current && git status --short`
Expected: prints current branch; note any uncommitted work (the hardware-deploy + spec commits may be present). Concurrent-session hazard: confirm you know which branch you're on.

- [ ] **Step 2: Create `feat/choreops-chores` off origin/main**

Run: `git switch -c feat/choreops-chores origin/main`
Expected: "Switched to a new branch 'feat/choreops-chores'". (Untracked files follow; that's fine.)

### Task 2: Pre-flight version checks (gate)

**Files:** none (verification only)

- [ ] **Step 1: Verify HA + Python versions on the Pi meet ChoreOps floor**

Run:
```bash
ssh kitchencom 'echo "HA:"; sudo docker exec homeassistant cat /config/.HA_VERSION; echo "Python:"; sudo docker exec homeassistant python3 --version'
```
Expected: HA ≥ 2025.6 (known 2026.6.3 ✓) and Python ≥ 3.13. If Python < 3.13, STOP — pull a newer image and recreate the container with the SAME run args:
```bash
ssh kitchencom 'sudo docker pull ghcr.io/home-assistant/home-assistant:stable && sudo docker stop homeassistant && sudo docker rm homeassistant && sudo docker run -d --name homeassistant --restart=unless-stopped --privileged --network=host -e TZ=America/New_York -v /home/garrettdehart/homeassistant:/config ghcr.io/home-assistant/home-assistant:stable'
```
Do not proceed past a failed floor. (HA already at 2026.6.3/Python 3.13, so this branch is unlikely to fire.)

- [ ] **Step 2: Confirm ChoreOps offline source is present (fallback)**

Run: `ls /Users/jdehart1/___Code_DEV/KitchenCOM/reference/ChoreOps-main/custom_components/choreops/manifest.json && grep '"version"' /Users/jdehart1/___Code_DEV/KitchenCOM/reference/ChoreOps-main/custom_components/choreops/manifest.json`
Expected: file exists, version `1.0.7`. This is the deterministic fallback if HACS can't fetch.

---

## Chunk 2: HACS + frontend cards

### Task 3: Install HACS

**Files:** creates `/config/custom_components/hacs/` on the Pi (via download script)

- [ ] **Step 1: Run the official HACS install script in the HA container**

Run:
```bash
ssh kitchencom 'sudo docker exec homeassistant bash -c "wget -O - https://get.hacs.xyz | bash -" 2>&1 | tail -15'
```
Expected: "HACS installation complete" (or similar). The script downloads HACS into `/config/custom_components/hacs/`.

- [ ] **Step 2: Validate config + restart HA**

Run:
```bash
ssh kitchencom 'sudo docker exec homeassistant python -m homeassistant --script check_config --config /config >/tmp/chk.txt 2>&1; echo "exit:$?"; grep -iE "error|invalid" /tmp/chk.txt || echo "clean"; sudo docker restart homeassistant >/dev/null && echo restarted; for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q ":8123" && { echo "up after ~$((i*2))s"; break; }; sleep 2; done'
```
Expected: check exit 0/clean, HA restarts and comes back up.

- [ ] **Step 3: [HUMAN-GATED] Add the HACS integration + GitHub device-auth**

Guide the user (HA browser UI):
1. Settings → Devices & Services → + Add Integration → search "HACS"
2. Check the acknowledgement boxes → Submit
3. A GitHub device-auth dialog shows a code + opens github.com/login/device — user enters the code and authorizes
4. HACS finishes setup and appears in the sidebar

Verify: `ssh kitchencom 'sudo python3 -c "import json,glob; print([x.get(\"domain\") for x in json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.config_entries\"))[\"data\"][\"entries\"] if x.get(\"domain\")==\"hacs\"])"'`
Expected: `['hacs']` — HACS config entry exists.

### Task 4: Install button-card + auto-entities via HACS

**Files:** creates `/config/www/community/...` on the Pi; registers Lovelace resources

- [ ] **Step 1: [HUMAN-GATED] Install both frontend cards via HACS**

Guide the user (HA browser UI): HACS → search "button-card" (by RomRider) → Download; HACS → search "auto-entities" (by Thomas Lovén) → Download. Then restart HA when HACS prompts (or via SSH below).

- [ ] **Step 2: Restart HA + verify card resources auto-registered**

Run:
```bash
ssh kitchencom 'sudo docker restart homeassistant >/dev/null && echo restarted; for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q ":8123" && break; sleep 2; done; echo "=== lovelace resources ==="; sudo python3 -c "import json; d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/lovelace_resources\")); print([i[\"url\"] for i in d[\"data\"][\"items\"]])"'
```
Expected: the resource list includes both `button-card.js` and `auto-entities.js` paths (HACS auto-registers for storage-mode Lovelace). If EITHER is missing, add it manually to `.storage/lovelace_resources` (same install pattern used for the screensaver card) and restart.

- [ ] **Step 3: Confirm both cards serve HTTP 200**

Run:
```bash
ssh kitchencom 'for u in $(sudo python3 -c "import json; [print(i[\"url\"]) for i in json.load(open(\"/home/garrettdehart/homeassistant/.storage/lovelace_resources\"))[\"data\"][\"items\"]]"); do code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8123$u"); echo "$code $u"; done'
```
Expected: `200` for the button-card and auto-entities URLs.

---

## Chunk 3: ChoreOps install + configuration

### Task 5: Install ChoreOps via HACS

**Files:** creates `/config/custom_components/choreops/` on the Pi

- [ ] **Step 1: [HUMAN-GATED] Add ChoreOps as a HACS custom repository + download**

Guide the user (HA browser UI): HACS → ⋮ (top-right) → Custom repositories → add `https://github.com/ccpk1/choreops` , type "Integration" → Add. Then HACS → search "ChoreOps" → Download → select version **v1.0.7** (tag exists per `hacs.json` `hide_default_branch:true`).

*Fallback if HACS can't fetch:* `scp -r reference/ChoreOps-main/custom_components/choreops kitchencom:/tmp/ && ssh kitchencom 'sudo cp -r /tmp/choreops /home/garrettdehart/homeassistant/custom_components/ && sudo chown -R garrettdehart:garrettdehart /home/garrettdehart/homeassistant/custom_components/choreops'`

- [ ] **Step 2: Restart HA + verify ChoreOps loaded (and python-dateutil pulled)**

Run:
```bash
ssh kitchencom 'sudo docker exec homeassistant python -m homeassistant --script check_config --config /config >/tmp/chk.txt 2>&1; echo "exit:$?"; grep -iE "error|invalid" /tmp/chk.txt || echo clean; sudo docker restart homeassistant >/dev/null; for i in $(seq 1 40); do ss -tln 2>/dev/null | grep -q ":8123" && break; sleep 2; done; echo "=== choreops integration files present? ==="; ls /home/garrettdehart/homeassistant/custom_components/choreops/manifest.json; echo "=== load errors? ==="; sudo docker logs homeassistant 2>&1 | grep -iE "choreops" | grep -iE "error|fail|traceback" | tail -10 || echo "no choreops errors"'
```
Expected: check clean, HA up, manifest present, no choreops load errors.

### Task 6: [HUMAN-GATED] Configure household — profiles

**Files:** ChoreOps storage on the Pi (instance state)

- [ ] **Step 1: Add the ChoreOps integration + create the 2 parents + 2 kids**

Guide the user (HA browser UI): Settings → Devices & Services → + Add Integration → "ChoreOps" → complete config-flow. Then ChoreOps → Configure (options-flow) → add assignees: 2 parents (role = approver/parent) + 2 kids (role = assignee/kid). Use the real names the user provides now.

- [ ] **Step 2: Verify assignee entities registered (kc_ prefix)**

Run:
```bash
ssh kitchencom 'sudo python3 -c "import json; r=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\")); kc=[e[\"entity_id\"] for e in r[\"data\"][\"entities\"] if e[\"entity_id\"].split(\".\")[1].startswith(\"kc_\")]; print(\"kc_ entities:\", len(kc)); [print(\" \",x) for x in kc[:20]]"'
```
Expected: a set of `*.kc_*` entities (sensors/buttons per assignee). NOT `choreops_*`. Non-empty = profiles provisioned.

### Task 7: [HUMAN-GATED] Seed chores + full gamification

**Files:** ChoreOps storage (instance state)

- [ ] **Step 1: Create starter chores**

Guide the user (options-flow → Chores): create a handful of starter chores (e.g. dishes, trash, bed, homework, vacuum), each with points, a due/recurrence, and assigned to a kid (or rotation across both). Lean on ChoreOps defaults; user tunes later.

- [ ] **Step 2: Enable + seed full gamification**

Guide the user (options-flow): enable the gamification features (badges, ranks, quests, achievements, challenges) and seed a small **reward store** (a few point-cost rewards the kids can redeem). Use ChoreOps' starter/default thresholds where offered.

- [ ] **Step 3: Verify chore + reward entities exist**

Run:
```bash
ssh kitchencom 'sudo python3 -c "import json; r=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\")); ids=[e[\"entity_id\"] for e in r[\"data\"][\"entities\"]]; kc=[i for i in ids if \".kc_\" in i]; print(\"total kc_ entities:\", len(kc)); print(\"buttons:\", len([i for i in kc if i.startswith(\"button.\")])); print(\"sensors:\", len([i for i in kc if i.startswith(\"sensor.\")]))"'
```
Expected: counts grew vs Task 6 (chores add buttons/sensors). Confirms chores/rewards provisioned BEFORE dashboard generation.

---

## Chunk 4: Dashboard generation + kiosk wiring

### Task 8: [HUMAN-GATED] Generate the cod-chores dashboard

**Files:** creates `.storage/lovelace.cod-chores` on the Pi (ChoreOps-generated)

- [ ] **Step 1: Run the Dashboard Generator**

Guide the user (HA browser UI): Settings → Devices & Services → ChoreOps → Configure → **Dashboard Generator**. Set:
- Name: `Chores`
- Assignees: both kids
- Template: `user-gamification-premier-v1`
- Admin mode: `global` (adds the parent approval view as a tab, from admin-shared)
- Release: `current_installed`
Submit. ChoreOps renders + writes the dashboard to storage at url_path `cod-chores`.

- [ ] **Step 2: Verify the generated dashboard exists + is non-empty**

Run:
```bash
ssh kitchencom 'f=/home/garrettdehart/homeassistant/.storage/lovelace.cod-chores; sudo test -f "$f" && echo "FOUND $f" || echo "MISSING (check url_path: ls .storage/lovelace.*)"; sudo ls -la /home/garrettdehart/homeassistant/.storage/lovelace.cod* 2>/dev/null; echo "=== view/card count ==="; sudo python3 -c "import json; d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/lovelace.cod-chores\")); v=d[\"data\"][\"config\"][\"views\"]; print(\"views:\", len(v), \"| titles:\", [x.get(\"title\") for x in v])" 2>/dev/null || echo "(adjust filename from ls above)"'
```
Expected: the `lovelace.cod-chores` storage file exists with multiple views (per-kid + Admin). Non-empty views = generation succeeded.

- [ ] **Step 3: Confirm it serves on the kiosk URL**

Run: `ssh kitchencom 'curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8123/cod-chores'`
Expected: `200`.

### Task 9: Replace the todo.chores card with a Chores nav button

**Files:** Modify `homeassistant/dashboards/kitchen.yaml` (repo) + deploy to Pi

- [ ] **Step 1: Edit the dashboard — swap the chores todo card for a navigation button**

In `homeassistant/dashboards/kitchen.yaml`, replace the `todo.chores` todo-list card block with:
```yaml
          - type: button
            name: Chores
            icon: mdi:broom
            tap_action:
              action: navigate
              navigation_path: /cod-chores
            show_state: false
```
(Keep the surrounding grid/section + the `todo.groceries` card intact.)

- [ ] **Step 2: Deploy + validate + reload**

Run:
```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
scp homeassistant/dashboards/kitchen.yaml kitchencom:/home/garrettdehart/homeassistant/dashboards/
ssh kitchencom 'sudo docker exec homeassistant python -m homeassistant --script check_config --config /config >/tmp/chk.txt 2>&1; echo "exit:$?"; grep -iE "error|invalid" /tmp/chk.txt || echo clean; sudo docker restart homeassistant >/dev/null; for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q ":8123" && break; sleep 2; done; echo "HA up"'
```
Expected: check clean, HA back up.

- [ ] **Step 3: [HUMAN-VERIFY] Confirm on the kiosk**

Ask the user to look at the kitchen monitor: the home screen now shows a **"Chores" button** (broom icon) where the chores list was. Tapping it opens the ChoreOps dashboard (per-kid + Admin tabs). Back nav returns home.

### Task 10: Delete the orphaned local_todo Chores list

**Files:** ChoreOps/HA storage (instance state)

- [ ] **Step 1: [HUMAN-GATED] Remove the old Chores to-do integration**

Guide the user: Settings → Devices & Services → Local To-do → the `Chores` entry → Delete. (Leave `Groceries`.) This removes the now-superseded `todo.chores` entity so there's a single chore surface.

- [ ] **Step 2: Verify it's gone**

Run: `ssh kitchencom 'sudo python3 -c "import json; r=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\")); print(\"todo.chores present:\", any(e[\"entity_id\"]==\"todo.chores\" for e in r[\"data\"][\"entities\"]))"'`
Expected: `todo.chores present: False`.

---

## Chunk 5: Smoke test + commit

### Task 11: End-to-end loop smoke test (gate)

**Files:** none (verification)

- [ ] **Step 1: [HUMAN-GATED] Run the claim→approve→points loop**

Guide the user on the kiosk (or browser): as a kid, **claim/complete** a chore → as a parent, **approve** it → confirm the kid's **points increase**. Then **redeem a reward** → parent **approves** → confirm points **decrease**. This proves the full gamified workflow end to end.

- [ ] **Step 2: Verify a points sensor reflects the change**

Run:
```bash
ssh kitchencom 'sudo python3 -c "import json; r=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\")); pts=[e[\"entity_id\"] for e in r[\"data\"][\"entities\"] if \".kc_\" in e[\"entity_id\"] and (\"point\" in e[\"entity_id\"].lower() or \"balance\" in e[\"entity_id\"].lower())]; print(\"points sensors:\", pts)"'
```
Expected: lists the per-kid points sensors (their states change as chores are approved). NOTE: this substring filter (`point`/`balance`) is best-effort — ChoreOps may name the balance sensor `_total`/`_xp`/etc., so an empty list here is NOT a failure. The UI confirmation in Step 1 is the real gate; if empty, widen the grep to all `.kc_` sensors and eyeball the points entity.

### Task 12: Commit the repo changes + update handoff

**Files:** `homeassistant/dashboards/kitchen.yaml`, `docs/session-state/...`

- [ ] **Step 1: Verify branch (hazard) + commit the dashboard change**

Run:
```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current   # MUST be feat/choreops-chores
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat(dashboard): replace todo.chores card with ChoreOps nav button

ChoreOps installed via HACS; chores now live in its generated cod-chores
dashboard (HA storage). Home screen links to it. local_todo Chores retired.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: commit on `feat/choreops-chores`.

- [ ] **Step 2: Write a deployment handoff**

Create `docs/session-state/2026-06-15-choreops-deployed-handoff.md` documenting: install state (HACS + ChoreOps v1.0.7 + button-card + auto-entities), the exact Dashboard Generator settings used (for reproducibility — this IS the version-controlled procedure), the family profiles created, gamification seed, the `cod-chores` url_path, and that the generated dashboard is HA storage state (not in repo). Commit it.

- [ ] **Step 3: Update memory**

Note in memory (`choreops-templates-hand-vendored.md` or a new deployment-state entry) that ChoreOps is DEPLOYED and live, with the generator-procedure reference.

---

## Notes for the executor
- **Most config is human-gated UI work.** The agent's job: drive SSH/file/verification steps, and *guide* the user precisely through each browser-UI step, then verify the result via `.storage` inspection before proceeding.
- **Never check `choreops_*`** — always `kc_` or the registry.
- **Order matters:** cards (Task 4) before generate; assignees+chores (Tasks 6-7) before generate (Task 8) — the generator injects identities that must already exist.
- **check_config before every restart** (session discipline).
- If HACS can't fetch ChoreOps, use the offline-copy fallback in Task 5 Step 1.
