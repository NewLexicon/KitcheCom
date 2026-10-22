# COLD OPEN — `feat/time-of-day-layouts`

**Refreshed 2026-10-21 evening:** **Phase A (Photos overlay + PIN'd Settings drawer) is
DEPLOYED on the Pi and verified at the panel by Garrett** (plan Task 12 — §4e).
**2026-10-22: Task 13 touch test RUN — output-off does not stick** (labwc re-enables the
ViewSonic ~10 s after `wlopm --off`). Garrett chose **"black, not off" (approach B)**: spec §3
rewritten + reviewed + approved; **plan Phase B rewritten as Tasks 14–17. Next move: execute
plan Task 14** (`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-10-21-sleep-settings-photos.md`,
search `### Task 14`). Tasks 14–16 are laptop-only (14 needs Docker); 17 needs home network + Garrett.

**Refreshed:** 2026-10-12 — a THIRD piece of work is now scoped on this branch:
the **Morning layout rework** (§4d), designed and committed, not implemented.
**Feature is DEPLOYED and running on the Pi.** One visual check remains (§4a) and
it needs a human at the physical panel — it cannot be closed over SSH.
**Light mode (§4b) has PARTLY landed** — the `--kc-*` extraction is deployed, so
the repo `kitchen.yaml` now carries 80 theme vars (this corrects the §4b framing
of it as "NOT started"; see §4b's note).
**The branch is now pushed; that long-standing warning is retired.**

> Cut from `feat/choreops-chores` (base `189fbc9`), NOT from main.
> `docs/session-state/COLD-OPEN-choreops-chores.md` still covers everything
> outside this feature.

---

## 0. Read this first — two things that will bite you

**① The branch IS PUSHED — resolved 2026-09-09.** This was the standing
single-point-of-failure at the top of every prior cold-open; it is closed.
`origin/feat/time-of-day-layouts` exists and tracks local, 0/0 divergence.
Critically, `07527cd` — the ONLY copy in git of 1932 lines of live Pi dashboard
work (the claim-button fix, the Grocy calendar), on no other branch — is now on
the remote. A dead disk on this Mac no longer loses it.

Confirm in one line (expect the two SHAs to match, and `0	0`):

```bash
git ls-remote origin refs/heads/feat/time-of-day-layouts; git rev-parse HEAD
git rev-list --left-right --count origin/feat/time-of-day-layouts...HEAD
```

Nothing has been merged and no PR was opened — this is a pushed feature branch,
still cut from `189fbc9`, not from main. How far ahead it is: ask, don't trust a
frozen number (it said "14" and was 16 by the next session):

```bash
git rev-list --count 189fbc9..HEAD
```

Later sessions: a plain `git push` now suffices; the upstream is set.

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
git ls-remote origin refs/heads/feat/time-of-day-layouts   # exists; expect 0	0 below
```

⚠️ **Multiple sessions share this checkout.** Re-run `git branch --show-current`
before every commit.

**Stable PREFIX** — immutable, will not move:

```
6017ef3 docs(cold-open): Tasks 1-11 built; Task 12 deploy is next
a6e28c1 fix(panel-tools): photos overlay stuck on Loading, reopening after close
00177e1 feat(panel): place panel-tools-card on the time views; install steps
d573059 feat(panel-tools): photos overlay with paging, hide/unhide and skipped-file note
7b2ad36 feat(panel-tools): corner icons, PIN pad and settings drawer
087087f fix: dev rig stages the panel packages; photo script never crashes on odd names
0b80f18 chore(dev-ha): stage the photo script and media folders in the dev rig
1ac8f9b feat(screensaver): delay comes from an input_number the drawer can set; theme survives restarts
ec89574 feat(photos): shell_command transport for the photos overlay
7c44d77 feat(photos): container-side hide/unhide/list script with hex filenames
ff43b7d feat(panel-tools): PIN, paging, skipped-file, settings and response logic
8b46f4e feat(panel-tools): filename and UTF-8 hex logic for photo moves
fc62c76 chore(panel-tools): scaffold bundled card package with dist guard
f14c7b2 plan: PIN 0510, drop theme initial, woken clears on idle (Garrett 2026-10-21)
4c04905 refactor(screensaver): extract media-browse so the photos overlay shares it
f8fe939 plan: sleep mode, settings drawer, photos overlay — Phase A first
927b774 design: sleep mode, PIN'd settings drawer, photos overlay
41d16c1 docs(cold-open): cold-start fix-ups — fold 1bd7db2, name the stamping trap
cbc132a docs(cold-open): add the morning rework, correct the stale light-mode heading
1bd7db2 design: morning layout rework — kid headers over block chore tiles
8a1a524 docs(kiosk): warn against killing only the renderers
749e7f9 fix(kiosk): restart the leaking chromium renderer overnight
59a9402 docs(cold-open): fold 68431f1 into the frozen prefix
9531c61 docs(cold-open): fold voice/grocy commits in, add the off-panel work
68431f1 feat(grocy): week shopping list that sums shared ingredients
f0d69c8 docs(voice): record the failed 2.4GHz SSID migration and two diagnostic traps
f940509 docs(voice): record Wyoming registration + the "Failed to connect" false alarm
c09e191 feat(voice): local Wyoming stack for HA Assist (whisper/piper/openwakeword)
e5597ab docs: pre-extraction Pi snapshot from the Phase 1 deploy
fc95d8c feat(theme): Mist light theme + input_select switch
70ddfdb docs: cold-open refreshed for the post-deploy state
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

Everything above the tip is frozen: as each close-out commit becomes history, it
gets folded into the prefix and the tip stays delegated. `70ddfdb` was folded in
on 2026-09-09 this way, `1bd7db2` on 2026-10-12, and `cbc132a`..`927b774` on 2026-10-21. **Do not "helpfully" stamp
the current tip** — that restarts precisely the loop this note exists to stop.

**2026-10-12 close-out, stated plainly so nobody re-stamps it:** the session's
own close-out commits (the cold-open update and this fix-up) are deliberately
NOT in the prefix above. They cannot be — a commit cannot name its own SHA, and
stamping it is itself another commit. The prefix is frozen through `1bd7db2` (2026-10-21: now through `a6e28c1`; the commits between `927b774` and `f8fe939` are docs-only cold-open/spec revisions, see `git log`);
everything after it lives in `git log --oneline`, which this document already
calls authoritative. Same for the ahead-count in §1: run the command.

---

## 2. Empirical state

**2026-10-21 evening (Task 12 deploy):** re-ran screensaver-card **113** and panel-tools-card
**33** before shipping; both `dist/` bundles deployed and md5-matched on the Pi
(`/home/garrettdehart/homeassistant/www/`, served at `screensaver-card.js?v=12`,
`panel-tools-card.js?v=1`). Dev-HA rig (port 8124) was **re-onboarded from scratch** — its
`.storage` was gone; login is still `dev` / `devdev123` (onboarded via
`/api/onboarding/users`, not the UI).

**2026-10-21 (after Tasks 1–11):** screensaver-card **113** passed + typecheck clean (its
`node_modules` lacked `@types/node` until a fresh `npm install` — typecheck failed TS2307 before
that, not a code problem); panel-tools-card **33** + typecheck clean; tod-autonav **14** +
typecheck clean; `python3 -m pytest homeassistant/kitchencom deploy/quotes -q` → **53** passed;
`npm run validate:yaml` printed no errors.

**Local (tod-autonav 14 + typecheck, and screensaver 109, ALL RE-VERIFIED
2026-10-12; no panel code has changed since — the morning rework of §4d is
design-only):**

```bash
cd custom_cards/tod-autonav-card && npm test        # 14 passed (12 decision + 2 guard)
cd custom_cards/tod-autonav-card && npm run typecheck   # exit 0
cd custom_cards/screensaver-card && npm test        # 109 passed (untouched)
npm run validate:yaml                               # exit 1 — see below (expected)

# Grocy tool math, no Pi needed (passed 2026-09-24) — see §3b for the expected output
python3 deploy/grocy/tools/fixture-server.py &
GROCY_URL=http://127.0.0.1:9285 GROCY_KEY=fake \
  python3 deploy/grocy/tools/week-shopping-list.py --days 7
pkill -f fixture-server
```

**`validate:yaml` exits 1 and that is EXPECTED.** The only two errors are
`missing starting space in comment` in `kitchen.yaml` (currently 488 and 1384).
**False positives** — yamllint reads the CSS hex colours `#4fc3f755` /
`#ba68c855` inside quoted style values as comments. The YAML is correct. **Do not
"fix" those lines.** Line numbers shift; identify them by the hex pattern.

**Pi (verified 21:46 local, 2026-09-08 — NOT re-checked since for PANEL state.**
ChoreOps/Grocy Pi work on 2026-09-21 is in §3b. Two attempts to reach the Pi on
2026-09-21 and 2026-09-24 both failed from the office network — LAN *and* Tailscale.
That is the documented `pi-unreachable-from-office` case, **not** a Pi fault: the
default gateway was `10.48.73.1`, so `192.168.1.234` routed out the corporate
interface. Check your own network before diagnosing anything.)

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

**Re-verification was ATTEMPTED on 2026-09-09 morning and was not possible.**
The Mac was on the corporate network (`en19`, gateway `10.48.73.1`, local
`10.200.40.220`); `ssh kitchencom` timed out and the tailnet address
`100.91.117.105` dropped 100% of pings. That is the documented office pattern, so
**no Pi fault is implied and nothing was diagnosed or changed.** The table above
therefore remains a 2026-09-08 21:46 reading, not a present-tense claim — treat
it as the last known good state and re-run the script below from the home LAN.

⚠️ **If `ssh kitchencom` times out, check YOUR network before suspecting the Pi:**
```bash
route -n get default | grep -E 'interface|gateway'   # a 10.x gateway = corporate net
ipconfig getifaddr en0        # may be empty — the office link came up on en19, not en0
```
A corporate `10.x` network cannot reach `192.168.1.234`, and Tailscale is blocked
there. This happened on 2026-09-08 AND again on 2026-09-09 and is a known pattern
(memory: `pi-unreachable-from-office`).

**macOS has no `timeout(1)`** — `timeout 10 ssh ...` dies with
`command not found`, which looks like a network failure but is a missing binary.
Use ssh's own `-o ConnectTimeout=6` (and `ping -t`) instead of installing
coreutils.

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

## 3b. Off-panel work that also lives on this branch

⚠️ **Neither item is panel/light-mode work.** They rode along on this branch
because it was checked out. Both are additive and touch no panel code, so they can
move to main whenever convenient — no rush, no conflict risk.

### ChoreOps: all 14 chores auto-approve at midnight (2026-09-21)

**A deliberate REVERSAL of the 2026-09-03 decision.** All 14 chores went
`clear_pending` → `auto_approve_pending`, so a claim a kid tapped is granted at the
midnight rollover instead of dropped. Garrett's call — he wasn't getting to the
approval queue and prefers "default to they were correct."

**Applied on the Pi, not in the repo** — this is `.storage` state, so there is no
commit for it. Backup: `.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-preautoapprove-20260921-082903`.

Common misreading to avoid: this does **not** mean unclaimed chores get paid. Only
chores a kid actually tapped are affected; untapped ones still reset to zero.

Verified post-restart: all 14 read `auto_approve_pending` (survived HA's shutdown
rewrite), 14 chores / 4 users / 4 rewards / 6 badges intact, Rowan+Wystan 4.0 each,
adults' `point_periods` still `null`, 0 errors in the startup window, both points
sensors numeric in the recorder DB.

⚠️ The memory `chore-reset-and-missable-semantics` calls this setting a "leak
CLOSED" — that text is now HISTORY. It is cross-referenced, but do not "fix" this
back without asking.

### Grocy: `week-shopping-list.py` (2026-09-21, commit `68431f1`)

Decision: **use Grocy's own meal plan as-is, as a test** — not a committed
architecture. Garrett asked about drag-and-drop; **there is none.** Grocy's meal
plan is click-to-add per day. Setting that expectation matters.

- `deploy/grocy/tools/week-shopping-list.py` — reads the meal plan, prints a list
  with shared ingredients **summed**. Read-only by design; never writes
  `shopping_list` (a past probe added 4 real rows to the household's live list).
- `deploy/grocy/tools/fixture-server.py` — fake API built from the local library
  export, so the math is testable with the Pi down. **Must run from the repo root.**
- `deploy/grocy/tools/README.md` — why the summing bug exists, usage, caveats.

Why it exists: Grocy's `add-not-fulfilled-products-to-shoppinglist` does not
aggregate a product used by two planned recipes — it writes the first amount and
skips the rest. Garlic is in 12 of the 24 library recipes and is bought as discrete
heads, so a normal week is under-ordered.

Re-verify the math in ~15 seconds (passed again 2026-09-24):

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM      # MUST be repo root
python3 deploy/grocy/tools/fixture-server.py &
sleep 4
GROCY_URL=http://127.0.0.1:9285 GROCY_KEY=fake \
  python3 deploy/grocy/tools/week-shopping-list.py --days 7
# expect: Garlic 5.00 Clove (Grocy would write 3.00), Olive oil 3.00 Tablespoon
pkill -f fixture-server
```

🔴 **It has NEVER run against the real Pi.** The fixture proves the summing math,
not the live API shapes. The first real run is the actual test — see §4c.

---

## 4. The next move

Four open items, and **which one you can even attempt depends on the network you
are on — check this FIRST:**

```bash
route -n get default | grep gateway     # 192.168.1.1 = home; 10.x = office/VPN
```

- **On the home network** → do **§4c** first. It is ~2 minutes, it is the only
  item blocked purely by network, and it closes the loop on work already written.
- **At the office / on the corporate 10.x** → the Pi is unreachable over BOTH LAN
  and Tailscale (verified twice, 2026-09-21 and 2026-09-24). Do **§4b**, which is
  pure local repo work. Do not spend time diagnosing the Pi; see §2.
- **§4a** needs a human physically at the panel and cannot be closed over SSH.
- **§4d (morning layout rework) is the live thread** — it is where the last
  session stopped mid-conversation. It is blocked on **two user answers**, not on
  the network (see §4d). If Garrett is present, ask those two questions first;
  they take seconds and they unblock the plan. Writing YAML needs home network.
- **§4e (sleep / settings drawer / photos overlay)** — **Phase A DEPLOYED + verified
  2026-10-21.** Next: plan **Task 13** (touch test, home network + Garrett at the panel),
  which gates Phase B Tasks 14–20.

⚠️ **Tailscale does not stay up.** It was started on 2026-09-21 and was found
`stopped` again on 2026-09-24. Starting it needs the existing flags preserved
(`tailscale up --accept-routes`), NOT `--reset` — `--accept-dns=false` is
deliberate. Even up, it did not reach the Pi from the office.

---

## 4c. First real run of the Grocy shopping list — NEEDS HOME NETWORK

The one item blocked only by where the laptop is. ~2 minutes.

```bash
# key lives in the Pi's secrets.yaml as grocy_api_key
ssh kitchencom 'sudo grep grocy_api_key /home/garrettdehart/homeassistant/secrets.yaml'

cd /Users/jdehart1/___Code_DEV/KitchenCOM
GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<key> \
  python3 deploy/grocy/tools/week-shopping-list.py --days 7
```

**Expected:** either a summed list, or `No recipe meals planned ...` if Garrett has
not yet planned a week in Grocy's UI (that is a valid pass — it proves the API
reads work).

**If it errors, that is the interesting result** — the fixture proved the math but
never the live API shapes. Likely suspects: field names on `meal_plan` rows, or
`recipes_pos` paging on a bigger library than the fixture's.

**Then ask the question that decides the next build:** was the friction in
*choosing* the meals, or in *getting the list right*? Choosing → a panel planning
view. List → this tool is already the answer. Do not build either without asking;
Garrett has not answered it yet.

---

## 4d. Morning layout rework — DESIGNED, not implemented (2026-10-12)

**Read first (absolute path):**
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-10-12-morning-layout-rework-design.md`

Spec committed as `1bd7db2`. **No code written, no YAML touched.** Brainstorming
reached the design-approved stage; the next step in the
`superpowers:brainstorming` checklist is the **user spec review**, then
`writing-plans`. **Hard gate: no implementation until the user approves.**

**What was decided.** Morning goes from 3 columns to 2 stacked bands: a
full-width chore band on top (one kid per column, each with a new header row —
**name left, points right, both large**), and a support band beneath for
calendar/weather/reminders. **The existing block chore tiles are KEPT as-is** —
the user explicitly chose the current 104px tap-to-claim tiles over the slim
list rows that were mocked up. The 32px `☀ Rowan — Morning` banners are replaced
by the new headers.

**Two decisions the user has NOT answered — do not guess:**

1. **Which points number** — current balance (what they can spend; recommended)
   vs `point_stat_points_earned_all_time` (what Afternoon shows).
2. **Where Perspective goes** — drop from Morning, fourth card in the support
   band, or tucked under Reminders.

**Three traps recorded in the spec, repeated here because they bite:**

- **`claim_button_eid` is the only working claim path.** The `claim_chore`
  *service* rejects panel taps in kiosk mode. Do not "simplify" the tap action.
- **The Sep 10 snapshot is stale for colors.** It has zero `--kc-` vars; the live
  Pi file has them. Use the snapshot for layout/structure, re-read live for color.
- **The two invisible cards must survive the rework.** `screensaver-card` feeds
  the activity bridge behind `timer.kitchen_nav_defer`; `tod-autonav-card` does
  the hour-based view switch. They render nothing and look droppable. They are not.

**Needs the home network to deploy** (`nc -z -G 6 192.168.1.234 22`) and a human
at the panel to judge tile fit at half-width.

---

## 4e. Sleep Mode, PIN'd Settings drawer, Photos overlay — DESIGNED (2026-10-21)

**Read first (absolute path):**
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md`

Spec committed as `927b774`. **No code, no YAML.** Borrowed from a commercial family
display Garrett saw elsewhere (photo was a HEIC in ~/Downloads — not kept). One new
bundled `panel-tools-card` with ⚙ (PIN → slide-over drawer: sleep window, view start
times, theme, screensaver delay) and 🖼 (full-screen photos overlay: see + hide).
A review pass was folded in; its "editable start times change tod-autonav" claim was
checked and is WRONG — the helpers already exist and the card only reads the sensor.

Two review passes folded in (`927b774`, then the commit after it in `git log`): the screen
fails ON (ExecStopPost + 5-min HA-unreachable rule), filenames travel hex-encoded, the wake
layer owns the tap above the screensaver.

**Next, in order:** (1) the §7 panel test in the spec, **including step 6** — does touch come
BACK after `wlopm --on`? If not, Sleep Mode can't ship as designed. Also run
`ssh kitchencom 'sudo docker exec homeassistant ls /config/media'` to settle photos/ vs media/.
(2) user spec review (brainstorming hard gate), (3) `superpowers:writing-plans`.

**Spec APPROVED 2026-10-21. Plan:**
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-10-21-sleep-settings-photos.md`
(20 tasks: Phase A 1–12 photos + PIN'd drawer; Task 13 touch-test gate; Phase B 14–20 sleep).

**✅ Tasks 1–11 BUILT 2026-10-21** (`4c04905`..`a6e28c1`, subagent-driven, each batch
reviewed). **Next move: Task 12 (deploy Phase A) — needs home network, VPN off, Garrett at
the panel.** Garrett's decisions, all folded into the plan: PIN `0510` (committed to git,
accepted); woken clears when the screensaver re-engages; theme `initial: Dark` REMOVED.

What landed, and the review catches that changed it:
- `screensaver-card` now imports `src/media-browse.ts` (shared with the new card). Behavior
  unchanged (113 tests) — but its `dist/` must be **redeployed with a bumped `?v=`** in Task 12,
  and the screensaver must be re-checked at the panel (regression check for the refactor).
- New `custom_cards/panel-tools-card` (33 tests). Review found two plan-code bugs, fixed in
  `a6e28c1`: one generation counter served both overlay load and page resolves (overlay stuck
  on "Loading…"), and a hide finishing after close reopened the overlay.
- `homeassistant/kitchencom/photo_move.py` (23 tests) + `packages/photos.yaml`. Security review:
  no hole; hardened in `087087f` (ensure_ascii + catch-all so it always answers JSON).
- `screensaver.yaml`: `input_number.kitchen_screensaver_minutes`; there were **3** timer.starts,
  not the 4 the plan guessed — all 3 now take the duration. **After first deploy, set it to 30**
  (with no restored state it starts at 5).
- `dev-setup.sh` used to delete every package but Grocy; now keeps photos/screensaver/theme/
  time_of_day (`087087f`). Add `sleep.yaml` there in Phase B.

**✅ Dev-rig checks DONE 2026-10-21 evening** (Task 8 Steps 4–5, Task 10 Step 5): list/hide/
unhide round-trip with `Rowan's "best" day.jpg`; minutes=45 → `timer.kitchen_inactivity`
duration `0:45:00`; Playwright click-through (HEIC listed as not shown, hide → Hidden tab →
Show again, wrong PIN refused, drawer +/theme/time-picker all write their entities, `kitchen_idle`
on closes AND re-locks the drawer). Dev rig's view times read 00:00 — no restored state there; not a bug.

**✅ Task 12 DEPLOYED + VERIFIED 2026-10-21 evening.**
- Pi photos confirmed at `/config/media/photos` (212 files then); container `python3` =
  `/usr/local/bin/python3`. `photos-hidden/` pre-created as `garrettdehart`.
- Pi packages had NOT drifted — the diff was exactly this branch's changes. Backups:
  `packages/{screensaver,theme}.yaml.bak-prephotos-<stamp>`, `www/screensaver-card.js.bak-prephotos-<stamp>`,
  `.storage/lovelace_resources.bak-prephotos-<stamp>`. New: `packages/photos.yaml`, `kitchencom/photo_move.py`.
- Resources edited with HA STOPPED: screensaver `?v=11→12`, added `panel-tools-card.js?v=1`.
- `kitchen.yaml` via `deploy-dashboard.sh` (live matched baseline; diff = the 3 card blocks).
  Snapshot `docs/pi-snapshots/kitchen.yaml.live-20261021-193833` committed.
- Kiosk Service Worker + caches cleared (kiosk = OS user `garrettdehart`, profile `~/.config/chromium/Default`).
- **Garrett at the panel:** PIN, drawer, theme, delay +/−, time picker by touch, photos overlay,
  icon placement on all three views — all OK. Screensaver engaged on the 5-min delay
  (`kitchen_idle` on 23:50:35 UTC) and **cycles photos** → refactor regression check passed.
- **Delay set to 30** (`input_number.kitchen_screensaver_minutes` = 30.0 at 23:58 UTC, recorder).
- **Garrett deliberately hid 20 photos** with the new overlay (192 in rotation). Not a bug —
  don't "restore" them.
- No HA API token for the Pi exists on the Mac; read state from the recorder DB
  (`/config/home-assistant_v2.db`, `states` ⋈ `states_meta`) via `docker exec … python3`.

**✅ Task 13 RUN 2026-10-22 — Phase B (Tasks 14–20) CANNOT ship as written.** Full result in
spec §7 "Result" (`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md`):
`wlopm --off` holds ~9.5 s, then the ViewSonic hotplugs (2 drm uevents) and **labwc** turns the
output back on — proven with kanshi killed. Touch survives (step 6 PASS); steps 3–4 inconclusive.
Re-asserting off would flash every ~10 s. kanshi was restarted as ONE process (boot had two
duplicates; a reboot restores both — harmless, its `config` is empty).

**✅ DECIDED 2026-10-22: "black, not off", approach B** — during the sleep window the idle
*screensaver* shows plain black (no Pi service, no wlopm, no token, no wake layer, no woken flag).
Night wake = **2 min** (Garrett). Glow accepted; DDC dimming out of scope. Spec §3 has the design,
its Tests subsection and failure modes (incl. an unconfirmed night-restart race that Task 17
step 5 tests). **NEXT: plan Task 14.** At-home items 1–3 below are all DONE.

**Carry-forward:** kernel logged `mmc0: Card stuck being busy! __mmc_poll_for_busy` at
2026-10-21 19:37 local (during the HA stop/start). One-off so far; if it recurs, suspect the
Pi 5's SD card before anything else.

**At-home session checklist (all four need Garrett on the home network):**
1. **Disconnect the GSU VPN first.** It routes all of 192.168.1.0/24 into the tunnel, so the
   Pi reads as down even on home wifi. Then `nc -z -G 6 192.168.1.234 22`.
2. Spec §7 touch test, steps 0–6 — **turn `input_boolean.kitchen_idle` on first** so no test
   tap can land on a chore tile; watch `input_button.kitchen_activity` for step 4, and
   step 6 (touch returns after `--on`) is make-or-break.
3. `ssh kitchencom 'sudo docker exec homeassistant ls /config/media'` → then correct whichever
   of `screensaver-photos-folder-and-formats.md` / `screensaver-media-mount-boundary.md` is stale.
4. Whether the wake layer really stacks above the screensaver overlay — panel-only; can be
   checked once a prototype layer exists.

**Traps:** hidden photos go to sibling `/config/media/photos-hidden/`, NOT a subfolder —
the screensaver recurses (`screensaver-card.ts:85`). The wake tap must land on a
transparent catch layer, or waking on Morning claims a chore. A reboot during sleep
re-lights the screen (`start-kiosk-wayland.sh:31`); the Pi service must reconcile on start.
Photos path conflict between memory notes (`photos/` vs `media/`) — confirm on the Pi.

---

## 4a. The visual check at the panel

Left over from the time-of-day deploy. Needs eyes on the physical screen.

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

## 4b. Light mode — PARTLY LANDED (this heading was stale)

> ⚠️ **Corrected 2026-10-12.** This section used to say "scoped, NOT started."
> That is wrong and was wrong before this session. Verify, don't trust the prose:
>
> ```bash
> git log --oneline --all | grep -iE "theme|kc-"   # design, 10-task plan, extractions
> git merge-base --is-ancestor fc95d8c HEAD && echo on-branch
> grep -c "var(--kc-" homeassistant/dashboards/kitchen.yaml   # 80
> ls homeassistant/themes/        # kitchencom.yaml + kitchencom-light.yaml
> cat homeassistant/packages/theme.yaml   # input_select.kitchen_theme + automation
> ```
>
> What exists: `59afbbb` design, `6f65cbc` 10-task plan, `044d008` 14 vars at dark
> values, `232bd77`/`249ec9b` accent extractions, `fc95d8c` Mist light theme +
> switch. What that means: **Phase 1 (extract) is largely done and the switch
> exists.** For which of the 10 tasks remain, read
> `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/plans/2026-09-10-light-mode.md`
> rather than re-deriving scope. The four-decisions table below is still
> accurate and still locked.
>
> The old text follows because its *findings* (the 54 literals, the pastel
> hand-pick warning, the trough inversion) are still the useful part.

**Read first (absolute path):**
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-09-09-light-mode-step1-findings.md`

That file is the complete Step-1 context exploration. **Everything below is a
summary of it — read it, don't work from this section alone.**

**What the user actually wants.** Not a light conversion. The ask was revised
mid-session to: **keep the current dark palette exactly as-is, add a light theme
beside it, and switch between them.** Dark is the known-good state and must
survive byte-identical.

**Four decisions are locked. Do not re-ask them:**

| | |
|---|---|
| Theme model | Both. Light added alongside dark. |
| Switch | `input_select` + automation calling `frontend.set_theme` |
| Light palette | **Warm / paper** — off-white and warm greys, not pure white |
| Branch | **this one**, not main |

**The finding that shapes the work:** `homeassistant/themes/kitchencom.yaml` is
only 6 colors, but `kitchen.yaml` hardcodes **54 more that bypass the theme
system entirely.** A theme switch cannot touch them. So the work is two phases:

1. **Extract** — replace each literal with `var(--kc-*, <current>)`. Mechanical,
   **zero visual change; "dark looks byte-identical" is the gate.**
2. **Define** — declare the vars in both themes, pick warm-paper values, add the
   `input_select` + automation.

The four accent hues (`#4fc3f7` ×22, `#ba68c8` ×22, `#ffd54f` ×12, `#7e57c2` ×6)
are pastels tuned for near-black and **must be re-picked by hand — find-and-replace
produces an unreadable panel.** Six `rgba(255,255,255,0.13)` progress-bar troughs
must *invert*, not re-tone.

**Where to resume: Step 2 of the `superpowers:brainstorming` checklist.** Steps
3–9 follow (design → spec → user approval → `writing-plans`).
**No implementation until the user approves a design — hard gate in the skill.**
The visual companion was offered and accepted but never produced; a palette
decision is genuinely visual, so honor it rather than skipping.

**One open question for the user:** should the screensaver follow the light theme
or stay dark always? It runs full-screen in a dark kitchen at night. Findings-doc
§8 recommends exempting it, but it is the user's call and it decides whether
`screensaver-card.ts` is touched at all.

---

## 5. Carry-forwards

**🔴 `week-shopping-list.py` has never touched the real Pi.** Verified only against
`fixture-server.py`. Mitigation: it is read-only, so a bad run prints garbage rather
than corrupting the household list. Fix trigger: §4c, first time on the home network.

**The Grocy shopping list under-orders shared ingredients if you use Grocy's own
button.** Unfixed upstream and not fixable — it is how the endpoint behaves. The
tool is the workaround. **Garlic** (12 of 24 recipes, bought as discrete heads) is
the one to eyeball every time; butter second. Salt and the oils share the bug
harmlessly.

**ChoreOps auto-approve has an unverified first rollover.** Set 2026-09-21; the
midnight behaviour was never observed afterwards because the Pi went unreachable.
Fix trigger: on the home network, confirm a tapped chore was granted (not dropped)
at a midnight boundary — points sensor, not the file.

**Tailscale will not be running.** See the warning in §4. It is not a fallback you
can assume; from the office it did not reach the Pi even when up.


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

**The two `validate:yaml` false positives will MOVE when light mode lands.** They
sit on `#4fc3f755` / `#ba68c855` (currently 488 and 1384) — the exact values the
light-mode extraction rewrites. Expect new line numbers, and possibly a different
count if the extraction changes how many 8-digit hex values remain inline. The
rule (`missing starting space in comment`) and the cause (yamllint reading
hex-with-alpha as a comment) stay the same. **Identify by pattern, never by
number, and don't read the nonzero exit as damage.**

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

For the off-panel work on this branch (§3b):

- `chore-auto-approve-at-midnight.md` — **the current ChoreOps state**, and why it
  reverses the older memory below. Read both or you will "fix" it back.
- `chore-reset-and-missable-semantics.md` — its "leak CLOSED" paragraph is now
  HISTORY; cross-referenced, but the live state is the file above.
- `meal-plan-workflow-grocy-as-is.md` — the as-is-as-a-test decision, no
  drag-and-drop, and the unanswered choosing-vs-list question.
- `grocy-shopping-list-no-aggregation.md` — the summing bug, quantified per product.
- `grocy-library-imported-to-pi.md` — the library is LIVE; seeding is DONE, do not
  re-run the importer thinking it is pending.
- `grocy-servings-house-default.md` — mains are 6 servings (dinner + leftovers).
- `grocy-api-write-endpoints.md` — verified endpoints, and the rule that probes must
  never touch the real shopping list.
- `choreops-full-reset-procedure.md` — **STOP HA before any `.storage` edit**, or the
  shutdown rewrite silently clobbers it.
- `vpn-hides-the-whole-lan.md` — a VPN captures all of 192.168.1.0/24; every host
  reads as down while the internet still works.

For the morning layout rework (§4d) specifically — all four are load-bearing:

- `choreops-claim-service-vs-button.md` — **the one that will break the rework.**
  The tiles' `claim_button_eid` tap is the only path that works from the kiosk.
- `chore-cards-strip-kid-name.md` — the tiles strip the kid's name citing a column
  header. The rework replaces that header, so the regex comment needs re-reading
  in its new context (the new points header still names the kid, so it holds).
- `kitchen-yaml-contested-file.md` — rebuild from the LIVE file, back it up first.
- `markdown-card-strips-inline-css.md` — the new header must be a
  `custom:button-card`; there is no card-mod on the Pi.

For the light-mode work (§4b) specifically:

- `markdown-card-strips-inline-css.md` — **why the colors are trapped in
  `button-card` style blocks in the first place.** No HACS/card-mod on the Pi, and
  markdown cards strip inline CSS, so `custom:button-card` is the only styling
  path. Read before proposing any "just use card-mod" shortcut — it does not exist here.
- `choreops-source-vendored-locally.md` — `reference/ChoreOps-main/` is read-only
  upstream (91 color literals across 10 files). **Not ours to theme. Excluded.**
