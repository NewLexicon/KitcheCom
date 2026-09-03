# Session state — AdGuard Pi card swap, postponed

**Date:** 2026-09-01 (written up 2026-09-03)
**Branch:** `fort-knox` (worktree `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox`)
**Outcome:** ⛔ **No work performed.** Blocked on missing hardware in the first minutes.
**Commit:** `e0200ee` — the only commit of the session, pushed to `origin/fort-knox`.

---

## Status

Garrett returned after a break to **back up the DNS Pi** using a spare microSD. Asked what
the spare was for, he chose **cloning the running card** — a hot-swappable cold spare —
over a fresh install. Then:

> *"I can't seem to find my reader or my microSD. I'll have to postpone this project."*

- **Done:** nothing on the Pi. It was never modified, never rebooted, never logged into
  beyond read-only inspection.
- **In progress:** nothing. The session is closed, not paused mid-edit.
- **Next:** unchanged — the card gate from the fort-knox cold-open §6. It now has a
  precise checklist in §6a of that doc.

The only artifact is documentation: cold-open §6a, a corrected gate line, a de-frozen HEAD
block, and one memory entry.

## Decisions & reasoning

**1. Clone, not rebuild.** Offered three options (clone / fresh install + config restore /
config-only backup), Garrett picked clone. The reasoning worth preserving: **the microSD is
the wear item, not the OS.** A bit-for-bit copy sidesteps re-verifying all seven §5 AdGuard
traps that a fresh install would force — and those traps all share the signature "stored
successfully, reported success, did nothing," so re-verification is expensive and
error-prone. A future session should **not** silently upgrade this to a rebuild because a
fresh install feels tidier. This is recorded in cold-open §6a step 4.

**2. De-froze the HEAD block instead of re-stamping it.** The doc pinned `949adf5` and
"34 commits ahead". Both went stale when the Grocy commits landed. Per the global
cold-open rule's self-counting clause, re-stamping a tip is a loop that cannot converge —
the stamp is itself a commit. So the **stable prefix is frozen** (nine SHAs, all verified
to resolve) and the tip is delegated to `git log --oneline -1`, with an explicit note in
the doc saying the tip is deliberately not frozen. That note exists to stop the *next*
session from "helpfully" re-stamping it.

**3. No fix-up commit this time.** The usual close-out fix-up (HEAD line → its own SHA)
was deliberately skipped, because change #2 removed the thing a fix-up would update. There
is no stale number left to correct.

**4. Did not push unasked.** Committed locally and left the push to Garrett; he asked for
it on the next turn. Pushed after re-verifying the branch.

## Architecture notes

No structural change. One correction and one genuinely new constraint:

- **Card age corrected.** `/sys/block/mmcblk0/device/` reports `name: SL32G`,
  `manfid: 0x000003` (SanDisk), `date: 11/2016`. That is **~10 years**, not the "~6-year-old
  drawer-aged SanDisk" the gate line claimed. Health is fine (29.7GB, 14% used, root on
  `mmcblk0p2`) — this strengthens the replacement case rather than changing the plan.

- 🔴 **The AdGuard Pi has no remote access path.** Newly established, not previously
  documented:
  - `~/.ssh/config` `Host adguard` → bare `192.168.1.113`. No jump host, no proxy.
  - **Not on the tailnet.** `tailscale status` lists only `kitchencom`
    (`100.91.117.105`, the Pi 5 running Home Assistant) and the Mac. The AdGuard Pi was
    never added.
  - Consequence: **every** AdGuard Pi task, including the zero-downtime config backup, is
    home-LAN-only. Do not plan a session around this box otherwise.

  Contrast the Pi 5, which *is* remotely reachable via Tailscale. Two different boxes —
  don't let the Pi 5's remote access imply anything about this one.

## Half-built work

**None.** Nothing was left mid-implementation. The one attempted action — refreshing the
committed config backup — failed and was abandoned cleanly, leaving no partial file in the
repo (the zero-byte output went to the scratchpad, not `deploy/adguard/backup/`).

**`deploy/adguard/backup/AdGuardHome.yaml.2026-08-17` remains the newest copy, and its
staleness is unquantified.** Expected drift is limited to `user_rules`, which cron toggles
for the Roku Live TV rule and which the backup README already documents as not meaningful.
Confirm from the home LAN before relying on it for a restore.

## Gotchas

**1. 🔴 `Connection refused` on `.113` usually means wrong network, not a dead Pi.**
This session hit it and briefly read it as an outage. The Mac had moved to `10.250.77.248`
(GSU/work network — `tailscale status` health check names **Fortinet** equipment blocking
it, and the client was logged out). The Pi was fine the whole time.
**Diagnose with `ipconfig getifaddr en0` before touching the Pi.** A `10.x` answer means
you are on the wrong network. This is the same shape as flashing-runbook §0's warning about
`192.168.1.1` being misread as a consumer router: *verify which network you are on before
trusting a negative result.*

**2. 🔴 `ssh host 'sudo cat file' > out` silently writes zero bytes.** sudo wanted a TTY.
The redirect captured nothing, `$?` did not make it obvious, and the subsequent
`diff committed live` rendered **the entire committed backup as deleted** — which reads as
catastrophic config drift and is pure artifact.

**This is the §5 trap family exactly: it looked like an answer and was not one.** The
fort-knox cold-open's own §11 warning ("test by resolving a domain, not by reading an API
response") generalizes — assert on the *effect*, and here the effect is a non-zero byte
count.
**→ Use `sudo -n` and check `wc -c` before trusting any diff built from remote output.**

**3. The first `ssh adguard` of the session succeeded and later ones did not.** The network
changed mid-session. The health snapshot below is real but was not re-confirmable
afterward. Treat timestamps on remote readings as load-bearing.

## Verified Pi state (2026-09-01, before the network moved)

```
up 5 days, 10 hours, 34 minutes
throttled=0x0
adguard/adguardhome:v0.107.78   Up 5 days
/dev/mmcblk0p2   29G  3.7G  24G  14% /
card: SanDisk SL32G, manfid 0x000003, date 11/2016
```

⚠️ Per `pi-power-and-kiosk-login` in memory: **`throttled=0x0` proves nothing after a
reboot.** Here it follows 5 days of uptime, so it is meaningful.

## Pointers

- **Cold-open (authoritative):** `docs/session-state/2026-08-18-fort-knox-cold-open.md`
  — §6a is new and holds the resume checklist; §6's card gate line is corrected.
- **Memory:** `adguard-pi-card-age-and-no-remote-path.md` in
  `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`
- **Restore path:** `deploy/adguard/backup/README.md`
- **Flashing runbook:** `docs/session-state/2026-08-17-adguard-pi-flashing-runbook.md`
