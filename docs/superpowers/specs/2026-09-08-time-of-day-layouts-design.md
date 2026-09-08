# Time-of-Day Panel Layouts — Design

**Date:** 2026-09-08
**Branch:** `feat/time-of-day-layouts` (off `feat/choreops-chores`)
**Status:** approved, ready for planning

The kitchen panel shows one layout all day. This makes it show three: a
get-out-the-door **Morning**, the current chore-focused **Afternoon**, and a
"what to expect tomorrow" **Evening**. The panel switches itself at fixed
clock boundaries.

---

## 1. The three layouts

| | **Morning** 5:00–11:00 | **Afternoon** 11:00–18:30 | **Evening** 18:30–5:00 |
|---|---|---|---|
| **Purpose** | Get out the door | Today's chores | What to expect tomorrow |
| **Col 1** | Big calendar — today | This Week agenda | Tomorrow's calendar |
| **Col 2** | Weather + Reminders | Rowan: chores, points, Perspective | Reminders |
| **Col 3** | Morning chores + Perspective *(if space)* | Wystan: chores, points, Weather | Week calendar + Weather |

**Afternoon is today's Home view, promoted.** Home is `kitchen.yaml` lines
**13–1808 (~1796 lines)**; the file is 1861 lines total because Schedule
(1809) and Lists (1846) follow it. The diff on that view is its `title` and
`path` only — all existing tuning survives untouched.

Morning and Evening are composed from cards that already exist and are
already tuned: the calendar card, the weather card, the `auto-entities`
chore tiles, the Daily Quote ("Perspective") card.

**The table is the intended composition, not a frozen layout.** Which cards
appear is settled; their exact column, order and size are a see-it-on-the-wall
decision (§7). Implement the table as written, then expect to move things.
In particular "Perspective *(if space)*" on Morning may be dropped entirely
if the column is full.

---

## 2. `todo.reminders` — the Reminder window

A `local_todo` list, shown with the stock `todo-list` card on Morning and
Evening.

**This is a config-flow entry of an integration already running on the Pi.**
`local_todo` appears in the Pi's `core.config_entries`, and `todo.groceries`
is served by it today (verified: `core.entity_registry`, platform
`local_todo`). No add-on, no HACS, no new integration class.

**Voice add/complete works with no intent code.** HA registers
`HassListAddItem`, `HassListCompleteItem`, `HassListRemoveItem`
(`reference/core-dev/homeassistant/components/todo/intent.py:11-13`,
registered by `async_setup_intents` at `:16-21`).

Registration requires the `conversation` → `intent` chain, which arrives via
`default_config`. **The live Pi has `default_config:`** (line 4 of
`/home/garrettdehart/homeassistant/configuration.yaml`, read directly
2026-09-08), so the chain holds.

> ⚠️ The **repo's** `homeassistant/configuration.yaml` does NOT contain
> `default_config:` — it has drifted from the live Pi. Reasoning about
> loaded components from the repo copy gives the wrong answer. See §8.

---

## 3. `sensor.kitchen_time_of_day`

New package `homeassistant/packages/time_of_day.yaml`.

States: `morning` / `afternoon` / `evening`. Boundaries live in three
`input_datetime` helpers (05:00, 11:00, 18:30) so they retune from the panel
without a redeploy. A `time_pattern` trigger keeps the sensor fresh.

Evening **wraps past midnight**. The template handles the wrap explicitly
rather than assuming the three boundaries are in ascending order.

Evening running to 05:00 is deliberate: a fourth "night" state would be
complexity for an audience of nobody. A night-owl or early-riser sees
tomorrow's view, which is the right answer for both.

---

## 4. Auto-nav and the defer signal

### 4.1 The card

`custom:tod-autonav-card` — a new custom card that renders nothing (zero
height). One instance per time view, configured with its own identity:

```yaml
- type: custom:tod-autonav-card
  view: morning
```

On each `hass` change it compares `sensor.kitchen_time_of_day` to its own
`view`. If they differ **and** the panel is not in a defer window, it
navigates: `history.pushState` followed by a `location-changed` event — the
mechanism HA's own frontend uses (`reference/frontend-dev/`).

### 4.2 Why NOT `timer.kitchen_inactivity`

An earlier draft used the screensaver's inactivity timer as the "someone is
here" signal. **It does not work**, for three independent reasons, all
verifiable in-repo:

1. **It is 30 minutes** (`homeassistant/packages/screensaver.yaml:25`).
   "Hold while counting" means a glance at 10:55 defers Morning→Afternoon
   until 11:25. That is auto-nav effectively disabled, not politeness.
2. **It is not reliably counting.** It restarts only on
   screensaver-enabled→on, on an activity ping, or at HA start. If it
   finishes while `kitchen_screensaver_enabled` is off it wedges in `idle`
   permanently — documented from live observation at `screensaver.yaml:45-51`.
   The signal is bimodal: stuck-idle (never defers) or 30-min-counting
   (always defers).
3. **Its producer is on one view.** The activity ping comes from
   `_startActivityBridge` (`custom_cards/screensaver-card/src/screensaver-card.ts:422-431`),
   which registers `window` listeners on mount and removes them on unmount.
   The card sits at `kitchen.yaml:57` — inside Home only. The signal dies on
   exactly the two new views that need it.

### 4.3 The replacement — a dedicated short timer

```yaml
timer:
  kitchen_nav_defer:
    duration: "00:01:30"    # ~90s: long enough to finish a tap sequence,
                            # short enough that a boundary lands promptly

automation:
  - alias: "Kitchen — hold auto-nav briefly after any touch"
    mode: restart
    trigger:
      - platform: state
        entity_id: input_button.kitchen_activity
    action:
      - service: timer.start
        target:
          entity_id: timer.kitchen_nav_defer
```

`input_button.kitchen_activity` is the existing browser→HA activity ping,
pressed on any interaction. This is a **second consumer** of that ping — the
screensaver's own automations are untouched.

**Card rule:** navigate when the sensor disagrees with the view AND
`timer.kitchen_nav_defer` is not `active`.

Worst-case defer is 90 seconds. The wedged-timer failure mode inverts
harmlessly: a timer that never runs reads as "nobody here," so nav fires
promptly rather than never.

`ACTIVITY_THROTTLE_MS = 5000` (`screensaver-card.ts:238`) caps ping
resolution at 5s — immaterial against a 90s window, noted so it is not
rediscovered as a bug.

### 4.4 The activity bridge must exist on all three views

**Decision: put `custom:screensaver-card` on all three time views** (option
(a), chosen 2026-09-08).

The card renders nothing unless idle, so it is visually free. One card, one
code path, one bridge implementation. It also closes a latent gap: the
screensaver itself only ever worked on Home.

The rejected alternative — giving `tod-autonav-card` its own bridge — means
two implementations of the same listener set.

### 4.5 Failure behavior

If `sensor.kitchen_time_of_day` is `unknown` or `unavailable`, the card does
nothing and the panel stays where it is. A broken sensor can never strand
the panel on a blank or wrong view.

This mirrors the screensaver safety-switch discipline: **no one-way doors.**

---

## 5. Manual override, and the five-view problem

All three time views keep their tabs. A human can navigate anywhere at any
time. Auto-nav re-asserts at the next boundary, or sooner once the defer
window lapses.

**The dashboard already has Schedule and Lists.** With Morning, Afternoon
and Evening that is **five views**, which has two consequences:

- Tab-bar width on the 15.6″ panel must be checked with five tabs present.
- **Auto-nav must never fire while the user is on Schedule or Lists.**
  Otherwise it yanks them off a page they deliberately opened, and manual
  override survives only until the next boundary.

The second falls out of the design — `tod-autonav-card` is only placed on
the three time views, so nothing on Schedule or Lists can navigate. It is
stated explicitly here so it cannot be refactored away by someone "tidying"
the card onto a shared section later.

---

## 6. Testing

`tod-autonav-card` ships with vitest tests, matching the two existing cards:

- boundary transition fires a navigate
- already on the correct view → no navigate
- defer timer `active` → no navigate
- defer timer idle/finished → navigate
- sensor `unavailable` / `unknown` → no navigate
- midnight wrap (evening spanning 18:30→05:00)

The sensor's boundary logic is extracted as pure functions and tested
independently of HA.

---

## 7. Deferred to later specs

- **Work-week calendar** (schoolwork, tests, dinner plans) — its own spec.
  Lands in Morning col 1 and Evening col 3. The event-tagging question
  (dedicated calendars vs. summary prefixes) is deliberately deferred to
  that design, where the full picture is in view.
- Morning's "Perspective if space" — a see-it-on-the-wall decision.
- Reminder-window placement — same.

Note for the calendar spec: a **verified voice write path already exists**
(`homeassistant/packages/calendar.yaml`, `AddCalendarEvent` →
`calendar.create_event` against `calendar.family`, confirmed 200 and read
back). The missing piece is tagging, not writing.

---

## 8. Carry-forwards

**Repo/Pi config drift (independent of this feature).** The repo's
`homeassistant/configuration.yaml` is missing `default_config:`, which the
live Pi has. Any reasoning about which components are loaded that starts
from the repo copy will be wrong. Not fixed here — fixing it is a change to
a contested file outside this feature's scope — but it should be
reconciled deliberately.

**`kitchen.yaml` is contested.** Multiple sessions edit it live on the Pi.
Check backup timestamps before deploying; never blind-copy the repo version
over the live one.

**Card deploys need a service-worker clear.** A card deploy can look perfect
server-side and still not reach the panel. Clear `Service Worker`, not just
`Cache`.
