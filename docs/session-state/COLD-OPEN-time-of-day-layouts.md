# COLD OPEN — `feat/time-of-day-layouts`

**Refreshed:** 2026-09-08 late evening, after the deploy.
**Feature is DEPLOYED and running on the Pi.** One visual check remains.

> Cut from `feat/choreops-chores` (base `189fbc9`), NOT from main.
> `docs/session-state/COLD-OPEN-choreops-chores.md` still covers everything
> outside this feature.

---

## 0. Read this first — two things that will bite you

**① The branch is NOT PUSHED.** All 14 commits exist only on this Mac. Among them
is `07527cd`, the ONLY copy in git of 1932 lines of live Pi dashboard work
(the claim-button fix, the Grocy calendar) that exists on no other branch.
**Push early:**

```bash
git push -u origin feat/time-of-day-layouts
```

**② A REBOOT IS PENDING and it is safe.** The Pi was going to be rebooted before
the panel could be checked. Nothing in this feature needs a clean shutdown:
the package is plain YAML, the card is a static file, and the kiosk supervisor
(`deploy/kiosk/start-kiosk-wayland.sh`) waits for HA to answer 200 and respawns
chromium on its own. After the reboot **expect the panel to land on Morning**
regardless of the hour — the kiosk loads `/kitchen-snapshot` with no view path,
so it takes the FIRST view, and the autonav card then corrects it within ~1s.
That is designed behaviour, not a bug.

---

## 1. Where is HEAD?

```bash
git branch --show-current                 # expect: feat/time-of-day-layouts
git log --oneline -1                      # authoritative tip — NOT frozen here
git rev-list --count origin/main..HEAD    # commits ahead of origin/main
git status --porcelain                    # expect: empty
git ls-remote origin refs/heads/feat/time-of-day-layouts   # EMPTY until pushed
```

⚠️ **Multiple sessions share this checkout.** Re-run `git branch --show-current`
before every commit.

**Stable PREFIX** — immutable, will not move:

```
229f9ee fix(panel): time-of-day sensor broke if boundaries were only partly set
a4188bf fix(panel): rebuild kitchen.yaml from the LIVE Pi file, not the repo copy
07527cd docs: snapshot the LIVE Pi kitchen.yaml before the time-of-day deploy
6910954 docs: cold-open for the time-of-day layouts branch
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

The tip is deliberately **not** stamped — a close-out commit cannot name its own
SHA, and stamping it is itself a commit, so the loop never converges. Ask
`git log`. Same for the ahead-count: quote the command, not the answer.

---

## 2. Empirical state

**Local (verified 2026-09-08, still true — no code changed after):**

```bash
cd custom_cards/tod-autonav-card && npm test        # 14 passed (12 decision + 2 guard)
cd custom_cards/tod-autonav-card && npm run typecheck   # exit 0
cd custom_cards/screensaver-card && npm test        # 109 passed (untouched)
npm run validate:yaml                               # exit 1 — see below
```

**`validate:yaml` exits 1 and that is EXPECTED.** The only two errors are
`missing starting space in comment` in `kitchen.yaml` (currently 488 and 1384).
**False positives** — yamllint reads the CSS hex colours `#4fc3f755` /
`#ba68c855` inside quoted style values as comments. The YAML is correct. **Do not
"fix" those lines.** Line numbers shift; identify them by the hex pattern.

**Pi (verified 21:46 local, 2026-09-08 — NOT re-checked since):**

| | |
|---|---|
| `sensor.kitchen_time_of_day` | `evening` (correct for 21:46) |
| `timer.kitchen_nav_defer` | `idle`, activity pings landing |
| `todo.reminders` | live on `local_todo`, referenced by Morning + Evening |
| `/local/tod-autonav-card.js` | serves 200 |
| Lovelace resource | `/local/tod-autonav-card.js?v=1`, type `module` |
| Dashboard | 5 views, no HA errors |
| Kiosk | respawned, 9 chromium processes |
| `kitchen_screensaver_enabled` | **on** — the panel DOES blank after 30 min idle |

Re-verify with (the script lives in the repo; `/tmp` does NOT survive the reboot):
```bash
ssh kitchencom 'python3 -' < deploy/checks/check-tod-entities.py
```

⚠️ **If `ssh kitchencom` times out, check YOUR network before suspecting the Pi:**
```bash
route -n get default | grep -E 'interface|gateway'   # a 10.x gateway = corporate net
ipconfig getifaddr en0
```
A corporate `10.x` network cannot reach `192.168.1.234`, and Tailscale is blocked
there. This happened on 2026-09-09 and is a known pattern
(memory: `pi-unreachable-from-office`).

---

## 3. What shipped

Three dashboard views the panel switches between on fixed clock boundaries:
**Morning** 05:00–11:00, **Afternoon** 11:00–18:30, **Evening** 18:30–05:00.

- `homeassistant/packages/time_of_day.yaml` — `sensor.kitchen_time_of_day`, three
  `input_datetime` boundary helpers, `timer.kitchen_nav_defer`, and the
  automation that restarts that timer on any panel touch.
- `custom_cards/tod-autonav-card/` — an invisible card that navigates the browser.
  HA core has **no** service that switches a browser's Lovelace view.
- `homeassistant/dashboards/kitchen.yaml` — Home renamed to Afternoon (header
  only); Morning and Evening inserted.

**Five verified facts. Do not "simplify" past any of them:**

1. **The defer signal is a NEW 90s timer**, NOT `timer.kitchen_inactivity`. That
   one is 30 minutes (`screensaver.yaml:25`), wedges in `idle` when the safety
   switch is off (`screensaver.yaml:45-51`), and its producer card was only on
   Home. All three checked in-repo before rejecting it.
2. **The trigger is an `input_button`, not an `input_boolean`.** `ButtonEntity`
   writes a fresh timestamp per press, so `platform: state` fires every time; an
   `input_boolean` silently no-ops on the second press.
3. **`custom:screensaver-card` is on all three time views deliberately.** Its
   activity bridge is what pings HA on touch; without it the defer signal dies on
   whichever view lacks it. It renders nothing unless idle.
4. **The autonav card is on the three time views ONLY** — never Schedule or
   Lists — and each declares the view it sits on. A mismatch = infinite nav loop.
5. **An unset `input_datetime` reports `timestamp = 0`, not `None`.** Each
   boundary falls back independently (300/660/1110 min) when it reads 0. See §5.

---

## 4. The next move — ONE visual check at the panel

Everything else is verified. This is the only open item, and it needs eyes on the
physical screen.

**After the reboot, touch the panel** (a touch, not a mouse move — the wake path
is `input_button.kitchen_activity`, pressed by the kiosk's touch handler).

Check three things:

1. **No error card** where the autonav card sits. *"Custom element doesn't exist:
   tod-autonav-card"* means the service worker is serving stale JS →
   DevTools → Application → **Service Workers → Unregister** (clearing "Cache"
   alone is NOT enough), or `ssh kitchencom 'pkill -f chromium'` to respawn.
2. **Correct view for the hour.** Morning before 11:00, Afternoon 11:00–18:30,
   Evening after. If it is sitting on Morning at, say, 14:00, the card is not
   loading — go to (1).
3. **Do all five tabs fit?** Morning · Afternoon · Evening · Schedule · Lists, on
   the 15.6″ panel, no wrap and no horizontal scroll. **This is the one pass/fail
   nobody has judged yet.** If they do not fit, in order of preference:
   (a) drop `title:` from the three time views so they render icon-only;
   (b) shorten to `AM` / `Day` / `PM`.

**Then, optionally, watch auto-nav fire live:** set
`input_datetime.kitchen_afternoon_start` to ~2 minutes ahead and wait. The panel
should switch on its own within ~60s. Restore the value afterward — or clear all
three back to unset, which is equally correct (§5).

**Absolute paths:**
- Plan: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-09-08-time-of-day-layouts.md`
- Spec: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-09-08-time-of-day-layouts-design.md`
- Live snapshot: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/pi-snapshots/kitchen.yaml.live-20260908-1331`

---

## 5. Carry-forwards

**The boundary helpers are UNSET (`00:00:00`) and that is fine.** The sensor
falls back per-boundary to 05:00 / 11:00 / 18:30. Setting all three is optional.
**Setting only one or two used to break the sensor entirely** — an unset helper
reports `timestamp = 0`, and `now_m >= 0` is trivially true, so it returned
`evening` at every hour. Fixed in `229f9ee` and verified across all four
configurations. Leave them unset, or set all three; never a partial set.

**The Evening "Tomorrow" column shows TODAY.** The stock calendar card has no
date-offset option — its config is exactly `{entities, initial_view, title,
theme}`, verified in
`reference/frontend-dev/src/panels/lovelace/cards/types.ts:53-58`. Needs a custom
card; folded into the work-week calendar spec. Marked `# TOMORROW-OFFSET` in
`kitchen.yaml`. **A known limitation, not a bug to fix in passing.**

**The kiosk cold-boots into Morning** — `/kitchen-snapshot` with no view path
takes the first view. Autonav corrects it in ~1s. Especially relevant after the
pending reboot.

**`kitchen.yaml` drift is REAL and cost this session a near-miss.** The live Pi
file was 1932 lines ahead of the repo, containing the claim-button migration and
Grocy calendar that existed on NO branch. The deploy was halted, the live file
snapshotted (`07527cd`), and the dashboard rebuilt FROM it (`a4188bf`).
**Never `scp` the repo's `kitchen.yaml` over the Pi's without diffing first.**
A second-order version of the same trap: the first merge attempt pulled Morning's
chore tiles from the stale repo copy and carried 6 dead `choreops.claim_chore`
calls — the path kiosk mode rejects — onto the tiles a kid taps at breakfast.
Caught by diffing counts against live.

**Repo/Pi `configuration.yaml` drift.** The repo copy lacks `default_config:`
that the live Pi has. Any "is component X loaded?" answered from the repo is
wrong. Not reconciled.

**The work-week calendar spec is not written.** Schoolwork/tests/dinner on a
work-week grid; the event-tagging decision (dedicated calendars vs. summary
prefixes) is deferred to that design. A verified voice write path already exists
(`homeassistant/packages/calendar.yaml`, `AddCalendarEvent` →
`calendar.create_event`, confirmed 200 and read back) — the missing piece is
tagging, not writing.

---

## 6. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- `panel-view-switching-is-browser-side.md` — why this feature is a card, and the five facts above
- `pi-unreachable-from-office.md` — check your own network before suspecting the Pi
- `kitchen-yaml-contested-file.md` — the drift that nearly cost the claim fix
- `repo-ha-config-drift.md` — never answer "is component X loaded?" from the repo copy
- `cards-must-be-bundled.md` — bare `lit` imports make a card unloadable
- `kiosk-service-worker-serves-stale-js.md` — unregister the SW, not just Cache
- `ha-yaml-entities-appear-late.md` — 60–90s after restart, not 20s
- `calendar-card-only-three-views.md` — only dayGridMonth/dayGridDay/listWeek
- `choreops-claim-service-vs-button.md` — the SERVICE is rejected in kiosk mode; use the button
- `concurrent-sessions-branch-hazard.md` — verify the branch before every commit
