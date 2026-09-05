# Cold-open — chores work end to end (2026-08-17, evening)

**Branch:** `feat/choreops-chores`
**Read this first.** Every number below has the command that verifies it.

---

## 🟢 START HERE — the system WORKS

**The promise is delivered.** A kid claims a chore on the ViewSonic panel, a parent approves from
their phone, and points move. Verified live tonight — Rowan went `None → 4.0 → 14.0` across
repeated claim/approve cycles.

Runbook §1–§5 are **done**. What remains is optional cleanup and the next feature.

**The next action is a choice, not a queue:**
- **§8 Google Calendar OAuth on the Pi** — the last runbook item.
  Follow `docs/session-state/2026-08-14-google-calendar-oauth-setup.md` §3 and §3b exactly.
- **ChoreOps dashboard layout** — improved but not finished; see §6. Garrett wants to revisit.
- **Voice slice / compliment-insult app** — design docs exist, no implementation.

**Runbook:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-17-monday-pi-runbook.md`

**Also working now:** the **screensaver** (photos cycling, and portrait photos **pairing side by
side** rather than centre-cropping), the Kitchen dashboard renamed from "Kitchen (snapshot)", and
a **Samba share** for drag-and-drop photo uploads. See §4a and §4b.

---

## 1. Where is HEAD?

- **HEAD (tip):** deliberately NOT frozen here — run `git log --oneline -1`. A close-out commit
  cannot stamp its own SHA, and stamping the tip is itself a commit, so the loop never converges.
- **Stable prefix of this arc** (immutable, verifiable): `ee43ab3` (cold-open fix-up) → `b3cecbc`
  (photos folder + Samba) → `0ac1eac` (portrait pairing) → `5a70e2d` (seek partner) → `a262e1d`
  (probe ahead) → `ec32213` (service-worker docs) → `c46c746` (resolve-before-probe — **pairing
  confirmed working on the panel**).
- **Branch:** `feat/choreops-chores`, in the **primary checkout** `/Users/jdehart1/___Code_DEV/KitchenCOM`
- **Ahead of `origin/main`:** run `git rev-list --count origin/main..HEAD` — it was 53 at
  `c46c746`. A number that counts the commits it lives inside cannot be frozen correctly.
- **Unpushed:** run `git log --oneline origin/feat/choreops-chores..HEAD | wc -l`.

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current                      # feat/choreops-chores
git rev-list --count origin/main..HEAD         # authoritative; 53 at c46c746
git log --oneline origin/feat/choreops-chores..HEAD | wc -l   # 0
```

### Worktrees — FIVE checkouts now, do not cross them

| Path | Branch | What lives there |
|---|---|---|
| `/Users/jdehart1/___Code_DEV/KitchenCOM` | `feat/choreops-chores` | **chores work (here)** |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox` | `fort-knox` | parental controls — **active concurrent session** |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-voice` | `feat/voice-slice` | voice slice (empty) |
| `…/KitchenCOM/.worktrees/main-merge` | `main` | project-wide docs |
| `…/KitchenCOM/.worktrees/grocy-chores` | detached `f2e561c` | older experiment |

**`fort-knox` moved `1c4d434 → 7fa0f43` during this session.** Leave it alone.

---

## 2. Empirical state — the Pi

**Verified 2026-08-17 evening. The Pi is HOME, on the home LAN.**

| Item | Value |
|---|---|
| Reachable as | **`ssh kitchencom`** — plain, no tunnel |
| Pi IP | `192.168.1.234` (reserved), also `kitchencom.local` |
| HA version | **2026.6.3** |
| ChoreOps version | **1.0.7** (the vendored `reference/ChoreOps-main` is 1.0.8 — *ahead* of the Pi) |
| HA container | `homeassistant`, Up |
| Live storage key | `choreops_data_01KXV33Q540SYEF1KFM54DCEDJ` |
| Touch panel | **working** — see §5 for the cable |

**The `kitchencom-eth` / link-local / SSH-tunnel path from the previous cold-open is OBSOLETE.**
It only applied while the Pi was at the work office.

### ChoreOps content + dashboard

| Field | Count |
|---|---|
| users / chores / rewards | 4 / 11 / 16 |
| bonuses / penalties / achievements / badges | 4 / 2 (negative) / 3 / 6 |
| choreops entities | **286** |
| `lovelace.cod_chores` | **exists** — 3 views: Rowan, Wystan, OpsCenter |

```bash
ssh kitchencom 'sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KXV33Q540SYEF1KFM54DCEDJ\"))
x=d[\"data\"]
print({k:len(x[k]) for k in [\"users\",\"chores\",\"rewards\",\"bonuses\",\"penalties\",\"achievements\",\"badges\"]})
"'
ssh kitchencom 'curl -s -o /dev/null -w "cod-chores HTTP %{http_code}\n" http://localhost:8123/cod-chores'
```

---

## 3. 🔴 The approval model — READ BEFORE CHANGING ANY LOGIN

This is the most important thing this session established. **Do not undo it.**

**Two HA users now exist, deliberately:**

| User | Group | Used by | Can approve? |
|---|---|---|---|
| `KitchenCom` | `system-admin` (owner) | parents' phones/laptops | **YES** |
| `Panel` | `system-users` (non-admin) | **the ViewSonic kiosk** | **NO** ← the point |

**Why:** the kiosk used to run as `KitchenCom`, so *anyone touching the panel inherited parent
admin rights and could approve their own claims*. Garrett found this during the acceptance test —
a kid could tap Claim then tap the approve check and award themselves points.

**The mechanism** (`helpers/auth_helpers.py`): `_has_management_authority` short-circuits on
`if user.is_admin: return True`. Approval was never unguarded — the *panel simply held an admin
identity*. Making the kiosk non-admin closes it at the cause.

**Kiosk mode is a SEPARATE axis and must stay ON.** `CONF_KIOSK_MODE` only skips the *assignee*
check on claim (`button.py:623`) and redeem (`button.py:1078`) so unlinked kids can claim at all.
Turning it off breaks claiming and does nothing for approval.

**`admin_approval_bypass: false` does NOT fix it — empirically ruled out.** Garrett and Rebecca
both have `can_approve=True` and both link to the *same* `ha_user_id` `487379b1…`, which is the
`KitchenCom` account. The check just falls through to the explicit record and the panel passes.

```bash
ssh kitchencom 'sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/auth\"))
for u in d[\"data\"][\"users\"]:
    if u.get(\"system_generated\"): continue
    print(u.get(\"name\"), u.get(\"group_ids\"))
"'   # expect KitchenCom=['system-admin'], Panel=['system-users']
```

**If the kiosk ever gets logged back in as `KitchenCom`, the hole reopens silently.**

---

## 4. What shipped this session

1. **§4 Dashboard Generator** — `cod-chores` created: 3 views (Rowan, Wystan, OpsCenter),
   `user-gamification-premier-v1`, kids-only assignees, HTTP 200.
2. **Kiosk mode enabled** so unlinked kids can claim.
3. **§5 nav button deployed** — `kitchen.yaml` scp'd, `check_config` exit 0, HA restarted,
   kiosk Chromium respawned. "Chores" button live on the Kitchen panel.
4. **§6 Task 11 acceptance test PASSED** — claim → approve → points moved.
5. **Approval hole found and fixed** — non-admin `Panel` user now drives the kiosk (§3).
6. **`internal_url` set** to `http://192.168.1.234:8123` (was unset; iOS app reconnect flakiness).
   Mirrored into the repo's `homeassistant/configuration.yaml`.
7. **Runbook corrected** (`4a18cdf`) — underscore filename, kiosk-mode requirement, version fact.

---

## 4a. Later-evening work (screensaver + dashboard rename)

1. **Screensaver FIXED — it had never once shown an image.** Two stacked causes:
   - `media_source`'s default root is the **container's** `/media`, which is **empty** (only
     `/config` is bind-mounted). The 26 photos sat in `/config/media`, invisible to media_source.
   - The card coerces an empty `media_path` back to `"media"`
     (`custom_cards/screensaver-card/src/screensaver-card.ts:43`), so it always browses
     `local/media`.

   Fix (`2931ba8`): `media_dirs: {local: /config/media}` + photos moved to `/config/media/media/`.
   **A third, simpler cause of "no screensaver on the panel":** the kiosk had been navigated to
   `/cod-chores`, where the card does not exist. `pkill chromium` returns it to Kitchen.

2. **Kitchen dashboard renamed** (`4b1b7a8`) — "Kitchen (snapshot)" → "Kitchen". Despite the old
   name it is **not** a backup: there is no storage-mode default dashboard and the kiosk loads it.
   `url_path` stays `kitchen-snapshot` because `start-kiosk-wayland.sh` hardcodes it.

3. **Task 10 done** (by Garrett) — the orphaned `local_todo` "Chores" entry is deleted; Groceries
   remains.

4. **ChoreOps layout partly improved** via the dashboard's own **gear panel** (`row_variant`
   `standard` → `kids`). Still not ideal on 1920x1080 — see §6 carry-forwards.

---

## 4b. Screensaver portrait pairing — WORKING (2026-08-18)

Portrait photos now pair two-up filling the 1920x1080 frame instead of being centre-cropped. A
portrait with no partner within `PARTNER_SEEK_LIMIT` (40) renders contained over a blurred copy of
itself. Landscape and video are unchanged: solo, full frame.

**It took five fixes, and the reason is worth keeping.** Each was a real defect, but 97 unit tests
stayed green throughout because they feed the pure planner (`planSlot`) pre-classified fixtures —
they cover the POLICY and never the wiring that feeds it. The three wiring bugs, in order found:

1. Pairing required two portraits to be ADJACENT in the list (`0ac1eac` → fixed `5a70e2d`).
2. `_ensureOrientation` only probed item+1, so seek candidates stayed `"unknown"` (`a262e1d`).
3. **The last and decisive one** (`c46c746`): the probe needs a resolved url, but only the item at
   the cursor is passed through `resolve_media`. Seek candidates had `url === undefined`, so the
   probe stamped `"unknown"` and returned — and `planSlot` refuses to pair with unknown. The stamp
   was cached, so those photos stayed unpairable all session.

**What located it:** Garrett reported the blurred SOLO portrait rendering correctly. contain-blur
only renders after a successful decode AND a `"portrait"` classification, which proved detection
and both render paths already worked and narrowed the fault to partner lookup alone. **One
observation from the panel beat four rounds of server-side verification.**

### Photo quality — the panel is 1920x1080, the photos are the limit

`wlr-randr`: ViewSonic TD1655, **1920x1080 @ 60Hz, scale 1.0**, no upscaling. Pi headroom is not a
constraint (5.9 GB RAM free, 101 GB disk).

**32 of 122 photos are 960x720 or smaller** — Facebook downloads (filenames like
`35265966_10155769...`), compressed before they ever reached the Pi. Upscaled 2x to fill the frame
they look soft. Nothing on the Pi or panel causes this.

| Use | Minimum | Ideal |
|---|---|---|
| Landscape (full frame) | 1920x1080 | **2560x1440** |
| Portrait paired (half width) | 960x1080 | **1440x1620** |

Do NOT downscale before uploading — phone photos are already plenty and the browser downscales
well but cannot upscale detail. Past ~2560px wide there is no visible gain, only decode cost.

### 🔴 macOS writes `._` junk to the SMB share and it sorts to the FRONT

HA sorts media by title (`local_source.py:270`), and `._` sorts before letters and digits — so
AppleDouble sidecars become **the first things the slideshow tries to display**. 39 of them were
present on 2026-08-18 and the first real portrait sat at index 41; after deleting them it was at
index 2.

```bash
ssh kitchencom 'D=/home/garrettdehart/homeassistant/media/photos
sudo find "$D" -name "._*" -delete; sudo find "$D" -name ".DS_Store" -delete
ls -A "$D" | wc -l'
```
Prevention is in two places: `veto files` + `delete veto files` in the `[photos]` share, and
`defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true` on the Mac (set
2026-08-18; **requires unmount/remount to take effect**).

### Adding photos

- **Samba (set up 2026-08-18):** Finder ⌘K → `smb://192.168.1.234/photos`, user `garrettdehart`,
  password set via `smbpasswd` (interactive — needs a REAL terminal; the `!` prefix has no TTY and
  fails with "Unable to get new password").
- **HA media browser:** Media → My media → photos. No setup, works from a phone.
- Photos must land in `/config/media/photos/` — see §4a for why the path is what it is.

---

## 4c. Daily quotes — SHIPPED (2026-08-18)

The **Perspective** card on the Kitchen dashboard, third column below Chores. Confirmed rendering
on the panel. Rotates hourly.

| Piece | Where |
|---|---|
| Script + dataset + 30 tests | `deploy/quotes/` (see its README) |
| Sensor | `homeassistant/packages/quotes.yaml` |
| Card | `homeassistant/dashboards/kitchen.yaml` |
| Spec / plan | `docs/superpowers/specs/2026-08-18-daily-quotes-design.md`, `docs/superpowers/plans/2026-08-18-daily-quotes.md` |
| On the Pi | `/config/quotes/pick_quote.py` + `quotes.json` |

Sources: ~65% local 5,421-quote dataset, ~35% ZenQuotes. Affirmations.dev was dropped after
measurement (25 fetches → only 17 unique). Quotable excluded: TLS cert expired 2024-09-10.
Quoteverse (RapidAPI, 28k quotes) is a deferred candidate — it needs an API key, so it brings
secret handling this design does not have.

### 🔴 A command_line sensor CANNOT be verified from storage files

`command_line` sensors have **no `unique_id`** — that key is not in the schema for HA 2026.6.3 and
adding it fails `check_config`. Consequently they never appear in `core.entity_registry`, and they
are not restore-backed either, so they never appear in `core.restore_state`. **Both files will
tell you the sensor does not exist even when it is working perfectly.** Verify by looking at the
panel, or by querying HA's API with a token. Time was lost here believing the sensor had failed.

`check_config --info all` IS a useful check — it confirms the package resolved:
```bash
ssh kitchencom 'sudo docker exec homeassistant python -m homeassistant --script check_config \
  --config /config --info all 2>&1 | grep -A4 command_line'
```

### Other gotchas worth keeping

- **`scan_interval: 3600` is load-bearing** — `command_line` defaults to **60 seconds**, which
  would mean ~1,440 ZenQuotes calls a day.
- **cwd is `/` when HA runs the command**, not the script's directory — hence the
  `os.path.dirname(os.path.abspath(__file__))` dataset path.
- **The local dataset was cp1252, not UTF-8.** Converted once at prep time; a test asserts
  non-ascii survived so mojibake cannot silently reach the wall.
- **Each `docker exec` is a separate shell** — an `mv` in one call does not persist into the next,
  which made a failure-path test appear to pass while proving nothing.

---

## 5. Traps and corrections

### 🟡 The dashboard file uses an UNDERSCORE

`url_path` is `cod-chores` (hyphen); the storage file is **`lovelace.cod_chores`** (underscore).
Checking the hyphen filename reports MISSING on a dashboard that exists. Verify the registry:

```bash
ssh kitchencom 'sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/lovelace_dashboards\"))
print([(x.get(\"url_path\"), x.get(\"title\")) for x in d[\"data\"][\"items\"]])
"'
```

### 🔴 A second Pi steals the route to `192.168.1.234`

When the Fort Knox Pi is plugged into the laptop, macOS routes `192.168.1.234` out that interface
(`en22`) instead of wifi. `ssh kitchencom` times out and `ping` gets 100% loss **while the Pi is
perfectly healthy**. The tell:

```bash
route -n get 192.168.1.234 | grep interface   # en22 instead of en0 = collision
curl --max-time 8 --interface en0 -o /dev/null -w "%{http_code}\n" http://192.168.1.234:8123/   # 200
```

Workaround: `ssh -b $(ipconfig getifaddr en0) kitchencom '...'`

**Do not misattribute this to the laptop's wifi.** The laptop genuinely drops wifi 2–3×/day
(separate, unsolved, ~since 2026-07). Distinguish them: `networksetup -getairportnetwork en0`
saying "not associated" is the *wifi* failure; a good association plus a timeout is the *route*
failure.

### 🟡 Touch needs a USB hub AND an old printer cable

`Pi USB-A → USB hub → USB-A-to-C → monitor USB-C`. The **Pi→hub upstream leg is a USB-B printer
cable** — easy to lose in a bag and not a cable anyone expects to still need. After a move, if
touch is dead: check `lsusb` for the hub (Realtek RTS5411). **Hub absent while mouse/keyboard
still enumerate = the break is upstream of the monitor**, so swapping monitor-side cables is
wasted effort.

### 🟢 `Brush Teeth` shows `state=independent` — not a bug

That's a distinct chore state, not a failed claim. Only `Feed Cats` was claimed in testing.

### 🟡 `claimed_by` is empty under kiosk mode — expected

Kiosk mode bypasses the assignee check, so ChoreOps has no identity to record. The system knows
*a* claim happened, not *who* tapped. Parent approval is the control. Trade-off accepted knowingly.

### 🔴 A card deploy can look PERFECT server-side and never reach the panel

**Clear the SERVICE WORKER, not just the HTTP cache.** HA registers a service worker whose
CacheStorage sits *in front of* the HTTP cache, so it can serve stale card JS despite **all** of:
a `?v=N` bump in `lovelace_resources`, an HA restart, `pkill chromium`, and deleting
`Cache`/`Code Cache`. On 2026-08-17/18 four consecutive screensaver-card deploys verified clean
server-side — matching md5 on disk AND on the served URL, bumped `?v=`, HA and kiosk restarted —
while the panel kept running old behaviour. `Service Worker/` had never once been cleared.

```bash
ssh kitchencom 'pkill chromium; sleep 3
P=/home/garrettdehart/.config/chromium/Default
sudo -u garrettdehart rm -rf "$P/Service Worker"        # <- the one always missed
sudo -u garrettdehart rm -rf "$P/Cache" "$P/Code Cache"
sudo -u garrettdehart rm -rf /home/garrettdehart/.cache/chromium
sleep 12; pgrep -c chromium'
```
**Keep `$P/Local Storage`** — the HA login lives there; deleting it forces a panel re-login.

**Status is honestly "unconfirmed", not "fixed".** The service worker was definitively never
cleared, so it is a real gap. Whether it *caused* the inert deploys was never verified, because
the session ended without reading the browser console. Rule it out first; do not assume it.

**The rule that follows: server-side verification cannot prove a browser-side outcome.** Four
fixes were declared done on md5 matches plus 97 passing unit tests. The tests fed the pure
planner pre-classified fixtures, so they covered the policy and never the wiring that feeds it —
a broken integration stayed green throughout. **Get the browser console before shipping another
card fix.** Cheapest route: open `http://192.168.1.234:8123/kitchen-snapshot` on a LAPTOP (not the
Pi), DevTools → **Console** tab (not Network), filter on the card's log prefix. There is no
remote-debugging port on the kiosk.

### Standing traps (unchanged, still true)

- **A deployed file is not a running file.** The kiosk caches hard: `ssh kitchencom 'pkill chromium'`
  (supervisor respawns). Has bitten three times.
- **Do NOT verify HA renders with browser automation** — it nulls `customElements`, renders no
  dashboard, and reports 0 errors while verifying nothing. Only a human looking at the panel counts.
- **`reference/ChoreOps-main/` is a nested git repo** and Bash cwd persists. Use absolute paths.
- **Pi power:** its own 27W brick into the wall. Never chain through the ViewSonic or a laptop dock.
- **`trusted_networks` does NOT work for kiosk auto-login** — HA always returns a "pick user" form
  step the kiosk can't auto-submit. Documented in the Pi's `configuration.yaml`. Don't retry it.

---

## 6. Carry-forwards

- ~~**Task 10:** delete the orphaned `local_todo` "Chores" entry~~ **DONE 2026-08-17.** Was:
  (`config_entry 01KV69CAFQ`) at `/config/integrations/integration/local_todo`.
  **Delete only "Chores" — leave "Groceries".** Backed up two places:
  `deploy/backups/local_todo.chores.ics.bak-20260817` and on the Pi at
  `.storage/local_todo.chores.ics.bak-predelete-20260817-1723`. Contents are June wiring-test
  items only. Purely cosmetic.
- ✅ ~~stale/broken `dist/screensaver-card.js`~~ **RESOLVED 2026-08-18.** It was the pre-bundling
  build with a bare `lit` import, and `test/dist-browser-loadable.test.ts` was FAILING on it.
  Rebuilt with vite; dist is self-contained and the guard test passes. **`dist/` is gitignored in
  the sibling grocy card but committed here — rebuild before deploying rather than trusting it.**
- **ChoreOps dashboard layout is improved but not finished.** The panel is **1920x1080 landscape**;
  `user-gamification-premier-v1` is authored at `max_columns: 2` for a portrait tablet, hence the
  side whitespace and vertical overflow. Improved by switching `row_variant` `standard` → `kids`
  in the dashboard's own **gear panel** (per-user, reversible, no regeneration). Not yet tried:
  raising `pref_column_count_*` / `pref_settings_column_count_wide`, or regenerating on
  `user-chores-lite-v1` / `-essential-v1` (both `max_columns: 4`). **Trade-off if you switch
  templates:** lite/essential drop most gamification display — premier has 423 badge / 139
  achievement refs, lite has none. The content survives either way; only the display changes.
  A pre-layout backup of the working dashboard is at
  `deploy/backups/lovelace.cod_chores.bak-20260817-prelayout.json` (785,446 B) and on the Pi.
- **"Not my turn" rows are rotation working, not a bug.** 7 of 11 chores are `completion_criteria:
  rotation_smart` shared between both kids, and all 7 currently show **Wystan**'s turn — so Rowan's
  view is mostly blocked rows. Three options: the gear panel's **blocked** toggle (hides
  `not_my_turn` + `completed_by_other` + `missed` together, per-user, instant), regenerate with
  `pref_exclude_states: ['not_my_turn']` for finer control, or switch those chores to
  `independent` so either kid can claim anything. **The last one is a parenting call, not a
  technical one** — with rotation, Rowan cannot take out the trash for points even if willing.
- **Rewards as its own page** — Garrett raised it; deferred, not designed.
- **Per-kid summary cards on the Kitchen dashboard** — Garrett asked for a simplified at-a-glance
  view per kid on the Kitchen panel. **Not started.** `kitchen.yaml` is version-controlled and
  never overwritten by the generator, so it is the right home for it.
- **Shuffle is OFF** on the screensaver, so playback is strictly alphabetical and every kiosk
  restart resets to index 0 — you see the same opening sequence each session. With the `._` junk
  cleaned the first portrait is at index 2, so this is no longer a problem, but turning shuffle on
  (`shuffle: true` on the card in `kitchen.yaml`) is a one-line change if the order gets stale.
- **32 photos are low-resolution Facebook downloads** (960x720 or smaller) and look soft on the
  1080p panel. Replacing them with originals is the single biggest available quality win. See §4b.
- ✅ ~~Daily quotes~~ **SHIPPED 2026-08-18 and confirmed rendering on the panel.** The
  "Perspective" card on the Kitchen dashboard, hourly, ~65% local dataset / ~35% ZenQuotes, with a
  whole-word content blocklist. Spec, plan, and `deploy/quotes/README.md` all committed.
  30 tests; spec-compliance and code-quality reviews both passed.
- 🔴 **The calendar card on the Kitchen dashboard SPINS FOREVER.** It references
  `calendar.family`, which **does not exist on the Pi** — Google Calendar was never set up there.
  The only calendars present are `calendar.rowan_choreops_calendar`,
  `calendar.wystan_choreops_calendar`, and `calendar.grocy_calendar`. Confirmed 2026-08-18:
  `application_credentials` does not exist in `.storage`, so no OAuth client was ever added.
  **§8 fixes this at the cause** — Garrett chose that over patching the card to a different entity.
- **§8 Google Calendar OAuth on the Pi** — not started. Follow
  `docs/session-state/2026-08-14-google-calendar-oauth-setup.md` §3 and §3b exactly; it documents
  a redirect-URI trap and an autofill trap that hit TWICE on the dev rig. The dev rig's OAuth does
  NOT carry over. Requires Google Cloud Console and a browser sign-in — not automatable. Dev-rig OAuth does not carry over.
- **`Wystan` has `points=None`** while Rowan has a number. Benign — the field initializes on first
  award (proven by Rowan going `None → 4.0`). It will resolve the first time Wystan is approved.
- **Rowan sat at 14.0 points** after testing. If you want a clean slate before the kids see it,
  zero it deliberately; don't let a test balance masquerade as earned.
- **Reward at 4.0 points for a 2.0-point chore** — `Feed Cats` is 2.0 but the first approval moved
  Rowan to 4.0. Probably a multiplier or bonus; **not investigated.** Worth understanding before
  the kids notice the math.
- **`internal_url` is set in YAML but `.storage/core.config` still reads `None`.** That's expected
  for YAML-set values, but it was **not independently proven** that the running instance uses it.
  `check_config` passed and no warnings appeared. The phone will demonstrate it.
- **Dev rig is DOWN** and was not needed. Docker Desktop is off after the reboot. The Pi is the
  real target; the rig only mattered when the Pi was unreachable.
- **`main`'s cold-open (`docs/session-state/README.md`) is STALE** — dated 2026-08-14, still frames
  Tuesday 2026-08-18 as a hard deadline. **Garrett de-emphasized that on 2026-08-17** — the goal is
  full functionality, not a date. Rewrite from main's perspective at merge time.
- **Two branches have design docs, no implementation:** `fort-knox` (active concurrent session) and
  `feat/voice-slice` (empty; research in the prior cold-open §7).

---

## 7. Memory-layer entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

| File | Why it matters here |
|---|---|
| `kiosk-admin-approval-hole.md` | **the §3 approval model — read before touching any login** |
| `second-pi-hijacks-route.md` | the `en22` route collision and the `ssh -b` workaround |
| `viewsonic-touch-needs-hub.md` | the hub requirement + the printer-cable reassembly note |
| `choreops-content-is-generated-json.md` | content comes from `gen_content.py`; penalties negative |
| `pi-ssh-access-from-claude.md` | `.234` reservation, macOS Local Network permission |
| `pi-power-and-kiosk-login.md` | the 27W-brick rule; kiosk "keep me logged in" |
| `pi-kiosk-wayland-labwc.md` | labwc autostart, `start-kiosk-wayland.sh`, respawn behavior |
| `concurrent-sessions-branch-hazard.md` | **five worktrees now** — verify branch before every commit |
| `cards-must-be-bundled.md` | if a Lovelace card shows "Configuration error" |
| `dev-ha-rig-for-offline-choreops.md` | port 8124 rig — down, and not needed while the Pi is home |
