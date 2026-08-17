#!/usr/bin/env python3
"""Add/remove scheduled custom rules in AdGuard Home. Fort Knox / KitchenCOM.

WHY THIS EXISTS
---------------
AdGuard's built-in per-client scheduler only pauses `blocked_services`
(the 136 built-in services). **Custom rules cannot be scheduled**, and the
`time=` modifier is accepted by the API and then silently ignored -- it stores
fine, reports success, and never fires (verified 2026-08-17, see
docs/session-state/2026-08-17-adguard-api-lab-findings.md §4c).

So for anything with no built-in service -- Roku Live TV being the case that
prompted this -- a schedule means cron adding and removing the rule.

    block at midnight:  ./adguard-rule-schedule.py block roku-live
    unblock at noon:    ./adguard-rule-schedule.py allow roku-live

THE SAFETY PROPERTY THAT MATTERS
--------------------------------
`POST /control/filtering/set_rules` replaces the ENTIRE user_rules list. A
naive script that writes only its own rules would silently delete every rule
you added by hand -- the same "returns success, destroys data" shape as
/clients/update (see adguard-rmw.py).

This script therefore does read-modify-write on the rule list, and brackets its
own rules with marker comment LINES so it can find and remove exactly those,
leaving hand-written rules untouched:

    ! kc-sched:roku-live
    ||therokuchannel.roku.com^$client='kid-roku'

⚠️ The marker is its OWN LINE, never appended to the rule. AdGuard does NOT
strip inline trailing comments -- appending `! kc-sched:x` to a rule makes the
whole line fail to parse, so the rule is stored, reports success, and never
blocks. Found the hard way on 2026-08-17 while testing this script: the tagged
rule resolved normally while the identical untagged rule blocked.

Verify after any run:  ./adguard-rule-schedule.py status

USAGE
-----
    export ADGUARD_URL=http://192.168.1.53:3000
    export ADGUARD_USER=admin
    export ADGUARD_PASS='...'

    ./adguard-rule-schedule.py block roku-live
    ./adguard-rule-schedule.py allow roku-live
    ./adguard-rule-schedule.py status

CRON (on the Pi, `crontab -e`) -- note cron has no environment, so set it:
    ADGUARD_URL=http://127.0.0.1:3000
    ADGUARD_USER=admin
    ADGUARD_PASS=...
    0 12 * * * /opt/adguard/adguard-rule-schedule.py allow roku-live >>/var/log/kc-sched.log 2>&1
    0  0 * * * /opt/adguard/adguard-rule-schedule.py block roku-live >>/var/log/kc-sched.log 2>&1

Exit codes: 0 success, 1 any failure (unreachable, auth, unknown group,
verification mismatch). Safe to alert on non-zero.
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

# AdGuard sends no WWW-Authenticate challenge, so auth must be preemptive.
_HDR = {"Authorization": "Basic " + base64.b64encode(
    f"{USER}:{PASS}".encode()).decode()}

TAG = "! kc-sched:"

# Rule groups this script manages. Add entries here, not in cron.
# Each rule is scoped with $client so it only affects the named devices.
GROUPS = {
    "roku-live": [
        "||therokuchannel.roku.com^$client='kid-roku'",
    ],
    # Example -- a site with no built-in service, blocked on both kid devices:
    # "misc-contraband": [
    #     "||example-site.com^$client='kid-roku'|'kid-laptop'",
    # ],
}


def _req(path, data=None, method="GET"):
    headers = dict(_HDR)
    if data is not None:
        headers["Content-Type"] = "application/json"
    try:
        return urllib.request.urlopen(urllib.request.Request(
            BASE + path, data=data, headers=headers, method=method), timeout=15)
    except urllib.error.HTTPError as e:
        sys.exit(f"error: {method} {path} -> HTTP {e.code} {e.read()[:200]!r}")
    except urllib.error.URLError as e:
        sys.exit(f"error: cannot reach {BASE} ({e.reason}). Check ADGUARD_URL.")


def get_rules():
    return json.load(_req("/control/filtering/status")).get("user_rules") or []


def set_rules(rules):
    _req("/control/filtering/set_rules",
         data=json.dumps({"rules": rules}).encode(), method="POST")


def tagged(group):
    return f"{TAG}{group}"


def split_managed(rules, mark=None):
    """Return (managed, unmanaged).

    A managed block is a marker comment LINE followed by its rules, up to the
    next marker or the end. If `mark` is given, only that group is treated as
    managed; other groups' blocks count as unmanaged so they are preserved.
    """
    managed, unmanaged, active = [], [], None
    for r in rules:
        s = r.strip()
        if s.startswith(TAG):
            active = s
            (managed if (mark is None or s == mark) else unmanaged).append(r)
            continue
        if active is not None and (mark is None or active == mark):
            managed.append(r)
        else:
            unmanaged.append(r)
    return managed, unmanaged


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    action = sys.argv[1]

    if action == "status":
        mine, theirs = split_managed(get_rules())
        print(f"managed by this script ({len(mine)}):")
        for r in mine:
            print("  ", r)
        print(f"hand-written, untouched ({len(theirs)}):")
        for r in theirs:
            print("  ", r)
        return

    if action not in ("block", "allow") or len(sys.argv) < 3:
        sys.exit(__doc__)
    group = sys.argv[2]
    if group not in GROUPS:
        sys.exit(f"error: unknown group {group!r}. Known: {', '.join(GROUPS)}")

    # READ the whole rule list
    current = get_rules()
    mark = tagged(group)

    # MODIFY: drop this group's block (marker + its rules), then re-add if
    # blocking. Hand-written rules and other groups' blocks are preserved.
    _, kept = split_managed(current, mark)
    desired = list(kept)
    if action == "block":
        # Marker on its own line -- NEVER appended to a rule (see module docstring).
        desired += [mark] + list(GROUPS[group])

    if desired == current:
        print(f"ok: {group} already {action} (no change)")
        return

    # WRITE the whole list back
    set_rules(desired)

    # VERIFY -- a 200 is not proof the state is right.
    after = get_rules()
    mine, _ = split_managed(after, mark)
    active = [r for r in mine if not r.strip().startswith(TAG)]
    want = len(GROUPS[group]) if action == "block" else 0
    if len(active) != want:
        print(f"VERIFY FAILED: expected {want} rule(s) for {group}, "
              f"found {len(active)}", file=sys.stderr)
        sys.exit(1)

    # No rule may carry an inline marker -- that silently disables it.
    broken = [r for r in after
              if TAG in r and not r.strip().startswith(TAG)]
    if broken:
        print("VERIFY FAILED: marker appended inline; these rules will NOT "
              "parse and would silently never block:", file=sys.stderr)
        for r in broken:
            print("  ", r, file=sys.stderr)
        sys.exit(1)

    lost = [r for r in kept if r not in after]
    if lost:
        print(f"VERIFY FAILED: {len(lost)} unrelated rule(s) were lost:",
              file=sys.stderr)
        for r in lost:
            print("  ", r, file=sys.stderr)
        sys.exit(1)

    print(f"ok: {group} -> {action} ({len(active)} rule(s) active, "
          f"{len(kept)} other rule(s) preserved)")


if __name__ == "__main__":
    main()
