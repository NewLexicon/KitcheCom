# Monday Pi Runbook — 2026-08-17

**Purpose:** execute, don't decide. Every decision is pre-made below. The deadline is
**Tuesday 2026-08-18** (calendar + chore chart working). Written 2026-08-15 while the Pi was down.

**Ordering rationale:** content import first (it's the long pole and everything else decorates it),
then nav wiring, then the smoke test. OAuth is last because the calendar already works on the
wall — it's a Pi-parity item, not a promise item.

---

## 0. Pre-flight — 2 minutes

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current          # MUST print feat/choreops-chores
git status --short                 # expect clean
ipconfig getifaddr en0             # expect 192.168.1.x — you must be on the HOME network
ssh kitchencom 'echo PI_UP; hostname -I'
```

**If `ssh kitchencom` times out:** you are probably not on the home LAN. Fall back to
`ssh kitchencom-eth` (direct ethernet) and read
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/README.md` §7 + the
`pi-direct-ethernet-fallback` memory entry. `169.254.x.x` does **not** route from macOS —
browse HA through a tunnel: `ssh -f -N -L 8123:localhost:8123 kitchencom-eth` → `http://localhost:8123`.

**Power and touch are two SEPARATE solved problems** — they share no hardware path. The Pi's only
USB-C is power-input; it does no video and no USB-host, so touch (USB-A) and power (USB-C) are
physically independent. Fixing one never affected the other.

- **Power — solved 2026-07-02 by the 27W brick.** At home, on its own brick, this is a non-issue.
  It recurred 2026-08-05 only because the Pi was at the work office on a laptop dock with no brick.
  Rule, not hazard: **Pi → its own 27W adapter → wall; ViewSonic → its own power → wall; never chain.**
- **Touch — solved 2026-08-13 by adding a USB hub.** Direct Pi→monitor never enumerates; any hub
  fixes it instantly.

Neither is an open risk for Monday at home. Don't re-debug them.

**If a drop DOES happen:** `vcgencmd get_throttled` reading `0x0` proves nothing after a reboot —
the counter resets at boot, and `journalctl -b -1` is empty because the trail is erased. The
reliable signature is **load-correlated drops + `uptime` showing `up 0 min`**. Sticky `0x50000`
(undervolt+throttle occurred) is only meaningful if the Pi has *not* restarted since.

---

## 1. Back up the Pi's ChoreOps storage — DO NOT SKIP

The paste flow **OVERWRITES** the entire storage file. It does not merge. The Pi holds
**11 chores + 4 users** entered by hand — that is the irreplaceable part.

```bash
ssh kitchencom 'cd /home/garrettdehart/homeassistant/.storage/choreops && sudo ls -la && \
  for f in choreops_data_*[!p]; do case "$f" in *.bak-*|*_recovery) continue;; esac; \
  sudo cp -v "$f" "$f.bak-premonday-$(date +%Y%m%d-%H%M)"; done && sudo ls -la'
```

Confirm a `.bak-premonday-*` file exists before continuing. **If this fails, stop.**

---

## 2. Regenerate content against the PI's storage — NOT the dev rig's

⚠️ **Never paste the dev-rig JSON onto the Pi.** It embeds dev-rig user IDs, chore IDs and storage
keys. It will produce dangling references that look fine and silently never track.

```bash
# Pull the Pi's live storage file down
ssh kitchencom 'sudo cat /home/garrettdehart/homeassistant/.storage/choreops/choreops_data_*[!p]' \
  > /tmp/pi-choreops-live.json
python3 -c "import json;d=json.load(open('/tmp/pi-choreops-live.json'));x=d.get('data',d);print({k:len(x.get(k,[])) for k in ['users','chores','rewards','bonuses','penalties','achievements','badges']})"
```

**Expect `users: 4, chores: 11`.** If chores is not 11, you grabbed the wrong file (a `.bak` or a
`_recovery`) — re-check the glob.

Then run the generator against it:

The generator takes **two positional arguments — no flags, and no `--help`** (verified 2026-08-15;
`main(src, dst)` at `gen_content.py:100`, invoked from `sys.argv[1], sys.argv[2]`):

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/deploy/choreops-content
python3 gen_content.py /tmp/pi-choreops-live.json /tmp/pi-choreops-generated.json
```

It prints `gamified users: N` then a counts line, then any `WARNINGS:` block. **Expect
`gamified users: 2`** (Rowan + Wystan — parents are approvers-only and are correctly skipped,
since the kid list is built from `enable_gamification`).

Generator + its README: `/Users/jdehart1/___Code_DEV/KitchenCOM/deploy/choreops-content/`

### 🚩 THE ONE WARNING THAT MEANS STOP

The dev rig has only 3 chores, so `Early Riser`'s **`Brush Teeth`** lookup failed there and left
`selected_chore_id` **empty**. The Pi has all 11, so it *should* resolve.

**If the generator prints a WARNING about an unresolved chore id on the Pi — STOP.** That
achievement would silently never track. Fix the lookup before pasting; do not paste past it.

**Verified on the dev rig 2026-08-17 (before the Pi session) — read this before diagnosing:**

- **Only `Early Riser` can produce this warning.** All three achievements show an empty
  `selected_chore_id` on the rig, which *looks* like three failures but is not. Per the
  `ACHIEVEMENTS` table at `gen_content.py:68-72`, only `Early Riser` is type `chore_streak`
  and binds to a named chore (`Brush Teeth`). `7-Day Streak` (`daily_minimum`) and
  `Chore Champion` (`chore_total`) are **chore-agnostic by design** — empty is CORRECT for
  them. The warning at `gen_content.py:144-147` only fires when a name is specified and not
  found, so an empty id with no warning is benign. **Do not "fix" those two.**
- **Chore-name matching is EXACT and lowercased** (`gen_content.py:108,143`) — no fuzzy or
  partial matching. If the Pi's chore is named `Brush teeth (AM)` or `Brush Your Teeth`, the
  lookup fails even though the chore exists. **The fix is a one-word edit to the table at
  `gen_content.py:72` to match the Pi's actual chore name** — not a debugging session. Check
  the Pi's chore names against it first:
  ```bash
  python3 -c "import json;d=json.load(open('/tmp/pi-choreops-live.json'));x=d.get('data',d);print([c.get('name') for c in x['chores'].values()])"
  ```
- **Penalty signs confirmed correct in generator output:** rig shows `Missed Chore = -5.0`,
  `Reminder Needed = -2.0`. The negative-storage requirement is satisfied by the generator;
  still eyeball it on the Pi output, but this is not expected to be a problem.

Verify before paste: **penalties stored NEGATIVE (−5 / −2)** — the JSON path bypasses the form's
negation. Positive penalties would *add* points. And confirm `Streak Master`'s
`associated_achievement` points at the real `7-Day Streak` id, not a dangling one.

---

## 3. Apply the content

Paste lives in the **CONFIG flow, not options** — it only runs when *adding* the integration.

1. Settings → Devices & Services → **ChoreOps → ⋮ → Delete** (backup from §1 is your safety net)
2. **+ Add Integration → ChoreOps**
3. ⚠️ **A DATA RECOVERY MENU APPEARS FIRST. "Paste JSON" is the LAST option.**
   Verified against `reference/ChoreOps-main/custom_components/choreops/config_flow.py:174-217`,
   which builds the menu in this order:
   | # | Option | What it does |
   |---|---|---|
   | 1 | *Use current data file* (`current_active`) | **WRONG** — reloads pre-paste content |
   | 2 | *Migrate from KidsChores* | not applicable |
   | 3 | *Start fresh* | **WRONG** — wipes everything |
   | 4… | **📄 dated backup entries**, e.g. `📄 2026-08-17 12:04 • Bak Premonday • Current Entry` | **WRONG** — restores the backup |
   | last | **Paste JSON** (`paste_json`) | ✅ **THIS ONE** |

   **§1's own backup ADDS one of those 📄 rows**, pushing Paste JSON further down. Scroll
   to the bottom.

   ### ⛔ THE PASTE FLOW DID NOT WORK — 2026-08-17. USE THE DIRECT WRITE (§3b).

   **Two attempts, both failed identically.** Valid JSON pasted, form **submitted cleanly
   with no error**, flow reported success — and the storage file still held the
   pre-existing `Treat`/`Cash`/`Cheerful`/`Demerit`/`Perfect Week`/`Week Winner` set
   (`rewards:2 bonuses:1 penalties:1 achievements:1 badges:1`) instead of the generated
   16/4/2/3/6.

   **Correction to an earlier version of this section:** it claimed the cause was picking
   a restore option instead of Paste JSON. **That explanation is unsupported.** Two
   identical failures make a repeated mis-pick unlikely, the operator reported no form
   error (a truncated/invalid paste would have raised one), and the generated JSON was
   verified to PASS ChoreOps's own `validate_backup_json` (Store format, `version == 1`,
   all eight entity keys present as dicts). The menu ordering above is still real and
   still worth knowing — but it is **not** the established cause.

   **Why we can't say more precisely:** HA rotates `home-assistant.log` on restart, and
   the session restarted HA to check results *before* reading the log — which discarded
   the only record of what the paste flow actually did. Debug logging was then enabled
   (`logger: custom_components.choreops: debug`) but only after the fact, so it captured
   nothing about the failed attempts. It has since been reverted. **If you ever retry the
   UI paste: enable choreops debug logging FIRST, and read the log BEFORE restarting.**
4. Paste the regenerated JSON → submit

   Our generated JSON takes the **"Store format"** branch (`config_flow.py:508-512`,
   `helpers/backup_helpers.py:616-628`): it has `version: 1` + a `data` wrapper, and the
   validator requires **`version` to be exactly 1** — anything else is rejected outright.
   Verified passing 2026-08-17.
5. Restart HA

---

## 3b. DIRECT WRITE — the path that actually worked (2026-08-17)

The paste step's own implementation (`config_flow.py:539-553`) just wraps the data and
writes it to the storage file, then creates the config entry. So do exactly that, minus
the UI. **This landed successfully and survived restart.**

**Do NOT write while HA is running** — it holds state in memory and rewrites the file on
shutdown/save, which will silently clobber the write. Stop it first.

```bash
# 1. Find the LIVE storage key (it changes every time the integration is re-added)
ssh kitchencom-eth 'sudo ls /home/garrettdehart/homeassistant/.storage/choreops/ | grep -vE "recovery|\.bak|removal"'
# -> e.g. choreops_data_01KXV33Q540SYEF1KFM54DCEDJ
KEY=choreops_data_01KXV33Q540SYEF1KFM54DCEDJ   # <-- set from the output above

# 2. Build the payload with that EXACT key. The `key` field inside the JSON must be
#    "choreops/<filename>" or HA ignores the file.
python3 -c "
import json
src=json.load(open('/tmp/pi-choreops-generated.json'))
K='choreops/$KEY'
json.dump({'version':1,'minor_version':1,'key':K,'data':src['data']},
          open('/tmp/pi-write-payload.json','w'), indent=2)
print('key:', K)
"

# 3. Stop HA, back up, write, verify
ssh kitchencom-eth "sudo docker stop homeassistant && \
  sudo cp /home/garrettdehart/homeassistant/.storage/choreops/$KEY \
          /home/garrettdehart/homeassistant/.storage/choreops/$KEY.bak-predirectwrite-\$(date +%H%M)"
scp /tmp/pi-write-payload.json kitchencom-eth:/tmp/payload.json
ssh kitchencom-eth "sudo cp /tmp/payload.json /home/garrettdehart/homeassistant/.storage/choreops/$KEY && \
  sudo chown root:root /home/garrettdehart/homeassistant/.storage/choreops/$KEY && \
  sudo chmod 644 /home/garrettdehart/homeassistant/.storage/choreops/$KEY"

# 4. Start HA and confirm the content SURVIVED (this is the real gate)
ssh kitchencom-eth 'sudo docker start homeassistant; for i in $(seq 1 45); do ss -tln | grep -q ":8123" && break; sleep 2; done'
sleep 25
ssh kitchencom-eth "sudo python3 -c \"
import json
d=json.load(open('/home/garrettdehart/homeassistant/.storage/choreops/$KEY'))
x=d['data']
print({k:len(x[k]) for k in ['users','chores','rewards','bonuses','penalties','achievements','badges']})
\""
```

**Expect** `{'users': 4, 'chores': 11, 'rewards': 16, 'bonuses': 4, 'penalties': 2,
'achievements': 3, 'badges': 6}`.

**Then confirm HA actually built entities** — a correct file that HA ignored looks
identical to a correct file it consumed:

```bash
ssh kitchencom-eth 'sudo python3 -c "
import json
from collections import Counter
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
e=[x for x in d[\"data\"][\"entities\"] if x.get(\"platform\")==\"choreops\"]
print(\"total:\", len(e))
"'
```

Expect **~286 choreops entities** (144 reward, 107 chore, 10 achievement, 10 bonus,
9 badge, 6 penalty). If the count is near 100 with 0-ish badge/reward entities, HA
loaded the OLD content and the write didn't take.

```bash
ssh kitchencom 'sudo docker restart homeassistant >/dev/null; \
  for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q ":8123" && break; sleep 2; done; echo "HA up"'
```

**Verify:** expect **16 rewards · 4 bonuses · 2 penalties · 3 achievements · 6 badges**, 4 users,
11 chores, and **5 choreops devices** (4 users + 1 system — the card says "N SERVICES" because it
counts devices, which is benign and already explained).

---

## 4. Task 8 — Dashboard Generator (browser, ~5 min)

Settings → Devices & Services → **ChoreOps → Configure → Dashboard Generator**:

| Field | Value |
|---|---|
| Name | `Chores` |
| Assignees | **Rowan + Wystan ONLY** |
| Template | `user-gamification-premier-v1` |
| Admin mode | `global` |
| Release | `current_installed` |

**Assignees: kids only.** Garrett/Rebecca still own ~27 stale entities from before they became
approvers-only; selecting them drags that mess onto the dashboard.

**Template spelling is `premier`, no "e"** — verified against
`reference/ChoreOps-main/custom_components/choreops/dashboards/dashboard_registry.json:111`.
Two similar strings exist in the source; this is the right one.

⚠️ Field *labels* were written against 1.0.7 and the vendored source is 1.0.8 — wording may differ
slightly in the dropdowns. Match on meaning, not exact text.

Verify:

```bash
ssh kitchencom 'f=/home/garrettdehart/homeassistant/.storage/lovelace.cod-chores; \
  sudo test -f "$f" && echo FOUND || echo "MISSING — check: sudo ls .storage/lovelace.*"; \
  sudo python3 -c "import json;d=json.load(open(\"$f\"));v=d[\"data\"][\"config\"][\"views\"];print(\"views:\",len(v),[x.get(\"title\") for x in v])"'
ssh kitchencom 'curl -s -o /dev/null -w "cod-chores HTTP %{http_code}\n" http://localhost:8123/cod-chores'
```

Expect multiple views (per-kid + Admin) and **HTTP 200**.

---

## 5. Task 9 — nav button on the kitchen dashboard

Edit `homeassistant/dashboards/kitchen.yaml`: replace the `todo.chores` card with

```yaml
          - type: button
            name: Chores
            icon: mdi:broom
            tap_action:
              action: navigate
              navigation_path: /cod-chores
            show_state: false
```

Keep the surrounding grid/section and the `todo.groceries` card intact. Then:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
scp homeassistant/dashboards/kitchen.yaml kitchencom:/home/garrettdehart/homeassistant/dashboards/
ssh kitchencom 'sudo docker exec homeassistant python -m homeassistant --script check_config --config /config >/tmp/chk.txt 2>&1; echo "exit:$?"; grep -iE "error|invalid" /tmp/chk.txt || echo clean; sudo docker restart homeassistant >/dev/null; for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q ":8123" && break; sleep 2; done; echo "HA up"'
```

**The kiosk caches aggressively.** If the panel still shows the old card: `ssh kitchencom 'pkill chromium'`
(the supervisor respawns it). A deployed file is not a running file — this has bitten three times.

---

## 6. Task 10 + 11 — cleanup and smoke test

- **Task 10:** delete the orphaned `local_todo` chores entity (it's superseded by ChoreOps).
- **Task 11 — the real acceptance test:** on the kiosk, have a kid **claim** a chore and a parent
  **approve** it. Watch points move. This is the thing the promise is actually about; everything
  above is setup.

---

## 7. Icon pass

Writing JSON sets icons directly, so the dev rig's icon-picker limitation (HA 2025.7's picker has
no search box) does **not** apply. Only fix icons that render wrong on the Pi.

---

## 8. Google Calendar OAuth on the Pi — LAST

The dev-rig OAuth does **not** carry over. The Pi needs its own redirect URI and its own
`my.home-assistant.io` instance URL. Follow **§3 and §3b** of
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-14-google-calendar-oauth-setup.md`
exactly — both traps cost real time on 2026-08-14 and will recur.

Then put **real events** on `calendar.family`. It currently holds only the test event that proved
the write path. An empty calendar on the wall is not a working calendar.

---

## 9. Commit + push

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current      # feat/choreops-chores
git add -A && git commit -m "feat(choreops): Pi content import + dashboard + nav button"
git push                       # branch now tracks origin (pushed 2026-08-15)
```

---

## 10. If the Pi never comes back

The promise is *calendar + chore chart working*. Everything except §1–3's Pi steps has been
rehearsed on the dev rig at port **8124**, which runs the full ChoreOps stack with the Pi down.
A laptop showing the working dashboard is a far better Tuesday than nothing.

---

## Traps — do not rediscover

1. **`.storage/core.restore_state` is STALE** (~5 min behind). Never diagnose from it.
2. **A deployed file is not a running file.** Chromium ran an 18-hour-old card after redeploy.
3. **HA logs the browser's real error** under `frontend.js.modern`:
   `ssh kitchencom 'sudo docker exec homeassistant grep frontend.js /config/home-assistant.log | tail'`
4. **Do NOT verify HA renders with the `browser-automation` skill** — it nulls `customElements`,
   renders no HA dashboard, and reports 0 errors while verifying nothing. It called a broken card
   clean. Only a human looking at the panel can confirm a render.
5. **`reference/ChoreOps-main/` is a nested git repo** and Bash cwd persists between calls —
   `cd` there then `git commit` hits the wrong repo. Use absolute paths.
6. **Tests can pass against impossible data.** When a check passes, ask what it supplied that
   production will not.
