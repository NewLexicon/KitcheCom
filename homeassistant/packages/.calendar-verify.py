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
