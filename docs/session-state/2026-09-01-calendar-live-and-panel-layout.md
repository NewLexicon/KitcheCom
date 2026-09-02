# Cold-open — the calendar is LIVE; the panel is a working dashboard (2026-09-01)

**Branch:** `feat/choreops-chores`
**Read this first.** Every number below has the command that verifies it.

> Supersedes `2026-08-18-panel-complete-handoff.md` for status. That doc is still the
> best reference for the screensaver/portrait-pairing and quotes work, and for the
> standing traps in its §5 — **those traps all still apply and bit again tonight.**

---

## 🟢 START HERE — the next action

**Google Calendar is done.** `calendar.family` exists, the card renders real events, and
the two-week-old spinner is gone. That was the last blocker from the previous cold-open.

Tonight also rebuilt the Kitchen panel into a real three-column dashboard and made six
ChoreOps config changes with Garrett.

**The next task is one of two, Garrett's call:**

1. **CSS / visual structure** (he asked to think about this overnight — see §5). The
   calendar's date format is the specific driver: he wants "SEPT 2", not
   "2 September 2026". **This is NOT achievable with the built-in calendar card** —
   analysis and the three real options are in §5. Don't re-derive it.
2. **Fold tonight's ChoreOps changes back into the generator** (§4 carry-forward) so the
   Pi's content stays reproducible.

**First mandatory pre-flight:** check whether Rowan's points re-inflated overnight (§6).
That is a live open question with a real bug behind it, and morning is when it answers
itself.

---

## 1. Where is HEAD?

- **HEAD (tip):** deliberately NOT frozen — run `git log --oneline -1`. A close-out commit
  cannot stamp its own SHA, and stamping it is itself a commit, so the loop never converges.
- **Stable prefix** (immutable): `8112835` → `9af5299` → `934a9b6` → `429cd3a`
  (previous cold-open) → `b3cc39d` (tonight's work). The tip above `b3cc39d` is
  deliberately not frozen — see the HEAD note.
- **Branch:** `feat/choreops-chores`, primary checkout `/Users/jdehart1/___Code_DEV/KitchenCOM`
- **Ahead / unpushed:** a number that counts the commits it lives inside cannot be
  frozen correctly — **run `git rev-list --count origin/main..HEAD`**. It was 74 at
  `429cd3a` and 75 at `b3cc39d`; this doc's own fix-up commit adds one more.

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current                                      # feat/choreops-chores
git log --oneline -1
git rev-list --count origin/main..HEAD                         # authoritative
git log --oneline origin/feat/choreops-chores..HEAD | wc -l    # expect 0
```

### 🔴 Nearly all of tonight's work was done LIVE ON THE PI, not in the repo

This is the single most important thing to understand about tonight. Chore config,
points repair, and every layout iteration were direct writes to the Pi's
`.storage` and `dashboards/`. The repo was synced back only at close-out.

**Six worktrees still exist — verify `git branch --show-current` before every commit.**

| Path | Branch |
|---|---|
| `/Users/jdehart1/___Code_DEV/KitchenCOM` | `feat/choreops-chores` ← **here** |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox` | `fort-knox` |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-grocy` | `feat/grocy-kitchen` |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-voice` | `feat/voice-slice` |
| `…/.worktrees/main-merge` | `main` |
| `…/.worktrees/grocy-chores` | detached `f2e561c` |

---

## 2. Empirical state — the Pi

**Verified 2026-09-01 ~23:30.** Pi home on the LAN; plain `ssh kitchencom`, no tunnel.
`route -n get 192.168.1.234` showed `en0` (no second-Pi hijack).

| Item | Value |
|---|---|
| Address | `192.168.1.234` (reserved), `kitchencom.local` |
| HA | **2026.6.3** · ChoreOps **1.0.7** |
| ChoreOps entities | **316** (was 288) — +8 Night Brush, +16 pet split, −8 removed originals. Re-run the count; it moved four times tonight. |
| Chores | **14** (was 11) — Night Brush + 4 pet chores, −2 replaced |
| Calendar entities | **12** (was 3) — 9 Google calendars arrived |
| OAuth credential | **PRESENT** · 72 chars · ends `.apps.googleusercontent.com` · prefix `438890574011-d` |
| Points | Rowan **0.0**, Wystan **0.0** (both zeroed; structures well-formed) |
| Screensaver idle | **30 min** (was 3) — `packages/screensaver.yaml:25` |
| Points-sensor errors | **0** · coordinator listener errors **0** |

---

## 3. 🟢 Google Calendar — DONE, and how

The previous cold-open's §3 is now **complete**. What actually happened differs from
its plan in one important way, recorded here so it isn't re-litigated:

**A NEW OAuth client was created — `KitchenCOM Pi`.** The old `KitchenCOM Cal` client
(created 2026-08-14, id prefix `438890574011-qsjp`) was **not** reused, because:

- Google shows a client secret **exactly once**, at creation. Both of that client's
  secrets were permanently masked (`****qoYn`, `****r3IH`) and unrecoverable.
- The secret was **not** stored anywhere recoverable: the Pi had no
  `application_credentials`, the dev rig's `.storage`
  (`KitchenCOM-fortknox/deploy/homeassistant/dev-config/.storage`) has no such file,
  and grepping the repo tree for `438890574011` returns nothing (by design — secrets
  never enter the repo).
- A client is capped at **two** secrets, so "+ Add secret" was unavailable.
- **Deleting one was refused as unsafe:** Google reported *"This secret has been used
  9 times in the past 8 days"* — while the Pi was off. The consumer was never
  identified (see §6). Creating a new client sidestepped it destructively-free.

The new client's only redirect URI is `https://my.home-assistant.io/redirect/oauth`.
**Do not add the Pi's IP** — Google rejects bare private IPs; that instruction was
wrong and is retracted in the previous cold-open too.

### The trap that actually bit: the browser's stored instance URL

The previous cold-open predicted this and it still cost time. `my.home-assistant.io`
held `http://localhost:8124` (the dev rig) in **normal-window local storage**, which
caused HA's login to bounce with *"Unable to fetch auth providers."*

- Fixed by editing it at `https://my.home-assistant.io` → **HOME ASSISTANT INSTANCE** →
  ✏️ pencil → `http://192.168.1.234:8123`.
- **Incognito was abandoned deliberately:** incognito has separate local storage, so a
  value fixed in the normal window is invisible to it. The autofill trap was handled
  manually instead (re-check the Client ID before submitting). That trade was correct.

**9 Google calendars now exist.** Garrett disabled `menu_for_food_cleanse` and
`bec_gare`; `working_location` is disabled by the integration. Live and in use:
`family`, `deharts`, `garrett_dehart`, `rebdinatl_gmail_com`, `birthdays`,
`holidays_in_united_states`.

`packages/calendar.yaml:26` in the repo (`KitchenAddCalendarEvent`, script at `:14`; the Pi's copy has it at `:22` and still carries a stale "PLACEHOLDER" comment worth deleting) now points at a **real writable
calendar for the first time** — written months ago, still **never tested**.

---

## 4. ChoreOps changes made WITH Garrett tonight

All six were his decisions, applied by direct storage write + HA restart.

| Chore | Change | Why |
|---|---|---|
| Clean Room | `rotation_smart` → `independent` | a bedroom is your own, not a turn |
| Laundry | `rotation_smart` → `independent` | same shape as Clean Room |
| Feed Cats | Rowan-only → **both kids**, `independent` → `rotation_smart` | Wystan was excluded |
| Trash, Recycling | *(unchanged)* | already `rotation_smart` + both kids — verified, not touched |
| Brush Teeth | **renamed → "Morning Brush"** | ID kept, so Early Riser stays linked |
| *(new)* Night Brush | cloned from it, fresh UUID `4ab75a5b…` | separate evening chore |
| Feed Cats, Fishy | **deleted**, replaced by 4 morning/evening chores | see below |
| Cook Dinner | stays **Rowan-only** — decided, not an oversight | Wystan is 8 |

### Pet chores — 14 chores now; the weekly swap is MANUAL

`Feed Cats` and `Fishy` were replaced by four `independent` chores, 2.0 pts each,
each assigned to ONE kid. Week 1: **Rowan** = Feed Cats—Morning + Fishy—Evening;
**Wystan** = Fishy—Morning + Feed Cats—Evening. Each kid does one pet in the morning
and the other at night; they swap times weekly.

**They are NOT rotating chores, deliberately.** ChoreOps has only `rotation_simple`
and `rotation_smart`, both **completion-driven** — there is no time-based rotation
(verified in `const.py:1462-1468`). A rotating version would decouple the
morning/evening pairing the first time one kid completed something the other did not.
Fixed assignment holds it; **the weekly swap is a manual reassign** (ask, and it is a
one-shot script). Could later be an HA automation on a weekly trigger.

Each kid now has **7 daily chores** — watch the Home column for overflow.

**Rowan's Early Riser streak was zeroed** (2 → 0), Wystan already 0 — verified AFTER a
restart, which is the only proof that counts here (see below). Chore Champion `6/250`
is **still un-zeroed**; that 6 includes the Aug-19 phantom re-awards.

### 🔴 Achievement progress is DERIVED — the first zeroing silently reverted

`data.achievements[].progress[user_id]` is **recomputed** by
`gamification_manager.py:2770` (`_get_tracked_current_streak`) from
`data.users[uid].chore_data[chore_id].current_streak`. Writing the achievement record
reports success, then reverts on the next HA restart — Garrett caught this ("Rowan is
still at 2"). Zero the **per-chore counters** instead (`current_streak`,
`longest_streak`, `streak_tally`, `*_missed_streak`); stale entries persist even for
**deleted** chores (one was found on the removed Feed Cats id `2d99b007`).

Same shape as the points bug: **write to the field that OWNS the value, not the one
that displays it**, and re-verify after a restart.

### 🔴 Rotation is COMPLETION-driven, not calendar-driven

Read from source, not inferred (`chore_manager.py` `_advance_rotation` + its 4 call
sites): the turn advances **only on completion + approval**. A chore nobody does stays
on the same kid forever. One exception at line 2685 — a midnight scan advances a
`MISSED` chore, but **only** under `mark_missed_and_lock`, and these chores use
`at_due_date_clear_immediate_on_late`, so it does not currently apply.

### 🟡 Renamed chore keeps its OLD entity_id

"Morning Brush" is still `sensor.<kid>_choreops_chore_status_brush_teeth`. HA fixes
entity IDs at creation. Harmless (tiles read `friendly_name`) — but do not "fix" it.

### Early Riser, explained (Garrett asked; he chose to keep it)

`chore_streak` on the Morning Brush chore id, target 5, reward 20 pts. Rowan's streak
is **2**. Note: the name is aspirational — ChoreOps has no concept of *when* a chore was
done, and "without a reminder" is not enforced by anything. Splitting morning/night
made the name honest. **Rowan's streak of 2 is partly phantom** (see §6).

---

## 5. 🔴 CSS / layout — read before touching the calendar's dates

Garrett's asks: bolder days, `SEPT 2` not `2 September 2026`, heading `SEPT. 1-7`
without the year, and the "Today" button turned into an icon moved into the grid.

**The built-in calendar card cannot do this.** Verified in the frontend source:

- `hui-calendar-card.ts:213` renders only `_config.title`; everything else —
  the date strings, "Today", the ‹ › arrows, the view toggles — is generated by
  **FullCalendar inside a shadow root** (`ha-full-calendar.ts:298`).
- The FullCalendar classes exist (`.fc-list-day-text`, `.fc-list-day-side-text`,
  `.fc-col-header-cell`) so CSS *could* reach them — **but only via `card-mod`**,
  which is **NOT installed** (there is no HACS dir; `button-card` and `auto-entities`
  were vendored by hand into `www/community/`).
- Even with `card-mod`, CSS can **hide or restyle** those strings but cannot
  **reformat** them — "2 September 2026" is one generated string. Moving "Today" into
  the grid is a DOM change, not a CSS one.

**Three real options, in the order I'd recommend them:**

1. **A custom calendar card** — `atomic-calendar-revive` is purpose-built for kitchen
   panels: native control of date formats, per-calendar colours, compact modes. This is
   the actual answer to what Garrett is describing.
2. **An HA theme** (`themes/kitchencom.yaml`) — the supported global mechanism for
   fonts/colours/radii across every card. Best value for "tighten up the whole app".
3. **`card-mod`** — gets maybe a third of the list, adds a dependency reaching into
   shadow DOM. Weakest option; do not reach for it first.

### 🔴 The markdown card STRIPS inline CSS — this cost an iteration tonight

A scoreboard hand-written as HTML in a `markdown` card rendered as a **plain unstyled
list**: every `style=` attribute was sanitized away. **Use `custom:button-card`**, whose
`styles:` blocks and `custom_fields` (raw HTML) both survive. All headers, stat boxes,
and achievement bars were rebuilt this way.

### 🟡 YAML flow-style + a `#` colour = silent breakage

`card: [border-left: 4px solid #4fc3f7]` — the `#` starts a YAML comment inside flow
style and the parse fails. Quote the colour, or use block style. Cost one deploy.

### 🟡 `initial_view` values are exact

`list` is invalid and **silently falls back to `dayGridMonth`** (looks like the feature
was ignored). Valid, from `hui-calendar-card.ts:206-208`: `dayGridMonth`, `dayGridWeek`,
`listWeek`, `timeGridWeek`.

**`listWeek` only renders days that HAVE events** — FullCalendar's list plugin behaviour
(`ha-full-calendar.ts:65`), not a setting. Garrett wanted empty days visible, so **Home
is now `dayGridWeek`**. Schedule is `timeGridWeek` (the Google-style hour grid).

Per-calendar colours are auto-assigned by index and are **overridable per entity**
(`hui-calendar-card.ts:146` reads the entity registry's `calendar.color`).
**Per-EVENT Google colours are not exposed over the API and can never be mirrored.**

---

## 6. 🔴 Carry-forwards

### The nightly re-award — UNRESOLVED, check this first thing

The previous cold-open listed "a 2.0-point chore awarded 4.0" as never investigated.
**It is a real bug.** Rowan's ledger showed three chores re-firing within 120ms at
`2026-08-19T04:00:00Z`, carrying the **same `reference_id`s** as the Aug 17 manual
completions — daily chores replaying on the nightly reset with nobody doing them.
That is how 14.0 became 28.0 while the Pi sat idle.

Both kids are now 0.0. **The mechanism was NOT fixed.** Morning check:

```bash
ssh kitchencom 'sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ\"))
for k,v in d[\"data\"][\"users\"].items():
    if isinstance(v,dict): print(v.get(\"name\"), v.get(\"points\"), len(v.get(\"ledger\") or []))
"'
```
Still 0.0 → possibly a one-off tied to the Aug 18 restart, not a nightly job. Non-zero →
read the ledger timestamps and chase `chore_manager.py`'s reset path.

### Rowan's achievement progress was NOT zeroed

Points, ledger, `point_periods` and `cumulative_badge_progress` were cleared — but
achievement progress lives in the **achievement records**, not the user record. Rowan
still held Early Riser **2/5** and Chore Champion **6/250**, partly from the phantom
re-award. **Early Riser was zeroed** at Garrett's request (2026-09-01, late).
**Chore Champion `6/250` is still un-zeroed** — open if a clean slate is wanted.

### 🔴 The points-structure bug — a warning, not just history

Zeroing points naively **breaks the points sensor**, and it took two wrong fixes:

- ❌ `all_time: 0.0` (a float) → `AttributeError: 'NoneType'/'float' has no attribute 'get'`
- ❌ `point_periods: None` → same crash, and it silently broke Wystan too
- ✅ **Correct:** every level a dict, `all_time` **nested**:
  `{"daily":{},"weekly":{},"monthly":{},"yearly":{},"all_time":{"all_time":{"by_source":{},"points_earned":0.0,"highest_balance":0.0}}}`

`statistics_engine.py:526` does `period_data.get(data_key, {})`, so any non-dict crashes.
The failure presents as the **entity showing "Unavailable"**, with the real cause only in
`home-assistant.log`. **Read the log traceback before theorising** — that is what finally
solved it, after two guesses.

### Still open from before

- **Cook Dinner is Rowan-only** — the last asymmetric chore, and a 10-pointer, so a third
  of the earning potential Wystan cannot reach. Raised twice; never decided.
- **The mystery OAuth consumer** — something used the OLD client's secret 9 times in 8
  days while the Pi was off. Never identified. The old `KitchenCOM Cal` client and both
  its secrets were **left intact** deliberately. Do not delete them without finding it.
- **Tonight's ChoreOps changes are Pi-only.** `deploy/choreops-content/gen_content.py`
  still generates the OLD content (11 chores, old names/criteria). Regenerating from the
  repo **would overwrite tonight's decisions.** Fold them into the entry sheets first.
- **Lists tab is a stub** — Groceries + Shopping List, chosen by me from the entity list,
  not by Garrett. Other candidates exist (`todo.grocy_tasks`, `grocy_meal_plan`,
  `grocy_shopping_list`, `grocy_stock`, `grocy_batteries`). He wants to grow this.
- **Calendar colours are still auto-assigned** — Garrett asked for Google-like colour
  coding; setting them deliberately per entity is unfinished.
- 32 low-res Facebook photos still soften the screensaver.

---

## 6b. 🟢 Remote access — Tailscale (added 2026-09-02)

The Pi is on a tailnet so Garrett can work from his (Jamf-managed) work laptop while the
Pi stays home. Tailscale **1.102.3**, service enabled, survives reboot.

| | |
|---|---|
| Address | **`100.91.117.105`** (hostname `kitchencom`) |
| Account | `garrettdehart@gmail.com` — personal, deliberately not work SSO |
| HA | `http://100.91.117.105:8123` → verified **200** |

- **`--accept-dns=false` is deliberate** — Tailscale DNS would override the Pi's resolver,
  and the kiosk resolves the local HA instance. Use the `100.x` IP, not MagicDNS.
- **Tailscale SSH deliberately NOT enabled** — the existing `id_ed25519` key works.
- ✅ **Key expiry IS disabled** — console shows "Expiry disabled", node reports
  `KeyExpiry: None`. (Default had been `2027-03-01`.)
- The work Mac joined as `prvh9n63p0qvp` / `100.81.209.35` (macOS 15.7.7). Its
  system-extension approval succeeded despite Jamf MDM. The name is the hardware
  serial — worth renaming in the console.
- **SSH from the work Mac is not set up yet** — generate a key there and add it to the
  Pi's `authorized_keys` (`ssh-copy-id -i ~/.ssh/id_ed25519.pub garrettdehart@100.91.117.105`).
- On the work laptop: **generate a fresh SSH key**, don't copy the personal one onto an
  MDM-managed machine.
- ⚠️ Restarting HA / killing chromium remotely **blanks the live kitchen panel** the
  family is using. Prefer the dev rig for layout work; deploy in the evening.

---

## 7. Verification & recovery

**Every dashboard deploy needs the service-worker clear** — it bit repeatedly tonight;
a deploy can be perfect server-side and never reach the panel.

```bash
ssh kitchencom 'pkill chromium; sleep 3
P=/home/garrettdehart/.config/chromium/Default
sudo -u garrettdehart rm -rf "$P/Service Worker" "$P/Cache" "$P/Code Cache"
sudo -u garrettdehart rm -rf /home/garrettdehart/.cache/chromium
sleep 15; pgrep -c chromium'
```
**Keep `$P/Local Storage`** — the HA login lives there.

**Only a human looking at the panel counts.** Every layout defect tonight — stripped CSS,
crushed tile names, the `listWeek` fallback, "Unavailable" points — was found by Garrett
photographing the screen, never by server-side checks. Do not verify renders with browser
automation; it nulls `customElements` and reports success while verifying nothing.

**Rollbacks on the Pi (all made tonight):**

| File | Backup |
|---|---|
| dashboard | `dashboards/kitchen.yaml.bak-precss-20260901-2334` (and `-preshowcase-2230`, `-prelayout-2201`) |
| ChoreOps content | `.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-prebrush-20260901-2322` |
| " (pre-tuning) | `…bak-pretuning-20260901-2135` |
| " (pre-zero, has the 28.0 ledger) | `…bak-prezero-20260901-2119` |
| screensaver | `packages/screensaver.yaml.bak-pretimer-*` |

**Reading ChoreOps storage:** the live file is
`.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ` (a **directory** of files,
one live + backups). Chores/users are **dicts keyed by internal_id**, not lists.
Inline `python3 -c` with nested quotes breaks over ssh — **write a script and `scp` it**.

---

## 8. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

| File | Why |
|---|---|
| `kiosk-service-worker-serves-stale-js.md` | fired repeatedly tonight |
| `kitchen-yaml-contested-file.md` | this file was rewritten ~6 times; back up before touching |
| `choreops-content-is-generated-json.md` | the generator now DIVERGES from the Pi |
| `kiosk-admin-approval-hole.md` | kiosk is admin — anyone at the panel can approve |
| `pi-ssh-access-from-claude.md` · `pi-power-and-kiosk-login.md` · `pi-kiosk-wayland-labwc.md` | Pi access, power, kiosk |
| `second-pi-hijacks-route.md` | checked tonight, clean (`en0`) |
| `cards-must-be-bundled.md` | if a Lovelace card shows "Configuration error" |
| `concurrent-sessions-branch-hazard.md` | six worktrees |
