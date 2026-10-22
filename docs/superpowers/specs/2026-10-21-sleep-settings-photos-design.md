# Sleep Mode, Settings drawer, Photos overlay — design

**Date:** 2026-10-21
**Branch:** `feat/time-of-day-layouts`
**Status:** Phase A (§4–§5) BUILT + DEPLOYED 2026-10-21. **§3 Sleep Mode REVISED 2026-10-22** to "black, not off" after the §7 panel test; revised design approved by Garrett and reviewed.

---

## 1. Why

Borrowed from a commercial family display (Skylight-style) seen elsewhere. Three of
its functional pieces fill real gaps in ours:

- **Sleep Mode** — the panel has an idle screensaver but nothing that darkens it
  overnight.
- **A Photos page** — "why am I only seeing some photos?" has come up before
  (see memory `screensaver-photos-folder-and-formats.md`); nothing on the panel shows
  what is actually in rotation or what was skipped.
- **A slide-over settings drawer** — settings over the current view, not a separate page.

Explicitly **not** borrowed: the always-visible left nav rail (costs horizontal space
the Morning rework needs), photo delete, a "Sleep now" button.

**This reverses one earlier decision.** The hub spec (`2026-06-07-kitchencom-ha-hub-design.md`,
Kiosk 4d) and `deploy/kiosk/start-kiosk-wayland.sh:28-31` say the screen *never* blanks.
After this change that stays true during active hours; the sleep window is the one exception,
and only when Sleep Mode is enabled.

## 2. Shape

One new bundled card, **`panel-tools-card`**, placed on all three views of the
**`/kitchen-snapshot`** dashboard (the one the kiosk loads — not Home). It draws two
small corner icons:

- **⚙ Settings** → PIN prompt → right-side slide-over drawer (§4)
- **🖼 Photos** → full-screen overlay (§5). An overlay, not a view, so tod-autonav can
  never navigate away from it mid-use.

Taps inside the drawer and overlay must count as activity (the existing activity bridge),
so the screensaver does not fire while someone is adjusting things.

Bundled like the other cards (memory `cards-must-be-bundled.md` — bare `lit` imports make a
card unloadable). No HACS / card-mod / browser_mod on the Pi.

## 3. Sleep Mode — "black, not off" (revised 2026-10-22)

**Revised after the §7 panel test.** The original design switched the display off from a Pi
service (`wlopm`). On this hardware that cannot work: about 10 s after `wlopm --off` the
ViewSonic hotplugs and labwc switches the output back on (§7 "Result"). Garrett chose
**"black, not off"**, approach B: **during the sleep window the idle screensaver shows plain
black instead of photos.** The backlight stays on, so black glows faintly; Garrett accepted
that. There is **no Pi-side service, no `wlopm`, no HA token on the Pi, no wake layer, and no
woken flag**.

### Behaviour
- Sleep shows only when the panel is **already idle**: `kitchen_idle` on AND
  `binary_sensor.kitchen_sleep_window` on. It never blacks out a panel that is in use.
- The window opens while photos are showing → black right away. The window closes while the
  screen is black (morning) → photos resume.
- **A tap wakes it exactly as a screensaver tap does today.** `screensaver-card` already
  presses `input_button.kitchen_activity` on any input; the wake automation clears idle, and
  the screensaver overlay swallows the tap, so no chore tile is pressed.
- **The night wake is short.** While the window is on, the timer restarts at **2 minutes**,
  not at `kitchen_screensaver_minutes` (Garrett, 2026-10-22). Someone getting water at 2am
  doesn't light the kitchen for half an hour. Any further touch restarts the 2 minutes.
- **Sleep needs the screensaver.** The go-idle automation is gated on
  `input_boolean.kitchen_screensaver_enabled` (`screensaver.yaml:53-55`). With that switch off,
  `kitchen_idle` never turns on, so the panel never sleeps. The drawer says so (§4).

### HA side — new `packages/sleep.yaml`, plus a template change in `screensaver.yaml`
- `input_boolean.kitchen_sleep_enabled`, and `input_datetime.kitchen_sleep_start` /
  `kitchen_sleep_end` (time only). **No `initial:`** on any of them, so they restore across
  restarts. On first deploy sleep is off until it's turned on in the drawer.
- `binary_sensor.kitchen_sleep_window`: a **plain template binary_sensor, not trigger-based.**
  HA re-renders it every minute (it uses `now()`) **and immediately when any referenced helper
  changes**, so a drawer change takes effect at once. On when enabled AND now is inside
  [start, end):
  - `start < end`: start ≤ now < end. `start > end` (wraps midnight, e.g. 22:00→06:00):
    now ≥ start OR now < end.
  - **`start == end` → empty window, never on.** That includes 00:00→00:00.
  - **Raw values, no fallback.** Unlike `time_of_day.yaml:61-63`, a 0 timestamp is NOT
    treated as "unset": 00:00 is a real time someone may pick. An unavailable helper → off.
- `screensaver.yaml`: the **wake automation** (`:84`) and the **HA-startup automation**
  (`:105`) choose their `timer.start` duration by the window: `00:02:00` when
  `binary_sensor.kitchen_sleep_window` is on, otherwise the clamped
  `kitchen_screensaver_minutes` as now. The startup case matters because an HA restart at
  night forces `kitchen_idle` off (`:114`). The "screensaver enabled" automation
  (`:68`) is left alone: someone switching the screensaver on is awake anyway.

### `screensaver-card` — a sleeping state
- New config key `sleep_entity`, default `binary_sensor.kitchen_sleep_window`.
- A pure function **`displayState(hass, cfg) → "off" | "photos" | "sleeping"`** replaces the
  boolean `_active`: idle off → `off`; idle on and sleep entity exactly `"on"` → `sleeping`;
  otherwise `photos`. **Fail on:** a missing, `unavailable` or `unknown` sleep entity means
  NOT sleeping, so it shows photos.
- `updated()` reacts only to **changes** of that value:
  - → `photos`: `_startLoop()`.
  - → `sleeping` or `off`: `_stopLoop()`, which bumps `_gen`, clears timers and empties the
    current URLs. Going to `sleeping` **always** goes through `_stopLoop()`, so the existing
    generation guard discards any browse/resolve already in flight.
  - Idle turning on inside the window goes straight to `sleeping` and **never calls
    `_startLoop()`**: no media browse and no image decode at night.
- `_advance()` / `_skip()` check `state === "photos"`, not `_active`, so a late callback
  cannot put an `<img>` on screen while sleeping.
- `render()` for `sleeping`: the same fixed black `.overlay` (z-index 9999), with **no media,
  no `.fallback` gradient and no clock**. The activity bridge stays attached, so a tap wakes it.

### Failure modes — every unclear case shows something, never a stuck black screen in use
- Sleep sensor missing or unavailable → photos (fail on).
- Inactivity timer wedged, or screensaver switch off → never idle → never sleeps (fails on).
- HA restart at night → startup automation clears idle → lit for 2 min → black again.
- 4am chromium renderer restart → the page reloads into a sleeping card. A brief load flash,
  nothing worse; with no images decoded overnight the restart will rarely fire anyway.

## 4. Settings drawer

Behind a 4-digit parent PIN. The PIN lives in the card's config in `kitchen.yaml`.
**Kid-proof, not secure** — it is checked in the browser, and the kiosk's non-admin `Panel`
user can read it. **It is also committed to git**, because `kitchen.yaml` is tracked in this
repo. Same trade-off: fine for kid-proofing, so never reuse a real PIN here. That trade-off
was chosen deliberately (alternatives considered: theme open/rest PIN'd, admin-only via
phone, no gate).

Contents:

| Control | Entity | New? |
|---|---|---|
| Sleep on/off, From, To — top of the drawer. **When `input_boolean.kitchen_screensaver_enabled` is off, show a hint** ("Sleep needs the screensaver on") so a sleep setting can't silently do nothing | §3 helpers | new |
| Morning / Afternoon / Evening start | `input_datetime.kitchen_{morning,afternoon,evening}_start` | **exists** |
| Theme | `input_select.kitchen_theme` | **exists** |
| Screensaver delay | new `input_number`; restart of `timer.kitchen_inactivity` reads it instead of the hardcoded `duration: "00:30:00"` (`screensaver.yaml:25`) | new |

**Editable view times need no tod-autonav change.** The helpers already exist with no
`initial:` (`time_of_day.yaml:7-19`), the sensor template already reads them with fallbacks,
and `tod-autonav-card` only reads `sensor.kitchen_time_of_day` (`tod-autonav-card.ts:35`).
Edits take effect within one minute (the sensor's `time_pattern` trigger). The card's 14
tests are unaffected.

**Screensaver delay touches the idle chain**, which has failed silently before
(`screensaver.yaml:45-51`, the timer-wedges-in-idle case). Clamp the input_number to a sane
range and test the restart path explicitly.

## 5. Photos overlay

- Grid of everything in rotation, with a count.
- A notice listing **skipped files** (e.g. HEIC) and why.
- Rotation includes `.mp4` / `.webm` (`screensaver-card.ts:19`) — those get a placeholder
  tile, not a player.
- **Tap → hide.** Hidden photos are listed in the same overlay with an unhide control.
- **Hide/unhide is NOT behind the PIN** — chosen deliberately 2026-10-21. A kid can hide a
  sibling's photos; it is fully reversible from the same overlay, so a parent just unhides.
- **Reuse `screensaver-card`'s browse logic** (`selectPlayableChildren`, `selectSubdirectories`)
  so the overlay and the screensaver cannot disagree about what is in rotation.

### Hide = move the file, to a SIBLING folder
⚠️ **Not a subfolder of `photos/`.** The screensaver recurses into subdirectories
(`selectSubdirectories`, `screensaver-card.ts:85`), so `photos/hidden/` would stay in rotation.
Hidden files go to **`/config/media/photos-hidden/`**.

Moving files needs something running inside the HA container:
- `shell_command` calling a fixed script that takes a **bare filename only** — reject any
  `/`, `..`, or leading dot; resolve and verify the result is inside the expected folder.
- **The filename travels hex-encoded.** With a template, HA renders the command and splits it
  shell-style (`shlex.split`), then runs it without a shell. Quoting `"{{ name }}"` survives
  spaces but breaks on a filename containing a quote. So the card sends the name as **hex**
  (`[0-9a-f]` only — nothing to split or quote); the script decodes it, then applies the
  bare-filename checks above. Every real filename works, including spaces, quotes and
  apostrophes ("Rowan's birthday.jpg"). On any rejection the overlay shows the error.
- **Hex means UTF-8 bytes.** Card: `TextEncoder` → bytes → hex. Script:
  `bytes.fromhex(arg).decode('utf-8')`. Hex-encoding JS char codes breaks on accents and emoji.
- **Derive the filename from the media-source id exactly as `screensaver-card` does**, and
  decode percent-encoding exactly once. If either side leaves it percent-encoded (or decodes
  twice), the move fails on a perfectly valid file. Test with a filename containing a space
  and an apostrophe.
- Unhide on a name collision → add a suffix, never overwrite.
- Operates on the **real container path** `/config/media/photos` (`configuration.yaml:14-17`:
  `media_dirs.local: /config/media`, `media_path: photos`), not the `media-source://` id.
  ⚠️ Two memory notes disagree: `screensaver-photos-folder-and-formats.md` (2026-09-04) says
  `photos/`, while `screensaver-media-mount-boundary.md` records the older `media/media/`
  layout from the original 2026-08-17 fix. `photos/` is most likely current. **Confirm on the
  Pi before building**: `ssh kitchencom 'sudo docker exec homeassistant ls /config/media'`,
  then correct the stale note.
- Means a `configuration.yaml` change + HA restart; new entities can take 60–90 s to appear
  (memory `ha-yaml-entities-appear-late.md`) — don't misread that as a dropped config.

### Memory budget
The chromium renderer already leaks enough to need a nightly restart
(memory `kiosk-spinner-after-screensaver.md`). A grid of full-resolution `resolve_media` URLs
would make that worse:
- lazy-load (`loading="lazy"`, `decoding="async"`), small page size (cap per page, paginate)
- **drop all grid `<img>` elements when the overlay closes**
- resolved URLs are signed and expire (`screensaver-card.ts:275`) — re-resolve on reopen

## 6. Deployment constraints

Same as the Morning rework spec §6: `kitchen.yaml` is contested — rebuild from the **live
Pi file** with a timestamped backup; needs the home network (`nc -z -G 6 192.168.1.234 22`);
unregister the service worker after a card deploy; a human at the panel verifies.

## 7. Panel test — gates the build

> **2026-10-22: run, and it changed the design.** The output-off approach failed (see "Result"
> below); §3 was rewritten as "black, not off". The steps are kept as the record of what was run.

The real risk is the **ViewSonic**, not Chromium: TD1655 touch already needs a hub to enumerate
at all (memory `viewsonic-touch-needs-hub.md`), and in standby the monitor may cut power to its
touch controller — then nothing receives the tap.

Run over SSH with Garrett at the panel to tap. Leave ~1 min in standby before step 2 — the
monitor may take a moment to drop into standby and cut touch power.

⚠️ **Make every test tap harmless.** During the test `kitchen_should_sleep` is off, so the wake
layer is NOT there. A tap on the dark screen lands on whatever is underneath — on Morning, a
chore tile. **Before step 1, turn `input_boolean.kitchen_idle` on** so the screensaver is
definitely covering the dashboard (or run the test on a view with nothing tappable under the
test spot).

0. Baseline: `libinput list-devices` with the screen on — note the touch device's name.
1. `wlopm --off '*'`, wait ~1 min
2. `libinput list-devices` — is the touch device **still listed**?
3. `libinput debug-events` while tapping — do events arrive?
4. Does Chromium receive the tap? The screen is dark, so you can't watch it — check HA
   instead: tap the screensaver, then see whether `input_button.kitchen_activity`'s state (its
   last-pressed timestamp) changed, via the HA API or Developer Tools on a phone.
5. `wlopm --on '*'`
6. **`libinput list-devices` again, then tap a harmless control.** Does touch **come back**
   after wake? The ViewSonic's touch only enumerates through a hub; if standby drops the device
   and wake doesn't restore it, every sleep night would leave the panel touch-dead until a
   replug or reboot.

Outcomes:
- **6 fails → Sleep Mode cannot ship as designed, whatever 2–4 showed.** Reconsider (e.g.
  dimming instead of output-off, if the panel supports it).
- 2–4 and 6 pass → design as written.
- 2–3 pass, 4 fails → evdev fallback (§3), with the script making both wake service calls.
- **2 or 3 fails**, 6 passes → no tap-to-wake; the panel wakes at sleep end only. (Listed but
  silent is the same as gone.)

### Result — run 2026-10-22 00:03–00:10 UTC and 11:15 UTC, Garrett at the panel

**An outcome the list above did not anticipate: output-off does not STICK.** Phase B as
designed (wlopm output-off) cannot ship; Phase B is paused for a redesign.

- Step 0: touch = `G2Touch Multi-Touch`, `/dev/input/event5` (behind the RTS5411 hub).
- `wlopm --off '*'` succeeds and reports `off` — then **~9.5 s later the ViewSonic drops and
  re-announces itself** (two `drm` `change` uevents on `card1`, caught with
  `udevadm monitor --kernel --subsystem-match=drm`), and the output reads `on` again.
  Reproduced 3×. Garrett: the screen **never visibly went dark** — the monitor never reached
  standby inside that window.
- **It is labwc (0.9.2), not kanshi:** with both kanshi processes killed, the same ~10 s
  off→on happened, with the same 2 drm events. kanshi's active `config` is empty anyway.
- Step 2: touch device still listed while off. Steps 3–4: inconclusive — no taps landed in the
  ~10 s window; `input_button.kitchen_activity` unchanged.
- **Step 6: PASS** — touch works normally afterwards. No touch-dead panel.
- Re-asserting `off` after each hotplug would flash the screen on every ~10 s — not viable.

**Route:** redesign sleep as **"black, not off"** — a full-screen black layer (touch stays
live, so tap-to-wake is trivial), optionally plus DDC/CI brightness-down (`ddcutil` not
installed yet; `/dev/i2c-13`, `/dev/i2c-14` exist; whether the TD1655 honours DDC over this
link is untested). Needs Garrett's design decision before Tasks 14–20 are rewritten.

## 8. Out of scope

Nav rail; photo delete; "Sleep now"; uploading photos from the panel; the Morning rework
(separate spec, two open decisions of its own); **turning the display off or dimming it via
DDC/CI** (§7 Result; Garrett accepted the backlight glow 2026-10-22); a clock while sleeping.
