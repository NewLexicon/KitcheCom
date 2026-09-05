# 2026-09-02 — Rollover bug resolved, Zigbee radio live, Tailscale blocked at work

**Branch:** `feat/choreops-chores` · **Tree:** clean
**Tip:** `git log --oneline -1` (deliberately not frozen here — see the cold-open rule)
**Ahead of main:** `git rev-list --count main..HEAD`

Session ran ~08:20–10:15 EDT. Garrett headed home ~11:15; work resumes there.

---

## 1. Status

| Thread | State |
|---|---|
| Nightly phantom re-award | ✅ **RESOLVED** — mechanism found, fix verified empirically |
| Zigbee coordinator | ✅ **Hardware live** on the Pi, ZHA **not yet configured** (needs UI + physical presence) |
| Zigbee channel choice | ✅ Decided — **25**, with 15 an acceptable fallback |
| Tailscale from the office | ❌ **Blocked by Fortinet** — worked ~3 min on cached state, then dropped |
| Calendar CSS decision | ⏸️ Untouched — still the next repo-side task |

---

## 2. The nightly re-award bug — CLOSED

Full write-up is in `docs/session-state/2026-09-01-calendar-live-and-panel-layout.md`
(rewritten this morning, commit `df611f9`). Summary:

**Mechanism.** `SystemManager._run_startup_midnight_catchup()` guards on
`meta.last_midnight_processed`:

```python
if last_processed_utc is not None and last_processed_utc >= today_midnight_utc:
    return   # already processed today
```

Before the `schema45_seed_last_midnight_processed` migration, that field did not exist →
getter returned `None` → **`None` fails the guard open** → every startup emitted a
MIDNIGHT_ROLLOVER replaying the day's daily chores with their **original `reference_id`s**.
That is the Aug-19 signature exactly, and why 14.0 became 28.0 across the Aug 18 restart.

**Fixed upstream** by that seeding migration (marker-guarded, runs once ever; marker present
in this install's `meta.migrations_applied`, stamp populated).

**Verified empirically** (ChoreOps 1.0.7 on the Pi): two mid-day HA restarts at 09:02/09:03
with `custom_components.choreops: debug` temporarily enabled. Log showed the guard declining:

```
09:02:45.752 DEBUG SystemManager: Midnight catch-up not needed
    (last_processed=2026-09-02T04:00:00.558071+00:00)
```

Rowan stayed **2.0 points / 1 ledger entry** across both restarts; stamp not re-written;
0 ChoreOps errors. `configuration.yaml` restored byte-identical to its pre-test backup.

**Garrett's question, answered: a midday power outage does NOT double that day's points.**
The guard is date-granular, not restart-count-granular.

**Residual risk (low):** the guard keys on *local* midnight. If the stamp is ever cleared,
or the clock/timezone jumps backwards across a midnight boundary, the `None`/stale path
re-opens. **Symptom to watch:** ledger entries at a reset boundary with no preceding
`last_claimed`.

### Two corrections made to yesterday's doc

1. It said "the mechanism was NOT fixed." False — it had been fixed by a migration that had
   already landed; what was never done was *verifying* it.
2. Its morning-check used **`chore_data.last_claimed`**. That key does not exist —
   `last_claimed`/`last_completed` are **top-level on the chore record**. The wrong path
   returns `None` for every chore, which reads as "nobody ever claimed anything."

---

## 3. Zigbee — hardware confirmed, ZHA not yet set up

**Present and working on the Pi** (Garrett brought it up mid-session; it was previously only
a purchase decision):

- **ITead Sonoff ZBDongle-P** (CC2652P) on `/dev/ttyUSB0`.
- Confirmed **-P not -E** by its **CP210x** bridge (`10c4:ea60` → `ttyUSB`). The -E uses an
  EFR32MG21 with native USB and enumerates as **`ttyACM`**.
- `SYS_VERSION` probe returned `transport=2 product=1 fw=2.7.1` (Z-Stack 2.7.1);
  `product=1` = CC2652 family. Independent confirmation.
- Link clean: 12 Mbps full-speed, 100 mA, **direct to the Pi root hub (bus 001)** — NOT
  behind the RTS5411 hub the touchscreen needs. Zero cp210x disconnects.

**Stable path — always use this, never `/dev/ttyUSB0`:**

```
/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_8aae1a09dd9def11b750cda661ce3355-if00-port0
```

**Mounting.** It sits in the USB extension cradle that came with a surplus Wi-Fi dongle
Garrett found at work. That cradle is protocol-agnostic and is the **permanent** home for the
Zigbee radio — it satisfies the extension-cable requirement in `lighting.yaml`. Keep it there
regardless of whether the Wi-Fi dongle is ever used.

**The surplus Wi-Fi dongle** (`0bda:b812`, Realtek RTL8822BU, AC1200) is now unplugged.
Verdict: keep as a spare, don't plan around it. **No macOS driver exists** (useless on the
Mac); on a Pi it is a sideways move from the built-in `wlan0`, and its out-of-tree
`rtw_8822bu` driver can break on kernel updates. It is NOT a Zigbee substitute — different
protocol entirely.

### Channel: 25

Home Wi-Fi `ThunderEnlighten` 2.4 GHz is on **channel 10** (2457 MHz, occupying ~2446–2468
MHz). Only one 2.4 GHz AP in range — an unusually quiet band.

- ✅ **Zigbee 25 (2475 MHz)** — clear of Wi-Fi ch 10, and a "Zigbee-preferred" channel
  (15/20/25) that many devices default to, so pairing goes more smoothly.
- ⚠️ **Not 26** — regulation power-limited on many radios; some bulbs refuse to join.
- ✅ Fallback **15** (2425 MHz), safely below ch 10.
- ❌ 20/21/22 sit inside Wi-Fi ch 10.

**Not a conflict:** the Pi's own `wlan0` is on **5 GHz ch 44** — different band, cannot
interfere. The ch-10 broadcast is a separate radio in the same router.

**Router caveat:** if its 2.4 GHz is "auto" it can drift to ch 11/13 and land on Zigbee 25.
Pin the router's 2.4 GHz to **ch 1** (2412 MHz) for permanent separation.

### Next action for ZHA — REQUIRES GARRETT PHYSICALLY AT THE PANEL

Verified this session: **no radio integration is configured** (zha/mqtt/zwave_js/matter/
deconz all absent from `core.config_entries`; 15 entries total). Clean slate.

ZHA setup is a **UI config flow only** — there is no supported CLI or file-based path, and
hand-forging `core.config_entries` plus ZHA's database is not worth the breakage risk.
The runbook also requires bulbs be paired **in their final fixtures** (mesh topology), so
this cannot be done remotely.

Steps:
1. Settings → Devices & Services → Add Integration → **Zigbee Home Automation**
2. Serial port: the **by-id** path above, not `ttyUSB0`
3. Radio type: **`znp`** (TI Z-Stack) — correct for CC2652P
4. **Form a new network**
5. ⚠️ ZHA usually does **not** prompt for a channel; it silently forms on **15**. That is
   **fine** here (2425 MHz, clear of ch 10) — do NOT re-form a network to chase 25. Only
   move to 25 if dropouts appear later. If the flow *does* offer a choice, pick 25.
6. Pair bulbs (power-cycle an unprovisioned ZL1), each **in its final fixture**

**Full runbook:** `homeassistant/packages/lighting.yaml` on branch **`feat/adaptive-lighting`**
(NOT on `feat/choreops-chores` — that file does not exist here). Bulbs: Third Reality ZL1.
A shared gate: the rainwater-irrigation design on `feat/irrigation` needs this same
coordinator.

---

## 4. Tailscale from the office — BLOCKED

First real remote test. **It does not work from Garrett's workplace.**

- Briefly worked on arrival (SSH reached, HA returned 200 in 55 ms, ping 49 ms avg via DERP
  relay `mia`), then died within ~3 minutes.
- After the drop: `self online: False`, 100% packet loss, SSH timeout, `CurAddr` fell back to
  `(relay)`, counters reset 0/0.
- General internet is fine (Google 200). Tailscale's HTTPS endpoints are reachable
  (controlplane 404 = normal for that path; DERP 200). **So it is UDP being blocked**, not
  DNS or the domains.
- Health reported: *"Network equipment from **Fortinet** may be blocking Tailscale traffic."*
  That warning was accurate; it was initially dismissed because traffic was flowing on
  cached state.

**`tailscale up`/`down` are no-ops on the Mac App Store build** — the CLI cannot force a
reconnect or change transport. Requires the GUI, or IT.

**Untried options, in order of likely payoff:**
1. Menu-bar toggle (disconnect → reconnect) — clears a stale session sometimes.
2. **Phone tether** — bypasses the office network entirely; ~30 s to confirm the diagnosis.
3. Ask IT to allow outbound **UDP 41641** + `*.tailscale.com` + DERP relays. Some Fortinet
   deployments also do TLS inspection that breaks Tailscale.

**Tailscale from home is unaffected** — this is purely the work network.

---

## 5. Next move

Garrett is home this evening; work resumes there, where the Pi is on the LAN and
`ssh kitchencom` works directly (no Tailscale needed).

Two candidates, either fine:

- **ZHA setup + bulb pairing** — needs him at the panel with bulbs in fixtures. Switch to
  `feat/adaptive-lighting` first; the runbook is there and NOT on this branch.
- **The calendar CSS decision** — pure repo-side, carried over from 2026-09-01. The built-in
  calendar card cannot produce "SEPT 2" strings; they come from FullCalendar inside a shadow
  root. Real paths are a custom card or an HA theme, both written up with source citations in
  `docs/session-state/2026-09-01-calendar-live-and-panel-layout.md`.
  Note `themes/kitchencom.yaml` is **proposed, not existing** — do not go hunting for it.

---

## 6. Carry-forwards

- **Chore Champion `6/250` still un-zeroed** for Rowan — partly from the Aug-19 phantom.
  Open if a clean slate is wanted. (Early Riser was zeroed 2026-09-01.)
- **Points-structure trap:** zeroing points naively breaks the points sensor. Every level
  must be a dict with `all_time` **nested**. Failure presents only as the entity showing
  "Unavailable" — read `home-assistant.log` before theorising. See
  [[choreops-point-periods-structure]].
- **ChoreOps logs nothing about resets at default verbosity.** To observe the midnight guard,
  temporarily add `logger:` with `custom_components.choreops: debug` to `configuration.yaml`
  — back it up first, it is a contested file — then restore.
- **`git status` on this checkout is shared** — multiple sessions use it. Verify
  `git branch --show-current` before every commit.

## 7. Memory entries written this session

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- **`midnight-rollover-guard.md`** — the `None`-fails-open mechanism, the restart-safety
  proof, and the `chore_data` path trap.
- **`zigbee-channel-and-radio.md`** — ZBDongle-P confirmation, CP210x-vs-ttyACM
  discriminator, channel-25 reasoning, cradle mounting.

Both indexed in that directory's `MEMORY.md`.
