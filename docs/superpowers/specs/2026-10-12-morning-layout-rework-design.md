# Morning layout rework — design

**Date:** 2026-10-12
**Branch:** `feat/time-of-day-layouts`
**Status:** design agreed in brainstorming; two decisions still open (§7)

---

## 1. Why

The Morning view is the "get out the door" screen, but it is laid out like a
dashboard rather than a morning routine:

- **Chores are cramped.** Both kids share a single narrow third column.
- **The calendar dominates.** It gets the largest block on screen for what is
  usually one or two events.
- **Nothing is scannable from across the kitchen.** No kid's name or score is
  large enough to read at a glance.

The ask, in the user's words: *highlight the chores on the top, one kid per
column, current points in the header row with their name, as big as possible* —
then refined to **name on the left, points on the right**, and **keep the block
chore tiles already in use** rather than switching to slim list rows.

## 2. Shape of the change

Morning goes from three side-by-side columns to **two stacked bands**:

```
┌─────────────────────────────┬─────────────────────────────┐
│ ROWAN              248 pts  │ WYSTAN             191 pts  │   ← chore band
│ ┌────┐ ┌────┐ ┌────┐        │ ┌────┐ ┌────┐ ┌────┐        │     (top, full width)
│ │tile│ │tile│ │tile│        │ │tile│ │tile│ │tile│        │
│ └────┘ └────┘ └────┘        │ └────┘ └────┘ └────┘        │
├───────────────┬─────────────┴──────────┬──────────────────┤
│ 📅 Today      │ 🌤 Weather             │ 🔔 Reminders     │   ← support band
└───────────────┴────────────────────────┴──────────────────┘
```

**Top band — chores, one kid per column.** Two equal columns, each with a header
row and that kid's existing chore tiles beneath it.

**Bottom band — everything else.** Today's calendar, weather, reminders. Same
cards as today, just smaller and below the chores.

## 3. The header row

This is the only genuinely new component.

| | |
|---|---|
| Left | Kid's name — large, uppercase, warm yellow (`--kc-accent-name`, currently `#ffd54f`) |
| Right | Current points — large, cyan (`--kc-hero-fg`, currently `#4fc3f7`), with a small uppercase "POINTS" caption beneath |

Built as a `custom:button-card` with `tap_action: none`, matching the existing
kid-banner pattern (`docs/pi-snapshots/kitchen.yaml.live-20260910-130153`, lines
85–101 — structure only; see the color caveat below) rather than inventing a new
idiom.
It replaces the current 32px `☀ Rowan — Morning` banner, which exists only to
carry the kid's name — the new header does that job and more.

**Sizing.** "As big as possible" has a practical ceiling: the name and the
number share a half-width column, and both must stay on one line. Target ~36px
name / ~40px points, tuned at the panel. The names are short (5 and 6
characters), so this fits — but the number grows a digit at 1000, so the layout
must not assume three digits.

**Theme vars, not literals.** Light mode is in progress on this same branch:
`044d008` and `fc95d8c` extracted hardcoded colors into `--kc-*` variables, and
the repo `kitchen.yaml` now carries 80 of them. New colors here go in as
`var(--kc-*, <fallback>)` from the start so this work does not re-introduce the
debt. The Afternoon points card is the reference pattern.

⚠️ **The Sep 10 snapshot predates that extraction** (zero `--kc-` vars) — the
live Pi file read on 2026-10-12 does have them. So the snapshot is a valid guide
to *layout and structure*, but **not to current colors**. Re-read the live file
for anything color-related.

## 4. Chore tiles — explicitly unchanged

The existing block tiles stay exactly as they are:

- `custom:auto-entities` wrapping a `grid` of `custom:button-card`s
- 104px tall, 12px radius, `size: 42px` icons
- Points shown via `default_points` → `"N pts"`
- Name regex-stripped of the `"… Chore Status - "` prefix
- `state:` styling — red border when `overdue`, primary border otherwise
- Tap → `button.press` on `claim_button_eid`, with a confirmation dialog

**`claim_button_eid` is load-bearing.** The `claim_chore` *service* rejects
panel taps in kiosk mode; the claim *button* is the working path. Do not
"simplify" this to a service call.

Only two things about the tiles change:
1. **Grid width** — `columns: 4` was tuned for a third-width column. At
   half-width it should be re-tuned (likely 4 still, verified at the panel).
2. **The name-stripping comment** — it says *"the column header already names
   the kid"*, which stays true, but the header is now the new points header.

## 5. What else moves

| Card | Now | After |
|---|---|---|
| Today's calendar | Col 1, ~12 rows | Bottom band, shorter |
| Weather | Col 2 | Bottom band |
| Reminders | Col 2 | Bottom band |
| Morning Chores heading | Col 3 | Dropped — headers name the kids |
| Kid banners (32px) | Col 3 | Replaced by the new headers |
| Perspective (quote) | Col 3 bottom | **Open — see §7** |
| `screensaver-card` | Col 1 | Unchanged, stays on this view |
| `tod-autonav-card` | Col 1 | Unchanged, stays on this view |

**The two invisible cards must survive.** They render nothing, so they look like
dead weight, but `screensaver-card` feeds the activity bridge that drives
`timer.kitchen_nav_defer`, and `tod-autonav-card` performs the hour-based view
switch. Removing either silently breaks idle/wake or auto-navigation.

## 6. Deployment constraints

- **`kitchen.yaml` is contested.** Multiple sessions edit it live on the Pi.
  Rebuild from the **live file**, never from the repo copy, and take a
  timestamped backup first (the established `kitchen.yaml.bak-<reason>-<stamp>`
  convention).
- **Needs the home network.** The Pi is unreachable from the office/corporate
  `10.x` over both LAN and Tailscale. Verify with
  `nc -z -G 6 192.168.1.234 22` — not DNS, not `ifconfig | grep utun`.
- **A VPN hides the whole LAN.** If every host including the gateway reads as
  down while internet works, that is the VPN, not the Pi.
- **Service worker caching.** A card change can look correct server-side and
  still not reach the panel. Unregister the service worker, not just the cache.
- **Verification needs a human at the panel.** Tile legibility, header sizing,
  and whether the tiles still fit at half width cannot be judged over SSH.

## 7. Open decisions

Both change the YAML and neither should be guessed:

1. **Which points number?**
   - *Current balance* — what they can actually spend; drops when rewards are
     claimed. Recommended: it is the number that motivates.
   - *Lifetime earned* (`point_stat_points_earned_all_time`) — what the
     Afternoon view already shows; only ever goes up, so the two screens agree.

2. **Where does Perspective go?** Drop it from Morning (it is a
   calm-reflection card and still lives on Evening), add it as a fourth card in
   the bottom band, or tuck it under Reminders.

## 8. Out of scope

- Light mode (separate, already scoped on this branch)
- Afternoon and Evening views
- Any change to ChoreOps chore definitions, points, or schedules
- The "no clock / no out-the-door countdown" gap — noted during brainstorming,
  not selected
