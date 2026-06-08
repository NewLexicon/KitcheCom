# KitchenCOM × Grocy — Household-Ops Backend, Slice 1: Chores

**Date:** 2026-06-08
**Status:** Design ratified (brainstorming complete) — ready for writing-plans.
**Supersedes:** the config-only `packages/chores.yaml` chore-engine direction sketched earlier this session and the parent spec §6b "Chore rotation/reminders → helpers + automations → No, config first" row (see §7, Boundary Amendment).

---

## 1. Summary & the framing decision

KitchenCOM adopts **[Grocy](https://github.com/grocy/grocy)** as its **household-ops backend** — the single data model behind chores, and (later slices) stock, recipes, shopping lists, and meal planning. Grocy runs as a **headless Docker service**; its native web UI is **not** shown on the kitchen touchscreen (the user evaluated it live and approved the functionality but rejected the CSS for an always-on kitchen display). KitchenCOM's job is **deployment + presentation**, not reimplementing household-ops domains.

**Why Grocy for chores specifically (Q1 — settled):** Grocy is a **backend investment**, and chores is **slice 1** because it is the cheapest domain to prove the full pipeline end-to-end (Docker service → HACS integration → HA entity → custom card → kitchen screen → round-trip mutation). The Docker + integration cost is **amortized across the later domains** (stock / recipes / shopping / meals), not charged against chores alone. This is the reason the architecture is coherent; without the later-domain payoff, HA-native `local_todo` would be the right call for chores alone.

**Reviewer concern addressed (orphaning):** Moving to Grocy **orphans no prior work.** The screensaver card, the idle/wake package, the theme, the dashboard snapshot, and the deploy model are all **reused** — Grocy feeds the HA dashboard, it does not replace it. The *only* thing displaced is the **unbuilt** config-only `packages/chores.yaml` chore engine — nothing built is abandoned. Source-verification (§3) further showed even a config-only path would have needed a custom card anyway (chores surface as a single attribute-blob sensor), so the custom-card cost is roughly equal either way — and Grocy buys the whole suite behind it.

---

## 2. Architecture

```
┌─ Pi 5 (Pi OS + Docker) ───────────────────────────────┐
│  homeassistant  (HA Container)                         │
│       │  HACS → grocy custom_component (Python)        │
│       │  config-flow: URL + Port + API key             │
│       ▼                                                │
│  grocy  (lscr.io/linuxserver/grocy, arm64-verified)    │  ← headless; native UI never shown on kitchen screen
│       host 9283 → container 80, volume ./grocy:/config │
└────────────────────────────────────────────────────────┘
        ▲
        │  HA Lovelace + custom grocy-chores-card (kitchencom theme)
   Kitchen touchscreen: polished CHORES card only (this slice)
```

**Two recorded, deliberate decisions:**

1. **Relaxes the zero-custom-Python boundary** (parent spec §6b). The grocy HACS integration *is* third-party `custom_components/` Python — but **HACS installs it at runtime into HA's config dir on the Pi, not into this repo** (the repo's `custom_components/` stays empty; see §7). This is the "proven necessary" exception that boundary always reserved. We adopt a maintained integration; we do not author or vendor Python. Recorded as a one-way architectural amendment here (§7) **and** appended to the parent spec §6b table (deliverable in the plan).
2. **Native Grocy UI is never shown on the kitchen screen** (this slice). Grocy data is presented through an HA custom card styled with the existing `kitchencom` theme. Drill-in to Grocy's native UI (stock/recipes/barcodes) is **deferred to a later slice** (user chose backend-first). Grocy sends **no `X-Frame-Options` / CSP `frame-ancestors`** (verified via `curl -D-` against the live instance), so a future iframe-embed drill-in is technically open — but out of scope here.

**Scope fence — Slice 1.**
*In:* Grocy compose + `INSTALL.md` "Grocy backend" phase; documented HACS integration wiring; the custom `grocy-chores-card` (render the chores list **and** the mark-done `execute_chore` round-trip).
*Out (later slices):* meal-plan cards, shopping cards, stock/recipe drill-in, the iframe-embed drill-in surface, multi-user assignee rotation.

---

## 3. Source-verification (the discipline that priced this slice correctly)

Per the project's "verify load-bearing 'X provides Y' claims against source, not memory" rule (which caught C-2/C-3/C-4 in the parent spec), the grocy HACS integration source was read before locking this design. Findings:

**✅ Verified true:**
- **`execute_chore` round-trips.** Service exists; takes `chore_id` (required), `done_by` (required), plus optional `track_execution_now` / `skipped`. The "mark done" interaction is real — but `done_by` (a Grocy user id) is a wiring detail the card must supply, not free.
- **arm64 image exists** via the linuxserver multi-arch manifest; `lscr.io/linuxserver/grocy:latest` auto-selects aarch64 on the Pi 5.
- **Config-flow is UI-based** (`async_step_user`): URL + Port + API key.

**⚠️ Corrections to the original proposal (all the kind of drift this discipline exists to catch):**
1. **Chores are NOT individual entities.** There is **one** `sensor.grocy_chores` whose state is a **count** and whose `attributes.chores[]` is a list of `as_dict()` objects. **Architecturally load-bearing:** a stock HA entities-card cannot bind per-chore rows — the card must read the single sensor's attribute array and render the list itself. Chores rendering is therefore **custom-card work** (mirrors the proven screensaver-card pattern), not a stock-card config job.
2. **`done_by` is required** on `execute_chore` → the mark-done button is custom too (pull `chore_id` from the array, supply a user id).
3. **Integration `DEFAULT_PORT` is 9192**, but the linuxserver image is published on **9283** in our compose. The config-flow's port field gets **9283**, overriding the default.

---

## 4. Components & the verified data contract

**Three deliverables, one new custom card:**

1. **`deploy/` Grocy service.** A `docker-compose` fragment + `INSTALL.md` "Grocy backend" phase for `lscr.io/linuxserver/grocy` (arm64-verified): host `9283→80`, `./grocy:/config` volume, `PUID/PGID/TZ`, `restart: unless-stopped`. *Authored now; stood up on the Pi later (deployment is Pi-blocked, slice D).*

2. **HACS integration wiring (documented, not code).** `INSTALL.md` steps: install HACS → add custom repo `custom-components/grocy` (Integration) → restart → config-flow. **Install note (the real gotcha — OQ-3):** the config-flow takes **URL and Port as separate fields**. Enter **URL = `http://<pi-host>`** (no port, no path) and **Port = `9283`** (the published host port) — do **not** bake the port into the URL, and do **not** leave Port at its 9192 default. API key from Grocy → *Manage API keys*. Entities are **disabled by default** — enable `sensor.grocy_chores`.

3. **`custom_cards/grocy-chores-card/`** — a new Lit/TS card, sibling to `screensaver-card/`, mirroring its TS/Lit/vitest setup.
   - **Reads** `sensor.grocy_chores` → `attributes.chores[]` (each an `as_dict()` object).
   - **Renders** rows: chore name (assignee baked into the Grocy chore name per the user's "name in the chore text" model), next-due, overdue styling via the `kitchencom` theme.
   - **Per-row ✓ Done** → `grocy.execute_chore` with `chore_id` (from the array) + `done_by` (user id — see the v1 `done_by` decision below).

**`done_by` v1 decision (stated, not an open question).** The card takes a **single static `done_by` card-config field** (single-household assumption). **Behavioral contract:** if `done_by` config is **absent or invalid**, the card renders rows **read-only — no ✓ button** — rather than firing an `execute_chore` call that would 500. The mark-done path is only wired when a valid `done_by` is configured. (The residual live-read is just *which id value* to put in config — see OQ-2.)

**Open questions — resolved at implementation step 1 by reading the LIVE entity (live-read lookups, not design unknowns; do not block the spec):**
- **OQ-1 — exact `as_dict()` chore field names** (name? next_estimated_execution_time? overdue flag? chore_id key?). Resolve in HA Dev Tools → States against the live local Grocy (running now on the Mac). The companion `grocy-tasks-chores` Lovelace card exists as a reference/fallback if the raw shape is awkward.
- **OQ-2 — the `done_by` user-id VALUE** to place in card config. Read Grocy's user list / API for the household user's id. (The card's *behavior* around `done_by` is already decided above; this OQ is only the literal id value.)
- **OQ-3 — config-flow URL/port split** (confirmed separate fields in source; verify exact field labels against the live config-flow when wiring). Drives the §4.2 install note.

---

## 5. Testing posture — three honestly-named verification tiers

Following the screensaver precedent (pure functions TDD'd; thin Lit glue verified by browser/manual check), but the live local Grocy makes tiers 1–2 achievable **now**, stronger than the screensaver's synthetic harness. **No tier's claim is made until that tier has actually run.**

- **Tier 1 — pure-function TDD (achievable now, in CI, no HA/Grocy needed).** Operate on captured `as_dict()` fixtures: parse `chores[]` → row view-models, overdue computation, sort order. Red→green→refactor per the project's TDD discipline.
- **Tier 2 — live integration round-trip (achievable now in a local dev-HA, not Pi-blocked).** Wire the HACS integration into a dev HA pointed at the local Grocy; read the real `sensor.grocy_chores` shape (resolves OQ-1); render the card against real data; press ✓ Done → confirm the execution **tracked in Grocy's own UI**. This is the tier that proves the slice *works*. **Prerequisite (a distinct plan task, separate from the Pi stand-up):** a local dev-HA with HACS + the grocy integration wired — the repo's `homeassistant/` is config files only today, with no running HA, so this is a one-time setup cost a plan must budget.
- **Tier 3 — on-kitchen-screen (Pi-blocked, deferred to slice D hardware phase).** Kiosk display, touch targets, the actual wall-mounted screen. Explicitly NOT claimed by this slice.

---

## 6. Repo placement

- New card: **`custom_cards/grocy-chores-card/`** (sibling to `screensaver-card/`; same TS/Lit/vitest scaffold).
- Compose fragment + install steps: **extend `deploy/INSTALL.md`** with a new "Grocy backend" phase (not a separate file).
- Boundary amendment: recorded in **this spec (§7)** AND appended to the **parent spec §6b** boundary table (plan deliverable).

---

## 7. Boundary Amendment (one-way architectural decision) & carry-forwards

**Boundary Amendment — amends parent spec §6b.** The parent spec's §6b table row "Chore rotation/reminders → helpers + automations (`packages/`) → No — config first" is **superseded for the household-ops domain**: KitchenCOM adopts the **Grocy HACS integration** as a deliberate, proven-necessary exception to the zero-custom-Python boundary. Rationale: Grocy is a household-ops *backend investment* (chores + stock + recipes + shopping + meals share one data model); the integration is maintained third-party Python (we author none); and chores provably can't be expressed as the §6b "config + built-in intent + one custom card" pattern *more cheaply via config* than via Grocy, because chores surface as a single attribute-blob sensor requiring a custom card regardless (§3). **Important — what actually lands where:** the boundary is crossed **at runtime** via the HACS-installed grocy integration; HACS installs it into HA's config dir **on the Pi**, NOT into this repo. **The repo's `custom_components/` stays empty** (it was never created on disk; parent §6b's tree marks it "EMPTY-RESERVED" and it remains so). No directory is vendored — a plan must not create/vendor one. **This is the first crossing of the zero-custom-Python boundary; record it in the parent spec so a future session finds it there, not only here.**

**Carry-forwards into the plan:**
- **OQ-1 / OQ-2 / OQ-3** — implementation-step-1 live-entity resolutions (§4).
- **Boundary amendment** — append to parent spec §6b as a plan task.
- **`done_by` wiring** — known bounded detail; card-config field, single-household assumption.
- **Grocy eval container** — currently running locally (`docker`, name `grocy`, host 9283, volume `~/grocy-eval`); disposable (`docker rm -f grocy && rm -rf ~/grocy-eval`). It is the Tier-1/Tier-2 fixture+round-trip source; keep until the card is verified, then tear down.
- **Pi-blocked** — Tier-3 on-screen verification + the actual compose stand-up wait on Pi 5 (slice D).
- **Deferred later slices** — meal-plan / shopping / stock cards + the iframe drill-in surface, all on this same Grocy backend.
