# Fort Knox — cold-open (branch `fort-knox`)

**Rewritten 2026-08-17, late evening. Amended 2026-09-01** (§6a — card swap postponed). Every claim below has the command that verifies it.
The project-wide cold-open (`docs/session-state/README.md`) is written from **main's**
perspective and does not describe this branch.

⚠️ **Multiple sessions share this checkout.** Run `git branch --show-current` before every
commit. A concurrent session parks other branches in the primary checkout
(`/Users/jdehart1/___Code_DEV/KitchenCOM`).

---

## 1. Where is HEAD

- **Stable prefix (frozen, immutable):** `1bf1bfd` (design) → `1af56db` (Phase 2 runbook)
  → `0be81e3` (Phase 1 runbook) → `4025488` (API lab) → `949adf5` (AdGuard config backup
  + restore path) → `ce850d4` (cold-open rewrite) → `d92acb7` / `acfbe06` / `68ecd79`
  (Grocy docs + Pi deploy).
- **The tip is deliberately NOT frozen here.** Get it live — do not stamp it back into this
  doc, that loop does not converge:

  ```bash
  git log --oneline -1
  git rev-list --count origin/main..HEAD      # branch-ahead count
  git rev-list --count origin/fort-knox..HEAD # expect 0 when pushed
  ```
- **Content:** design + runbooks + reference helpers + `deploy/adguard/`.
  **No app code, no test suite, no build.** Test tables in the main cold-open do not apply.

```bash
git log --oneline -1 && git rev-list --count origin/main..HEAD && git rev-list --count origin/fort-knox..HEAD
```
Expect the last number to be **0**.

## 2. 🟢 The state in one paragraph

**The AdGuard Pi is built, configured, and running.** Phases 0–2 are done. A hard YouTube
schedule and a cron-driven Roku Live TV schedule are live on the box and verified working.
**But no household device uses the Pi for DNS yet**, so nothing is actually blocked. The
one remaining cheap gate before the Phase 3 cutover is a **fresh A2 microSD card**.

## 3. The box

| | |
|---|---|
| **Access** | **`ssh adguard`** — passwordless ed25519, alias in `~/.ssh/config` |
| **IP** | `192.168.1.113` (eth0). ⚠️ also `192.168.1.236` on wlan0 — **one Pi, two IPs** |
| **Admin UI** | `http://192.168.1.113:3000` |
| **API creds** | `~/.adguard-netrc` on the Pi (0600) · cron creds `/root/.adguard-env` (0600) |
| **Board** | Raspberry Pi 3 Model B **Rev 1.2**, `armv7l` |
| **OS** | Raspberry Pi OS Lite 32-bit (trixie), 0 upgradable, kernel `6.18.39+rpt-rpi-v7` |
| **Docker** | 29.7.2 + Compose v5.5.0, enabled at boot |
| **AdGuard** | **`v0.107.78`** pinned, `network_mode: host` |
| **Power** | Apple 12W iPad brick, 5.2V 2.4A (replaced an under-spec 5V 2.0A Samsung) |

```bash
ssh adguard 'uptime -p; vcgencmd get_throttled; sudo docker ps --format "{{.Image}} {{.Status}}"'
dig +short @192.168.1.113 example.com     # must return an address
```

## 4. What is configured

**8 clients** — 6 kid devices, 2 parent devices (parents have **no** blocking):

| Client | IP | Device |
|---|---|---|
| `Roku-65-livingrm` | `.216` | 65" Roku TV `65R4CX` |
| `Roku-55-S425` | `.228` | 55" TCL Roku TV `55S425` |
| `Roku-55-R625` | `.230` | 55" TCL Roku TV `55R625` |
| `PS5` | `.82` | PlayStation 5 |
| `Oculus-VR` | `.238` | Meta/Oculus headset |
| `iPad-kid-250` | `.250` | kid's iPad |
| `PARENT-mac-garrett` | `.180` | Garrett's Mac — **exempt** |
| `PARENT-device-215` | `.215` | Apple device — **exempt** |

**The household rule — HARD, every day of the year, no exceptions.** Garrett was explicit.
An override helper was written and **deleted at his direction — do not re-introduce one.**
He may move the weeknight cutoff to **19:30** with experience.

| Days | Allowed |
|---|---|
| **Sun–Thu** | **12:00 – 20:00** |
| **Fri–Sat** | **12:00 – 23:59** |

- **YouTube** (built-in service, 176 rules) → native per-client scheduler.
  Re-apply with `deploy/adguard/apply-youtube-schedule.py` **on the Pi**.
- **Roku Live TV** (`therokuchannel.roku.com`) → **no built-in service exists**, so a custom
  `$client` rule driven by **cron** (`/etc/cron.d/kc-roku-live`, 3 entries →
  `deploy/adguard/kc-roku-live.cron`). Scoped to the three Rokus **by client name**.
- **SafeSearch** global, `enabled: true`, all engines.
- Schedule timezone **`America/New_York`**.

```bash
ssh adguard 'sudo sh -c ". /root/.adguard-env && export ADGUARD_URL ADGUARD_USER ADGUARD_PASS && /opt/adguard/adguard-rule-schedule.py status"'
```

## 5. 🔴 SEVEN TRAPS — all the same shape

**Signature failure mode: stored successfully, reported success, did nothing.** Every one
was caught by asserting on the *effect* — actual DNS resolution, an actual state re-read —
never on an API response. **Checking the write would have passed in all seven.**

### Found in the lab (before the Pi existed)

**5.1 `/clients/update` destroys protections.** A *partial* write returns **HTTP 200** and
zeroes every omitted field — `filtering_enabled`, `safebrowsing_enabled`,
`parental_enabled`, `safe_search` all → false. A bedtime cron written the obvious way
disables a kid's filtering while appearing to work. **→ Read-modify-write only; see
`docs/reference/adguard-rmw.py`.**

**5.2 Inline comments silently break rules.** AdGuard does **not** strip trailing comments.
`||x.com^$client='kid'   ! note` stores fine, reports success, **never blocks**. Applies in
the UI too, with no warning. **→ Comments on their own line.**

**5.3 `time=` is accepted and ignored.** `...,time=21:00-07:00` is stored verbatim, returns
success, **never fires** — proven with a control rule and a window containing "now".
**→ Custom rules cannot self-schedule. Cron must add/remove them.**

**5.4 SafeSearch reads as on while off.** `enabled` is a **separate master switch** from the
per-engine flags. A stock instance reports `{"enabled": false, "google": true, ...}` — every
engine `true`, SafeSearch **off**. Reproduced live on this box.
**→ `GET /control/safesearch/status` must show `"enabled": true`.**

### Found while building this Pi (2026-08-17)

**5.5 The setup wizard puts the admin UI on port 80**, not the `:3000` its own screen shows.
Calls to `:3000` then return **`HTTP 000` (connection refused)**, which reads as an auth or
service failure and is neither. **→ Diagnose with `ss -tlnp`, not by re-checking creds.**
Corrected here; `AdGuardHome.yaml` line 12 is `address: 0.0.0.0:3000`.

**5.6 🔴 Schedule timezone defaults to UTC** while the Pi is `America/New_York`. Left alone,
**a 20:00 cutoff fires at 16:00** — working perfectly, at the wrong time, every day, with
nothing looking broken. **→ Set the zone *name* (DST-aware; EDT is -0400, EST is -0500) and
re-read to confirm.**

**5.7 apt reports success while fetching nothing.** First upgrade ended with 5 failed
packages and **all 85 still pending**, via IPv6 timeouts to the Raspbian mirror, while the
pipeline showed `EXIT:0`. Fixed with `Acquire::ForceIPv4` (`/etc/apt/apt.conf.d/99force-ipv4`).
**→ Verify apt by remaining-upgradable count, never by exit code.** Also:
`/var/run/reboot-required` is **unreliable** here — it read `no` right after a new kernel
was installed. Compare `uname -r` against `ls /boot/vmlinuz-*`.

### Same family, already in project memory

ChoreOps penalties must be stored **negative** · a Grocy test asserted the buggy value and
locked it in · `adguard-rmw.py` itself once reported "protections intact" on an
already-broken client.

## 6. 🎯 The literal next move

**Phase 3 — household DNS cutover.** Gates:

| Gate | Status |
|---|---|
| Printed rollback card (design §12) | ✅ written + every address verified — **`docs/reference/rollback-card.html`, open and print it** |
| Config backup for the card swap | ✅ `deploy/adguard/backup/` + restore steps |
| PSU | ✅ Apple 12W (5.2V 2.4A) |
| **Fresh A2 microSD** | ❌ **the last cheap gate** — card + reader both **missing as of 2026-09-01**; see §6a. The running card is a SanDisk `SL32G` dated **11/2016** (~10 yrs, not ~6) |
| Filtered secondary resolver | ❌ deferred by design — expensive; one filtered resolver is normal for a home |

**When the card arrives:** flash per the flashing runbook §1–§4, install Docker, restore
`deploy/adguard/backup/AdGuardHome.yaml.2026-08-17` per that directory's README (the
password hash is redacted — regenerate it), reinstall the cron + `/root/.adguard-env`, then
cut over by pointing the gateway's DHCP DNS at `192.168.1.113`.

**Then verify by resolving from a real device, not by reading a status page.**

## 6a. 🛑 Card swap attempted 2026-09-01 — postponed, no work done

Garrett returned after a break intending to **clone the running card onto a spare** (a cold
spare, not a rebuild — that was his explicit pick over a fresh install). It stopped
immediately: **he could locate neither the spare microSD nor a card reader.** His words:
*"I can't seem to find my reader or my microSD. I'll have to postpone this project."*

**Nothing was changed.** No flashing, no config edits, no commits to `deploy/adguard/`.
The Pi is untouched.

### What the session did establish

- ✅ **The Pi is healthy.** Verified live before the network dropped: `up 5 days`,
  `throttled=0x0`, `adguard/adguardhome:v0.107.78 Up 5 days`, root fs 14% used.
- 🔴 **The card is ~10 years old, not ~6.** From
  `/sys/block/mmcblk0/device/` — `name: SL32G`, `manfid: 0x000003` (SanDisk),
  `date: 11/2016`. The gate above is corrected. Still healthy, but the age argument for
  replacing it is stronger than the doc claimed.
- 🔴 **There is NO remote path to this Pi.** `~/.ssh/config` `Host adguard` is a bare
  `192.168.1.113` with no jump host, and the box **is not on the tailnet** —
  `tailscale status` lists only `kitchencom` (the Pi 5) and the Mac. From the GSU/work
  network (Mac on `10.250.77.x`) Tailscale is *also* blocked outright, with the health
  check naming **Fortinet** equipment.

  **⚠️ Do not misread this.** `ssh adguard` returning `Connection refused` is the
  expected result off the home LAN. Run `ipconfig getifaddr en0` first — a `10.x`
  answer means wrong network, **not** a dead Pi. This session hit exactly that and it
  briefly looked like an outage.

### Also worth knowing: the committed config backup could not be refreshed

`deploy/adguard/backup/AdGuardHome.yaml.2026-08-17` is still the newest copy. A refresh was
attempted and **failed for two independent reasons**, both worth writing down:

1. `ssh adguard 'sudo cat ...' > file` wrote a **zero-byte file** — sudo wanted a TTY and
   the redirect captured nothing. The subsequent `diff` then showed the entire committed
   backup as "removed", which reads like catastrophic drift and is pure artifact.
   **Use `sudo -n` and check the byte count before trusting any diff.**
   This is the same family as the §5 traps: *it looked like an answer and was not one.*
2. The network had moved off the home LAN by then, so it was unreachable regardless.

**The backup's staleness is unquantified.** The only expected drift is `user_rules`, which
cron toggles for the Roku rule and which the backup README already calls not-meaningful.
Confirm from the home LAN before relying on it.

### The literal next move for this gate

1. Find the spare microSD **and** a USB card reader. This is the whole blocker.
2. Be **on the home LAN** — nothing about this Pi is reachable otherwise.
3. Refresh the config backup first (cheap, no downtime):
   `ssh adguard 'sudo -n cat /opt/adguard/conf/AdGuardHome.yaml' > deploy/adguard/backup/AdGuardHome.yaml.$(date +%F)`
   — verify it is non-empty, redact the `password:` line, then commit.
4. Then clone: power the Pi down, image the old card, write it to the spare.
   Cloning was chosen deliberately — **the card is the wear item, not the OS**, so a
   bit-for-bit copy avoids re-verifying all seven §5 traps that a fresh install would
   force. Do not silently upgrade this to a rebuild.

---

## 7. ❓ Open question that may reshape the plan

**The gateway may support per-device scheduling after all** — via the **AT&T Smart Home
Manager app**, not the local web UI. A local probe (`parentalcontrols.ha`, `schedule.ha`,
`allowblocklist.ha` → all 400) **cannot detect an app/cloud-managed feature**, so the
absence measured was not evidence of absence.

**This challenges design line 33**, which says scheduling *"is the capability the AT&T
gateway lacks and the reason a DNS layer exists at all."*

If it works, gateway-level beats DNS for **full-internet** scheduling on every axis — it
cuts real traffic (so video already playing **dies**, which DNS cannot do), is immune to
DoH/VPN, needs no cron, and has an instant per-device pause. **DNS stays the right tool for
*selective* blocking** (YouTube off on a Roku while the TV still works), which the gateway
cannot do. Complementary layers; the architecture survives, that one claim may not.

**Blocked on:** Garrett's AT&T password (couched 2026-08-17). **Deciding factor:** a
**reseller** account (e.g. Sonic over AT&T lines) has no Smart Home Manager, and per-device
scheduling would then need an external router via IP Passthrough. Detail: build-handoff §4e.

## 8. Carry-forwards

- ⚠️ **What the 20:00 cutoff actually does.** It stops YouTube being **startable**, not
  instantly unusable. A playing video finishes, and the app often serves more from cached
  DNS for **~10–30 min**. Power-cycling the device ends it. `blocked_response_ttl` is 10s.
  **A hard curfew is not achievable via DNS** — that needs §7's gateway route. Garrett has
  been told this plainly; do not oversell it.
- ⚠️ **Blocking YouTube also blocks `googlevideo.com`, so YouTube Music breaks.** Accepted
  in design §8.
- 🔴 **One Pi, two IPs.** `eth0 .113` + `wlan0 .236` both hold leases and advertise the same
  hostname — it briefly looked like two Raspberry Pis. **Disable wlan0 before reserving the
  IP at the gateway**, or the wrong address gets reserved:
  `sudo nmcli con modify netplan-wlan0-ThunderEnlighten connection.autoconnect no`
- **Reserve every client IP at the gateway (HUMAX, `192.168.1.254`).** Client entries key on
  IP — an unreserved kid device that changes address **silently loses its ruleset**, and a
  parent device that changes address **silently picks up the kid one**.
- 🔑 **Apple "Private Wi-Fi Address": Fixed is sufficient, Off is not required.** Three
  states — Off ✅, **Fixed ✅ (stable per network)**, Rotating ❌ (breaks reservations).
  Check each kid iPad.
- **Devices are scattered.** Windows laptop at work being rebuilt (~1 week from 2026-08-17);
  a second iPad returns **Wed 2026-08-20**. **Do each device's runbook section when that
  device is in hand** — do not wait for a session where everything is present.
  **The laptop rebuild is the right moment to do Phase 1 §2 from scratch** (Standard
  accounts + AppLocker) rather than retrofitting. Until then the **DoH bypass stays open** —
  AppLocker is what stops portable browsers.
- **Phase 1 (device/OS) is still the layer that actually enforces** and is largely undone.
  Family Link needs no hardware and is the standing first move.
- **`.107` (Amazon), `.85` (Grandstream), `.227` (ecobee), `.248` (Spreadtrum)** are
  uncatalogued in AdGuard. Decide whether any belong in the kid set.
- **No `!` in the AdGuard admin password** — shell history expansion in `curl -u` produces
  silent 401s that look like bad credentials.
- **Add HaGeZi Encrypted DNS/VPN/TOR/Proxy Bypass (registry id 52) at Phase 3.** 16,585
  rules; closes the DoH hole design §5 calls partially-mitigated. ⚠️ **Blocklists are
  GLOBAL — they hit parents too.** Do not stack Ultimate/Pro++ blindly.
- **Old card contents are gone.** It held LEDE 17.01.4 (OpenWrt); erased deliberately at
  Garrett's direction, no image taken. Do not go looking for a backup.

## 9. Artifacts

**Read in this order.** All paths verified to exist.

1. `docs/session-state/2026-08-17-adguard-pi-build-handoff.md` — **the build. Read first.**
2. `docs/superpowers/specs/2026-08-16-parental-controls-design.md` — the design. §13 phases,
   §5 honest enforcement posture. **Appendix A holds 11 corrections contrary to popular
   online guidance — do not "fix" them back.** ⚠️ **line 33 is challenged by §7 above.**
3. `docs/session-state/2026-08-17-adguard-api-lab-findings.md` — every software claim tested
   against a live v0.107.78.
4. `docs/session-state/2026-08-17-phase1-device-controls-runbook.md` — Phase 1, ungated,
   the layer that actually enforces.
5. `docs/session-state/2026-08-17-adguard-pi-flashing-runbook.md` — Phase 2. §0 is
   **resolved**; the rest is the card-swap procedure.
6. `docs/reference/rollback-card.html` — **print before cutover.**
7. `docs/reference/adguard-rmw.py` · `docs/reference/adguard-rule-schedule.py`
8. `deploy/adguard/` — compose · `apply-youtube-schedule.py` · `kc-roku-live.cron` ·
   `backup/`

## 10. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- `adguard-pi-built-and-scheduled.md` — **this box: access, the rule, ms-not-minutes, UTC**
- `old-pi-is-3b-running-lede.md` — board + the card's prior life
- `adguard-clients-update-destroys-protections.md` — trap 5.1
- `adguard-safesearch-master-switch.md` — trap 5.4
- `concurrent-sessions-branch-hazard.md` — verify the branch before committing
- `pi-power-and-kiosk-login.md` — never power a Pi from a monitor or dock;
  **`throttled=0x0` proves nothing after a reboot**
- `pi-ssh-access-from-claude.md` — Pi 5 at `.234` (Home Assistant, a different box)
- `second-pi-hijacks-route.md` — sibling to the direct-cable DNS hijack
- `adguard-pi-card-age-and-no-remote-path.md` — **card is 11/2016; this Pi is home-LAN
  only and NOT on the tailnet, so `Connection refused` usually means wrong network**

## 11. Verification commands

```bash
# branch
git branch --show-current && git log --oneline -1 && git rev-list --count origin/fort-knox..HEAD

# the Pi is alive and resolving
ssh adguard 'uptime -p; vcgencmd get_throttled; sudo docker ps --format "{{.Image}} {{.Status}}"'
dig +short @192.168.1.113 example.com

# config is what we think it is
ssh adguard 'curl -s --netrc-file ~/.adguard-netrc http://127.0.0.1:3000/control/safesearch/status'
ssh adguard 'curl -s --netrc-file ~/.adguard-netrc http://127.0.0.1:3000/control/blocked_services/get'
ssh adguard 'sudo grep -cE "^[0-9]" /etc/cron.d/kc-roku-live'   # expect 3

# helpers compile
python3 -m py_compile docs/reference/*.py deploy/adguard/apply-youtube-schedule.py
```

⚠️ **Test by resolving a domain, not by reading an API response.** All seven traps in §5
return success. Only resolution tells the truth.
