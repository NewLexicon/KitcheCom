# Sleep Mode, Settings drawer, Photos overlay — design

**Date:** 2026-10-21
**Branch:** `feat/time-of-day-layouts`
**Status:** design agreed in brainstorming + one review pass; **panel test (§7) gates the build**

---

## 1. Why

Borrowed from a commercial family display (Skylight-style) seen elsewhere. Three of
its functional pieces fill real gaps in ours:

- **Sleep Mode** — the panel has an idle screensaver but nothing that turns the
  display off overnight.
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

## 3. Sleep Mode

### HA side (new package)
- `input_boolean.kitchen_sleep_enabled`
- `input_datetime.kitchen_sleep_start`, `input_datetime.kitchen_sleep_end` (time only;
  window may wrap midnight — reuse the wrap logic pattern in `time_of_day.yaml`)
- a "woken" override (e.g. `input_boolean.kitchen_sleep_woken`) — set by a wake tap,
  cleared at the next sleep start
- `binary_sensor.kitchen_should_sleep` (template) = enabled AND inside window AND NOT woken

### Wake tap must not press anything
While `kitchen_should_sleep` is on, `panel-tools-card` draws a **full-screen transparent
layer above everything**. A tap on it sets the woken override and does **nothing else**.
With the screen dark a finger lands on whatever is underneath — on Morning that is a chore
tile, so without this layer waking the panel could claim a chore.

**The screensaver is almost certainly up too** — the sleep window is long past the 30-min
idle timeout, so `input_boolean.kitchen_idle` is on and `screensaver-card`'s full-screen
overlay is showing. The wake layer must sit **above the screensaver overlay** and **owns the
tap**: it sets the woken override, presses the existing activity button
(`input_button.kitchen_activity`, which clears idle exactly as a normal screensaver tap does),
and stops the event there. One tap = screen on + screensaver dismissed + dashboard showing;
nothing beneath receives it. Both cards are separate shadow roots inside HA's card wrappers,
so **verify the stacking on the real panel** — a transformed ancestor can trap a
`position: fixed` layer below the screensaver's.

### Pi side (new user service)
HA runs in Docker and cannot drive the display, so a small Pi script owns `wlopm`:
- **Subscribes to HA's websocket** for `binary_sensor.kitchen_should_sleep` changes and runs
  `wlopm --off '*'` / `--on '*'` immediately. Not polling — a 30 s poll means a kid taps a
  black screen and waits.
- **Reconciles on start and on every reconnect.** A reboot during the sleep window runs
  `start-kiosk-wayland.sh:31` (`wlopm --on`) and lights the screen; the service must put it
  back. (Checked: the 4am renderer restart does *not* do this — it kills chromium and the
  supervisor loop at line 69 respawns it without re-running line 31.)
- Runs as a **systemd user service** in the labwc session's environment
  (`WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`) — the same environment problem the 4am restart
  script had to solve. Long-lived HA token stored on the Pi, not in the repo.
- **Fail on, never off.** If the service dies, loses HA, or its token stops working while
  the screen is off, the panel must not stay dark until someone reboots it:
  - systemd unit has `Restart=always` **and** `ExecStopPost=wlopm --on '*'` — ExecStopPost
    runs however the service exits, crash included.
  - If HA has been unreachable (or auth fails) for **5 minutes** while the output is off,
    turn it on and keep it on until HA is back and says sleep.
  - Rule of thumb for every unclear case: **the screen comes on.**
- **Fallback, only if §7 shows it's needed:** watch local touch input (libinput/evdev) and
  turn the output on directly, still reporting the wake to HA.

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
| Sleep on/off, From, To | §3 helpers | new |
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

The real risk is the **ViewSonic**, not Chromium: TD1655 touch already needs a hub to enumerate
at all (memory `viewsonic-touch-needs-hub.md`), and in standby the monitor may cut power to its
touch controller — then nothing receives the tap.

Run over SSH with Garrett at the panel to tap. Leave ~1 min in standby before step 2 — the
monitor may take a moment to drop into standby and cut touch power.

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
- 2–3 pass, 4 fails → evdev fallback (§3).
- 2 fails, 6 passes → no tap-to-wake; the panel wakes at sleep end only.

## 8. Out of scope

Nav rail; photo delete; "Sleep now"; uploading photos from the panel; the Morning rework
(separate spec, two open decisions of its own).
