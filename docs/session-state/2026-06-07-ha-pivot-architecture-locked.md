# KitchenCOM — Session State: Home Assistant Pivot & Architecture Locked

**Date:** 2026-06-07
**Phase:** Design locked + **foundation slice BUILT, reviewed, and MERGED to main.** Next phase: deferred subsystems (voice config, calendar intent_script) + hardware deployment.
**This file is the cold-open briefing.** A fresh session should read this end-to-end before doing anything.

**Empirical state (current):**
- Git repo initialized; single branch **`main`**. **HEAD = `33e3ef4`** ("docs: cold-open reflects merged foundation slice"; the foundation merge is its parent `30cfcbe`). No remote configured yet (GitHub repo not created — user will add later; to push: create remote, then `git push -u origin main`).
- The foundation slice was built on `feat/foundation-slice` (15 commits, TDD + per-task spec+quality review), merged `--no-ff` to main, branch + worktree cleaned up.
- **Empirical green (verified on merged main):** `python3 -m yamllint -c .yamllint homeassistant/` → exit 0; `cd custom_cards/screensaver-card && npm install && npm test` → 9 passing (4 idle + 5 media); `bash -n deploy/kiosk/start-kiosk.sh` → OK.
- Reference folder = **`reference/`**, gitignored (328 MB upstream HA clones; source cites use `reference/core-dev/...`). `.gitignore` also excludes `.superpowers/`, `.worktrees/`, `.claude-flow/`, secrets, build artifacts.
- **Tooling prereq:** `validate:yaml` needs `yamllint` (`pip install --user yamllint`); on this Mac it's at `~/Library/Python/3.9/bin` (NOT on default PATH) — invoke via `python3 -m yamllint` or prepend that dir. Node 24 + npm for the card.

**DESIGN + FOUNDATION-SLICE COMPLETE. Durable artifacts:**
- **Spec:** `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` (6 sections, folds applied, consistency-reviewed).
- **Plan:** `docs/superpowers/plans/2026-06-07-kitchencom-foundation-slice.md` (executed in full; 8 tasks).
- **Built (in main):** `homeassistant/` (keystone configuration.yaml + theme + Layout-B dashboard snapshot + screensaver idle package), `custom_cards/screensaver-card/` (Lit/TS, 9 tests), `deploy/` (kiosk systemd unit + INSTALL.md), root README.

**→ NEXT SESSION'S WORK (no single literal action — pick the next slice):** The foundation scaffold is done and merged. The remaining work is the *deferred subsystems* + hardware. Each is its own spec→plan→build cycle. Candidate next slices, roughly in dependency order:
1. **Hardware deployment** (when the Pi 5 arrives): follow `deploy/INSTALL.md` Phases A–E. Address its HARDWARE-PHASE TODOs: M-12 kiosk auth, M-10 touch→`input_button.kitchen_activity` bridge, M-8 Pi-5 codec validation, Bookworm `chromium` binary, boot-to-desktop autologin, repoint kiosk `HA_URL` to the live dashboard, replace placeholder entity ids.
2. **Voice pipeline config slice** — wire the Assist pipeline (Gemini STT→conversation→TTS) per spec §3 (the verified TWO-call pipeline). Mostly HA config.
3. **C-4 calendar-by-voice slice** — custom `intent_script` for calendar event creation (calendar has NO built-in add intent; only `CREATE_EVENT_SERVICE` at `reference/core-dev/homeassistant/components/calendar/__init__.py:224`). The first thing likely to need `custom_components/`-adjacent work.
4. **Screensaver card rendering** — the current card is pure idle/media-select LOGIC only; the Lit rendering + media loop + Ken-Burns/crossfade is NOT built yet. Deferred Minor from Task 5: add `lib: ["ES2021","DOM","DOM.Iterable"]` to the card's tsconfig when rendering lands.

**Sections approved so far (section-by-section reviewer-pass discipline):**
- §1 Architecture — approved (C-1 retired, see §9).
- §2 Component breakdown / repo structure — approved; folded I-3 (added keystone `homeassistant/configuration.yaml`), M-3 (dashboard mode tension), M-4 (reference gitignore verified). **Decision: dashboard runs in STORAGE mode + committed snapshot** (keeps phone drag-edit; premium look from version-controlled theme + screensaver card).
- §3 Voice pipeline — approved after **C-2 fold** (the heart-of-system error): it's a **TWO-call pipeline**, not one. Then M-7 fold (model-default phrasing). See §10.
- §4 Error handling — approved; folded **C-3** (offline = greyed-out default), I-4 (no-intent reply is our prompt), I-5 (tool-dispatch MatchFailedError row), M-8 (Pi-5 codec caveat). **Decision: accept greyed-out offline default for v1.** See §11.
- §5 Idle/screensaver — approved (0 Critical, 0 Important, 3 Minor: M-9 custom-card hass-reactivity, M-10 touch→HA-timer browser↔HA seam, M-11 motion-sensor optional-gating). Reactive-card design (card subscribes to `input_boolean.kitchen_idle`, fades in place) verified to sidestep the no-native-view-switch constraint (browser_mod not in core, confirmed).
- §6 Kiosk + custom-component scope — approved after **C-4 fold** (calendar-add is NOT a built-in intent — `calendar` registers zero intents; only `CREATE_EVENT_SERVICE` at `calendar/__init__.py:224` — so calendar-by-voice is a custom intent_script case, I-1 family, NOT a config freebie). **I-6 RESOLVED → install method amended to Pi OS + HA Container** (see §3 Decision 4). 6b "zero custom Python until proven necessary" boundary endorsed. Verified built-in: device-control (`intent/__init__.py:107-155`), climate (`climate/intent.py`), weather (`weather/intent.py`); intents ship via `home-assistant-intents==2026.6.1` (`conversation/manifest.json:9`).

**ALL 6 DESIGN SECTIONS NOW APPROVED.** Next: produce the formal implementation plan (`writing-plans`) for the first buildable slice. Carry-forwards into the plan: C-4 calendar-add = custom intent_script scope; M-10 touch→HA-timer bridge; M-8 Pi-5 codec validation at hardware time; M-12 kiosk auth (long-lived token vs trusted_networks).

---

## 1. What KitchenCOM is

A kitchen touchscreen "Home Hub" running on a **Raspberry Pi 5**, mounted in/on the kitchen (fridge-style ambient display). Family-scale. Core capabilities the user wants in the final product:

- Glanceable kitchen dashboard (calendar, groceries, chores, notes, weather, time)
- Shared lists synced to family phones
- Voice control: speak a command → it either answers a question aloud or performs an action (e.g. "add milk" mutates a list)
- Ambient photo/video screensaver when idle
- Mobile access for the family

## 2. THE BIG PIVOT (most important decision)

**Original plan:** standalone Node.js/Express backend + vanilla SPA + JSON data layer + separate Google Cloud Speech-to-Text + custom webhook sync framework.

**Locked decision: build ON Home Assistant OS instead.** The original Express/Node stack is **dropped entirely.**

### Why the pivot is sound (verified, not assumed)

The user added `git /core-dev` (= `home-assistant/core`) and `git /frontend-dev` (= `home-assistant/frontend`) to the workspace. We verified **against the actual core source** (not from memory) that HA natively ships almost everything KitchenCOM needs:

| Requirement | HA component (verified present in `core-dev/homeassistant/components`) |
|---|---|
| Gemini voice — STT | `google_generative_ai_conversation/stt.py` — confirmed it sends raw audio bytes (`Part.from_bytes`, `mime_type=audio/...`) to `generate_content`. This IS the user's "Gemini-native multimodal audio" insight, already implemented. No separate Google Cloud STT credential needed. |
| Gemini voice — TTS | `google_generative_ai_conversation/tts.py` |
| Answer-vs-command brain | `google_generative_ai_conversation/conversation.py` — Assist exposes entities (lists, calendar) to Gemini as tools |
| Structured JSON output | `google_generative_ai_conversation/ai_task.py` — confirmed `json_loads`, `task.structure`, `GenerateContentConfig` |
| Gemini SDK version | `google-genai==1.59.0` (current official SDK) |
| Shared lists (groceries) | `todo`, `shopping_list`, `local_todo`, `todoist` |
| Chores/family notes | `todo` + helpers/automations |
| Calendar | `calendar`, `local_calendar`, `google` |
| Push to family phones | `google_tasks`, `google` + HA Companion app |
| Photo screensaver source | `google_photos` (+ `media_source`) and/or local media |
| Mobile access | Official HA Companion app — NO QR-code hack needed |
| Voice pipeline plumbing | `assist_pipeline` + `assist_satellite` |

**What we inherit:** lists, calendar, chores, mobile app, auth, the entire Gemini voice pipeline — all maintained by HA, not written by us. Months of work avoided.

**What we still build (the bespoke layer — the only custom effort):**
1. **Custom Lovelace dashboard** = the Layout B tile grid (the kitchen "face")
2. **Custom screensaver card** = cinematic idle photo/video loop with fade transitions
3. **Voice + automation wiring** = configuring Assist (USB mic → Gemini → answer-or-action → speaker) + any chore-rotation logic. Mostly config, not code, since the integration already exists.

## 3. All locked decisions (Q&A arc)

1. **Frontend stack** → originally vanilla SPA + Tailwind + Lucide. **SUPERSEDED by the HA pivot** — the dashboard is now HA Lovelace (Lit/TypeScript custom cards), not a from-scratch SPA. Tailwind/Lucide reference clones become reference-only or feed custom-card styling.
2. **Data persistence** → originally "JSON-now-behind-repository-interface, SQLite-swappable." **SUPERSEDED by the HA pivot** — HA owns the data layer (entities/recorder). No custom JSON store.
3. **Voice / STT** → **Gemini-native multimodal** (record audio → send to Gemini → it transcribes + decides answer-vs-action + returns JSON/conversational text). Separate Google Cloud Speech-to-Text **rejected** (re-adds a second credential the user explicitly wanted gone). Confirmed natively supported by HA's Gemini integration.
4. **Install method** → **AMENDED 2026-06-07 (Section 6 / I-6 resolution):** originally **Home Assistant OS**, now **Raspberry Pi OS + Home Assistant Container (Docker).** Reason: HA OS is a locked headless appliance and cannot cleanly self-host a Chromium kiosk on the same Pi (I-6). Pi OS is full desktop Linux → Chromium `--kiosk` runs natively via a standard systemd unit. **Verified (`reference/core-dev`):** every component the design depends on (google_generative_ai_conversation, todo, local_todo, intent, conversation, assist_pipeline, input_boolean, media_source, frontend, lovelace) lives in `homeassistant/components` = the core image = present in HA Container. **Cost of the trade:** no Supervisor → no Add-on Store (any add-on becomes a separate Docker container you run; KitchenCOM's verified feature set needs none). HACS still works (it's a `custom_components` integration, not an add-on). You self-manage OS + container updates. Net: Container loses nothing this project uses and gains the native kiosk.
5. **Build timing** → **Start now, deploy when hardware arrives.** All file-based artifacts (dashboard YAML, custom card TS, custom integration Python, theming, kiosk scripts) get built in this repo now; deployment later = copy files + click-through integration setup. NOT blocked on hardware.
6. **Dashboard layout** → **Layout B (Tile Grid)**: a large hero clock/weather/voice tile anchoring the left, with other modules as flexible cards of varying sizes around it. Premium smart-display feel. (Layout A "Command Center" — top status bar + 3 equal columns — was rejected.)
7. **Polish vs. editability tradeoff** → **Balanced.** Custom theme + custom screensaver card for the cinematic feel, BUT content tiles stay as standard HA cards inside a grid → user keeps phone-side drag-and-drop reorder/add/remove of content tiles forever. The "premium" styling + screensaver are config-edits (not drag-and-drop), editable anytime via HA's YAML editor or by asking Claude to adjust + re-deploy.

## 4. Install/setup process (agreed, for when hardware arrives)

- **Phase A (AMENDED — Pi OS + Container):** Flash **Raspberry Pi OS** to fast storage (NVMe SSD strongly recommended on Pi 5; keep SD/media for photos). Boot → install **Docker** → run the **Home Assistant Container** image → onboard. (Previously "flash HA OS appliance" — changed per the §1 Decision-4 amendment / I-6 resolution.) More setup steps than the appliance, but enables the same-Pi kiosk.
- **Phase B:** Wire integrations (mostly clicks + light config): add Google Gemini integration (paste API key); add Google Calendar/Tasks/Photos (OAuth with family Google account); set up Assist voice pipeline (USB mic → Gemini STT → conversation agent → Gemini TTS → speaker).
- **Phase C:** Our custom build — custom Lovelace dashboard (Layout B), custom screensaver card, theming, chore logic via helpers/automations or small custom integration.
- **Phase D:** Kiosk deployment — Pi boots → Chromium full-screen at the dashboard → auto-launch on startup → screen stays on → touchscreen calibration. Config + small scripts.
- **Phase E:** Mobile — family installs HA Companion app, signs in on home network → instant phone access + notifications.

## 5. Claude's role on HA work (confirmed to user)

Claude can help with all three "code" types:
- **Custom integrations** (Python in `custom_components/`) — can read real patterns from `git /core-dev` (manifest, config flow, entities, coordinators) instead of guessing.
- **Custom Lovelace cards** (TypeScript/Lit) — can mirror real patterns from `git /frontend-dev`.
- **Third-party HACS plugins** — can fork/patch/fix; needs the plugin's code in-repo or a GitHub URL to edit the real thing.
- **Caveat stated to user:** HA evolves fast; for anything load-bearing, verify against the provided source or current docs rather than from memory (as was done with the Gemini STT/TTS confirmation).

## 6. Gotchas / things to watch

- **The reference folder is named `git ` (trailing space).** This breaks naive shell commands — always quote it. Consider renaming to `reference/` or `vendor/` to avoid ongoing friction.
- **This workspace is NOT a git repo yet** (`git rev-parse` would fail; environment reports git: false). No commit-history backstop. Consider `git init` before substantive file work so decisions/code are recoverable. Note: `core-dev`/`frontend-dev` are clones — decide whether they live inside KitchenCOM's git (gitignore them) or stay external reference.
- **Two Google credential domains still exist even after dropping Cloud STT:** the Gemini API key, and the Google OAuth (Calendar/Tasks/Photos). That's inherent to using Google's ecosystem; HA manages both via its config-flow UI, so it's not the "two SDKs in our code" complexity the user originally feared.
- **The "premium look" is the real build cost.** HA dashboards look like "HA" by default; the high-end smart-display aesthetic requires custom theme + custom card(s). This is where effort concentrates, and it's the one thing HA does NOT hand over for free.

## 7. Where we left off / NEXT ACTIONS

**Interrupted mid-design-walkthrough.** Section 1 (Architecture & the big pivot) was being presented for section-by-section approval when the session paused. The reviewer (Claude-as-reviewer) flagged that no durable artifact existed and the user chose "capture state first, then review" — which produced THIS file.

**Next actions, in order:**
1. ✅ Capture locked decisions + reasoning (this file).
2. ✅ Reviewer-pass on architecture — approved (§9, C-1 verified).
3. ✅ Housekeeping — `git init` done (HEAD `536215d`), `git ` → `reference/` renamed + gitignored. (Resolved I-2, M-1.)
4. ✅ Design walkthrough §§1–4 approved with folds (§§9–11 capture the load-bearing ones).
5. **→ NEXT: Section 5 of the design walkthrough.** Remaining sections to ratify: screensaver-card design, kiosk deployment specifics, custom-component scope boundary, testing strategy. Continue section-by-section reviewer-pass discipline (deep on substantive sections).
6. **Then: write the design doc** to `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` + commit (brainstorming skill terminal step before plan).
7. **Then: `writing-plans`** for the first buildable slice — repo scaffold as HA config + custom-card workspace, `configuration.yaml` keystone, Layout B dashboard (standard cards in grid), custom screensaver-card stub, theme.

**Carry-forwards (deferred, with triggers):**
- **v2 offline degrade** (C-3): build template-sensor snapshotting / custom-card fallback ONLY if family finds greyed-out offline tiles annoying.
- **M-8 Pi-5 codec validation**: screensaver video format guidance (HEVC/H.265 hardware decode limited on Pi 5) must be validated on real hardware — hardware-test phase.
- **M-2 canonical list**: `local_todo` canonical (voice path of least resistance), Google Tasks as sync mirror — confirm during voice-slice build.

## 9. Reviewer-pass result (2026-06-07) + C-1 source verification

**Architecture APPROVED to proceed.** Deep reviewer-pass surfaced 1 Critical + 2 Important + 2 Minor. The Critical (C-1) has now been **verified resolved against `core-dev` source**.

### C-1 (RESOLVED — verified): the spoken-command → list-mutation flow works natively

The concern was that "STT platform exists" did not prove the actual product flow (*"add milk" → Gemini decides action → mutates the list → confirms aloud*). Traced the real source:

- **`google_generative_ai_conversation/conversation.py`** — the conversation entity sets `_attr_supported_features = ConversationEntityFeature.CONTROL` **when `CONF_LLM_HASS_API` is configured**. It calls `chat_log.async_provide_llm_data(... options.get(CONF_LLM_HASS_API) ...)`. So enabling the "Assist" LLM API on the Gemini config entry is what grants it control of HA entities. **This is a config toggle, not custom code.**
- **`entity.py:510-513`** — confirmed: `if chat_log.llm_api:` → it passes `_format_tool(tool, ...) for tool in chat_log.llm_api.tools` to Gemini as native function-declarations (the `function_declarations` list is assembled at `entity.py:162`). So HA's exposed entities/intents become **Gemini tool calls**. Gemini's function-call response is read at `entity.py:439` (`if part.function_call:`) and dispatched back through HA's tool layer. (Note: the `Part.from_function_call` *constructor* is at `entity.py:317` — the outbound tool-result path — not 439; 439 is the inbound read.)
- **`todo/intent.py`** — confirmed the `todo` domain registers `HassListAddItem` (`ListAddItemIntentHandler`), plus complete/remove handlers. Slots: `item` + `name` (the list). This is the intent Gemini's tool call resolves to.
- **`shopping_list/intent.py`** — confirmed the older built-in shopping list also registers `HassShoppingListAddItem` / complete / last-items.

**Verdict:** the user's exact flow — speak "add milk" → Gemini (with Assist API enabled) calls the `HassListAddItem` tool → the `todo`/`shopping_list` entity is mutated → spoken confirmation — is **natively supported via configuration**, no custom integration required for the basic add/complete/remove path. C-1 risk retired.

### I-1 (downgraded, not eliminated): "mostly config" is now defensible for the STANDARD path

Given C-1's resolution, the *standard* list/calendar mutation path IS mostly config. The residual I-1 concern narrows to: anything BEYOND the built-in intents (e.g. custom chore-rotation, strict-JSON payloads that don't map to an existing intent, multi-step actions) may still need automation glue or a small custom intent. Scope statement for the plan: **"voice = config for built-in list/calendar/HVAC intents; custom intents/automation only for bespoke actions not covered by stock HA intents."**

### I-2 (open): no git backstop — `git init` recommended before formal plan. Decide clone tracking.
### M-1 (open): rename `git ` (trailing space) → `reference/`.
### M-2 (open, now sharper): canonical list source-of-truth decision is load-bearing because the voice tool resolves to a specific entity domain. `todo`/`local_todo` (HA-native) is the path of least resistance for the voice flow; Google Tasks sync is a separate concern layered on top. Recommend `local_todo` as canonical, Google Tasks as a mirror/sync target — to be confirmed in the design walkthrough.

## 10. Section 3 — voice pipeline is TWO sequential Gemini calls (C-2 fold, source-verified)

**Critical correction.** The pipeline is NOT a single fused Gemini call. Source: `reference/core-dev/homeassistant/components/assist_pipeline/pipeline.py:604` — `# wake -> stt -> intent -> tts` (four stages).

1. **STT — Gemini call #1 (transcribe only, NO tools).** `google_generative_ai_conversation/stt.py:234` sends audio via `Part.from_bytes` to `generate_content`; the file has **zero** `tool|llm_api|function|chat_log|intent` refs (verified by grep). Returns `result.text` (`pipeline.py:994`).
2. **INTENT — Gemini call #2 (conversation, TOOLS exposed).** `pipeline.py:1296` `conversation.async_converse(text)`. THIS call turns entities into Gemini tools (`chat_log.llm_api.tools` → `_format_tool`, `entity.py:510-513`; `function_declarations` assembled at `entity.py:162`) and is where Gemini **decides question-vs-command**. Action path: function-call response read at `entity.py:439` (`if part.function_call:`) → HA tool dispatch. (`Part.from_function_call` constructor = `entity.py:317`, outbound path, not 439.)
3. **TTS** → speaker.

**Consequences (now load-bearing in the design):**
- **Latency:** two *sequential* Gemini round-trips per utterance. `TIMEOUT_MILLIS = 10000` (`const.py:44`, used at `entity.py:771`) → ~20s worst-case before both time out.
- **Cost:** two billed Gemini calls per command.
- **Config:** STT entity and conversation entity configured **separately**, each with own model. **M-7:** both default to the SAME model — `RECOMMENDED_STT_MODEL = RECOMMENDED_CHAT_MODEL = models/gemini-3.1-flash-lite` (`const.py:22-23`); independently overridable. Cost = two calls to the cheap flash-lite tier by default — real but modest.

## 11. Section 4 — error handling folds (source-verified)

- **C-3 (offline UX inverted from default — RESOLVED via v1 scope decision).** `reference/core-dev/homeassistant/helpers/update_coordinator.py`: `CoordinatorEntity.available` ← `last_update_success`, which flips `False` on update failure (lines 369/385/394/442/456). So offline cloud entities (Calendar/Tasks/Photos, all `cloud_polling`) **grey out as `unavailable`** — NOT cached stale data. **v1 DECISION: accept greyed-out default.** Still-works-offline: `local_todo`, clock, weather-last-value, SD-card screensaver. Stale-data degrade = v2 carry-forward.
- **I-4:** no-matching-intent graceful reply is **our Assist system-prompt** responsibility, not a platform freebie (`entity.py:143` literally "we don't have a better fallback strategy so far").
- **I-5:** missing failure point added — tool dispatch can fail with `MatchFailedError` (`todo/intent.py:52`, via `MatchTargetsConstraints`) when a misheard/typo'd list name matches no `todo` entity. UX: "I couldn't find a list called X." Most likely real-world voice failure.
- **M-8:** Pi 5 has limited HEVC/H.265 hardware decode (dropped vs Pi 4) — screensaver format guidance is Pi-5-specific, validate on real hardware.

**Meta-pattern observed across §§2–4:** the "we inherit HA robustness" framing held for STT/timeout/local_todo but was WRONG for offline-tile-degrade (C-3) and the single-call assumption (C-2). Source-checking confident-looking platform claims is earning its keep — both Criticals were platform-default/architecture assumptions that source contradicted.

## 8. Open questions not yet resolved

- Exact hardware: which Pi 5 (RAM), which touchscreen, which USB mic array, which speaker, NVMe vs SD.
- Which list backend is canonical: HA `local_todo`/`shopping_list` vs. Google Tasks vs. Todoist (the user mentioned Google Tasks/Keep for phone sync — needs a single source-of-truth decision).
- Screensaver media source: local SD-card media (chokidar-style watching, though that was the Node plan — HA equivalent is `media_source`/folder) vs. `google_photos` integration vs. both.
- Whether any genuinely-custom integration is needed at all, or whether everything is achievable via config + one custom card + helpers/automations.
