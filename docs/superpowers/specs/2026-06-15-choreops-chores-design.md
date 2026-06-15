# ChoreOps Chores — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorm + 2 reviewer re-anchor passes folded)
**Supersedes:** the chore domain of the concurrent `feat/grocy-chores` slice. Grocy may still own stock/shopping/recipes/meals in future slices; ChoreOps owns **chores**.
**Implementation branch:** `feat/choreops-chores` (off `origin/main`) — NOT the current `feat/hardware-deploy`.
**Reviewer research:** `docs/session-state/2026-06-15-choreops-reviewer-research-handoff.md`.

---

## 1. Goal & context

Chores are the **#1 priority** of KitchenCOM (the household's primary motivation for the kitchen display: gamified family/kid chores). Replace the placeholder `todo.chores` local-to-do list with **ChoreOps** (`reference/ChoreOps-main`, v1.0.8, HA custom integration, quality_scale platinum), surfaced as a **Chores tab** on the live Wayland kiosk.

**Already live (context):** Pi 5 running HA 2026.6.3 in Docker (`:stable`), Wayland/labwc kiosk showing the kitchen dashboard, weather + `todo.groceries` + `todo.chores` cards wired. ChoreOps replaces only the chores card; groceries stays.

**Approved scope decisions:**
- Family: **2 parents (approvers) + 2 kids (gamified assignees)**.
- Gamification: **full** (XP, points, badges, ranks, quests, achievements, challenges, rewards), seeded with sensible defaults and tuned after — not hand-authored from zero.
- Install: **HACS** (one-time GitHub device-auth).
- Kiosk: keep kitchen home screen; add a **Chores tab**.
- Boundary: ChoreOps lives in `custom_components/` — **deliberately relaxes** the original "zero custom Python in custom_components/" spec boundary (user-approved). HACS manages the source on the Pi; it is NOT vendored into the KitchenCOM repo.

---

## 2. Corrected premises (from reviewer re-anchor — DO NOT regress)

These overturn casual claims made during brainstorming. The plan and runbook MUST reflect them:

1. **ChoreOps does NOT auto-generate a Lovelace dashboard.** `managers/ui_manager.py` is a backend manager (state/shards/translation sensors) — no panel registration, no storage-dashboard creation. Dashboards are **template `.yaml` files** under `custom_components/choreops/dashboards/templates/` that you **hand-vendor/adapt**. No runbook step may "wait for a dashboard to appear."
2. **Entity prefix is `kc_`, not `choreops_`.** ChoreOps inherits the KidsChores entity-id stem: `button.kc_*`, `sensor.kc_*`, `calendar.kc_*` (verified in `const.py`; `_attr_has_entity_name=True` makes the slug name-derived). Any verification step must check `kc_` or use the entity registry / unique_id — a `choreops_*` check FALSE-NEGATIVES a healthy install.
3. **Two frontend custom cards required**, not one: `custom:button-card` AND `custom:auto-entities` (the v1 template line). Both HACS-installed + registered as Lovelace resources, or the views render empty.
4. **Not "self-contained":** ChoreOps pip-installs `python-dateutil>=2.9.0` at integration load. Trivial wheel, but state it.
5. **Avoid the "classic" templates** — they additionally need the mushroom suite + mini-graph-card (4 cards). The **v1 line** is the cheap-dependency path (2 cards).

---

## 3. Architecture

### 3.1 Install chain (on the Pi, via HACS)
1. **Pre-flight (verify, don't assume):** `docker exec homeassistant python3 --version` ≥ 3.13; HA ≥ 2025.6 (already confirmed 2026.6.3 ✓).
2. **Install HACS** → restart HA → complete GitHub **device-auth** in the UI (human-gated step).
3. **Via HACS, install + pin:**
   - ChoreOps `ccpk1/choreops` @ **v1.0.8** → `/config/custom_components/choreops/`. *(If no real v1.0.8 release tag exists, HACS pins to `main` HEAD; the offline copy at `reference/ChoreOps-main/custom_components/choreops/` is the deterministic fallback — prefer it for reproducibility.)*
   - `custom:button-card` and `custom:auto-entities` → register both as Lovelace resources (module), like the screensaver card.
4. **Restart HA** → ChoreOps appears in Settings → Devices & Services.

### 3.2 Configuration (config-flow + options-flow)
- Add the ChoreOps integration; create the household.
- **Profiles:** 2 parents (approver) + 2 kids (assignee). Real names/ages at implementation.
- **Gamification seed:** starter chores (points + due/recurrence, assignable), a starter reward store (point-cost items), starter badges/ranks/quests/achievements/challenges with sensible thresholds. Lean on ChoreOps starter content + a small seed set; user tunes after. **Entities must be provisioned BEFORE the dashboard references them** (provisioning order is a plan concern).

### 3.3 Dashboard & kiosk
- **Chores tab** on the kiosk dashboard with **two sub-views** (reviewer-verified disjoint `ui_control` roots — no state collision):
  - **Kids:** `gamification-premier-v1` (both kids' chores, claim, points, badges — the fun layer). *Note (M-1): large template (~3057 LOC, inline render ceiling); fine for 2 kids.*
  - **Parents:** `admin-shared-v1` (approve/disapprove queue).
- Both templates **vendored** into the repo (committed yaml), lightly adapted + KitchenCOM-themed. Kitchen home screen stays default; Chores is a tab.
- **Retire** the placeholder `todo.chores` card (superseded). Keep `todo.groceries`. (The `local_todo` Chores list created earlier may be deleted or left orphaned — plan decides.)

---

## 4. Testing & rollout

- **Branch:** `feat/choreops-chores` off `origin/main`.
- **Gates (mirror the session's deploy discipline):**
  1. Pre-flight version checks pass.
  2. `check_config` clean before each HA restart.
  3. ChoreOps entities register — verify via **entity registry / `kc_` prefix** (`button.kc_*`, `sensor.kc_*`, `calendar.kc_*`) — **NOT `choreops_*`** (C-1).
  4. Both card resources load (HTTP 200 at their `/local/...` or HACS resource URLs).
  5. Chores tab renders on the kiosk (both sub-views).
  6. **Loop smoke-test:** kid claims a chore → parent approves → points move; a reward redemption → parent approve → points deduct.
- **Concurrent-session hazard:** verify `git branch --show-current` before any commit (shared checkout). Record the ChoreOps-supersedes-Grocy-chores pivot prominently so the other session sees it.

## 5. Open items for the plan (deferred, not blockers)
- Exact entity-provisioning order (entities before dashboard references).
- HACS GitHub device-auth as an explicit human-gated step.
- Precise Lovelace resource registration for button-card + auto-entities (HACS auto-registers vs manual).
- Confirm `v1.0.8` release tag exists, else main-HEAD pin vs offline-copy decision.
- Disposition of the orphaned `local_todo` Chores list.

## 6. Out of scope (this slice)
- Grocy / stock / shopping / recipes / meals (future slices).
- Reward-store + badge-gallery as dedicated kiosk sub-tabs (deferred; full gamification still runs underneath — surfaced later).
- Voice/calendar/screensaver-media integrations (separate, credential-gated work).
