# COLD OPEN — `feat/time-of-day-layouts`

**Created:** 2026-09-08. Tasks 1–8 of 11 complete and verified locally.
**Nothing has been deployed to the Pi yet.**

> This branch is cut from `feat/choreops-chores` (base `189fbc9`), NOT from main.
> The other branch's cold-open — `docs/session-state/COLD-OPEN-choreops-chores.md` —
> is still valid for everything outside this feature.

---

## 1. Where is HEAD?

```bash
git branch --show-current                 # expect: feat/time-of-day-layouts
git log --oneline -1                      # authoritative tip — NOT frozen here
git rev-list --count origin/main..HEAD    # commits ahead of origin/main
git status --porcelain                    # expect: empty
```

⚠️ **Multiple sessions share this checkout.** Re-run `git branch --show-current`
before every commit; the branch can move under you.

**Stable PREFIX** — immutable, will not move:

```
92f42a3 feat(panel): Evening view — tomorrow, reminders, week, weather
93eccdf feat(panel): Morning view — today's calendar, weather, reminders, morning chores
1c58021 feat(panel): promote Home to the Afternoon view + auto-nav card
2f15705 feat(tod-autonav): lit element with pushState navigation + bundle guard
a542d22 feat(tod-autonav): navigation decision function with fail-safe defaults
cd2e236 fix(tooling): validate:yaml invoked a yamllint binary that does not exist
268b558 chore(tod-autonav): scaffold card package with bundled vite build
d1b7012 feat(panel): time-of-day sensor, boundary helpers, and nav-defer timer
7efd99a plan: time-of-day panel layouts implementation
acf4c73 design: time-of-day panel layouts (morning/afternoon/evening)
```

The tip is deliberately **not** stamped: a close-out commit cannot name its own
SHA, and stamping it is itself a commit, so the loop never converges. Ask
`git log`. Same for the ahead-count — quote the command, not the answer.

---

## 2. Empirical state (verified 2026-09-08)

```bash
cd custom_cards/tod-autonav-card && npm test        # 14 passed (12 decision + 2 guard)
cd custom_cards/tod-autonav-card && npm run typecheck   # exit 0, no output
cd custom_cards/screensaver-card && npm test        # 109 passed (untouched by this branch)
npm run validate:yaml                               # exit 1 — see below
```

**`validate:yaml` exits 1 and that is EXPECTED.** The only two errors are
`missing starting space in comment` in `kitchen.yaml` (currently lines 495 and
1392). They are **false positives**: yamllint reads the CSS hex colours
`#4fc3f755` / `#ba68c855` inside quoted style values as comments. The YAML is
correct. **Do not "fix" those lines.** Line numbers shift as the file grows —
identify them by the hex-colour pattern, not by number.

The built bundle was additionally verified by loading `dist/tod-autonav-card.js`
under a DOM shim and exercising it: `navigateTo` does `pushState` + fires
`location-changed`; `updated()` navigates on a period mismatch; it stays put
while deferring, and when already on the correct view; `setConfig` rejects an
invalid view name. That covers the wiring the unit tests do not.

---

## 3. What shipped, and why

Three dashboard views the panel switches between on fixed clock boundaries:
**Morning** 05:00–11:00, **Afternoon** 11:00–18:30, **Evening** 18:30–05:00.

- `homeassistant/packages/time_of_day.yaml` — `sensor.kitchen_time_of_day`,
  three `input_datetime` boundary helpers, `timer.kitchen_nav_defer`, and the
  automation that restarts that timer on any panel touch.
- `custom_cards/tod-autonav-card/` — an invisible card that navigates the
  browser. HA core has **no** service that switches a browser's Lovelace view,
  so this has to be browser-side.
- `homeassistant/dashboards/kitchen.yaml` — Home renamed to Afternoon (header
  only, all ~1796 lines of tuning untouched); Morning and Evening inserted.

**Three verified facts this design rests on. Do not "simplify" past them:**

1. The defer signal is a **new 90s timer**, NOT `timer.kitchen_inactivity`.
   That one is 30 minutes (`screensaver.yaml:25`), wedges in `idle` when the
   screensaver safety switch is off (`screensaver.yaml:45-51`), and its producer
   card is only on Home (so it dies on the new views). All three checked in-repo.
2. The trigger entity is an **`input_button`**, not an `input_boolean`.
   `ButtonEntity` writes a fresh timestamp on every press, so `platform: state`
   fires each time; an `input_boolean` silently no-ops on the second press.
3. `custom:screensaver-card` is on **all three** time views deliberately. Its
   activity bridge is what pings HA on touch; without it the defer signal dies
   on whichever view lacks it. It renders nothing unless idle, so it is free.

**Structural invariant, verified:** the autonav card is on the three time views
ONLY — never on Schedule or Lists — and each declares the view it sits on. A
mismatch there would cause an infinite navigation loop.

---

## 4. The next move

**Task 9 — create `todo.reminders`. Requires the UI; cannot be scripted safely.**

`local_todo` is a config-flow integration: it stores an `.ics` per list plus a
config-entry record. Hand-editing `.storage` risks corrupting the registry, so
do this in the browser:

> Settings → Devices & Services → Add Integration → **Local To-do**, name `Reminders`

Verify:
```bash
ssh kitchencom 'python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
print([e[\"entity_id\"] for e in d[\"data\"][\"entities\"] if e[\"entity_id\"].startswith(\"todo.\")])
"'
```
Expect `todo.reminders` in the list. `todo.groceries` already runs on
`local_todo`, so this is a second entry of a proven integration.

Then test voice: Assist → `add test item to reminders`. The live Pi has
`default_config:`, so `conversation` → `intent` loads and `HassListAddItem` is
registered. Remove the test item afterward.

**Task 10 — deploy.** Full steps in the plan, §Task 10. The load-bearing ones:

- Back up the live `kitchen.yaml` first and check its timestamp — other sessions
  edit it live on the Pi.
- Register `/local/tod-autonav-card.js` as a Lovelace **JavaScript Module** resource.
- `check_config`, then restart, then **wait 60–90s** — new YAML entities appear
  well after HA answers 200. Checking early looks exactly like a failed deploy.
- **Clear the panel's Service Worker**, not just Cache, or the new card will not
  reach the kiosk however correct the server side is.
- Verify the tab bar fits **five** views at panel resolution (pass criterion and
  two fallbacks are in the plan).

**Absolute paths:**
- Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-09-08-time-of-day-layouts.md`
- Spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-09-08-time-of-day-layouts-design.md`

---

## 5. Carry-forwards

**The Evening "Tomorrow" column shows TODAY.** The stock calendar card has no
date-offset option — its config is exactly `{entities, initial_view, title,
theme}`, verified in
`reference/frontend-dev/src/panels/lovelace/cards/types.ts:53-58`. Showing
tomorrow needs a custom card. Deliberately out of scope; folded into the
work-week calendar spec. Marked `# TOMORROW-OFFSET` in `kitchen.yaml`.
**This is a known limitation, not a bug to fix in passing.**

**The kiosk cold-boots into Morning.** `start-kiosk-wayland.sh` loads
`/kitchen-snapshot` with no view path, so it lands on the FIRST view, which is
now Morning regardless of the hour. The autonav card corrects it within ~60s.
Acceptable; note it before treating it as a bug.

**Repo/Pi `configuration.yaml` drift.** The repo copy lacks `default_config:`
that the live Pi has. Any "is component X loaded?" question answered from the
repo copy is wrong. Not yet reconciled — see the memory entry below.

**The work-week calendar spec is not written.** Schoolwork/tests/dinner on a
work-week grid, with the event-tagging decision (dedicated calendars vs. summary
prefixes) deferred to that design. A verified voice write path already exists
(`homeassistant/packages/calendar.yaml`, `AddCalendarEvent` →
`calendar.create_event`, confirmed 200 and read back) — the missing piece is
tagging, not writing.

---

## 6. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- `repo-ha-config-drift.md` — never answer "is component X loaded?" from the repo copy
- `kitchen-yaml-contested-file.md` — multiple sessions edit it live on the Pi
- `cards-must-be-bundled.md` — bare `lit` imports make a card unloadable
- `kiosk-service-worker-serves-stale-js.md` — clear Service Worker, not just Cache
- `ha-yaml-entities-appear-late.md` — 60–90s after restart, not 20s
- `calendar-card-only-three-views.md` — only dayGridMonth/dayGridDay/listWeek
- `markdown-card-strips-inline-css.md` — no HACS/card-mod on the Pi
- `concurrent-sessions-branch-hazard.md` — verify the branch before every commit
