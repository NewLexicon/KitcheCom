# Cold-open — the panel works; Google Calendar is the last piece (2026-08-18)

**Branch:** `feat/choreops-chores`
**Read this first.** Every number below has the command that verifies it.

---

## 🟢 START HERE — the next action

**Everything on the Kitchen panel works except the calendar.** Chores, screensaver, and the
Perspective quote card are all live and confirmed by eye on the ViewSonic.

**The next task is runbook §8 — Google Calendar OAuth on the Pi.** It is a *mid-flow resume*, not
a fresh start. Read §3 below before touching anything: Garrett was partway through the Google
Cloud Console step when the session ended, and one instruction given earlier was **wrong**.

**Procedure:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-14-google-calendar-oauth-setup.md`
— follow §3 and §3b exactly. They document two traps that already cost hours on the dev rig.

**Runbook:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-17-monday-pi-runbook.md`
**Previous cold-open (still accurate for chores/screensaver detail):**
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-17-chores-working-end-to-end-handoff.md`

---

## 1. Where is HEAD?

- **HEAD (tip):** deliberately NOT frozen — run `git log --oneline -1`. A close-out commit cannot
  stamp its own SHA, and stamping it is itself a commit, so the loop never converges.
- **Stable prefix** (immutable): `8112835` (sensor + card) → `9af5299` (quotes README) →
  `934a9b6` (quotes shipped; calendar spinner recorded).
- **Branch:** `feat/choreops-chores`, in the **primary checkout** `/Users/jdehart1/___Code_DEV/KitchenCOM`
- **Ahead / unpushed:** run the commands — they were **73 / 0** at `934a9b6`. A number that counts
  the commits it lives inside cannot be frozen correctly.

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current                                      # feat/choreops-chores
git log --oneline -1
git rev-list --count origin/main..HEAD                         # authoritative
git log --oneline origin/feat/choreops-chores..HEAD | wc -l    # expect 0
```

### Worktrees — SIX checkouts, do not cross them

| Path | Branch |
|---|---|
| `/Users/jdehart1/___Code_DEV/KitchenCOM` | `feat/choreops-chores` ← **here** |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox` | `fort-knox` |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-grocy` | `feat/grocy-kitchen` |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-voice` | `feat/voice-slice` (empty) |
| `…/.worktrees/main-merge` | `main` |
| `…/.worktrees/grocy-chores` | detached `f2e561c` |

`fort-knox` and `feat/grocy-kitchen` both moved during this session — other windows are active
there. **Verify `git branch --show-current` before every commit.**

---

## 2. Empirical state — the Pi

**Verified 2026-08-18 evening.** Pi is home on the LAN; plain `ssh kitchencom`, no tunnel.

| Item | Value |
|---|---|
| Address | `192.168.1.234` (reserved), `kitchencom.local` |
| HA | **2026.6.3** · ChoreOps **1.0.7** |
| ChoreOps content | 4 users · 11 chores · 16 rewards · 4 bonuses · 2 penalties · 3 achievements · 6 badges |
| ChoreOps entities | **286** |
| Points | Rowan **14.0**, Wystan `None`, parents 0.0 |
| HA users | `KitchenCom` (**admin**) · `Panel` (**non-admin**, drives the kiosk) |
| Screensaver photos | **122** in `/config/media/photos` |
| Quote script | works — `sudo docker exec homeassistant python3 /config/quotes/pick_quote.py` |
| OAuth credentials | **ABSENT** — `.storage/application_credentials` does not exist |

---

## 3. 🔴 §8 Google Calendar — resume here, and read this first

### What is already done

- The Google Cloud Console client exists from the dev-rig setup. Its **Authorized redirect URIs**
  currently hold:
  1. `https://my.home-assistant.io/redirect/oauth`
  2. `http://localhost:8124/auth/external/callback`
- The Pi can reach everything the flow needs (all verified 2026-08-18):
  `http://192.168.1.234:8123` → 200 · `accounts.google.com` → 302 · `my.home-assistant.io` → 200

### ⚠️ A wrong instruction was given and then retracted — do not repeat it

The session told Garrett to add `http://192.168.1.234:8123/auth/external/callback` as a third
redirect URI. **Google rejects it:** *"Invalid Redirect: must end with a public top-level domain."*
Google does not accept bare private IPs; `localhost` is a special exemption.

**There is nothing to add.** URI 1, `https://my.home-assistant.io/redirect/oauth`, is Home
Assistant's official OAuth broker and exists precisely because home instances sit on private IPs.
It bounces the callback to whatever instance URL **your browser** has stored.

If a third URI was saved before the error appeared, delete it. Console work for §8 is otherwise
**complete** — provided the Calendar API is enabled on the project and the Gmail account is still
listed as a test user.

### The two traps (full detail in the OAuth doc)

**§3 — three places must agree on HA's address.** For the Pi that is `http://192.168.1.234:8123`.
1. HA's own config — **already correct**, `internal_url` is set in `configuration.yaml:21`.
   (`.storage/core.config` reads `None`; that is expected for a YAML-set value, not a fault.)
2. Google's redirect URIs — done, see above.
3. **`my.home-assistant.io`'s instance URL — stored in YOUR BROWSER's local storage.** Invisible
   from the server; nothing on the Pi can read or set it. On the "Link account to Home Assistant?"
   page there is a line *"Your instance URL: …"* with a **✏️ pencil**. If it does not read
   `http://192.168.1.234:8123`, fix it **before** clicking Link account.

**§3b — Chrome autofill silently clobbers the Client ID.** It hit twice in a row on the dev rig.
The Secret was correct every time; only the ID was overwritten, and it surfaces as Google's
*"Access blocked: The OAuth client was not found"*, which sends you back to the console to debug a
problem that is not there.

- A valid Client ID is **~72 chars and always ends `.apps.googleusercontent.com`**. Short, or
  containing an `@`, means autofill won.
- **Use an incognito window** — no saved form data, trap sidestepped entirely.
- Procedure: clear the field (Cmd+A, Delete) → paste → fill the Secret → **re-check the ID**
  (autofill can repopulate on focus change) → submit.

### Next actions, in order

1. Delete the rejected third redirect URI if it was saved; confirm the Calendar API is enabled.
2. Incognito → `http://192.168.1.234:8123/config/integrations` → **+ Add Integration** →
   **Google Calendar** → paste Client ID and Secret per §3b.
3. On the consent screen, check the instance URL pencil per §3 before linking.
4. Verify the stored credential from the Pi — **this catches the autofill trap before Google does:**
   ```bash
   ssh kitchencom 'sudo python3 -c "
   import json
   d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/application_credentials\"))
   for i in d[\"data\"][\"items\"]:
       c=i.get(\"client_id\",\"\") or \"\"
       print(i.get(\"name\"), len(c), c.endswith(\".apps.googleusercontent.com\"))
   "'
   ```
   Expect a length near 72 and `True`.
5. Confirm `calendar.family` appears:
   ```bash
   ssh kitchencom 'sudo python3 -c "
   import json
   d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
   print([e[\"entity_id\"] for e in d[\"data\"][\"entities\"] if e[\"entity_id\"].startswith(\"calendar.\")])
   "'
   ```
   Today it returns only `rowan_choreops`, `wystan_choreops`, `grocy` — **no `calendar.family`**,
   which is exactly why the dashboard's calendar card spins forever.
6. Restart HA + kiosk with the **service-worker clear** (§5), then look at the panel.

---

## 4. What shipped this session

1. **Portrait pairing on the screensaver** — two portraits share the frame instead of being
   centre-cropped; a lone portrait renders contained over a blurred copy. Took five fixes; see §5.
2. **Photo pipeline** — folder renamed to `/config/media/photos`, a **Samba share** added
   (`smb://192.168.1.234/photos`, user `garrettdehart`), and 122 photos loaded.
3. **Daily quotes — the "Perspective" card**, confirmed rendering on the panel. Full detail in
   §4c of the previous cold-open and in `deploy/quotes/README.md`.
4. **Kitchen dashboard renamed** from "Kitchen (snapshot)" — it was never a backup.

---

## 5. Traps worth keeping

### 🔴 A `command_line` sensor CANNOT be verified from storage files

No `unique_id` (not in the schema for HA 2026.6.3 — adding it fails `check_config`), so it never
enters `core.entity_registry`, and it is not restore-backed, so it never enters
`core.restore_state`. **Both files report the sensor as absent while it works perfectly.** Time was
lost here believing it had failed. Use `check_config --info all`, or look at the panel.

### 🔴 Clear the SERVICE WORKER when redeploying a card

HA registers a service worker whose CacheStorage sits in front of the HTTP cache, so it can serve
stale JS despite a `?v=` bump, an HA restart, `pkill chromium`, and a cleared `Cache`/`Code Cache`.
```bash
ssh kitchencom 'pkill chromium; sleep 3
P=/home/garrettdehart/.config/chromium/Default
sudo -u garrettdehart rm -rf "$P/Service Worker" "$P/Cache" "$P/Code Cache"
sudo -u garrettdehart rm -rf /home/garrettdehart/.cache/chromium
sleep 12; pgrep -c chromium'
```
**Keep `$P/Local Storage`** — the HA login lives there.

### 🔴 Server-side verification cannot prove a browser-side outcome

The portrait-pairing feature took **five** fixes. Each was a real defect, but 97 unit tests stayed
green throughout because they fed the pure planner pre-classified fixtures — covering the policy
and never the wiring. What finally located the bug was Garrett reporting that the blurred *solo*
portrait rendered correctly, which proved classification worked and narrowed the fault to partner
lookup. **One observation from the panel beat four rounds of server-side checking.** Get the
browser console before shipping another card fix; there is no remote-debugging port on the kiosk.

### 🟡 macOS writes `._` junk to the SMB share, and it sorts to the FRONT

HA sorts media by title (`local_source.py:270`) and `._` sorts before letters, so AppleDouble
sidecars become the first things the slideshow tries to display. 39 were present at one point.
`defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true` is set on the Mac
(**needs unmount/remount**), and the share has `veto files`. Clean up with:
```bash
ssh kitchencom 'D=/home/garrettdehart/homeassistant/media/photos
sudo find "$D" -name "._*" -delete; sudo find "$D" -name ".DS_Store" -delete; ls -A "$D" | wc -l'
```

### 🟡 A second Pi on the laptop steals the route to `192.168.1.234`

`ssh kitchencom` times out while the Pi is perfectly healthy. Tell: `route -n get 192.168.1.234`
shows `en22` instead of `en0`. Workaround: `ssh -b $(ipconfig getifaddr en0) kitchencom`.
**Not** the laptop's separate wifi-drop problem.

### Standing traps

- **A deployed file is not a running file** — the kiosk caches hard.
- **Do NOT verify renders with browser automation** — it nulls `customElements` and reports success
  while verifying nothing. Only a human looking at the panel counts.
- **Nested-repo cwd trap** — Bash cwd persists between calls; `cd deploy/quotes` then a repo-root
  `git add` fails confusingly. Use absolute paths.
- **Do NOT `git add -A` while a subagent is working in this checkout** — it sweeps up their
  uncommitted work and they report a phantom "concurrent session". Happened this session.
- **Pi power:** its own 27W brick into the wall, never chained through the ViewSonic or a dock.
- **Touch needs a USB hub** — and the Pi→hub cable is an old **USB-B printer cable**.

---

## 6. Carry-forwards

- **§8 Google Calendar** — the active task, see §3.
- **Rowan is sitting at 14.0 test points.** Zero it deliberately before the kids see it, or a test
  balance reads as earned.
- **A 2.0-point chore awarded 4.0** during the acceptance test — probably a multiplier or bonus,
  **never investigated**. Worth understanding before the kids do the arithmetic themselves.
- **`Wystan` has `points: None`** while Rowan has a number. Benign — the field initialises on first
  award, proven by Rowan going `None → 4.0`.
- **7 of 11 chores are `rotation_smart`** and all currently show Wystan's turn, so Rowan's view is
  mostly "Not my turn" rows. Options: the gear panel's blocked toggle, `pref_exclude_states`, or
  switching them to `independent`. **A parenting call, not a technical one.**
- **32 photos are low-res Facebook downloads** (960×720 or smaller) and look soft on the 1080p
  panel. Replacing them with originals is the biggest available quality win.
- **ChoreOps dashboard layout** — improved via the gear panel's `row_variant`, not finished.
  Garrett intends a full layout pass; the Perspective card was deliberately built as a movable
  titled card for that reason.
- **Quoteverse (RapidAPI)** — a deferred quote source, 28k quotes / 21 categories. Needs an account
  and API key, so it brings secret handling the current design lacks (`secrets.yaml` on the Pi,
  never the repo).
- **`main`'s cold-open (`docs/session-state/README.md`) is STALE** — dated 2026-08-14 and still
  frames Tuesday 2026-08-18 as a hard deadline. **Garrett de-emphasised that deadline**; the goal
  is full functionality. Rewrite from main's perspective at merge time.

---

## 7. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

| File | Why |
|---|---|
| `kiosk-service-worker-serves-stale-js.md` | a card deploy can look perfect server-side and never reach the panel |
| `kiosk-admin-approval-hole.md` | why `Panel` is non-admin — **do not undo** |
| `screensaver-media-mount-boundary.md` | `/config/media` is NOT media_source's root |
| `second-pi-hijacks-route.md` | the `en22` route collision |
| `viewsonic-touch-needs-hub.md` | the hub requirement + the printer-cable reassembly note |
| `choreops-content-is-generated-json.md` | content comes from `gen_content.py`; penalties negative |
| `pi-ssh-access-from-claude.md` · `pi-power-and-kiosk-login.md` · `pi-kiosk-wayland-labwc.md` | Pi access, power, kiosk |
| `concurrent-sessions-branch-hazard.md` | **six worktrees now** |
| `cards-must-be-bundled.md` | if a Lovelace card shows "Configuration error" |
