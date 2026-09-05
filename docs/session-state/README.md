# KitchenCOM — cold-open (`main`)

**Last refreshed:** 2026-09-04 evening, immediately after **PR #4 merged**.
**Read this first.** Everything below is verified, with the command that verifies it.

> This is the **project-wide** cold-open, written from `main`'s perspective. Feature branches
> carry their own branch-scoped cold-opens; see §3.

---

## 1. Where is HEAD?

```bash
git branch --show-current                 # expect: main
git log --oneline -1                      # authoritative tip — NOT frozen here
git status --porcelain                    # expect: empty
git ls-remote origin refs/heads/main      # pushed? compare to git rev-parse HEAD
```

**Stable PREFIX** — immutable and verifiable. The tip is deliberately **not** frozen (a
close-out commit cannot name its own SHA, and stamping it is itself a commit, so the loop never
converges). `6613fce` and everything below it will not move:

```
6613fce Merge PR #4: Kitchen panel — chores end-to-end, calendar, screensaver, daily quotes
b2203e6 docs: project CLAUDE.md — absolute read paths, verify-before-success
b6451cb docs: correct stale "the Pi runs HA OS" comment in dev compose
```

⚠️ **This checkout is SHARED — `main` lives in the `.worktrees/main-merge` worktree**, not the
repo root (the root has `feat/choreops-chores` checked out). Two Claude sessions worked this
project on 2026-09-04 and the branch tip moved mid-session. **Always check
`git branch --show-current` before committing**, and re-run `git log` rather than trusting a
remembered SHA.

---

## 2. Empirical state

All re-verified 2026-09-04 evening.

| Check | Command | Expected |
|---|---|---|
| Kitchen Pi | `ssh kitchencom 'uptime'` | responds (up 3 days) |
| HA healthy | `ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8123/'` | `200` |
| No errors | `ssh kitchencom 'sudo grep -icE "(choreops\|screensaver\|zha\|lovelace).*(error\|traceback)" /home/garrettdehart/homeassistant/home-assistant.log'` | `0` |
| Photos | `ssh kitchencom 'ls -1 /home/garrettdehart/homeassistant/media/photos \| wc -l'` | `212` |
| AdGuard Pi | `ssh adguard 'uptime'` | responds |
| Card tests | `cd custom_cards/screensaver-card && npm test` | **109 passing** |
| Dashboard parses | `python3 -c "import yaml,io; yaml.safe_load(io.open('homeassistant/dashboards/kitchen.yaml',encoding='utf-8'))"` | no output |

**No project-wide test suite / typecheck / build.** The only test suite is
`custom_cards/screensaver-card` (109 passing). Everything else is YAML + docs + Pi deployment;
the verification loop is: edit → parse YAML → deploy → restart HA → grep log → look at the panel.

⚠️ **`custom_cards/screensaver-card` typecheck reports 3 PRE-EXISTING errors** in
`test/dist-browser-loadable.test.ts` (missing `@types/node`). Unrelated to any recent change —
do not chase them as a regression. `npm test` is clean.

⚠️ **`dist/` is gitignored.** The built card is deployed to the Pi but never committed. After
editing the card: `npm run build`, copy to the Pi, **and bump the `?v=` cache-buster** in
`.storage/lovelace_resources` (now **v11**) — otherwise the panel serves the cached bundle.

**Known-benign drift:** `habluetooth.scanner ... Failed to force stop scanner`
(`AttributeError: 'NoneType' object has no attribute 'send'`) repeats every few minutes.
Bluetooth stack, unrelated. Do not chase it.

---

## 3. Branches — what is live and what is parked

`main` now carries the entire kitchen-panel arc. Every feature branch below is **behind main by
~105 commits** and would need a rebase/merge before further work.

| Branch | Ahead | What it holds |
|---|---|---|
| `feat/choreops-chores` | 0 | **MERGED via PR #4.** Safe to delete. |
| `fort-knox` | 40 | Grocy deployed to the Pi; SD-card swap postponed (reader + spare card missing) |
| `feat/grocy-kitchen` | 9 | Grocy shopping card — deferred, a concurrent session owned `kitchen.yaml` |
| `feat/adaptive-lighting` | 5 | Circadian lighting design + `homeassistant/packages/lighting.yaml`. ⚠️ **Its §4 step 1a is WRONG for this deployment** — see §5 |
| `feat/irrigation` | 1 | Rainwater capture design; shares the Zigbee coordinator gate |
| `feat/panel-features` | 1 | Panel feature design — six items, half already built |
| `research/att-network-control` | 1 | AT&T gateway cannot do per-device control — negative result, worth keeping |

**Branch-scoped cold-opens** (read the branch's own, not this one, when working there):
- `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/COLD-OPEN-choreops-chores.md` —
  now historical, but the most detailed record of the panel/ChoreOps arc and still the reference
  for §5's traps

---

## 4. What just shipped (PR #4, 100 commits, 2026-06-15 → 09-04)

Full detail: `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/session-state/COLD-OPEN-choreops-chores.md`

- **Chores work end to end.** Claim at the panel, approve from a phone/Mac. The kiosk
  **self-approval hole is closed** — the panel runs as non-admin `Panel`, so a kid can claim but
  not approve. The **auto-approve leak** is closed too: all 14 chores moved
  `auto_approve_pending` → `clear_pending`, so an unverified claim is dropped at midnight
  instead of silently granting points.
- **Rewards pruned to the 4 Cash Outs** (`deploy/choreops-content/prune_rewards.py`).
- **Calendar live**; Kitchen dashboard rebuilt; tap-to-claim tiles in Morning/Evening rows.
- **Screensaver**: 212 photos, portrait pairing, and **shuffle-bag ordering** — order and cursor
  resume across activations, so every photo shows once before any repeats (repeats 25% → 0%).
- **Daily quotes** — `command_line` sensor + Perspective card.
- **Zigbee/ZHA is configured** — ch 15, PAN `2701`, radio live. **No bulbs paired yet.**
- **Pi Wi-Fi fixed** — was 46.7% packet loss from co-channel interference; now 0%.

---

## 5. 🔴 Traps that have each cost real time — read before touching these areas

**ZHA serial path — use `/dev/ttyUSB0`, NOT the by-id path.** HA runs in **Docker** here and
`/dev/serial/by-id/` exists on the host but **not inside the container**. Pointing ZHA at it
stops the radio **silently**: HA still returns 200, zero log errors, but `zigbee.db` never
opens. Diagnostic — a live radio has `zigbee.db-wal`/`-shm` beside the db.
⚠️ `homeassistant/packages/lighting.yaml` §4 step 1a on `feat/adaptive-lighting` still says to
use the by-id path. **That instruction is wrong for this deployment.**

**Zigbee is on channel 15 — do NOT re-form to chase 25.** Home Wi-Fi 2.4 GHz is on ch 10; they
do not overlap. Re-forming would force re-pairing every device for nothing.

**Pi unreachable? Check the ROUTE before blaming the Pi.** Three different conditions look
identical. `route -n get default | grep interface` → `en0` = home, `utun*` = the **work VPN has
captured the LAN** (hit twice on 2026-09-04; `ipconfig getifaddr en0` still shows a
`192.168.1.x` address, so the address is NOT the tell), `10.x` = at the office, where there is
**no path at all** (Tailscale is blocked by Fortinet).

**`core.entity_registry` and `core.restore_state` are NOT live state.** The registry keeps rows
for deleted entities indefinitely; `restore_state` is a startup snapshot. Both showed 16 rewards
long after 12 were deleted. **Query the recorder DB** (`home-assistant_v2.db`, newest `states`
row per `metadata_id`) to prove an entity is gone.

**The calendar card accepts only three views:** `dayGridMonth`, `dayGridDay`, `listWeek`.
`dayGridWeek` / `timeGridWeek` do not exist and **fail silently** to a month view.

**A stuck card after a long screensaver is the BROWSER, not HA.** The kiosk chromium had run
~2 days at 1.25 GB when it produced a permanent spinner. `pkill -TERM -f "chromium --js-flags"`
— the launcher's supervisor loop respawns it in 3s. (10 h uptime = ~330 MB, which is healthy.)

**`kitchen.yaml` is contested** — sessions edit it live on the Pi. Always `diff` the Pi copy
against the repo before deploying, and back up on the Pi first.

**Deleting a ChoreOps reward does NOT check `pending_count`** — it silently discards a
redemption the kid already spent points on. `prune_rewards.py` guards this; the UI does not.

---

## 6. Hardware

**Kitchen Pi** — `ssh kitchencom` @ `192.168.1.234` (reserved). Pi 5, HA in **Docker** (there is
no `homeassistant.service`; use `docker restart homeassistant`). Runs labwc/Wayland; the kiosk is
chromium launched from `~/.config/labwc/autostart` via
`deploy/kiosk/start-kiosk-wayland.sh`, which supervises and respawns it. Needs its **own 27 W
supply**. Touch requires a **USB hub** in the path. Tailnet `100.91.117.105`.

**Wi-Fi — pinned to 2.4 GHz ch 10 (2026-09-04).** It was on 5 GHz ch 44 where a **hidden AP
`C6:98:5C:AB:21:A2`** sat on the same channel: 46.7% packet loss with *clean* latency, which is
the signature of collisions rather than distance. Now 0% loss. Persisted in netplan
(`band: "2.4GHz"`, `powersave 2`); backup `/etc/netplan/90-NM-37d92620-*.yaml.bak-preband-*`.
Better long-term: change the router's 5 GHz channel away from 44, or plug in ethernet
(**`eth0` is DOWN**).

**Zigbee** — ITead **ZBDongle-P** (CC2652P; the CP210x bridge → `ttyUSB` is the -P
discriminator). On the Pi's root hub via the extension cradle, not behind the touchscreen hub.

**AdGuard Pi** — `ssh adguard` @ `192.168.1.113`. Home-LAN only (**not** on the tailnet), so
`Connection refused` usually means the wrong network. Runs in **Docker** — `systemctl` reports
nothing about it.

---

## 7. Carry-forwards

- 🔴 **AdGuard is BUILT but NOT IN SERVICE** — the router still needs pointing at
  **`192.168.1.113`** for DNS. Until then none of the blocking or scheduling applies to any
  device.
- 🔴 **25 photos have only ONE copy.** Backup audited 2026-09-04 filename-by-filename: the 90
  added that day are in `Photos/__KitchCom` ✅, 97 of the original 122 are in
  `Photos/../Mom's Photos` ✅, but **25 exist only as HEIC in `~/Downloads`** (`IMG_2816`,
  `IMG_2822`, `IMG_2823`, `IMG_2825`, `IMG_2832`, `IMG_2839`, `IMG_2857`, `IMG_2869`,
  `IMG_2872`, `IMG_2881`, `IMG_2902`, `IMG_2908`, …). `~/Downloads` is not a backup. **The 212
  photos are Pi-only and not in git** (correctly — binary content), so a fresh clone cannot
  reproduce the screensaver.
- 🟡 **Zigbee bulbs are NOT paired** (`devices_v15` = 1, coordinator only). Needs Garrett at the
  panel, in the bulbs' final fixtures. Then `feat/adaptive-lighting` can be finished.
- 🟡 **`feat/choreops-chores` is merged and safe to delete**, locally and on origin.
- 🟡 **Every other feature branch is ~105 commits behind main** and needs a rebase before work.
- 🟡 **`listWeek` hides empty days** — FullCalendar's list view renders only days with events.
  Showing all 7 cells would need a custom card.
- 🟡 **Router 5 GHz ch 44 is still contested**; the Pi is parked on 2.4 GHz as a workaround.
- 🟢 **Chore Champion `6/250` un-zeroed** for Rowan, partly from the Aug-19 phantom re-award.
- 🟢 **Points-structure trap:** zeroing points naively breaks the points sensor — every level
  must be a dict with `all_time` **nested**. Presents ONLY as the entity showing "Unavailable".

---

## 8. Memory layer

`/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`
(outside the repo; `MEMORY.md` there is the index — **47 entries**)

Most relevant on `main`:
- 🔴 `zha-must-use-ttyusb-in-docker.md` — before touching the ZHA serial path
- 🔴 `pi-wifi-cochannel-interference.md` — before diagnosing any Pi connectivity
- `entity-registry-is-not-live-state.md` — proving an entity is really gone
- `calendar-card-only-three-views.md` — the 3 valid `initial_view` values
- `kiosk-spinner-after-screensaver.md` — a stuck card is the renderer, not HA
- `screensaver-photos-folder-and-formats.md` — folder, formats, HEIC trap, ordering
- `reward-delete-drops-pending-claims.md` — `delete_reward` ignores `pending_count`
- `kitchen-yaml-contested-file.md` — the shared-file discipline
- `kiosk-admin-approval-hole.md` — `group_ids` is authoritative, not `is_admin`
- `midnight-rollover-guard.md` — the phantom re-award, and why midday restarts are safe

**Environment gotchas that cost time:**
- **`timeout` does not exist on macOS** — use `ssh -o ConnectTimeout=N`.
- **`--include=*.py` fails unquoted under zsh** — quote it.
- **`sudo cmd > file` fails** — the shell redirects unprivileged; use `sudo tee` or a heredoc.
- **`cd` into a nested repo changes cwd for later tool calls** — use absolute paths (this is
  also the load-bearing rule in the project `CLAUDE.md`).
