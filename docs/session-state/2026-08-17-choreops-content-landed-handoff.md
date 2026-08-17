# Cold-open — ChoreOps content landed on the Pi (2026-08-17)

**Branch:** `feat/choreops-chores`
**Read this first.** Every number below has the command that verifies it.

---

## 🟢 START HERE — the next action

**ChoreOps gamification content is LIVE on the Pi.** The long pole is done. The next task is
**runbook §4 — the Dashboard Generator** (browser work, ~5 min), then §5 nav-button deploy
(the file edit is already committed — it's one `scp`).

**Runbook (execute, don't decide):**
`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/2026-08-17-monday-pi-runbook.md`

**⚠️ Read §3b of that runbook before touching ChoreOps content again.** The UI paste flow is
broken (see §5 below); §3b is the direct-write procedure that actually works.

---

## 1. Where is HEAD?

- **HEAD:** `3609de8` — `docs: §3 paste flow is broken — add §3b direct write; retract the mis-pick claim`
- **Branch:** `feat/choreops-chores`, in the **primary checkout**
  `/Users/jdehart1/___Code_DEV/KitchenCOM`
- **Ahead of `origin/main`:** **38**
- **Unpushed: 0** — everything is on GitHub.
- This session's arc: `136b62a` (Task 9 kitchen.yaml nav button) → `c748110` (stop-warning
  precision) → `98da50a` (paste-menu warning — **partially retracted**) → `3609de8`
  (paste flow broken + §3b direct write).

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current                      # feat/choreops-chores
git log --oneline -4
git rev-list --count origin/main..HEAD          # 38
git log --oneline origin/feat/choreops-chores..HEAD | wc -l   # 0
```

### Worktrees — FOUR checkouts, do not cross them

| Path | Branch | SHA | What lives there |
|---|---|---|---|
| `/Users/jdehart1/___Code_DEV/KitchenCOM` | `feat/choreops-chores` | `3609de8` | **chores work (here)** |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox` | `fort-knox` | `1c4d434` | parental controls |
| `/Users/jdehart1/___Code_DEV/KitchenCOM-voice` | `feat/voice-slice` | `5d877f4` | voice slice (empty so far) |
| `…/KitchenCOM/.worktrees/main-merge` | `main` | `b6451cb` | project-wide docs |

**`fort-knox` moved during this session** — a concurrent window is working there. Leave it alone.
Created this session: `fort-knox` (renamed from `feat/parental-controls`) and `feat/voice-slice`.

```bash
git worktree list
```

---

## 2. Empirical state — the Pi

**Verified 2026-08-17 ~13:15.** Reached over **direct ethernet**, not the home LAN.

| Item | Value |
|---|---|
| Reachable as | `ssh kitchencom-eth` (**not** `kitchencom` — see §3) |
| Pi IP | `169.254.209.138` (link-local) + `172.17.0.1` (docker bridge) |
| HA container | `homeassistant`, Up |
| Live storage key | `choreops_data_01KXV33Q540SYEF1KFM54DCEDJ` |
| `lovelace.cod-chores` | **MISSING** — Task 8 (§4) not done yet |

### ChoreOps content — landed and survived restart

| Field | Count | Expected |
|---|---|---|
| users | 4 | 4 ✓ (Rowan + Wystan gamified; Garrett + Rebecca approvers) |
| chores | 11 | 11 ✓ |
| rewards | 16 | 16 ✓ |
| bonuses | 4 | 4 ✓ |
| penalties | 2 | 2 ✓ — **stored NEGATIVE** (`-5.0`, `-2.0`) |
| achievements | 3 | 3 ✓ (`Early Riser` chore id **RESOLVED**) |
| badges | 6 | 6 ✓ (`Streak Master` → real `7-Day Streak` id) |
| choreops entities | **286** | 144 reward · 107 chore · 10 achievement · 10 bonus · 9 badge · 6 penalty |

```bash
KEY=choreops_data_01KXV33Q540SYEF1KFM54DCEDJ
ssh kitchencom-eth "sudo python3 -c \"
import json
d=json.load(open('/home/garrettdehart/homeassistant/.storage/choreops/$KEY'))
x=d['data']
print({k:len(x[k]) for k in ['users','chores','rewards','bonuses','penalties','achievements','badges']})
\""
# expect {'users': 4, 'chores': 11, 'rewards': 16, 'bonuses': 4, 'penalties': 2, 'achievements': 3, 'badges': 6}
```

**Entity count is the real gate** — a correct file HA *ignored* looks identical to one it consumed:

```bash
ssh kitchencom-eth 'sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
print(len([e for e in d[\"data\"][\"entities\"] if e.get(\"platform\")==\"choreops\"]))
"'   # expect ~286
```

### Backups on the Pi (4)

```
choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5.bak-preedit-20260704
choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5.bak-premonday-20260718-1204   <- pre-paste, 11 chores + 4 users
choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5.bak-prerewards-20260805
choreops_data_01KXV33Q540SYEF1KFM54DCEDJ.bak-predirectwrite-1313       <- pre-direct-write
```

**Also on the laptop:** `~/Downloads/choreops-pi-backup-20260817.json` (36,418 B, `users:4 chores:11`).

---

## 3. Connectivity — the Pi is NOT on the home LAN

The Pi was taken to the work office. It answers on **`kitchencom-eth`** (direct ethernet,
link-local `169.254.x.x`), **not** `kitchencom` / `192.168.1.234`.

- `169.254.x.x` **does not route from macOS** — to browse HA you need a tunnel:
  ```bash
  ssh -f -N -L 8123:localhost:8123 kitchencom-eth
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123   # expect 200
  ```
  Then `http://localhost:8123`. The `-f` backgrounds it, so **a laptop sleep kills it silently** —
  if the page hangs, re-run the command (it's idempotent).
- **Once the Pi is home again**, `http://192.168.1.234:8123` works directly, no tunnel.
- **HA login on the Pi:** username **`kitchencom`** (lowercase; display name "KitchenCom", owner).
  **NOT** `dev`/`devdev123` — those are the port-8124 dev rig's, a different machine entirely.
  Password not recorded. To reset without touching data:
  ```bash
  ssh kitchencom-eth 'sudo docker exec -it homeassistant hass --script auth --config /config change_password kitchencom NEWPASS'
  ```
- Expect `metno` DNS errors and `habluetooth` scanner errors in the log on this link — the Pi has
  no internet here. **Benign, unrelated to ChoreOps.**
- `timeout` **does not exist on macOS** — use `ssh -o ConnectTimeout=N` instead.

---

## 4. What shipped this session

1. **Runbook §1–§3 executed against the live Pi.** Backup taken, content regenerated from the
   **Pi's own storage** (never the dev rig's), verified, and landed.
2. **`Brush Teeth` resolved.** The Pi's 11 chores include an exact `Brush Teeth`, so `Early Riser`
   binds correctly. The generator ran with **zero warnings**.
3. **Task 9 committed** (`136b62a`): `homeassistant/dashboards/kitchen.yaml` — the `todo.chores`
   card is replaced by a nav button to `/cod-chores`. **Deployed? NO.** Still needs the `scp`
   (runbook §5).
4. **Dev rig brought up** at `http://localhost:8124` (Docker container `kitchencom-ha-dev`).
   Rehearsing there caught the achievement false-alarm in §5 below.
5. **Runbook hardened** with §3b (direct write), the exact-match chore-name trap, and the
   achievement false-alarm.
6. **Stale doc fixed on `main`** (`b6451cb`): a comment claimed "the Pi runs HA OS." **It runs
   Pi OS + HA Container**, chosen deliberately at
   `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md:17` so Chromium `--kiosk` could
   run on the same Pi. **Consequence: no Add-on Store** — voice services must be Wyoming Docker
   containers, and most HA voice tutorials don't apply.

---

## 5. Traps and corrections — read before re-treading

### 🔴 The ChoreOps UI paste flow is BROKEN — use §3b

Two attempts, valid JSON, **form submitted cleanly with no error**, flow reported success, and the
storage file still held the old `Treat`/`Cash`/`Cheerful`/`Demerit` content (`2/1/1/1/1`).
The JSON was verified to **PASS** ChoreOps's own `validate_backup_json`.

**A retracted claim is in the git history.** Commit `98da50a` asserted the cause was mis-picking a
restore option instead of "Paste JSON" in the recovery menu. **That is unsupported** — two
identical failures, no form error, valid JSON. `3609de8` retracts it. The menu-ordering trap
(Paste JSON is **last**, after every discovered backup, and §1's own backup adds a row) is real
and worth knowing, but is **not** the established cause.

**Why we can't be more precise, and the rule that follows:** HA **rotates
`home-assistant.log` on every restart**, and this session restarted HA to check results *before*
reading the log — destroying the only evidence. Debug logging was enabled afterward, too late.
> **If you retry the UI paste: enable `logger: custom_components.choreops: debug` FIRST, and read
> the log BEFORE restarting HA.**

### 🟡 Direct-write gotchas (all in §3b)

- **Stop HA before writing.** A running HA holds state in memory and rewrites the file — it will
  silently clobber the write. This is the likely mechanism behind the paste failures too.
- The `key` field inside the JSON must be exactly `choreops/<filename>`, or HA ignores the file.
- **The storage key changes on every integration re-add.** Always re-read it; never hardcode.
- Verify **entity count**, not just file counts.

### 🟢 Achievement false alarm — do NOT "fix" this

All three achievements can show an empty `selected_chore_id` and that is **correct**. Per
`deploy/choreops-content/gen_content.py:68-72`, only `Early Riser` is type `chore_streak` and binds
to a named chore. `7-Day Streak` (`daily_minimum`) and `Chore Champion` (`chore_total`) are
**chore-agnostic by design**. The warning at `gen_content.py:144-147` fires *only* when a chore name
is specified and not found — so an empty id with **no warning** is benign.

### 🟡 Chore-name matching is EXACT and lowercased

`gen_content.py:108,143` — no fuzzy matching. A Pi chore named `Brush teeth (AM)` would fail the
`Brush Teeth` lookup despite existing. Fix is a one-word edit at `gen_content.py:72`, not debugging.

### 🟡 Never paste dev-rig JSON onto the Pi

It embeds dev-rig user/chore IDs → dangling references that look fine and silently never track.
Always regenerate from the Pi's live storage (runbook §2).

### Standing traps (unchanged)

- **A deployed file is not a running file.** The kiosk caches hard; `ssh kitchencom 'pkill chromium'`
  (supervisor respawns). Has bitten three times.
- **Do NOT verify HA renders with the `browser-automation` skill** — it nulls `customElements`,
  renders no dashboard, and reports 0 errors while verifying nothing. Only a human looking at the
  panel can confirm a render.
- **`reference/ChoreOps-main/` is a nested git repo** and Bash cwd persists between calls. Use
  absolute paths.
- **Pi power:** its own 27W brick into the wall. **Never** chain through the ViewSonic or a laptop
  dock — that caused the 2026-08-05 brownout recurrence at this same work office.

---

## 6. Next moves, in order

1. **§4 Dashboard Generator** (browser, ~5 min). ChoreOps → Configure → Dashboard Generator.
   Name `Chores` · Assignees **Rowan + Wystan ONLY** · Template `user-gamification-premier-v1`
   (**`premier`, no "e"**) · Admin mode `global` · Release `current_installed`.
   *Assignees kids-only:* the parents carry ~27 stale entities that would drag onto the dashboard.
   Field labels were written against 1.0.7 and the vendored source is 1.0.8 — **match on meaning,
   not exact text.**
2. **§5 deploy the nav button** — `scp homeassistant/dashboards/kitchen.yaml kitchencom:…`, then
   check_config + restart. The edit is already committed.
3. **§6 Task 10/11** — delete the orphaned `local_todo` chores entity; then the real acceptance
   test: a kid **claims** a chore, a parent **approves**, points move.
4. **§8 Google Calendar OAuth on the Pi** — LAST. The dev-rig OAuth does not carry over. Follow
   §3 and §3b of `docs/session-state/2026-08-14-google-calendar-oauth-setup.md` exactly.

---

## 7. Carry-forwards

- **§4/§5/§6/§8 of the runbook are all still open.** Nothing else on chores is blocked.
- **`lovelace.cod-chores` does not exist yet** — §4 creates it. Verify with
  `ssh kitchencom-eth 'sudo test -f /home/garrettdehart/homeassistant/.storage/lovelace.cod-chores && echo FOUND'`
  and expect HTTP 200 at `/cod-chores`.
- **Dev rig is running** (`kitchencom-ha-dev`, port 8124) and Docker Desktop was started manually.
  Both die on laptop reboot; restart with
  `cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/main-merge/deploy/homeassistant && docker compose -f docker-compose.ha-dev.yml up -d`.
  **The rig is pinned to HA 2025.7** — older than the Pi, so UI wording differs.
- **SSH tunnel to the Pi dies on reboot/sleep.** Re-run the §3 command.
- **`main`'s cold-open (`docs/session-state/README.md`) is STALE** — dated 2026-08-14 and still
  says the chore chart is "unverified… whether the Pi panel displays it." That's now partly
  answered (content is live; the panel/dashboard still isn't built). It also still frames Tuesday
  2026-08-18 as a hard deadline. **Garrett said on 2026-08-17 to stop leaning on that deadline** —
  the goal is full functionality ASAP, not a date. Rewrite `README.md` from main's perspective at
  merge time.
- **Two new branches have design docs but no implementation:** `fort-knox` (parental controls —
  design + AdGuard flashing runbook, Phase 1 device/OS controls are ungated and need no hardware)
  and `feat/voice-slice` (empty; research done, see below).

### Voice slice — research done, two spec assumptions BROKEN

Not yet written to a design doc. Findings worth preserving:

- **`packages/voice.yaml` CANNOT declare an Assist pipeline.** `assist_pipeline`'s config schema
  accepts exactly one key (`debug_recording_dir`); pipelines live in a storage collection. The plan
  in `2026-06-07-kitchencom-ha-hub-design.md` is impossible — it's UI or websocket API only.
- **Custom intents require the Gemini agent's LLM API set to "Assist"**, or zero custom tools are
  exposed. And **omit `platforms:`** on an intent like "log a compliment" or the tool silently
  vanishes when no matching domain has an exposed entity.
- **No Add-on Store on HA Container** (§4 above) — Whisper/Piper/openWakeWord must be Wyoming
  Docker containers (`rhasspy/wyoming-*`).
- **Decided:** hybrid — on-device wake word + Gemini STT.
- **Mic: nothing in the house has one.** Recommended **HA Voice Preview Edition (~$59–69)**:
  far-field dual mics, on-device wake word, own speaker, verified working on HA Container.
  **No custom wake words** ("Okay Nabu" / "Hey Jarvis" / "Hey Mycroft"). **TTS to the ViewSonic's
  HDMI speakers is a workaround, not config.**
- Gemini STT audio constraint: **WAV/OGG, 16-bit, 16 kHz, mono only.** Cite drift: `stt.py:254`,
  not `:234`.

### Compliment/insult app — decided, not designed

Kids earn **+1** per sincere compliment, **−2** per insult. Decisions locked:
**anyone can log, parent confirms**; **penalties are parent-only, logged after the fact** (kids
cannot report each other — avoids a tattling machine). **"Utter sarcasm" is not machine-detectable**
— it lives in tone, not words; the **parent is the sensor**, which the parent-only penalty rule
already resolves. Don't build a sarcasm classifier. ChoreOps's `BONUSES`/`PENALTIES` structure in
`gen_content.py` is the right shape to extend. **Depends on the voice slice** for capture.

---

## 8. Memory-layer entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

| File | Why it matters here |
|---|---|
| `choreops-content-is-generated-json.md` | content comes from `gen_content.py`; penalties must be negative |
| `pi-direct-ethernet-fallback.md` | the `kitchencom-eth` path used all session |
| `pi-eth0-link-local-fix.md` | why the Pi is on `169.254.x.x` |
| `pi-ssh-access-from-claude.md` | `.234` reservation, macOS Local Network permission |
| `pi-power-and-kiosk-login.md` | the 27W-brick rule — the work office is where it recurred |
| `dev-ha-rig-for-offline-choreops.md` | port 8124, pinned to HA 2025.7 |
| `choreops-source-vendored-locally.md` | read schemas from `reference/ChoreOps-main`; nested-repo cwd trap |
| `concurrent-sessions-branch-hazard.md` | **four worktrees now** — verify branch before every commit |
| `cards-must-be-bundled.md` | if a Lovelace card shows "Configuration error" |
| `v3-internet-time-as-chore-reward.md` | records the Tuesday deadline — **now de-emphasized** (§7) |
