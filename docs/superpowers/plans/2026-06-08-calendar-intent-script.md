# Calendar-by-Voice intent_script (C-4) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a config-only HA `intent_script` (`homeassistant/packages/calendar.yaml`) that lets the Gemini voice pipeline create calendar events via `calendar.create_event`, closing the C-4 gap (calendar has no built-in add intent).

**Architecture:** One new HA package file with a single `intent_script` entry (`KitchenAddCalendarEvent`). Gemini fills structured slots (summary, tz-aware start, optional duration); the intent's `action:` calls `calendar.create_event` with `end_date_time` computed as `start + duration` (default 1h) via a verified Jinja template; `speech:` returns a spoken confirmation. **Zero custom Python.** Verified in files (yamllint + structural/schema checks against `reference/core-dev` + a documented manual-test recipe); live behavior deferred to the hardware phase.

**Tech Stack:** Home Assistant `intent_script` + `calendar.create_event` service (config/YAML), HA Jinja (`as_datetime`, `timedelta` globals). yamllint for validation. No build, no runtime tests.

**Source-of-truth:** `docs/superpowers/specs/2026-06-08-calendar-intent-script-design.md`

**Scope boundary:** v1 = summary + tz-aware start + optional duration, single `calendar.family` placeholder, structured-slot path. NOT in scope: all-day/date-only events, location/description slots, multi-calendar routing, sentence-trigger fallback, live HA/Docker testing (hardware phase). Zero Python.

**Tooling note:** `yamllint` may not be on PATH (pip-installed). Invoke via `python3 -m yamllint` or prepend `~/Library/Python/3.x/bin`. The repo `.yamllint` config exists at root.

---

## Chunk 1: The intent_script package + structural verification

### Task 1: Write `calendar.yaml` and validate it (config + yamllint)

**Files:**
- Create: `homeassistant/packages/calendar.yaml`

**Note:** This is config, not unit-testable code. The "test-first" discipline here = define the validation gate (yamllint) and the structural acceptance checks (Task 2) up front; this task produces the file that must pass them. The file content is fully specified by the spec §2 — transcribe it precisely.

- [ ] **Step 1: Write the package file**

`homeassistant/packages/calendar.yaml`:
```yaml
# Calendar-by-voice (C-4): a custom intent_script that lets the Gemini voice
# pipeline create calendar events. Calendar has NO built-in add intent — only the
# calendar.create_event service (reference/core-dev/homeassistant/components/calendar/__init__.py:224).
# Gemini (Assist conversation agent, hardware-phase config) fills the slots and calls this intent.
#
# Slot contract (Gemini must supply):
#   summary  (required, string)            -> event title
#   start    (required, tz-AWARE ISO dt)   -> start_date_time; MUST be tz-aware
#                                             (create_event tz validators reject naive datetimes)
#   duration (optional, hours, number)     -> used ONLY to compute end_date_time below.
#                                             NEVER sent to create_event (not a field of that service).

intent_script:
  KitchenAddCalendarEvent:
    description: >-
      Add an event to the family calendar. Use this when the user asks to
      schedule, add, book, or put something on the calendar (e.g. "add dentist
      Tuesday at 3pm"). Provide a tz-aware ISO 8601 start datetime.
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

- [ ] **Step 2: Validate with yamllint**

Run: `python3 -m yamllint -c .yamllint homeassistant/packages/calendar.yaml ; echo "exit: $?"`
Expected: exit 0. (If `yamllint` truly unavailable: `pip install --user yamllint` first.)
PASTE actual output.

- [ ] **Step 3: Validate the whole config tree (no regressions)**

Run: `python3 -m yamllint -c .yamllint homeassistant/ ; echo "exit: $?"`
Expected: exit 0 (existing files + the new one all clean).

- [ ] **Step 4: Commit**

```bash
git add homeassistant/packages/calendar.yaml
git commit -m "feat: calendar-by-voice intent_script (C-4)"
```
Use configured identity or `-c user.name="Garrett" -c user.email="newlexicondev@gmail.com"`.

### Task 2: Structural / schema-shape verification (a runnable check script)

**Files:**
- Create: `homeassistant/packages/.calendar-verify.py` (a standalone structural checker — NOT loaded by HA; a dev/CI assertion script)

**Note:** Since we can't run a live HA instance, this script encodes the spec's §3 structural acceptance checks as runnable assertions: the YAML parses, the intent_script shape matches HA's schema keys, the create_event call supplies the required fields, and crucially `duration` is NOT in `data:` (C-1). This is the closest thing to a "test" for config-without-runtime, and it guards against regressions. (Filename starts with `.` so HA's `!include_dir_named packages` — which includes `*.yaml` — never tries to load this `.py`. Confirm in Step 4 it's excluded.)

- [ ] **Step 1: Write the failing check (run before the assertions are satisfiable to confirm it actually checks)**

`homeassistant/packages/.calendar-verify.py`:
```python
#!/usr/bin/env python3
"""Structural verification for calendar.yaml intent_script (C-4).
Not loaded by HA (dotfile). Encodes spec §3 acceptance checks as assertions.
Run: python3 homeassistant/packages/.calendar-verify.py
"""
import sys, pathlib
try:
    import yaml
except ImportError:
    print("PyYAML required: pip install --user pyyaml"); sys.exit(2)

p = pathlib.Path(__file__).with_name("calendar.yaml")
doc = yaml.safe_load(p.read_text())

errors = []
iscript = doc.get("intent_script", {})
intent = iscript.get("KitchenAddCalendarEvent")
if not intent:
    errors.append("missing intent_script.KitchenAddCalendarEvent")
else:
    if not intent.get("description"):
        errors.append("intent missing description (Gemini uses it to decide to call)")
    actions = intent.get("action") or []
    create = next((a for a in actions if a.get("service") == "calendar.create_event"), None)
    if not create:
        errors.append("action missing a calendar.create_event service call")
    else:
        data = create.get("data") or {}
        for req in ("summary", "start_date_time", "end_date_time"):
            if req not in data:
                errors.append(f"create_event data missing required field: {req}")
        # C-1: duration must NOT be passed to create_event
        if "duration" in data:
            errors.append("C-1 violation: 'duration' must NOT be in create_event data")
        # end_date_time must derive from start + duration (uses the verified helpers)
        end = str(data.get("end_date_time", ""))
        if "as_datetime(start)" not in end or "timedelta(" not in end:
            errors.append("end_date_time must compute start+duration via as_datetime()+timedelta()")
        if not (create.get("target") or {}).get("entity_id"):
            errors.append("create_event missing target.entity_id")
    speech = (intent.get("speech") or {}).get("text")
    if not speech:
        errors.append("intent missing speech.text confirmation")

if errors:
    print("FAIL:"); [print("  -", e) for e in errors]; sys.exit(1)
print("OK: calendar.yaml intent_script structurally valid (spec §3 checks pass)")
```

- [ ] **Step 2: Run it against the Task-1 file — verify it PASSES**

Run: `python3 homeassistant/packages/.calendar-verify.py ; echo "exit: $?"`
Expected: `OK: ...` and exit 0. (If PyYAML missing: `pip install --user pyyaml`.)
PASTE output.

- [ ] **Step 3: Prove the check actually checks (mutation test)**

Temporarily add `duration: 1` to the `data:` block in `calendar.yaml`, re-run the script → expect `FAIL` with the C-1 violation line and exit 1. Then REMOVE the `duration: 1` line (restore the file) and re-run → expect `OK` exit 0 again. This confirms the verifier isn't vacuously passing.
PASTE both runs' output. **Leave calendar.yaml in its correct (no-duration-in-data) state.**

- [ ] **Step 4: Confirm HA won't try to load the .py**

The keystone wires `packages: !include_dir_named packages`. HA's `!include_dir_named` excludes `.calendar-verify.py` for **two** independent reasons (both confirmed by HA core's own test suite, `reference/core-dev/tests/util/yaml/test_init.py`): it matches only `*.yaml`/`*.yml`, AND it skips dot-prefixed/hidden entries. So a future maintainer needn't worry even about a hypothetical `calendar-verify.yaml`-named helper (it'd be loaded) vs. this dotfile (skipped).
Confirm the files present (use `ls -a` — bare `ls` hides dotfiles on macOS): `ls -a homeassistant/packages/` should show `calendar.yaml`, `screensaver.yaml`, `.calendar-verify.py`, `.gitkeep`. (Documentation check only.)

- [ ] **Step 5: Commit**

```bash
git add homeassistant/packages/.calendar-verify.py
git commit -m "test: structural verifier for calendar intent_script (spec §3 checks)"
```

### Task 3: Document the manual-test recipe + hardware carry-forwards

**Files:**
- Create: `deploy/CALENDAR_VOICE.md`

**Note:** The runtime behavior (Gemini calls the intent, slots resolve, event lands) is hardware-phase. This file documents how to verify it live + the carry-forwards, so nothing is silently dropped.

- [ ] **Step 1: Write the runbook**

`deploy/CALENDAR_VOICE.md`:
```markdown
# Calendar-by-Voice (C-4) — setup & manual test

The `intent_script` `KitchenAddCalendarEvent` (in `homeassistant/packages/calendar.yaml`)
lets the Gemini voice pipeline create calendar events. Config-only; verified structurally
in-repo (`.calendar-verify.py` + yamllint). Runtime behavior is verified here, on hardware.

## Hardware-phase setup
1. Replace the `calendar.family` placeholder in `calendar.yaml` with your real calendar
   entity id (Settings → Devices & Services → your calendar integration → entity id).
2. Ensure the Gemini conversation agent (Assist) is configured and the Assist LLM API is
   enabled on it (so it can call custom intents). The agent's system prompt should instruct
   it to emit a **tz-aware** ISO 8601 `start` and to call `KitchenAddCalendarEvent` for
   calendar requests. (This prompt work is part of the deferred voice slice.)

## Manual test (run once live)
- Say / type to Assist: **"add dentist Tuesday at 3pm"**
- Expect: a 1-hour event titled "dentist" on the target calendar, starting the upcoming
  Tuesday 15:00 (local tz), and the spoken reply **"Added dentist to the calendar."**
- Verify the `end_date_time` template: the event should END at 16:00 (start + default 1h).
- Edge to check: a request with an explicit duration ("...for 2 hours") → 2h event, IF the
  voice prompt is set up to pass `duration`. Without a duration slot, defaults to 1h.

## Carry-forwards
- Real calendar entity id (replaces `calendar.family`).
- Gemini agent exposure/prompt for the intent = deferred voice slice / hardware phase.
- Later (own slices): all-day events, location/description, multi-calendar routing.
```

- [ ] **Step 2: Validate it's coherent + commit**

Run: `ls deploy/CALENDAR_VOICE.md && echo "exists"`
```bash
git add deploy/CALENDAR_VOICE.md
git commit -m "docs: calendar-voice setup + manual-test recipe + carry-forwards"
```

### Task 4: Final slice verification

- [ ] **Step 1: Run the full slice verification**

Run:
```bash
python3 -m yamllint -c .yamllint homeassistant/ && \
python3 homeassistant/packages/.calendar-verify.py && \
ls deploy/CALENDAR_VOICE.md && echo "CALENDAR SLICE VERIFIED"
```
Expected: yaml validates (exit 0), structural verifier prints OK, runbook exists, prints `CALENDAR SLICE VERIFIED`. PASTE full output. If any part fails, STOP and report.

- [ ] **Step 2: Confirm clean tree**

Run: `git status --short` → expect empty (all committed). `git log --oneline -4` to show the slice's commits.

---

## Done criteria
- `homeassistant/packages/calendar.yaml` exists, yamllint-clean, loaded via the existing keystone `packages:` include.
- The intent_script supplies `summary` + `start_date_time` + computed `end_date_time` to `calendar.create_event`, with NO `duration` field (C-1), `end_date_time` via the verified `as_datetime(start)+timedelta(...)` template (C-2).
- `.calendar-verify.py` passes and was shown to actually catch a C-1 violation (mutation test).
- `deploy/CALENDAR_VOICE.md` documents the hardware-phase setup, the manual-test recipe, and carry-forwards.
- Zero custom Python in the HA runtime (the verifier is a dev dotfile HA never loads).
- Live behavior explicitly deferred to hardware — documented, not silently dropped.
