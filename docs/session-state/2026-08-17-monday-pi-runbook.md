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

**Power:** the Pi needs its **own 27W brick**. Never power it from the ViewSonic or a laptop dock —
both brown it out under load. **Touch needs a USB hub in the path** (direct Pi→monitor never
enumerates). Both are settled findings; don't re-debug them.

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

Verify before paste: **penalties stored NEGATIVE (−5 / −2)** — the JSON path bypasses the form's
negation. Positive penalties would *add* points. And confirm `Streak Master`'s
`associated_achievement` points at the real `7-Day Streak` id, not a dangling one.

---

## 3. Apply the content

Paste lives in the **CONFIG flow, not options** — it only runs when *adding* the integration.

1. Settings → Devices & Services → **ChoreOps → ⋮ → Delete** (backup from §1 is your safety net)
2. **+ Add Integration → ChoreOps** → choose the paste option
3. Paste the regenerated JSON → submit
4. Restart HA

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
