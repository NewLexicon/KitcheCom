# ChoreOps — Reviewer Research Handoff (for controller)

**Date:** 2026-06-15
**Role:** Reviewer (research only — not implementing). Deliverable = verified facts + corrected view-selection model for the controller to fold into spec/plan.
**Branch context:** brainstorm happened on `feat/hardware-deploy`; ChoreOps slice should get its own branch (`feat/choreops-chores`) per brainstorm.
**Source of truth read:** `reference/ChoreOps-main/` (gitignored local copy, v1.0.8) + live Pi (`ssh kitchencom`).

---

## 1. Verified facts (empirical, re-anchored)

| Claim | Verdict | Evidence |
|---|---|---|
| ChoreOps exists, v1.0.8, platinum, config_flow | ✅ TRUE | `custom_components/choreops/manifest.json` |
| Lives in `custom_components/` (boundary break) | ✅ TRUE | path confirmed |
| HA floor 2025.6 | ✅ TRUE | `hacs.json: "homeassistant": "2025.6"` |
| Pi runs HA ≥ floor | ✅ TRUE — **2026.6.3** `:stable` | `docker exec homeassistant cat /config/.HA_VERSION` |
| Ships dashboard templates | ✅ TRUE — 9 templates | `dashboards/templates/*.yaml` |

## 2. Corrections to the brainstorm (load-bearing)

### C-1 (Critical): ChoreOps does NOT auto-generate a dashboard.
`managers/ui_manager.py` (711 LOC) is a **backend** manager (chore shards, translation sensors, per-user UI prefs). **No panel registration, no storage-dashboard creation, no frontend writing.** Grep for `async_register_panel`/`frontend.`/storage-dashboard creation → none.
**Consequence:** the brainstorm's "Approach 1 (generate storage dashboard)" and "Approach 3 (generate then export)" were premised on auto-generation that doesn't exist. **All paths reduce to: hand-vendor a provided template `.yaml` into the repo dashboard.** The chosen *outcome* (vendored family view, kiosk tab) is unchanged and simpler than billed. Runbook must NOT tell the operator to wait for a dashboard to appear.

### C-2 (Important): The chosen template needs TWO custom cards, not one.
Brainstorm named only `button-card`. Family/admin views also need **`custom:auto-entities`**. Both must be HACS-installed + registered as Lovelace resources or the view renders empty.

### C-3 (Important): "Self-contained / zero external moving parts" is inaccurate.
ChoreOps pip-installs **`python-dateutil>=2.9.0`** at load (`manifest.json: requirements`) and its UI depends on HACS frontend cards. Trivial in practice; state it accurately in the runbook.

### C-4 (Minor): Python floor is a hard `requires-python = ">=3.13"` (`pyproject.toml`).
HA 2026.6 ships Python 3.13 so near-certainly fine, but pre-flight must RUN `docker exec homeassistant python3 --version`, not assume.

## 3. View-selection — corrected model (this revises the brainstorm's "family overview = admin-shared-v1")

The brainstorm mapped the chosen "family overview, both kids side-by-side, claim + parent-approve" to `admin-shared-v1`. **The template intent docs (`dashboards/preferences/*.md`) show the ChoreOps split is different from how the brainstorm framed it:**

- **`admin-*` templates = APPROVAL boards** (parent-facing). `admin-shared-v1` = "shared admin approval board… every user who currently has pending chore or reward approvals… stacked approval rows." It is the **parent approve/disapprove queue**, NOT a kids' chore-list-with-progress view.
- **`user-*` templates = the per-person CHORE experience** (the claim/progress/gamification side the kids interact with).

So the brainstorm's "family overview" actually wants **BOTH halves**: a `user-*` chore view (kids claim + see progress/points) **and** an `admin-*` approval board (parents approve). One template alone doesn't deliver "claim + parent-approve in the family overview." This is the key thing for the controller to design around.

### Template inventory (size = complexity proxy; cards = dependency cost)

| Template | LOC | Custom cards required | Role |
|---|---|---|---|
| `user-chores-lite-v1` | 645 | **`auto-entities` only** | Kid chore view, native HA cards, old-device friendly |
| `user-chores-standard-v1` | 312* | `auto-entities` + `button-card` | **Default** kid chore view, full claim/approve/undo, `kids` row variant |
| `user-chores-essential-v1` | 738 | `auto-entities` + `button-card` | Lightweight kid view; **inline cap ~25 chores/user** |
| `user-gamification-premier-v1` | 3057 | `auto-entities` + `button-card` | Full kid view + rewards + badges (the "full gamification" surface) |
| `admin-shared-v1` | 3911 | `auto-entities` + `button-card` | Parent approval board, all users together |
| `admin-peruser-v1` | 3915 | `auto-entities` + `button-card` | Parent approval board, per-user context |
| `*-kidschores-classic` (3 files) | 1264–1921 | `auto-entities` + **`mini-graph-card` + `mushroom-select-card` + `mushroom-template-card`** | Legacy "classic" look — **most card deps, avoid** |

\* standard-v1 is smaller because it composes from shared fragments in `templates/shared/`.

**Key dependency insight:** the cheap-dependency path is the **v1 line** (`auto-entities` + `button-card` = 2 cards). The **classic** templates are the expensive ones (4 cards incl. mushroom suite) — the brainstorm's instinct to avoid them is right, just for a different reason than stated.

**`user-chores-standard-v1` has a built-in `kids` row variant** (`pref_chore_row_variant: kids`, default mobile columns = 2) — purpose-built for the kid audience. Strong candidate for the kid side.

### Reviewer recommendation to controller (for spec/plan)
Two viable shapes for the "Chores" tab — controller/user to pick:

- **Option α — one combined view (matches brainstorm's "family overview, one tab, no switching"):** hand-compose a single repo view that stacks (a) `user-chores-standard-v1` with `kids` variant for each kid's claimable chores + points, and (b) an `admin-shared-v1` approval lane for parents. Most authoring work; truest to "everyone sees everyone + approve in one place." Deps: `auto-entities` + `button-card`.
- **Option β — vendor templates closer to as-shipped, accept light structure:** use `user-gamification-premier-v1` (kid side, shows the full XP/badge/reward surface the user explicitly wanted) + `admin-shared-v1` (parent approvals), as two sections or two sub-views. Less custom authoring; pulls in ChoreOps' richer gamification UI directly. Deps: same 2 cards.

Both need the **2-card** dependency set. Neither needs the mushroom/mini-graph suite. **Recommendation: lean Option β** — the user chose *full gamification* and `gamification-premier` is exactly that surface as-shipped, minimizing hand-authoring (which C-1 showed is the only real work anyway). But this is a controller/user call.

## 3b. Entity_id prefix — CRITICAL (added at design-review)

**Test/automation steps must use `kc_`, NOT `choreops_`.** The integration domain is `choreops`, but entity_ids carry the KidsChores heritage prefix:
- `const.py:2690` → `BUTTON_KC_PREFIX = "button.kc_"`
- `const.py:2710` → `CALENDAR_KC_PREFIX = "calendar.kc_"`
- `"choreops"` appears only as the notify-tag (`const.py:3803`) and storage key (`choreops_data`), never in entity_ids.

Entities use `_attr_has_entity_name = True`, so the visible slug is device+name derived — match on the `kc_` stem + platform (or by `unique_id` via the entity registry), not a hard-coded full entity_id. **Any plan step checking for `sensor.choreops_*` / `button.choreops_*` is checking the wrong thing and will false-negative on a healthy install.**

## 3c. Sub-view coexistence — VERIFIED SAFE (added at design-review)

`user-gamification-premier-v1` and `admin-shared-v1` use **disjoint `ui_control` roots** (`gamification/*` vs `admin-shared/*`) — no collapse-state collision, no shared header-key clash. The two-sub-view Chores tab (kids = premier, parents = admin-shared) is safe to compose. `gamification-premier` is the large template (3057 LOC) with an inline render-size ceiling — fine for a 2-kid household, note the ceiling if chore lists grow.

## 4. Open items the controller should resolve before the plan
1. **Composition mechanism:** ChoreOps templates are large `!include`-style YAML with shared fragments (`templates/shared/`). Confirm how they vendor into the repo's `kitchen.yaml` dashboard structure (storage-mode primary vs yaml-snapshot the kiosk reads). The brainstorm noted kiosk points at a yaml snapshot — the vendored view must land where the kiosk actually reads.
2. **Entity provisioning order:** templates reference per-assignee helper entities that only exist AFTER config-flow sets up the 2 kids. Plan sequencing: install → configure family → THEN vendor view (entities must exist or `auto-entities` renders empty).
3. **HACS bootstrap:** HACS itself needs GitHub device-auth (one-time, user-in-the-loop). Plan must flag this as a manual gate, like the prior eval-container manual run.
4. **button-card / auto-entities install:** both are HACS frontend cards; register Lovelace resources (same pattern as the screensaver card already done this session).

## 5. Decisions still locked (unchanged by this research)
ChoreOps owns chores · 2 parents + 2 kids · full gamification (seed defaults) · HACS install · keep kitchen home screen + add Chores tab · vendor into repo (version-controlled). Supersedes the concurrent Grocy-chores slice.
