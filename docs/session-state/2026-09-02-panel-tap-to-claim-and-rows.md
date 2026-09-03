# 2026-09-02 — Rollover resolved · Zigbee live · Panel: tap-to-claim + Morning/Evening rows

**Branch:** `feat/choreops-chores` · **Tree:** clean
**Tip:** `git log --oneline -1` (deliberately NOT frozen here — see the cold-open rule's
self-referential gotcha; the prefix below is immutable, the tip is not)
**Ahead of main:** `git rev-list --count main..HEAD`

Session ran 2026-09-02 ~08:20 EDT → 2026-09-03 ~08:30 EDT (spanning a midnight, which
turned out to be useful — see §2).

---

## 1. Commit arc this session

```
6c8d7e2 feat(panel): merge each kid's name into the section header bar
a6bb052 feat(panel): tap-to-claim chore tiles, split into Morning/Evening rows
f7e9a88 docs: session state — rollover resolved, Zigbee radio live, Tailscale blocked at work
df611f9 docs: resolve the nightly re-award bug — mechanism found, fix verified
```

(Prefix is stable. Anything after `6c8d7e2` landed later — ask git, don't trust a frozen tip.)

---

## 2. The nightly re-award — CLOSED, and now proven twice unattended

**Mechanism.** `SystemManager._run_startup_midnight_catchup()` guards on
`meta.last_midnight_processed`:

```python
if last_processed_utc is not None and last_processed_utc >= today_midnight_utc:
    return   # already processed today
```

Before the `schema45_seed_last_midnight_processed` migration, that field did not exist →
getter returned `None` → **`None` fails the guard open** → every startup emitted a
MIDNIGHT_ROLLOVER replaying the day's daily chores with their **original `reference_id`s**.
That is the Aug-19 signature exactly (14.0 → 28.0 across the Aug 18 restart).

**Fixed upstream** by that seeding migration — marker-guarded, runs once ever, marker present
in `meta.migrations_applied`, stamp populated.

**Verified three ways:**
1. Two deliberate mid-day restarts 2026-09-02 09:02/09:03 with debug logging →
   `SystemManager: Midnight catch-up not needed (last_processed=...)`, points unchanged.
2. Three further restarts during panel work (15:04, 15:41, and one more) → points unchanged.
3. **Unattended overnight 2026-09-02→03**: stamp advanced to `2026-09-03T04:00:00.323600Z`,
   Rowan still **2.0 / 1 ledger entry**. No phantom entries.

**Answer to the practical question: a midday power outage does NOT double that day's points.**
The guard is date-granular, not restart-count-granular.

**Residual risk (low):** the guard keys on *local* midnight. If the stamp is cleared, or the
clock/timezone jumps backwards across a midnight boundary, the `None`/stale path re-opens.
**Symptom:** ledger entries at a reset boundary with no preceding `last_claimed`.

---

## 3. Panel work — shipped and verified on the wall

### 3a. Tap-to-claim (`a6bb052`) — CONFIRMED WORKING

The popup Garrett photographed was **explicitly configured**, not a fallback:
`tap_action: action: more-info` on the tile blocks. Replaced with:

```yaml
tap_action:
  action: call-service
  service: choreops.claim_chore
  service_data:
    user_name: Rowan
    chore_name: >
      [[[ return entity.attributes.friendly_name
            .replace(/^.*Chore Status\s*[-–]\s*/, ''); ]]]
```

`choreops.claim_chore` takes `user_name` + `chore_name` (plain strings) and per its own
description *"marks it as 'claimed' for approver review"* — i.e. it goes to approval, which
is what Garrett wanted. A confirmation dialog guards stray touches on a wall panel.

**Completed/approved tiles deliberately keep `more-info`** — tapping a finished chore must
not re-claim it.

**Verified 2026-09-03:** `Fishy — Evening` is sitting in `state=claimed` in
`choreops_data_*`. Garrett confirmed the tap works and saw no caching. The open question
from during the session — whether button-card evaluates JS templates inside `service_data`
— **is answered: it does.** (The minified bundle resisted static reading; the empirical test
settled it.)

### 3b. Morning/Evening rows (`a6bb052`)

Tiles were previously `sort: method: state` — which sorts by state string, so with everything
`pending` they were all tied and the order was arbitrary. Now: explicit per-row entity lists
with `sort: method: none` so authored order holds.

| Row | Rowan | Wystan |
|---|---|---|
| ☀ Morning | Morning Brush, Feed Cats — Morning, Plants | Morning Brush, Fishy — Morning, Plants |
| 🌙 Evening | Night Brush, Fishy — Evening, Cook Dinner, Set the Table, Wash Dishes, Trash, Recycling, Laundry, Clean Room | Night Brush, Feed Cats — Evening, Set the Table, Wash Dishes, Trash, Recycling, Laundry, Clean Room |

Only 4 of 14 chores declare a time of day; every chore has the same `0d 1h 0m` due window and
**no chore uses `chore_labels`**, so ChoreOps has no morning/evening concept — the grouping
is purely dashboard-side. Garrett chose a two-row layout with untimed chores in Evening
(over three-row Morning/Evening/Anytime, or four-row splitting the weeklies).

### 3c. Header merge (`6c8d7e2`)

Kid's name moved **into** the tinted bar; the redundant "Chores Due" label removed. Keeps the
existing accents — **Rowan `#4fc3f7`, Wystan `#ba68c8`**. The old `<h1>` glow was inline HTML
on a markdown card; button-card cannot host raw HTML, so it is reproduced as a `text-shadow`
style.

---

## 4. ⚠️ ENTITY SLUGS ARE STALE — read before touching tile lists

Entity IDs were minted from the ORIGINAL chore names and **did not follow renames**:

| Entity ID | Actual chore today |
|---|---|
| `..._chore_status_brush_teeth` | **Morning Brush** (renamed at the brush split) |
| `..._chore_status_feed_cats` (bare) | **ORPHAN** — pre-split chore, no longer exists |
| `..._chore_status_fishy` (bare) | **ORPHAN** — pre-split chore, no longer exists |
| `..._chore_status_feed_cats_morning` / `_evening` | real |
| `..._chore_status_fishy_morning` / `_evening` | real |

**You cannot infer chore identity from the slug.** Map it via `core.entity_registry`
`original_name` before building any list:

```bash
ssh kitchencom 'sudo python3 -c "
import json
er=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
for e in sorted(er[\"data\"][\"entities\"], key=lambda x: x[\"entity_id\"]):
    eid=e.get(\"entity_id\") or \"\"
    if \"choreops_chore_status\" in eid: print(eid, \"|\", e.get(\"original_name\"))
"'
```

The 4 orphans (2 sensors + their claim/approve/disapprove buttons per kid) are excluded from
the new lists. They were previously invisible only because the `unavailable`/`unknown`
`exclude` filters caught them. **Carry-forward:** worth removing from the entity registry,
harmless meanwhile.

---

## 5. 🔴 OPEN: the kiosk cannot APPROVE chores

**Found in the log 2026-09-03 08:01** — a real user action, not a side effect of this work:

```
ERROR ... Authorization failed to Approve Chore 'Morning Brush' for Assignee 'Rowan':
          You are not authorized to approve_chores
```

**Why.** The two auth paths differ:

- `AUTH_ACTION_PARTICIPATION` (claim) → `_has_participation_authority_for_target()` →
  `if user.is_admin: return True`. **Unconditional admin grant** — so claiming works.
- `AUTH_ACTION_APPROVAL` (approve) → `_has_approval_authority_for_target()` → gated behind
  **`is_admin_approval_bypass_enabled(hass)`**, a ChoreOps *setting*, currently **off**.

**Identity facts (verified, and they correct an earlier memory note):**
- Kiosk browser runs as HA user **`KitchenCom`**, which IS admin — via
  `group_ids: ['system-admin']`. The raw `is_admin` field in `.storage/auth` reads `None`;
  **group membership is authoritative, the field is not.** Don't re-derive this from the field.
- ChoreOps `Garrett` and `Rebecca` **both link to the same HA user** `KitchenCom`
  (`487379b1...`). `Rowan` and `Wystan` are **UNLINKED** (no `ha_user_id`).
- A third HA user `Panel` exists in `system-users` (non-admin), largely unused.

**This is a design decision for Garrett, not a bug to silently fix.** Enabling the admin
approval bypass would let anyone at the kiosk approve chores — including the kids, since the
panel is a shared logged-in session. That is the same approval hole already recorded in
[[kiosk-admin-approval-hole]]. Options, unexplored:
1. Enable the bypass (convenient; kids can self-approve).
2. Leave it off and approve from a phone/personal login.
3. Link `Rebecca` to her own HA user so approvals are attributable.

---

## 6. Hardware state

**Zigbee — hardware live, ZHA still NOT configured.**
- ITead **ZBDongle-P** (CC2652P) on `/dev/ttyUSB0`; **-P confirmed by its CP210x bridge**
  (`10c4:ea60` → `ttyUSB`; the -E is EFR32MG21 → `ttyACM`). `SYS_VERSION` probe returned
  `transport=2 product=1 fw=2.7.1`.
- Mounted in the USB extension cradle that came with a surplus Wi-Fi dongle — protocol-agnostic,
  and the permanent home for the radio. Satisfies `lighting.yaml`'s extension-cable requirement.
- Link: 12 Mbps full-speed, 100 mA, **direct to Pi root hub (bus 001)**, NOT behind the
  RTS5411 hub the touchscreen needs. Zero cp210x disconnects.
- **Stable path — never use `/dev/ttyUSB0`:**
  `/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_8aae1a09dd9def11b750cda661ce3355-if00-port0`
- **No radio integration is configured** (zha/mqtt/zwave_js/matter/deconz all absent from
  `core.config_entries`).

**Surplus Wi-Fi dongle** (`0bda:b812`, Realtek RTL8822BU, AC1200): unplugged, keep as a spare.
**No macOS driver exists** — useless on the Mac; on a Pi it is a sideways move from the
built-in `wlan0`, with an out-of-tree `rtw_8822bu` driver that breaks on kernel updates. NOT a
Zigbee substitute.

**Tailscale from Garrett's office: BLOCKED.** Fortinet drops the UDP Tailscale needs. It ran
~3 min on cached state, then `self online: False`, 100% loss. General internet fine; Tailscale
HTTPS endpoints reachable. `tailscale up`/`down` are **no-ops on the Mac App Store build**.
Untried: menu-bar toggle, phone tether, asking IT for outbound **UDP 41641**. Unaffected at home.

**Cisco VPN gotcha (cost ~20 min this session):** with the work VPN connected at home, the
Mac's default route goes to `utun11` and the Pi is unreachable on the LAN — `ssh kitchencom`
gives *"Connection refused"* or a timeout, which reads like a dead Pi. Check
`route -n get default | grep interface` before diagnosing anything else.

---

## 7. Next move

**First action:** none of this is blocked. Pick one:

1. **The kiosk-approval decision** (§5) — needs Garrett's call, not code. Highest value:
   there is a real claim (`Fishy — Evening`) sitting unapproved right now, and Morning Brush
   was already refused once this morning.
2. **ZHA setup + bulb pairing** — requires Garrett **physically at the panel** with bulbs in
   their final fixtures. **Switch to `feat/adaptive-lighting` first**; the runbook is
   `homeassistant/packages/lighting.yaml` on THAT branch, not this one.
   Flow: Settings → Devices & Services → Add Integration → Zigbee Home Automation → the by-id
   port → radio type **`znp`** → Form a new network.
   ⚠️ ZHA usually does **not** prompt for a channel and silently forms on **15**. That is fine
   here (2425 MHz, clear of Wi-Fi ch 10) — **do NOT re-form a network to chase 25.**
   Channel decision: **25** preferred if offered; not 26 (regulation-limited, bulbs refuse).
   Home 2.4 GHz Wi-Fi is on **ch 10**; the Pi's own `wlan0` is 5 GHz ch 44 (different band,
   cannot interfere).
3. **Calendar CSS decision** — pure repo-side, carried since 2026-09-01. The built-in calendar
   card cannot produce "SEPT 2" strings; they come from FullCalendar inside a shadow root.
   Paths are a custom card or an HA theme, both written up with citations in
   `docs/session-state/2026-09-01-calendar-live-and-panel-layout.md`.

---

## 8. Carry-forwards

- **Orphaned entities** from the pet split (§4) — 2 sensors + 6 buttons per kid. Harmless,
  worth cleaning.
- **Chore Champion `6/250` still un-zeroed** for Rowan — partly from the Aug-19 phantom.
  (Early Riser was zeroed 2026-09-01; it read 1/5 on the panel 2026-09-02, i.e. real activity
  since.)
- **Points-structure trap:** zeroing points naively breaks the points sensor. Every level must
  be a dict with `all_time` **nested**. Failure presents ONLY as the entity showing
  "Unavailable" — read `home-assistant.log` before theorising.
- **ChoreOps logs nothing about resets at default verbosity.** To observe the midnight guard,
  temporarily add `logger:` with `custom_components.choreops: debug` to `configuration.yaml`
  (back it up — contested file), restart, read, restore.
- **Benign log noise:** `habluetooth.scanner ... Failed to force stop scanner` recurs every few
  minutes (`AttributeError: 'NoneType' object has no attribute 'send'`). Unrelated to ChoreOps
  — Bluetooth stack, not this project.
- **`Cook Dinner` sits `overdue`** and is Rowan-only; likely wants a due-window review.
- **Shared checkout:** multiple sessions use this working copy. Verify
  `git branch --show-current` before every commit.

---

## 9. Memory entries (outside the repo)

`/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`

- **`midnight-rollover-guard.md`** — the `None`-fails-open mechanism, restart-safety proof,
  and the `chore_data` path trap.
- **`zigbee-channel-and-radio.md`** — ZBDongle-P confirmation, CP210x-vs-ttyACM discriminator,
  channel-25 reasoning, cradle mounting.
- **`kiosk-admin-approval-hole.md`** — pre-existing; now sharpened by §5 (claim is granted by
  unconditional admin bypass, approve is gated behind a separate setting).

All indexed in that directory's `MEMORY.md`.
