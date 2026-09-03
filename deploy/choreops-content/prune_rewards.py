#!/usr/bin/env python3
"""Prune the ChoreOps reward store down to the four Cash Outs.

Garrett's ask (2026-09-03): "only have the Cash Outs available as rewards".
The other 12 come back later via bonuses. All 16 are regenerable from
gen_content.py, so deletion is reversible.

WHY THIS SCRIPT EXISTS — the earlier attempt failed
---------------------------------------------------
The first attempt emptied ``assigned_user_ids`` on the 12 non-Cash-Outs.
That gate is real in ChoreOps **1.0.8**, but the Pi runs **1.0.7**, whose
reward loop (Pi ``button.py:146-148``) builds a button for every reward with
no assignment check. The edit is inert; all 16 still show. Deleting the
reward definitions is the only mechanism that works on 1.0.7 today.

WHAT ``delete_reward`` ACTUALLY DOES (reference/ChoreOps-main,
managers/reward_manager.py:929-990) — this script mirrors it:
  1. ``del data["rewards"][reward_id]``
  2. removes the reward's HA entities
  3. **prunes each assignee's ``reward_data[reward_id]``** — skipping this
     leaves orphaned redemption history behind

Step 2 is a live-HA call we cannot make from a JSON edit. That is why this
script must run with **Home Assistant stopped**. The deleted rewards' button
entities are left behind as orphans in ``core.entity_registry`` -- harmless
(they render as unavailable) and removable from the HA UI. This is the same
orphan class already documented in the cold-open sec.7.

PENDING REDEMPTIONS ARE A REAL HAZARD
-------------------------------------
``delete_reward`` does **not** check ``pending_count``. A reward with an
unapproved redemption is deleted along with the kid's claim — they spent the
points and get nothing. This script REFUSES to delete such a reward unless
--force is passed, and always reports what it found.

USAGE (run on the Pi, HA stopped)
---------------------------------
    # 1. look, change nothing (default)
    sudo python3 prune_rewards.py /path/to/choreops_data_XXXX

    # 2. apply
    sudo python3 prune_rewards.py /path/to/choreops_data_XXXX --apply

The store path is the FILE inside the store directory, not the directory
itself — ``json.load`` on the directory raises IsADirectoryError.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import shutil
import sys
from pathlib import Path

# Rewards to KEEP, matched exactly against the reward's "name".
# Source of truth: deploy/choreops-content/gen_content.py REWARDS.
KEEP_NAMES = {
    "Cash Out ($1)",
    "Cash Out ($5)",
    "Cash Out ($10)",
    "Cash Out ($20)",
}

# The inert 1.0.7 edit left this behind; clear it once the decision lands.
STASH_KEY = "_kc_unassigned_rewards_20260903"


def _fail(msg: str) -> "typing.NoReturn":  # noqa: F821
    # Flush stdout first: the summary above is written to stdout while this
    # goes to stderr, and unflushed buffering makes the error appear BEFORE
    # the context that explains it.
    sys.stdout.flush()
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def load_store(path: Path) -> dict:
    if path.is_dir():
        _fail(
            f"{path} is a DIRECTORY. The ChoreOps store is a directory whose "
            "payload is a file inside it. Pass the file, e.g.\n"
            "  .storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ"
        )
    if not path.exists():
        _fail(f"{path} does not exist.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _fail(f"{path} is not valid JSON: {exc}")


def resolve_payload(store: dict) -> dict:
    """Return the dict that actually holds 'rewards'.

    HA Store files wrap the payload in {"version":..,"data":{..}}; a raw
    storage dump has the collections at the top level. Support both rather
    than guessing.
    """
    if "rewards" in store:
        return store
    data = store.get("data")
    if isinstance(data, dict) and "rewards" in data:
        return data
    _fail(
        "No 'rewards' key found at the top level or under 'data'. "
        f"Top-level keys: {sorted(store)}"
    )


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Prune ChoreOps rewards down to the Cash Outs."
    )
    ap.add_argument("store", type=Path, help="path to the choreops_data_* FILE")
    ap.add_argument(
        "--apply",
        action="store_true",
        help="write the change (default is a dry run that touches nothing)",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="delete even rewards that have pending (unapproved) redemptions",
    )
    ap.add_argument(
        "--keep-stash",
        action="store_true",
        help=f"do not remove meta.{STASH_KEY}",
    )
    args = ap.parse_args()

    store = load_store(args.store)
    payload = resolve_payload(store)
    rewards = payload.get("rewards") or {}
    if not isinstance(rewards, dict):
        _fail(f"'rewards' is {type(rewards).__name__}, expected a dict keyed by internal_id.")

    users = payload.get("users") or {}

    # ---- classify -------------------------------------------------------
    keep, drop = {}, {}
    for rid, rdata in rewards.items():
        name = (rdata or {}).get("name", "")
        (keep if name in KEEP_NAMES else drop)[rid] = name

    print(f"Store            : {args.store}")
    print(f"Rewards found    : {len(rewards)}")
    print(f"  keep           : {len(keep)}")
    print(f"  delete         : {len(drop)}")
    print()

    missing = KEEP_NAMES - set(keep.values())
    if missing:
        _fail(
            "These KEEP rewards were not found in the store: "
            + ", ".join(sorted(missing))
            + "\nRefusing to run — the store does not look like the expected one."
        )

    print("KEEP:")
    for rid, name in sorted(keep.items(), key=lambda kv: kv[1]):
        print(f"  + {name}   [{rid}]")
    print()

    # ---- pending-redemption safety check --------------------------------
    blocked: list[str] = []
    print("DELETE:")
    for rid, name in sorted(drop.items(), key=lambda kv: kv[1]):
        pend_note = ""
        for uid, udata in users.items():
            rd = (udata or {}).get("reward_data", {}).get(rid)
            if not rd:
                continue
            pending = rd.get("pending_count", 0) or 0
            if pending:
                uname = (udata or {}).get("name", uid)
                pend_note += f"  ⚠ {uname} has {pending} PENDING"
                blocked.append(f"{name} ({uname}: {pending} pending)")
        print(f"  - {name}   [{rid}]{pend_note}")
    print()

    if blocked and not args.force:
        print("REFUSING TO APPLY — pending redemptions would be silently discarded:")
        for b in blocked:
            print(f"    {b}")
        print(
            "\nA pending redemption means points were already spent and a parent has\n"
            "not yet approved it. Approve or disapprove these first, then re-run.\n"
            "Use --force only if you accept discarding them."
        )
        return 2

    # ---- count the reward_data references we will prune ------------------
    ref_prunes = [
        (udata.get("name", uid), name)
        for uid, udata in users.items()
        for rid, name in drop.items()
        if rid in (udata or {}).get("reward_data", {})
    ]
    if ref_prunes:
        print(f"Per-user reward_data references to prune: {len(ref_prunes)}")
        for uname, rname in ref_prunes:
            print(f"    {uname} → {rname}")
        print()

    stash_present = STASH_KEY in (payload.get("meta") or {})
    if stash_present:
        action = "kept (--keep-stash)" if args.keep_stash else "will be REMOVED"
        print(f"meta.{STASH_KEY}: present, {action}")
        print()

    if not args.apply:
        print("DRY RUN — nothing written. Re-run with --apply to commit.")
        return 0

    # ---- apply ----------------------------------------------------------
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = args.store.with_name(args.store.name + f".bak-prunerewards-{stamp}")
    shutil.copy2(args.store, backup)
    print(f"Backup written   : {backup}")

    for rid in drop:
        del rewards[rid]

    # Mirror delete_reward's cleanup: drop orphaned per-user reward_data.
    valid = set(rewards)
    for udata in users.values():
        rd = (udata or {}).get("reward_data")
        if not isinstance(rd, dict):
            continue
        for rid in [r for r in rd if r not in valid]:
            del rd[rid]

    if stash_present and not args.keep_stash:
        del payload["meta"][STASH_KEY]

    args.store.write_text(
        json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Rewards remaining: {len(rewards)}")
    print("APPLIED.")
    print(
        "\nNext: restart HA (`docker restart homeassistant`), then confirm the panel\n"
        "shows only the 4 Cash Outs. The deleted rewards' button entities become\n"
        "orphans in core.entity_registry — harmless, cleanable via the HA UI."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
