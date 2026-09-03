# COLD OPEN — `feat/choreops-chores`

**Refreshed:** 2026-09-03 morning.
**Read this first.** Everything below is verified, with the command that verifies it.

> ⚠️ `docs/session-state/README.md` is the **main**-branch cold-open and is **STALE**
> (last refreshed 2026-08-14). It still frames an **Aug 18 deadline that has passed** and
> calls `feat/choreops-chores` "a concurrent session's branch — leave it alone," which is
> now **this** branch. Ignore it while working here; it needs a rewrite from main's
> perspective at merge time.

---

## 1. Where is HEAD?

```bash
git branch --show-current                 # expect: feat/choreops-chores
git log --oneline -1                      # authoritative tip — NOT frozen in this doc
git rev-list --count main..HEAD           # ahead of main
git status --porcelain                    # expect: empty
```

**Stable prefix of the 2026-09-02 arc** (immutable; anything above `6c8d7e2` landed later):

```
6c8d7e2 feat(panel): merge each kid's name into the section header bar
a6bb052 feat(panel): tap-to-claim chore tiles, split into Morning/Evening rows
f7e9a88 docs: session state — rollover resolved, Zigbee radio live, Tailscale blocked at work
df611f9 docs: resolve the nightly re-award bug — mechanism found, fix verified
```

The tip is **deliberately not stamped here** — a close-out commit cannot name its own SHA, and
stamping it is itself a commit, so the loop never converges. Ask `git log`. Same for the
ahead-count: quote the command, not the answer.

---

## 2. Empirical state

| Check | Command | Expected |
|---|---|---|
| Pi reachable | `ssh kitchencom 'uptime'` | responds (LAN) |
| HA healthy | `ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8123/'` | `200` |
| ChoreOps errors | `ssh kitchencom 'sudo grep -icE "choreops.*(error\|traceback)" /home/garrettdehart/homeassistant/home-assistant.log'` | `0`, **unless** the approval error in §5 |
| Dashboard in sync | `diff <(ssh kitchencom 'sudo cat /home/garrettdehart/homeassistant/dashboards/kitchen.yaml') homeassistant/dashboards/kitchen.yaml` | identical (was, at close) |
| YAML parses | `python3 -c "import yaml,io; yaml.safe_load(io.open('homeassistant/dashboards/kitchen.yaml',encoding='utf-8'))"` | no output |

**No test suite / typecheck / build** on this branch — it is YAML + docs + Pi deployment. The
verification loop is: edit → parse YAML → deploy → restart HA → grep log → look at the panel.

**Known-benign drift:** `habluetooth.scanner ... Failed to force stop scanner`
(`AttributeError: 'NoneType' object has no attribute 'send'`) repeats every few minutes.
Bluetooth stack, unrelated to this project. Do not chase it.

---

## 3. What just shipped and why

Full detail: **`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-02-panel-tap-to-claim-and-rows.md`**

1. **The nightly phantom re-award is CLOSED.** `None` was failing the midnight-catchup guard
   open before the `schema45_seed_last_midnight_processed` migration existed, so every startup
   replayed the day's daily chores with their original `reference_id`s. Fixed upstream;
   verified by two deliberate mid-day restarts, three more during panel work, and one
   unattended overnight (stamp advanced to `2026-09-03T04:00:00.323600Z`, Rowan unchanged at
   2.0 / 1 entry). **A midday power outage does NOT double that day's points.**
2. **Tap-to-claim** — tiles called `more-info` (that was the popup Garrett photographed);
   they now call `choreops.claim_chore`, which routes to approval. **Confirmed working**:
   `Fishy — Evening` sits in `state=claimed`.
3. **Morning/Evening rows** — was `sort: method: state`, which left everything tied at
   `pending` and therefore unordered. Now explicit per-row entity lists with
   `sort: method: none`.
4. **Header merge** — kid's name moved into the tinted bar, "Chores Due" dropped.
   Rowan `#4fc3f7`, Wystan `#ba68c8`.

---

## 4. What's the next move?

**Nothing is blocked.** Three candidates:

### (a) The kiosk-approval decision — needs Garrett, not code — HIGHEST VALUE
See §5. There is a real claim sitting unapproved right now, and an approval was refused on
the panel at 08:01 on 2026-09-03. Ask Garrett which of the three options he wants.

### (b) ZHA setup + bulb pairing — requires Garrett PHYSICALLY AT THE PANEL
**Switch branches first:** `git checkout feat/adaptive-lighting`. The runbook is
`homeassistant/packages/lighting.yaml` on **that** branch — it does **not** exist here.

- Settings → Devices & Services → Add Integration → **Zigbee Home Automation**
- Serial port: the **by-id** path (§6), never `/dev/ttyUSB0`
- Radio type: **`znp`** (TI Z-Stack) — correct for CC2652P
- **Form a new network**
- ⚠️ ZHA usually does **not** prompt for a channel and silently forms on **15**. That is
  **fine** here — **do NOT re-form a network to chase 25.** If it does offer a choice, pick
  **25**. Never 26 (regulation power-limited; some bulbs refuse to join).
- Pair each bulb **in its final fixture** (mesh topology depends on it), power-cycling an
  unprovisioned ZL1 to enter pairing mode.

### (c) Calendar CSS decision — pure repo-side, no Pi needed
Carried since 2026-09-01. The built-in calendar card **cannot** produce "SEPT 2" strings —
they come from FullCalendar inside a shadow root. Real paths are a custom card or an HA theme,
both written up with source citations in
**`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-01-calendar-live-and-panel-layout.md`**

---

## 5. 🔴 OPEN DECISION: the kiosk cannot APPROVE chores

Observed in the log **2026-09-03 08:01** — a real user action:

```
ERROR ... Authorization failed to Approve Chore 'Morning Brush' for Assignee 'Rowan':
          You are not authorized to approve_chores
```

**Why the two paths differ** (`helpers/auth_helpers.py`):

- **Claim** → `_has_participation_authority_for_target()` → `if user.is_admin: return True`.
  **Unconditional admin grant.** This is why tap-to-claim works.
- **Approve** → `_has_approval_authority_for_target()` → gated behind
  **`is_admin_approval_bypass_enabled(hass)`**, a ChoreOps setting, currently **off**.

**Identity facts — verified, and they correct an earlier assumption:**
- The kiosk browser runs as HA user **`KitchenCom`**, which **IS** admin via
  `group_ids: ['system-admin']`. The raw `is_admin` field in `.storage/auth` reads **`None`**
  — **group membership is authoritative, the field is not.** Do not re-derive from the field
  and conclude the kiosk is non-admin.
- ChoreOps `Garrett` and `Rebecca` **share one HA user** (`KitchenCom`, `487379b1...`).
  `Rowan` and `Wystan` are **UNLINKED** (no `ha_user_id`).
- A third HA user `Panel` exists in `system-users` (non-admin), largely unused.

**This is Garrett's design call, not a bug to silently fix.** Enabling the bypass lets anyone
at the kiosk approve — including the kids, since the panel is one shared logged-in session
(see [[kiosk-admin-approval-hole]]). Options: (1) enable the bypass; (2) leave it off and
approve from a phone; (3) link Rebecca to her own HA user so approvals are attributable.

---

## 6. Hardware facts worth not re-deriving

**Zigbee — hardware live, ZHA NOT configured.**
- ITead **ZBDongle-P** (CC2652P), `SYS_VERSION` → `transport=2 product=1 fw=2.7.1`.
- **-P vs -E discriminator:** the **CP210x** bridge (`10c4:ea60` → `ttyUSB`) means **-P**.
  The -E is EFR32MG21 with native USB → `ttyACM`.
- **Stable path — never `/dev/ttyUSB0`:**
  `/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_8aae1a09dd9def11b750cda661ce3355-if00-port0`
- Mounted in the USB extension cradle from a surplus Wi-Fi dongle — permanent home, satisfies
  `lighting.yaml`'s extension-cable requirement. Link: 12 Mbps, 100 mA, **direct to Pi root
  hub (bus 001)**, NOT behind the RTS5411 hub the touchscreen needs.
- Home 2.4 GHz Wi-Fi is on **ch 10**; the Pi's own `wlan0` is **5 GHz ch 44** (different band,
  cannot interfere with Zigbee).

**Surplus Wi-Fi dongle** (RTL8822BU): unplugged, spare. **No macOS driver exists.** Not a
Zigbee substitute.

**Tailscale from Garrett's office: BLOCKED** by Fortinet (drops the UDP Tailscale needs). Ran
~3 min on cached state, then offline. `tailscale up`/`down` are **no-ops on the Mac App Store
build**. Unaffected at home.

**⚠️ Cisco VPN gotcha — cost ~20 min on 2026-09-02.** With the work VPN connected *at home*,
the Mac's default route goes to `utun11` and the Pi is unreachable on the LAN;
`ssh kitchencom` returns *"Connection refused"* or a timeout, which reads exactly like a dead
Pi. **Check `route -n get default | grep interface` before diagnosing anything else** — it
should say `en0`.

---

## 7. ⚠️ Entity slugs are stale — read before touching tile lists

Entity IDs were minted from ORIGINAL chore names and **did not follow renames**:

| Entity ID | Actual chore today |
|---|---|
| `..._chore_status_brush_teeth` | **Morning Brush** |
| `..._chore_status_feed_cats` (bare) | **ORPHAN** — chore no longer exists |
| `..._chore_status_fishy` (bare) | **ORPHAN** — chore no longer exists |
| `..._feed_cats_morning` / `_evening`, `..._fishy_morning` / `_evening` | real |

**Never infer chore identity from the slug.** Map via `core.entity_registry`'s `original_name`
first (command in the session-state doc, §4). The orphans are excluded from the current lists;
they were invisible before only because the `unavailable`/`unknown` excludes caught them.

---

## 8. Carry-forwards

- **Orphaned entities** (§7) — 2 sensors + 6 buttons per kid. Harmless; worth cleaning.
- **Chore Champion `6/250` un-zeroed** for Rowan, partly from the Aug-19 phantom. Early Riser
  was zeroed 2026-09-01.
- **Points-structure trap:** zeroing points naively breaks the points sensor — every level must
  be a dict with `all_time` **nested**. Presents ONLY as the entity showing "Unavailable";
  read `home-assistant.log` before theorising.
- **Rollover residual risk (low):** the guard keys on *local* midnight. If the stamp is cleared
  or the clock jumps backwards across midnight, the `None` path re-opens. **Symptom:** ledger
  entries at a reset boundary with no preceding `last_claimed`.
- **ChoreOps logs nothing about resets at default verbosity** — to observe the guard, add
  `logger:` with `custom_components.choreops: debug` (back up `configuration.yaml` first —
  contested file), restart, read, restore.
- **`Cook Dinner` sits `overdue`**, Rowan-only; likely wants a due-window review.
- **`kitchen.yaml` is contested** — other sessions edit it live on the Pi. Always `diff` the Pi
  copy against the repo before deploying; back up on the Pi first.
- **Shared checkout** — verify `git branch --show-current` before every commit.

---

## 9. Memory layer

`/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`
(outside the repo; `MEMORY.md` there is the index)

Most relevant to this branch:
- `midnight-rollover-guard.md`
- `zigbee-channel-and-radio.md`
- `kiosk-admin-approval-hole.md`
- `kitchen-yaml-contested-file.md`
- `choreops-point-periods-structure.md`
- `kiosk-service-worker-serves-stale-js.md` — note: **no caching problem was observed**
  2026-09-02; deploys reached the panel directly.
- `choreops-source-vendored-locally.md` — read schemas from `reference/ChoreOps-main` with the
  Pi off. **Nested-repo cwd trap: use absolute paths for grep**, or the shell lands inside the
  vendored repo.
