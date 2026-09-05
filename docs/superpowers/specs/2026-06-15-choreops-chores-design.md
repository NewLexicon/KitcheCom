# ChoreOps Chores — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorm + 2 reviewer re-anchor passes folded)
**Supersedes:** the chore domain of the concurrent `feat/grocy-chores` slice. Grocy may still own stock/shopping/recipes/meals in future slices; ChoreOps owns **chores**.
**Implementation branch:** `feat/choreops-chores` (off `origin/main`) — NOT the current `feat/hardware-deploy`.
**Reviewer research:** `docs/session-state/2026-06-15-choreops-reviewer-research-handoff.md`.

---

## 1. Goal & context

Chores are the **#1 priority** of KitchenCOM (the household's primary motivation for the kitchen display: gamified family/kid chores). Replace the placeholder `todo.chores` local-to-do list with **ChoreOps** (`reference/ChoreOps-main`, v1.0.7, HA custom integration, quality_scale platinum), surfaced as a **Chores tab** on the live Wayland kiosk.

**Already live (context):** Pi 5 running HA 2026.6.3 in Docker (`:stable`), Wayland/labwc kiosk showing the kitchen dashboard, weather + `todo.groceries` + `todo.chores` cards wired. ChoreOps replaces only the chores card; groceries stays.

**Approved scope decisions:**
- Family: **2 parents (approvers) + 2 kids (gamified assignees)**.
- Gamification: **full** (XP, points, badges, ranks, quests, achievements, challenges, rewards), seeded with sensible defaults and tuned after — not hand-authored from zero.
- Install: **HACS** (one-time GitHub device-auth).
- Kiosk: keep kitchen home screen; add a **Chores tab**.
- Boundary: ChoreOps lives in `custom_components/` — **deliberately relaxes** the original "zero custom Python in custom_components/" spec boundary (user-approved). HACS manages the source on the Pi; it is NOT vendored into the KitchenCOM repo.

---

## 2. Corrected premises (DO NOT regress)

These overturn casual claims made during brainstorming AND a wrong correction from the first reviewer pass. The plan and runbook MUST reflect them:

1. **ChoreOps DOES auto-generate dashboards — via its options-flow "Dashboard Generator", NOT hand-vendored templates.** *(This corrects an earlier reviewer conclusion that cited `ui_manager.py` — the wrong file. Verified by a deeper trace 2026-06-15:)* `options_flow.py:455` `async_step_dashboard_generator` → `helpers/dashboard_builder.py:647` `render_dashboard_template()` renders the `<< >>` Jinja2 templates (custom delimiters, `dashboard_builder.py:690`) injecting real assignee names → `create_choreops_dashboard()` (`dashboard_builder.py:1040`) writes the result **directly to HA Lovelace storage** at url_path `cod-<name>` (e.g. `cod-chores`, `:1371`). **The `dashboards/templates/*.yaml` files are un-renderable raw Jinja (`<< user.name >>`, `<< template_shared.* >>` includes) — they CANNOT be copy-pasted as static YAML.** There is **no** `choreops.generate_dashboard` service; generation is options-flow-UI-only (human-gated).
2. **Build approach = Option 1 (use the generator + link from home screen).** The generated `cod-chores` dashboard lives in **HA storage (instance state, NOT the repo)**. We version-control the **generation PROCEDURE** in the runbook (install → assignees → Dashboard Generator with documented settings), not the artifact — same pattern as the `local_todo` lists. The kitchen home screen stays the kiosk default; the `todo.chores` card is replaced with a **navigation link/button** to the `cod-chores` dashboard. Kiosk is NOT repointed. *(Rejected: hand-vendoring 480KB rendered YAML — brittle, meaningless diffs, drifts on every ChoreOps update.)*
3. **Entity prefix is `kc_`, not `choreops_`.** ChoreOps inherits the KidsChores entity-id stem: `button.kc_*`, `sensor.kc_*`, `calendar.kc_*` (verified in `const.py:2690` `BUTTON_KC_PREFIX="button.kc_"`; `_attr_has_entity_name=True` makes the slug name-derived). Any verification step must check `kc_` or use the entity registry / unique_id — a `choreops_*` check FALSE-NEGATIVES a healthy install.
4. **Frontend custom cards:** the `gamification-premier-v1` + `admin-shared-v1` templates render to YAML that uses `custom:button-card` AND `custom:auto-entities`. Both must be HACS-installed + registered as Lovelace resources, or the generated dashboard renders empty. *(Avoid the "classic" templates — they additionally need the mushroom suite + mini-graph-card.)*
5. **Not "self-contained":** ChoreOps pip-installs `python-dateutil>=2.9.0` at integration load. Trivial wheel, but state it.

---

## 3. Architecture

### 3.1 Install chain (on the Pi, via HACS)
1. **Pre-flight (verify, don't assume):** `docker exec homeassistant python3 --version` ≥ 3.13; HA ≥ 2025.6 (already confirmed 2026.6.3 ✓).
2. **Install HACS** → restart HA → complete GitHub **device-auth** in the UI (human-gated step).
3. **Via HACS, install + pin:**
   - ChoreOps `ccpk1/choreops` @ **v1.0.7** → `/config/custom_components/choreops/`. *(If no real v1.0.7 release tag exists, HACS pins to `main` HEAD; the offline copy at `reference/ChoreOps-main/custom_components/choreops/` is the deterministic fallback — prefer it for reproducibility.)*
   - `custom:button-card` and `custom:auto-entities` → register both as Lovelace resources (module), like the screensaver card.
4. **Restart HA** → ChoreOps appears in Settings → Devices & Services.

### 3.2 Configuration (config-flow + options-flow)
- Add the ChoreOps integration; create the household.
- **Profiles:** 2 parents (approver) + 2 kids (assignee). Real names/ages at implementation.
- **Gamification seed:** starter chores (points + due/recurrence, assignable), a starter reward store (point-cost items), starter badges/ranks/quests/achievements/challenges with sensible thresholds. Lean on ChoreOps starter content + a small seed set; user tunes after. **Entities must be provisioned BEFORE the dashboard references them** (provisioning order is a plan concern).

### 3.3 Dashboard & kiosk (Option 1 — generator + home-screen link)
- Run ChoreOps' **Dashboard Generator** (options-flow) to create a multi-view `cod-chores` dashboard in HA storage:
  - Template: **`user-gamification-premier-v1`** (kids' chores/claim/points/badges — the fun layer). *Note (M-1): large template ~3057 LOC, inline render ceiling; fine for 2 kids.*
  - Admin mode: **`global`** (adds the parent approve/disapprove view as a tab within the generated dashboard, sourced from `admin-shared-v1`). The generated dashboard's own tabs (per-kid + Admin) cover the two-sub-view intent — we do NOT hand-build them.
  - Assignees: the 2 kids (+ admin tab for parents).
- The generated dashboard is **HA storage state, NOT vendored into the repo.** Version-control the **generation procedure** (exact generator settings) in the runbook so it's reproducible.
- **Kiosk:** stays pointed at the `kitchen-snapshot` home dashboard. **Replace** the placeholder `todo.chores` card with a **navigation button** (`type: button`/`navigation` action, or a `picture`/`markdown` link) that opens `/cod-chores`. Tap Chores → ChoreOps dashboard; built-in back nav returns home. Kiosk is NOT repointed.
- **Frontend cards:** `button-card` + `auto-entities` must be installed/registered BEFORE generating (else the generated dashboard renders empty).
- Keep `todo.groceries`. The earlier `local_todo` **Chores** list is now orphaned → **delete it** (plan step) to avoid two competing chore surfaces.

---

## 4. Testing & rollout

- **Branch:** `feat/choreops-chores` off `origin/main`.
- **Gates (mirror the session's deploy discipline):**
  1. Pre-flight version checks pass.
  2. `check_config` clean before each HA restart.
  3. ChoreOps entities register — verify via **entity registry / `kc_` prefix** (`button.kc_*`, `sensor.kc_*`, `calendar.kc_*`) — **NOT `choreops_*`** (C-1).
  4. Both card resources load (HACS-registered; confirm present in `.storage/lovelace_resources`).
  5. **Generated `cod-chores` dashboard exists** (`.storage/lovelace.cod-chores` or sidebar) and renders (not empty) on the kiosk after tapping the home-screen Chores link.
  6. **Loop smoke-test:** kid claims a chore → parent approves → points move; a reward redemption → parent approve → points deduct.
- **Concurrent-session hazard:** verify `git branch --show-current` before any commit (shared checkout). Record the ChoreOps-supersedes-Grocy-chores pivot prominently so the other session sees it.

## 5. Open items — RESOLVED (during plan drafting)
- **Generation mechanism:** options-flow Dashboard Generator → writes to HA storage `cod-chores` (NOT a service, NOT hand-vendored). §2.1.
- **Build approach:** Option 1 — generator + home-screen nav link; procedure version-controlled, artifact is instance state. §2.2 / §3.3.
- **Entity-provisioning order:** assignees + chores created BEFORE running the Dashboard Generator (generator injects assignee identities). §3.2.
- **v1.0.7 pin:** `hacs.json` has `hide_default_branch: true` → HACS uses release tags; pin to `v1.0.7`. Offline copy `reference/ChoreOps-main` is deterministic fallback.
- **HACS card resources:** HACS auto-registers frontend-card resources on install for storage-mode Lovelace; plan verifies via `.storage/lovelace_resources` and adds manually only if absent.
- **Orphaned `local_todo` Chores list:** delete it (§3.3) so there's one chore surface.
- **HACS GitHub device-auth:** explicit human-gated step in the plan (user authorizes in browser).

## 6. Out of scope (this slice)
- Grocy / stock / shopping / recipes / meals (future slices).
- Reward-store + badge-gallery as dedicated kiosk sub-tabs (deferred; full gamification still runs underneath — surfaced later).
- Voice/calendar/screensaver-media integrations (separate, credential-gated work).
