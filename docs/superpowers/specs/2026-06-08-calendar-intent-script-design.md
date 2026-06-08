# Calendar-by-Voice intent_script (C-4) — Design Spec

**Date:** 2026-06-08
**Status:** Approved (2 sections, reviewer-pass; C-1 + C-2 folded)
**Branch:** `feat/calendar-intent`, off `main` `38d8ff5` (post-screensaver-merge; PR #1 merged, screensaver already on main, so no concurrency concern)
**Builds on:** parent design `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` §6/§9 (C-4 carry-forward: calendar has no built-in add intent)

All HA claims verified against `reference/core-dev`. Cites below.

---

## 1. Summary & architecture

A custom HA **`intent_script`** (config-only YAML, **zero custom Python**) that lets the voice pipeline create calendar events — closing the C-4 gap. Calendar exposes **no built-in add intent**; only the `create_event` *service* (`calendar/__init__.py:224` `CREATE_EVENT_SERVICE`, registered `:331`). So a custom intent that calls that service is the correct, minimal mechanism.

**Flow:** the Gemini conversation agent (the verified two-call pipeline's call #2) parses "put dentist on the calendar Tuesday at 3pm," resolves relative→absolute datetime, and invokes our intent `KitchenAddCalendarEvent` with structured slots. Our `intent_script`'s `action:` calls `calendar.create_event`; its `speech:` returns a spoken confirmation.

**Deliverable (version-controlled):** one new file `homeassistant/packages/calendar.yaml` with a single `intent_script` entry. Loaded by the keystone `configuration.yaml` (`packages: !include_dir_named packages`, same as `screensaver.yaml`).

**Depends on:** HA `intent_script` component + `calendar.create_event` service (both source-verified) + the Gemini agent being configured to expose/call the intent (a hardware-phase HA-UI step — documented, NOT built here).

**Isolation / conflict-safety:** a single new package file; touches none of the open screensaver PR's files (`screensaver-card.ts`, `kitchen.yaml`, etc.). Safe to build concurrently.

**Scope (locked):** structured-slot path (Gemini fills slots; not rigid sentence patterns); slots = summary + start datetime + optional duration (default end = start+1h); single target calendar (`calendar.family` placeholder). **NOT in v1 (YAGNI):** all-day/date-only events, location/description slots, multi-calendar routing, sentence-trigger fallback.

## 2. The intent_script contract

`homeassistant/packages/calendar.yaml` contains one `intent_script` block. Structure verified against `intent_script/__init__.py`: `intents:` → per-intent `description:` (`:44`), `action:` (`:46`, `cv.SCRIPT_SCHEMA`), `speech:` → required templated `text:` (`:58-60`, `cv.template`). Slots reach `{{ … }}` in both action and speech (`:248,254,262` — `action.async_run(slots,…)` + speech renders with the same slots).

### Slot contract (what Gemini must supply)
| Slot | Required | Shape | Notes |
|---|---|---|---|
| `summary` | yes | string | event title → `summary` field |
| `start` | yes | ISO datetime string | Gemini resolves relative→absolute → `start_date_time` field |
| `duration` | no | hours (number) | **Consumed by our Jinja template ONLY, to compute `end_date_time`. NEVER sent to `calendar.create_event` — `duration` is not a field of that service's schema (it belongs to `get_events`, `const.py:55`); `data: {duration: …}` would be rejected.** (C-1) |

### create_event field requirements (verified)
- `summary` **required** (`__init__.py:230`, `vol.Required(EVENT_SUMMARY)`).
- `start_date_time` + `end_date_time` are an **inclusive pair** — both required together (`:244-248`, `vol.Inclusive(..., "datetimes", …)`). **`end_date_time` cannot be omitted** — hence the duration→end computation.
- The schema runs `_has_consistent_timezone` + `_as_local_timezone` on the datetimes (`:257-258`) and `_has_min_duration` (`:259-260`). → start/end must be tz-consistent and span ≥ the min duration.

### Locked `end_date_time` template (C-2 — verified, not deferred)
```yaml
end_date_time: "{{ (as_datetime(start) + timedelta(hours=(duration | default(1) | float))) }}"
```
- `as_datetime(start)` parses the ISO `start` (`helpers/template/extensions/datetime.py:181`); `timedelta(hours=…)` is a real HA Jinja global (`:57-58`); HA stringifies the resulting datetime into a `cv.datetime`-acceptable value.
- This is **the one piece of real logic** in the slice and the focus of verification + the manual-test recipe (tz-aware `start` in → valid, tz-consistent, paired `end` out — satisfying the `:257-258` validators).

### Sketch (final block nailed in implementation)
```yaml
intent_script:
  KitchenAddCalendarEvent:
    description: "Add an event to the family calendar. Use when the user asks to schedule/add/put something on the calendar."
    action:
      - service: calendar.create_event
        target:
          entity_id: calendar.family    # PLACEHOLDER — set the real calendar entity at hardware setup
        data:
          summary: "{{ summary }}"
          start_date_time: "{{ start }}"
          end_date_time: "{{ (as_datetime(start) + timedelta(hours=(duration | default(1) | float))) }}"
    speech:
      text: "Added {{ summary }} to the calendar."
```

### Assumption (NOT source-verified — runtime/hardware-phase)
"Gemini fills the structured slots and knows to call `KitchenAddCalendarEvent` via its `description:`" is a **runtime behavior of the Gemini conversation agent**, verifiable only with a live instance + API key. Documented as an assumption, not a verified fact.

## 3. Verification bar (config-without-runtime)
1. **yamllint** passes on `homeassistant/packages/calendar.yaml` and `homeassistant/`.
2. **Structural schema-check** against `reference/core-dev`: the `intent_script` keys (`intents`/`description`/`action`/`speech.text`) match the verified schema; `action` is a valid `cv.SCRIPT_SCHEMA` service call.
3. **Service-field check:** the `create_event` call supplies exactly the schema-required fields (`summary` + `start_date_time`/`end_date_time` pair) and NO `duration` field.
4. **Manual-test recipe** (documented for hardware phase): e.g. say "add dentist Tuesday at 3pm" → expect a 1-hour event "dentist" on `calendar.family` starting Tue 15:00, spoken "Added dentist to the calendar." Specifically exercises the `end_date_time` template + tz validators.

(NOT this slice: standing up a live HA/Docker instance — deferred to hardware, same reasoning that deferred the broader voice slice.)

## 4. Carry-forwards
- Real `calendar.*` entity id replaces the `calendar.family` placeholder at hardware setup.
- Gemini-agent exposure/registration of the intent = hardware-phase UI step (documented in the eventual VOICE/INSTALL runbook).
- Later additions (own slices): all-day events, location/description, multi-calendar routing.
