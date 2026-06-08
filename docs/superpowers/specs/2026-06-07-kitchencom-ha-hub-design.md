# KitchenCOM — Home Assistant Kitchen Hub: Design Spec

**Date:** 2026-06-07
**Status:** Approved (all 6 sections through section-by-section deep reviewer-pass; folds applied)
**Companion:** `docs/session-state/2026-06-07-ha-pivot-architecture-locked.md` (cold-open briefing, fold history, source cites)

All "HA provides X" claims below were verified against the actual `home-assistant/core` source in `reference/core-dev/` — not from memory. Three confidently-assumed "freebies" turned out NOT to be free (C-2, C-3, C-4) and are priced correctly here.

---

## 1. Summary & architecture

KitchenCOM is a kitchen touchscreen "Home Hub" for a **Raspberry Pi 5**: a glanceable dashboard (calendar, groceries, chores, notes, weather, time), voice control (speak → answer aloud or perform an action), an ambient photo/video screensaver when idle, and family mobile access.

**The pivot:** Built **on Home Assistant**, not as a standalone Node/Express app. The original Express + vanilla-SPA + JSON-store + separate Google Cloud STT + custom webhook plan is **dropped entirely.** HA natively ships the Gemini voice pipeline, lists, calendar, chores, mobile app, and auth — we inherit them instead of building them.

**Install target (amended):** **Raspberry Pi OS + Home Assistant Container (Docker)** — not HA OS. HA OS is a locked appliance that can't cleanly self-host a Chromium kiosk on the same Pi; Pi OS runs Chromium `--kiosk` natively. Every component the design depends on lives in the core image, so Container loses nothing this project uses (cost: no Add-on Store; HACS still works; self-managed updates).

**The bespoke layer (our only custom effort):**
1. A custom **Lovelace dashboard** — the Layout B tile grid.
2. A custom **screensaver card** — the one piece of real custom code (TS/Lit).
3. **Config + automation wiring** — Assist voice pipeline, idle automation, chore logic, theme.

## 2. Components & repository structure

```
KitchenCOM/
├── homeassistant/                  # HA /config (deployed to the Pi)
│   ├── configuration.yaml          # ★ KEYSTONE — wires packages/, themes/, dashboards/
│   ├── dashboards/kitchen.yaml     # Layout B — committed SNAPSHOT (not live source; see §2 mode)
│   ├── themes/kitchencom.yaml      # premium look
│   ├── packages/
│   │   ├── chores.yaml             # chore helpers + rotation automations
│   │   ├── voice.yaml              # Assist pipeline + system-prompt + custom intents
│   │   └── screensaver.yaml        # input_boolean.kitchen_idle + idle automation
│   └── README.md                   # storage-vs-YAML mode tradeoff documented here
├── custom_cards/screensaver-card/  # the only "real code" unit (TS/Lit)
├── custom_components/              # EMPTY-RESERVED — zero custom Python until proven necessary
├── deploy/
│   ├── kiosk/                      # systemd unit + Chromium --kiosk flags (Pi OS)
│   └── INSTALL.md                  # Phase A–E runbook
├── reference/                      # gitignored — upstream HA source we read
└── docs/
```

**Keystone:** `configuration.yaml` is mandatory glue. HA's `CONF_MODE` defaults to `MODE_STORAGE` (`lovelace/const.py:84`), so a dashboard file loads nothing unless `configuration.yaml` registers it. It also wires `homeassistant: packages:`, `frontend: themes:`.

**Dashboard mode decision (Balanced):** kitchen dashboard runs in **storage mode** (keeps phone drag-and-drop edit of content tiles — the Section-1 promise). The **premium look** comes from version-controlled files (theme + screensaver card), which don't require YAML dashboard mode. `dashboards/kitchen.yaml` is a committed **snapshot** for recoverability/review, not the live source of truth.

## 3. Data flow — the voice pipeline (TWO sequential Gemini calls)

HA's Assist pipeline is four stages: `wake → stt → intent → tts` (`assist_pipeline/pipeline.py:604`). This is **two separate Gemini calls**, not one:

1. **STT — Gemini call #1 (transcribe only, NO tools).** `google_generative_ai_conversation/stt.py:234` sends audio via `Part.from_bytes` → `generate_content`. No tools/intent in this call (verified: zero such refs in the file). Returns `result.text` (`pipeline.py:994`).
2. **INTENT — Gemini call #2 (conversation, TOOLS exposed).** `pipeline.py:1296` `conversation.async_converse(text)`. Entities are exposed as `function_declarations` (`entity.py:510-513`) — **this** is where Gemini decides question-vs-command. Action → `Part.from_function_call` (`entity.py:439`) → HA tool dispatch → e.g. `HassListAddItem` (`todo/intent.py`) mutates the entity.
3. **TTS** → speaker.

**Consequences (priced into the design):**
- **Latency:** two sequential round-trips; `TIMEOUT_MILLIS = 10000` (`const.py:44`) → ~20s worst case.
- **Cost:** two billed calls/command. Both default to the same model (`RECOMMENDED_STT_MODEL = RECOMMENDED_CHAT_MODEL = models/gemini-3.1-flash-lite`, `const.py:22-23`), the cheap tier — real but modest. Independently overridable.
- **Config:** STT entity and conversation entity configured separately.

**Live UI:** dashboard cards are state-subscribed (websocket push, not polling) — list tile updates the instant the intent fires. **Mobile:** `local_todo` canonical, mirrored to Google Tasks (M-2).

## 4. Error handling & edge cases

**Voice — five failure points (the two-call reality):**

| Failure | Cause | UX |
|---|---|---|
| STT call fails/times out | mic noise, no speech, network | "Didn't catch that" + re-arm |
| Conversation call fails/times out | network, key, quota | "Couldn't reach the assistant" |
| No matching intent | unmappable command | Graceful reply via **our Assist system-prompt** (I-4: NOT a platform freebie — `entity.py:143` "no better fallback strategy so far") |
| **Tool dispatch fails** — `MatchFailedError` (`todo/intent.py:52`) | misheard/typo'd list name | "I couldn't find a list called X" (I-5: the most likely real-world voice failure) |
| Both slow | cold model / poor net | "thinking…" state; never frozen |

**Offline (v1 decision: accept HA default).** Cloud entities (Calendar/Tasks/Photos, all `cloud_polling`) **grey out as `unavailable`** when offline — `CoordinatorEntity.available` ← `last_update_success` (`update_coordinator.py`), which flips False on failure. NOT cached stale data (C-3: the design promise was inverted from platform default). **Still works offline:** `local_todo`, clock, weather-last-value, SD-card screensaver. Voice announces unavailability. *Stale-data degrade = v2 carry-forward.*

**Media/screensaver (4c):** missing dir/empty/corrupt → tasteful fallback (clock+gradient), skip-and-log, never broken-image grid. **M-8:** Pi 5 has limited HEVC/H.265 hardware decode — format guidance is Pi-5-specific, validate on hardware.

**Kiosk (4d):** systemd auto-restart of Chromium; Pi OS auto-boot; screen kept awake during active hours (screensaver ≠ display-off).

## 5. The screensaver card (the one custom-code component)

A custom Lovelace card (`custom_cards/screensaver-card/`, TS/Lit, mirroring `reference/frontend-dev` patterns). HA has `media_source`/`local_source.py` for serving local media but **no built-in screensaver** — so this card is genuinely necessary.

**Idle architecture (reactive-card — verified-constraint-driven):** HA core has **no native remote view-switch service** (verified; `browser_mod` is HACS, not core). So instead of switching views:
- An **HA automation** decides idle → sets `input_boolean.kitchen_idle` (native helper). Inputs: inactivity timer, optional **gated** motion sensor (M-11: trigger conditional on the entity existing), time-of-day. Lives in `packages/screensaver.yaml`.
- The **card subscribes to that state and fades in/out IN PLACE** — no view switching, no `browser_mod`. **M-9:** via Lit's reactive `hass` property (`@property hass`, per `hui-entity-card.ts:67`); reads `this.hass.states['input_boolean.kitchen_idle'].state` (`:111`). No manual websocket subscription.

**M-10 — the browser↔HA touch-bridge seam (must be wired deliberately):** the inactivity timer is HA-side; a kiosk touch is a browser event that doesn't reach HA automatically. v1: dashboard interactions that call an HA service implicitly signal activity; add a lightweight "activity ping" for pure-navigation touches. This bridge resets the HA-side idle timer.

**Card I/O:** inputs `media_path`, `idle_timeout_seconds`, `transition_style`, `photo_duration`, `show_clock_overlay`. Depends only on `media_source` + `kitchen_idle` state. Emits no state, mutates nothing (deliberate isolation). Ken-Burns + crossfade via CSS/Web Animations (no heavy dep on the Pi).

**Scope (YAGNI):** no media-management UI, no transcoding, no cloud photos in v1 (`google_photos` = clean later add).

## 6. Kiosk deployment & custom-component scope boundary

**6a — Kiosk (`deploy/`, Pi OS native):** Chromium `--kiosk` at the HA dashboard URL, launched on boot via a **systemd unit** (Pi OS = full desktop Linux, so this is native — the I-6 reason for choosing Container over OS). Auto-login HA via long-lived token or `trusted_networks` (**M-12** carry-forward: pick one at build). Disable screen blanking during active hours. Touch calibration + orientation = hardware-phase step in `INSTALL.md`.

**6b — Custom-component scope boundary (when do we write Python?):**

| Need | Mechanism | Custom Python? |
|---|---|---|
| Add/complete/remove list items by voice | built-in `HassListAddItem` + Assist | No — config |
| Device/climate/weather control by voice | built-in intents (`intent/__init__.py:107-155`, `climate/intent.py`, `weather/intent.py`; ship via `home-assistant-intents==2026.6.1`) | No — config |
| **Calendar add by voice** | **custom `intent_script`** (C-4: calendar registers ZERO intents; only `CREATE_EVENT_SERVICE` at `calendar/__init__.py:224`) | **Custom intent (config), NOT a freebie** |
| Idle/screensaver | `input_boolean` + automation + custom card | No Python (card is TS) |
| Chore rotation/reminders | helpers + automations (`packages/`) | No — config first |
| Bespoke action w/ no stock intent | custom intent_script, or last-resort `custom_components/` | Only then |

**Boundary:** v1 writes **zero custom Python** unless a feature provably can't be expressed as config + built-in intent + one custom card. `custom_components/` stays empty-reserved.

## 7. Carry-forwards into the plan

- **C-4** — calendar-add-by-voice = a custom `intent_script` task (real work, not config-freebie).
- **M-10** — touch→HA-timer activity bridge (explicit wiring task).
- **M-8** — Pi-5 codec validation at hardware-test time.
- **M-12** — kiosk auth method (long-lived token vs `trusted_networks`) decision at build.
- **M-2** — `local_todo` canonical / Google Tasks mirror, confirm at voice-slice build.
- **v2** — offline stale-data degrade, only if greyed-out proves annoying.

## 8. First buildable slice (for the plan)

Given "build in files now, deploy on hardware": repo scaffold as an HA config + custom-card workspace — `configuration.yaml` keystone, `packages/`, `themes/kitchencom.yaml`, `dashboards/kitchen.yaml` (Layout-B skeleton in standard HA cards), `deploy/kiosk/` (systemd unit + Chromium flags), and the `screensaver-card` stub — with C-4 / M-10 / M-8 carried as explicit plan tasks.
