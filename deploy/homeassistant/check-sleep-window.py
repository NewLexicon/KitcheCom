#!/usr/bin/env python3
"""Check binary_sensor.kitchen_sleep_window and the night-wake duration on the dev-HA rig.

Builds windows around the rig's CURRENT local time, sets the sleep helpers, and
compares the sensor with the expected answer. DEV RIG ONLY — it rewrites the sleep
helpers, so never point it at the Pi.

  TOKEN=$(python3 deploy/homeassistant/dev-token.py) python3 deploy/homeassistant/check-sleep-window.py
"""
import datetime
import json
import os
import time
import urllib.request
import zoneinfo

BASE = os.environ.get("HA_URL", "http://localhost:8124")
HEAD = {"Authorization": "Bearer " + os.environ["TOKEN"], "Content-Type": "application/json"}
SENSOR = "binary_sensor.kitchen_sleep_window"


def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(BASE + path, headers=HEAD)))


def call(domain, service, data):
    req = urllib.request.Request(f"{BASE}/api/services/{domain}/{service}", json.dumps(data).encode(), HEAD)
    urllib.request.urlopen(req).read()


def hhmm(minutes):
    m = minutes % 1440
    return f"{m // 60:02d}:{m % 60:02d}:00"


def set_window(start, end, enabled=True):
    call("input_boolean", "turn_on" if enabled else "turn_off", {"entity_id": "input_boolean.kitchen_sleep_enabled"})
    call("input_datetime", "set_datetime", {"entity_id": "input_datetime.kitchen_sleep_start", "time": start})
    call("input_datetime", "set_datetime", {"entity_id": "input_datetime.kitchen_sleep_end", "time": end})
    time.sleep(2)  # plain template sensor re-renders on helper change; give it a beat
    return get(f"/api/states/{SENSOR}")["state"]


tz = zoneinfo.ZoneInfo(get("/api/config")["time_zone"])
now = datetime.datetime.now(tz)
n = now.hour * 60 + now.minute
print(f"rig local time {now:%H:%M} ({tz})")

cases = [
    ("normal window containing now", hhmm(n - 60), hhmm(n + 60), True, "on"),
    ("normal window after now", hhmm(n + 60), hhmm(n + 120), True, "off"),
    ("wrapping window containing now", hhmm(n - 60), hhmm(n - 120), True, "on"),
    ("wrapping window not containing now", hhmm(n + 30), hhmm(n - 30), True, "off"),
    ("start == end (empty)", hhmm(n), hhmm(n), True, "off"),
    ("00:00 -> 00:00 (empty, no fallback)", "00:00:00", "00:00:00", True, "off"),
    ("disabled, window containing now", hhmm(n - 60), hhmm(n + 60), False, "off"),
]
failed = 0
for label, start, end, enabled, want in cases:
    got = set_window(start, end, enabled)
    ok = got == want
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  {label}: {start}->{end} enabled={enabled} -> {got} (want {want})")


def wake_duration():
    call("input_button", "press", {"entity_id": "input_button.kitchen_activity"})
    time.sleep(2)
    return get("/api/states/timer.kitchen_inactivity")["attributes"].get("duration")


set_window(hhmm(n - 60), hhmm(n + 60), True)
got = wake_duration()
failed += got != "0:02:00"
print(f"{'PASS' if got == '0:02:00' else 'FAIL'}  night wake inside window -> {got} (want 0:02:00)")

set_window(hhmm(n - 60), hhmm(n + 60), False)
minutes = int(float(get("/api/states/input_number.kitchen_screensaver_minutes")["state"]))
want = f"{minutes // 60}:{minutes % 60:02d}:00"
got = wake_duration()
failed += got != want
print(f"{'PASS' if got == want else 'FAIL'}  wake outside window -> {got} (want {want})")

raise SystemExit(1 if failed else 0)
