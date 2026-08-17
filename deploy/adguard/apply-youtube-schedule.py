#!/usr/bin/env python3
"""Apply the YouTube allowance schedule to the kid devices.

READ-MODIFY-WRITE only: each client is fetched in full, then only the fields we
mean to change are touched. Never hand-write a client object -- a partial write
to /clients/update returns HTTP 200 while zeroing every field you omitted
(filtering_enabled, safebrowsing_enabled, parental_enabled, safe_search).
"""
import json
import subprocess

NETRC = "/home/garrettdehart/.adguard-netrc"
BASE = "http://127.0.0.1:3000"

KIDS = [
    "Roku-65-livingrm",
    "Roku-55-S425",
    "Roku-55-R625",
    "PS5",
    "Oculus-VR",
    "iPad-kid-250",
]

# Allowance windows in MILLISECONDS from local midnight (America/New_York).
# THE WINDOW IS WHEN YOUTUBE *WORKS*, not when it is blocked.
#
# The API takes MILLISECONDS, not minutes. Passing minutes fails loudly with
#   "bad day range: start 720ms isn't rounded to minutes"
# -- it read 720 as 720ms. It must also be a whole number of minutes.
MIN = 60 * 1000
NOON = 12 * 60 * MIN        # 12:00
EIGHT_PM = 20 * 60 * MIN    # 20:00
LATE = (23 * 60 + 59) * MIN # 23:59  (00:00 would wrap to the next day -> HTTP 400)

SCHEDULE = {
    "time_zone": "America/New_York",
    "sun": {"start": NOON, "end": EIGHT_PM},
    "mon": {"start": NOON, "end": EIGHT_PM},
    "tue": {"start": NOON, "end": EIGHT_PM},
    "wed": {"start": NOON, "end": EIGHT_PM},
    "thu": {"start": NOON, "end": EIGHT_PM},
    "fri": {"start": NOON, "end": LATE},
    "sat": {"start": NOON, "end": LATE},
}


def api(path, method="GET", body=None):
    cmd = ["curl", "-s", "--netrc-file", NETRC, "-X", method, BASE + path]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    if not out.strip():
        return {}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"_raw": out.strip()}


def main():
    clients = api("/control/clients").get("clients") or []
    by_name = {c["name"]: c for c in clients}

    for name in KIDS:
        current = by_name.get(name)
        if not current:
            print("  MISSING  %s" % name)
            continue
        updated = dict(current)                      # full copy, then narrow edits
        updated["use_global_blocked_services"] = False
        updated["blocked_services"] = ["youtube"]
        updated["blocked_services_schedule"] = SCHEDULE
        result = api("/control/clients/update", "POST",
                     {"name": name, "data": updated})
        print("  %-22s -> %s" % (name, result if result else "ok"))


if __name__ == "__main__":
    main()
