#!/usr/bin/env python3
"""Read-modify-write for an AdGuard Home client. Fort Knox / KitchenCOM.

WHY THIS EXISTS
---------------
`POST /control/clients/update` replaces the ENTIRE client object. Sending only
the field you want to change returns **HTTP 200** and silently sets every
omitted field to its zero value.

Verified against a live v0.107.78 on 2026-08-17 (see
docs/session-state/2026-08-17-adguard-api-lab-findings.md §3). A partial write
that changed only `blocked_services` also turned OFF:

    parental_enabled, safebrowsing_enabled, filtering_enabled, safe_search

...and reported success. A cron job written the obvious way would disable a
kid's filtering while appearing to work. Same defect class as the ChoreOps
penalty-sign bug: validates, succeeds, stores the wrong thing.

ALWAYS go through this helper (or replicate its GET -> mutate -> PUT-whole-object
pattern). Never hand-write a partial update.

USAGE
-----
    export ADGUARD_URL=http://192.168.1.53:3000
    export ADGUARD_USER=admin
    export ADGUARD_PASS='...'

    # inspect
    ./adguard-rmw.py get kid-laptop

    # bedtime: block youtube for one client, preserving everything else
    ./adguard-rmw.py set kid-laptop '{"blocked_services": ["youtube"]}'

    # morning: unblock, still preserving everything else
    ./adguard-rmw.py set kid-laptop '{"blocked_services": []}'

    # dry run - show the diff without writing
    ./adguard-rmw.py set kid-laptop '{"blocked_services": []}' --dry-run

Exit codes: 0 on success, 1 on any failure (unreachable, auth, unknown client,
bad patch, or a write that clobbered protections). Safe to use in cron with
`|| mail -s 'adguard rmw failed'`.

Verified end-to-end against a live v0.107.78 on 2026-08-17: happy paths,
dry-run, unknown client, bad JSON, bad auth, and unreachable host.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("ADGUARD_URL", "http://localhost:3000").rstrip("/")
USER = os.environ.get("ADGUARD_USER", "admin")
PASS = os.environ.get("ADGUARD_PASS", "")

# AdGuard does NOT send a WWW-Authenticate challenge, so urllib's
# HTTPBasicAuthHandler never fires -- it waits for a 401 to react to, and by
# then the request has already failed. The header must go out preemptively on
# every call. This cost a debugging cycle; do not "simplify" it away.
_HDR = {"Authorization": "Basic " + base64.b64encode(
    f"{USER}:{PASS}".encode()).decode()}

# Fields whose silent loss actually matters. Checked after every write.
PROTECTIONS = ("filtering_enabled", "safebrowsing_enabled", "parental_enabled")


def _req(path, data=None, method="GET"):
    headers = dict(_HDR)
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        BASE + path, data=data, headers=headers, method=method)
    try:
        return urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as e:
        sys.exit(f"error: {method} {path} -> HTTP {e.code} {e.read()[:200]!r}")
    except urllib.error.URLError as e:
        sys.exit(f"error: cannot reach {BASE} ({e.reason}). Check ADGUARD_URL.")


def fetch(name):
    clients = json.load(_req("/control/clients")).get("clients") or []
    for c in clients:
        if c.get("name") == name:
            return c
    sys.exit(f"error: no client named {name!r}. "
             f"Known: {', '.join(c.get('name', '?') for c in clients) or '(none)'}")


def snapshot(c):
    """The protection-relevant state, for before/after comparison."""
    return {k: c.get(k) for k in PROTECTIONS} | {
        "safe_search": (c.get("safe_search") or {}).get("enabled"),
        "blocked_services": c.get("blocked_services"),
    }


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    action, name = sys.argv[1], sys.argv[2]

    if action == "get":
        print(json.dumps(fetch(name), indent=2))
        return

    if action != "set" or len(sys.argv) < 4:
        sys.exit(__doc__)

    try:
        patch = json.loads(sys.argv[3])
    except json.JSONDecodeError as e:
        sys.exit(f"error: patch is not valid JSON ({e})")
    if not isinstance(patch, dict):
        sys.exit("error: patch must be a JSON object")

    # READ the whole object
    cur = fetch(name)
    before = snapshot(cur)

    # MODIFY only the requested keys
    cur.update(patch)

    if "--dry-run" in sys.argv:
        print(f"would write to {name}:")
        print(" before:", json.dumps(before))
        print("  after:", json.dumps(snapshot(cur)))
        return

    # WRITE the whole object back. Note `name` appears twice -- outside as the
    # selector, inside `data` as the (possibly renamed) client.
    _req("/control/clients/update",
         data=json.dumps({"name": name, "data": cur}).encode(),
         method="POST")

    # VERIFY. A 200 from this endpoint does not mean the write was correct.
    after = snapshot(fetch(name))
    lost = [k for k in PROTECTIONS
            if before.get(k) and not after.get(k) and k not in patch]
    if before.get("safe_search") and not after.get("safe_search") \
            and "safe_search" not in patch:
        lost.append("safe_search")

    if lost:
        print(f"WRITE CLOBBERED PROTECTIONS: {', '.join(lost)}", file=sys.stderr)
        print(f" before: {json.dumps(before)}", file=sys.stderr)
        print(f"  after: {json.dumps(after)}", file=sys.stderr)
        sys.exit(1)

    # A write can be non-destructive and STILL leave the client unprotected --
    # e.g. a nightly cron running against a client someone already clobbered by
    # hand. Reporting only "no new damage" would be true but dangerously
    # reassuring, so flag the absolute state too.
    off = [k for k in PROTECTIONS if not after.get(k)]
    if not after.get("safe_search"):
        off.append("safe_search")
    if off:
        print(f"WARNING: {name} written OK, but these are OFF: {', '.join(off)}",
              file=sys.stderr)
        print("  (not caused by this write -- pre-existing. Repair with:", file=sys.stderr)
        print(f"   {sys.argv[0]} set {name} '{{\"filtering_enabled\":true,"
              f"\"safebrowsing_enabled\":true,\"parental_enabled\":true}}')",
              file=sys.stderr)
        print(f"  {json.dumps(after)}", file=sys.stderr)
        sys.exit(1)

    print(f"ok: {name} updated, protections intact")
    print(f"  {json.dumps(after)}")


if __name__ == "__main__":
    main()
