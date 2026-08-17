# Fort Knox — cold-open (branch `fort-knox`)

**Written:** 2026-08-17 evening, for the next session.
**Worktree:** `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox`

Read this first if you are on `fort-knox`. Everything here is verified, with the command
that verifies it. The project-wide cold-open (`docs/session-state/README.md`) is written
from **main's** perspective and does not describe this branch.

⚠️ **Multiple sessions share this checkout.** Run `git branch --show-current` before every
commit. A concurrent session parks other branches in the primary checkout
(`/Users/jdehart1/___Code_DEV/KitchenCOM`).

---

## 1. Where is HEAD

- **Last substantive commit:** `87f1238` — `adguard-rule-schedule.py`. Anything after it
  is cold-open bookkeeping.
- **Whole branch:** 14 commits ahead of `origin/main`, all pushed. 7 files, +2168 lines.
- **Content:** design + runbooks + two tested Python helpers. **No app code, no test
  suite, no build.** The test tables in the main cold-open do not apply here.

```bash
git log --oneline -1 && git rev-list --count origin/main..HEAD && git rev-list --count origin/fort-knox..HEAD
```
Expect the last number to be **0** — nothing stranded locally.

## 2. What this branch is

Household parental controls ("Fort Knox"), three layers:

- **Layer 1 — DNS.** AdGuard Home on the old Pi (primary) + Pi 5 (secondary). Reaches
  every device. Scheduling, SafeSearch, service blocking, query logs.
- **Layer 2 — device/OS.** Windows Standard accounts + AppLocker, iPad Screen Time,
  PS5 vendor controls, Roku PIN. **This is the layer that actually enforces.**
- **Layer 3 — Home Assistant.** Visibility and overrides on the kitchen panel. Reads and
  drives Layer 1; never authoritative.

**Phases** (design §13): 0 pre-flight · 1 device/OS · 2 AdGuard on old Pi ·
3 household DNS cutover · 4 HA panel · 5 ChoreOps hook (deferred).

## 3. Artifacts, in reading order

All paths absolute; all verified to exist.

1. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/superpowers/specs/2026-08-16-parental-controls-design.md`
   — the design. §13 phase table, §5 honest enforcement posture.
   **Appendix A holds 11 corrections contrary to popular online guidance — do not "fix"
   them back toward the common claims.**
2. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/session-state/2026-08-17-phase1-device-controls-runbook.md`
   — **Phase 1. Ungated, needs no hardware, delivers the original ask.**
3. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/session-state/2026-08-17-adguard-pi-flashing-runbook.md`
   — Phase 2. Tuesday gate lifted; blocked only on hardware/location (§5).
4. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/session-state/2026-08-17-adguard-api-lab-findings.md`
   — **every software claim tested against a live v0.107.78.** Read before touching
   AdGuard.
5. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/reference/adguard-rmw.py`
   — the only safe way to change an AdGuard **client**.
6. `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox/docs/reference/adguard-rule-schedule.py`
   — cron add/remove for **custom rules** (Roku Live TV).

## 4. 🔴 THE FOUR TRAPS — all the same shape

**This project's signature failure mode: stored successfully, reported success, did
nothing.** It has now fired four times on Fort Knox alone. Every one was caught only by
asserting on the *effect* (actual DNS resolution, actual state re-read) rather than on the
API's response. **Checking the write would have passed in all four cases.**

### 4.1 `/clients/update` destroys protections silently

A **partial** write to `/control/clients/update` returns **HTTP 200** and zeroes every
field you omitted. Verified — changing only `blocked_services` also turned off:

```
filtering_enabled  safebrowsing_enabled  parental_enabled  safe_search   → all false
```

A bedtime cron written the obvious way disables a kid's filtering *while appearing to
work*. The only symptom is that the internet quietly starts working.

**→ Never hand-write a client update. Use `docs/reference/adguard-rmw.py`.**

### 4.2 Inline comments silently break rules

AdGuard does **not** strip trailing comments. This stores fine, reports success, and never
blocks:

```
||therokuchannel.roku.com^$client='kid-roku'   ! my note      → 13.32.179.80  NOT blocked
||therokuchannel.roku.com^$client='kid-roku'                  → ::            blocked
```

**→ Comments go on their own line, above the rule. Applies to the UI too** — nothing warns
you. This bit `adguard-rule-schedule.py` during development; it now exits 1 if it finds a
marker appended inline.

### 4.3 The `time=` modifier is accepted and ignored

Custom rules cannot be scheduled. `||site.com^$client='kid',time=21:00-07:00` is stored
verbatim, returns success, and **never fires** — verified with a control rule proving the
syntax is otherwise valid, including a window that contained "now."

**→ Custom rules are all-day or nothing from AdGuard's own scheduler.** To schedule one,
cron must add/remove it: `docs/reference/adguard-rule-schedule.py`.

### 4.4 SafeSearch reads as on while being off

`enabled` is a **separate master switch** from the per-engine flags. Stock instance:

```json
{"enabled": false, "google": true, "bing": true, "youtube": true, ...}
```

Every engine `true`, SafeSearch **off**. Setting engines without `enabled` does nothing.

**→ Verify explicitly:** `GET /control/safesearch/status` must show `"enabled": true`.

### Related, same family, already in project memory

- **ChoreOps penalties must be stored negative** — the form's negation is bypassed.
- **A Grocy test asserted `amount` stayed `1.5`** — a green test locking in the bug.
- **`adguard-rmw.py` itself** reported "protections intact" on an already-broken client.
  A delta check is not a safety check; it now asserts absolute state.

## 5. Where Phase 2 actually stands

**The Tuesday gate was lifted by Garrett on 2026-08-17** — Tuesday work is proceeding in a
separate session. Do not re-impose it. Two physical blockers remain, both checked
2026-08-17:

| Blocker | Evidence | Fix |
|---|---|---|
| **No microSD reader** | `diskutil list external physical` → empty | buy/find one |
| **Not on home network** | `10.250.4.64`, gateway `10.48.73.1` (work) | flash at home |

**Flashing at work bakes the wrong Wi-Fi SSID into the card** (runbook §1 writes creds
before first boot). Imager is installed; Docker works.

**Software risk is retired.** Runbook §5–§6 are transcription now, not discovery:

- v0.107.78 confirmed newest stable (v0.108.x still beta); pushed 2026-07-13.
- Image ships **arm64 + armv7 + armv6** → **the unidentified board does not gate the
  container.** It only decides the 32- vs 64-bit OS choice in §1 step 3.
- `youtube` service confirmed real: **176 rules**, bundles `googlevideo.com` (so YouTube
  Music breaks — verified by resolution) and `youtubei.googleapis.com`.

## 6. The household rule, as designed and tested

**Kids' devices scheduled, parents' devices always open. No cron needed for the built-in
services.**

| Client | `blocked_services` | `blocked_services_schedule` |
|---|---|---|
| each kid device | `["youtube","tiktok","instagram","discord",…]` | allow **07:00–21:00** |
| parent laptop/phone | `[]` | none — nothing to pause |

**136 built-in services exist.** Confirmed present: `tiktok` (33 rules), `instagram` (72),
`discord` (27), `snapchat`, `twitch`, `reddit`, `facebook` (443), `twitter` — ⚠️ **the X id
is `twitter`, not `x`.** Prefer a built-in id over a hand-written rule always: maintained
upstream, **and the only thing the scheduler can pause.**

> 🔴 **The window is an ALLOWANCE window, not a blocking window.** Enter the hours the
> service should be **available**. Verified: inside → resolves; outside → `0.0.0.0`.
> Entering `21:00–07:00` to mean "block overnight" inverts the rule.
>
> 🔴 **Overnight/wrapping ranges are rejected** — `21:00→07:00` gives
> `HTTP 400 ... start 21h0m0s is greater or equal to end 7h0m0s`. Harmless: the same-day
> allowance already implies blocked overnight.

**Roku Live TV has no built-in service.** Needs a custom `$client` rule, therefore cron
(§4.3). Verified working both directions:

```bash
export ADGUARD_URL=http://127.0.0.1:3000 ADGUARD_USER=admin ADGUARD_PASS=...
adguard-rule-schedule.py block roku-live   # → therokuchannel.roku.com :: 
adguard-rule-schedule.py allow roku-live   # → resolves
adguard-rule-schedule.py status            # shows managed vs hand-written
```

Idempotent, survives a reboot mid-block, preserves hand-written rules, exits 0/1 for cron
alerting.

**Timing behavior** (asked and answered 2026-08-17): rules live on the Pi, not the TV —
a TV reboot cannot affect them, and config survives an AdGuard/Pi restart. Changes take
effect in **seconds**, no restart needed. `blocked_response_ttl` is **10s**, so an unblock
can lag ~10s and a block can lag a minute or two if the device cached the answer.
**DNS blocking stops things starting, not continuing** — a mid-stream video keeps playing
until the next app launch.

## 7. 🎯 The literal next move

**Two tracks. Pick by what hardware is in reach.**

**A — at home with an SD reader → Phase 2** (artifact 3). Gate is gone, software risk is
retired. Follow the runbook; §7's acceptance checklist is unchanged and still requires
testing against one real volunteer device.

**B — otherwise → Phase 1** (artifact 2). No hardware, no network changes, no Pi. Design
§13 sequences it *first* because it delivers the download-approval capability that was the
original ask. Budget an afternoon.

**Do not start Phase 3** (household DNS cutover) without the **printed** rollback card
physically posted near the gateway — design §12 / runbook §8. The failure it addresses is
one where looking things up is itself impaired.

## 8. Carry-forwards

- **Old Pi model still unidentified** (runbook §0). Photos confirmed a full-size Pi, not a
  USB dongle; inferred 3B/3B+, unconfirmed. Boot it and read `/proc/cpuinfo` rather than
  reading silkscreen through the case. Less urgent now (arch is covered).
- **The SanDisk 32GB card is ~6 years old.** Fine for Phase 2 testing; **do not carry it
  into Phase 3** — drawer-aged cards fail silently weeks later.
- **Parent devices need reserved IPs too.** Client entries key on address; a parent laptop
  that changes IP silently loses its exemption and picks up the kid ruleset.
- **Add HaGeZi Encrypted DNS/VPN/TOR/Proxy Bypass (registry id 52) in Phase 3.** 16,585
  rules, auto-updating; verified blocking `dns.google`, `cloudflare-dns.com`,
  `nordvpn.com`, `protonvpn.com`. Closes the DoH bypass that design §5 called the
  partially-mitigated hole. ⚠️ **Blocklists are GLOBAL — they hit the parents too.**
- **Do not stack HaGeZi Ultimate/Pro++ blindly.** Breakage rises with tier; a false
  positive on the household resolver reads as "the internet is broken."
- **No `!` in the AdGuard admin password** — shell history expansion in `curl -u` produces
  silent 401s that look like bad credentials. It ends up in HA secrets, so it gets
  scripted.
- **Phase 3 needs both resolvers filtered.** Handing out a public resolver as secondary
  silently converts enforcement into a suggestion.

## 9. Memory-layer entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- `adguard-clients-update-destroys-protections.md` — trap §4.1
- `adguard-safesearch-master-switch.md` — trap §4.4
- `concurrent-sessions-branch-hazard.md` — verify the branch before committing
- `choreops-content-is-generated-json.md` — the penalty-sign bug, same family as §4
- `pi-ssh-access-from-claude.md` — `ssh kitchencom`, Pi 5 at `.234`
- `pi-power-and-kiosk-login.md` — never power a Pi from a monitor or dock

## 10. Verification commands

```bash
# branch state
git branch --show-current && git log --oneline -1 && git rev-list --count origin/fort-knox..HEAD

# the helpers run
python3 -m py_compile docs/reference/adguard-rmw.py docs/reference/adguard-rule-schedule.py

# artifacts exist
ls docs/superpowers/specs/2026-08-16-parental-controls-design.md \
   docs/session-state/2026-08-17-*.md docs/reference/*.py
```

**Reproducing the lab** (no Pi needed — this is how every claim above was verified):

```bash
docker run -d --name adguard-lab -p 3053:3000 \
  -v "$PWD/lab/work:/opt/adguardhome/work" -v "$PWD/lab/conf:/opt/adguardhome/conf" \
  adguard/adguardhome:v0.107.78
curl -X POST http://localhost:3053/control/install/configure -H 'Content-Type: application/json' \
  -d '{"web":{"ip":"0.0.0.0","port":3000},"dns":{"ip":"0.0.0.0","port":53},"username":"labadmin","password":"LabPassw0rdX9"}'
# ...then drive the API. Tear down: docker rm -f adguard-lab
```

⚠️ **Test by resolving a domain, not by reading the API response.** All four traps in §4
return success. Only resolution tells the truth.
