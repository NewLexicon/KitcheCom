# AdGuard Pi build — session handoff

**Written:** 2026-08-17 evening (session "FortKnox", branch `fort-knox`).
**Supersedes on the hardware question:** the flashing runbook's §0 "resolve before
flashing" — the board is identified and **the card is now flashed**.

> **Read with:** `docs/session-state/2026-08-18-fort-knox-cold-open.md` (branch cold-open)
> and `docs/session-state/2026-08-17-adguard-pi-flashing-runbook.md` (the procedure).

---

## 1. The box, as built

| | |
|---|---|
| **Hostname** | `adguard` |
| **Model** | Raspberry Pi 3 Model B **Rev 1.2** (`/proc/device-tree/model` on the running OS) |
| **OS** | Raspbian GNU/Linux 13 (trixie), **Lite 32-bit**, `armv7l` |
| **eth0** | `192.168.1.113` — MAC `b8:27:eb:ae:2a:5c` |
| **wlan0** | `192.168.1.236` — MAC `b8:27:eb:fb:7f:09`, SSID `ThunderEnlighten` |
| **Disk** | 29 GB usable, filesystem auto-expanded, 10% used |
| **RAM** | 920 MB total / ~800 MB available |
| **SSH** | `ssh adguard` — passwordless, ed25519, alias added to `~/.ssh/config` |
| **sudo** | passwordless via `/etc/sudoers.d/010_garrettdehart-nopasswd` |

**Port 53 is free** and `systemd-resolved` is **inactive** (not merely stopped — the Lite
image does not ship it). Runbook §5's port-53 contingency is **not needed on this box.**

`eth0` negotiated **100 Mb/s full duplex, link detected** — ample for DNS.

### 🔴 Two IPs, one Pi — do not read this as two devices

`eth0` and `wlan0` each hold a DHCP lease, so the Pi answers on **both** `.113` and
`.236`, and both advertise the same hostname. During this session that briefly looked like
two Raspberry Pis on the LAN (two distinct `b8:27:eb` MACs). It is one board: same model,
same hostname, same uptime, same SSH host key.

**Decision pending:** design §11 wants this box **wired**. Two live interfaces means an
unpredictable source IP and two reservations to make at the gateway. Recommended:

```bash
sudo nmcli con down netplan-wlan0-ThunderEnlighten
sudo nmcli con modify netplan-wlan0-ThunderEnlighten connection.autoconnect no
```
Keep Wi-Fi credentials on the card as a recovery path, but do not run both in steady state.
**Do this before reserving the IP at the gateway (runbook §3)** or you will reserve the
wrong one.

## 2. What the old card turned out to hold

**LEDE 17.01.4 (OpenWrt predecessor, ~Oct 2017) — a working router build.** Discovered by
booting the Pi on a direct laptop-to-Pi Ethernet cable and reading LuCI.

**Erased deliberately.** Garrett's call, 2026-08-17: *"That build is 8 years old and I
don't remember what it was. I'm cool to erase and start fresh."* No image was taken. If a
future session wants that config back, **it is gone** — do not go looking for a backup.

## 3. 🔴 Power supply is UNDER SPEC — the live risk on this box

**The PSU in use is a Samsung EP-TA20JWE: 5.0V ⎓ 2.0A (10W).**
**A Pi 3 Model B officially requires 5V 2.5A (12.5W).** It is **0.5A short.**

It also advertises "Adaptive Fast Charging" — these negotiate voltage with the attached
device, and a Pi does not negotiate, it just draws.

Observed so far: `throttled=0x0`, `volt=1.2688V` at idle, and the box survived an 85-package
`apt upgrade`. **That is not proof.** Memory `pi-power-and-kiosk-login` records the exact
trap: **`throttled=0x0` proves nothing after a reboot** — the register clears at boot.

**How this fails:** not with a clean error. Brownouts under load look like a hang, a
spontaneous reboot, or SD corruption weeks later. On the box the household depends on for
name resolution, that reads as "the internet is broken."

**→ Replace with a 5V 2.5A+ micro-USB supply before Phase 3.** The official Pi 3 PSU is
5.1V 2.5A. **Check `vcgencmd get_throttled` after any unexplained behaviour** — a non-zero
value (bit 16 = under-voltage has occurred) confirms it.

## 4. Traps hit during this build

### 4.1 The old Pi hijacks the laptop's DNS over a *direct cable*

Fully documented in the flashing runbook §0. Summary: with the laptop-to-Pi cable
attached, the LEDE Pi's DHCP won and macOS took `192.168.1.1` as resolver #1. It answers
nothing → **all name resolution died** while wifi was healthy. `git push` failed with
`ssh: Could not resolve hostname github.com` **plus** *"make sure you have the correct
access rights"*, which reads as an SSH-key problem and is not. It later captured the
**default route** as well (`Network is unreachable`). **Fix: unplug the cable.**

This is **Phase 3's failure mode in miniature** and the empirical argument for design §12's
**printed** rollback card.

### 4.2 Imager no longer configures passwordless sudo

A fresh Trixie Lite image prompts for a password on every `sudo`, which blocks all
non-interactive SSH automation. Fixed once, by hand, in a **real terminal**:

```bash
ssh -t adguard 'echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/010_$USER-nopasswd && sudo chmod 440 /etc/sudoers.d/010_$USER-nopasswd'
```

⚠️ **This must run in Terminal.app, not through the agent harness.** `ssh -t` cannot
allocate a TTY when stdin is a pipe — the harness's `!` prefix fails with *"Pseudo-terminal
will not be allocated because stdin is not a terminal."* The `!` prefix also does **not**
keep a typed password out of the transcript; it routes through the harness. Use a real
terminal for anything that prompts for a secret.

### 4.3 🔴 apt reports success while fetching nothing — IPv6 timeouts

**Same shape as cold-open §4's four AdGuard traps: reported success, did nothing.**

The first `apt-get upgrade` ended with `E: Unable to fetch some archives`, **five failed
packages, and all 85 still pending** — while the shell pipeline still reported `EXIT:0`.
The failures were IPv6:

```
Unable to connect to raspbian.raspberrypi.com:http: [IP: 2a00:1098:0:80:1000:75:0:3 80]
Could not connect to ... (93.93.128.193), connection timed out
```

The mirror's IPv6 address is tried first and times out. **Fix applied to this box:**

```bash
echo 'Acquire::ForceIPv4 "true";' | sudo tee /etc/apt/apt.conf.d/99force-ipv4
```
After that the same upgrade took 85 → 8 remaining (the 8 being kernel packages held back
for new dependencies, resolved with `full-upgrade`).

⚠️ **Expect this again for `get.docker.com` and any other external fetch on this box.** If
a download stalls, suspect IPv6 before suspecting the network.

**→ Verify apt by STATE, never by exit code:** `apt list --upgradable | grep -vc "^Listing"`
should reach 0. An exit code from a pipeline reflects the last command in it, not apt.

⚠️ **`/var/run/reboot-required` is unreliable on Raspberry Pi OS.** It read `no` immediately
after a new kernel + initramfs were installed. Compare `uname -r` against `ls /boot/vmlinuz-*`
instead.

### 4.4 `ssh-keyscan` needed for the new alias

Adding `Host adguard` to `~/.ssh/config` gave `Host key verification failed` because the
key was known under the IP, not the alias. Fix: `ssh-keyscan -t ed25519 adguard >> ~/.ssh/known_hosts`.

## 4b. AdGuard is INSTALLED AND RESOLVING

| | |
|---|---|
| **Version** | `v0.107.78` (pinned, per design §4.1) |
| **Container** | `adguardhome`, `restart: unless-stopped`, `network_mode: host` |
| **Compose** | `/opt/adguard/docker-compose.yml` (source of truth: `deploy/adguard/docker-compose.yml`) |
| **Config** | `/opt/adguard/conf/AdGuardHome.yaml` (root, 0600) |
| **Admin UI** | `http://192.168.1.113:3000` |
| **DNS** | `*:53` UDP + TCP — **verified by resolving example.com and wikipedia.org** |
| **Docker** | 29.7.2, Compose v5.5.0, service `enabled` at boot |

**API credentials** live in `~/.adguard-netrc` on the Pi (mode 0600). Drive the API with
`curl --netrc-file ~/.adguard-netrc http://127.0.0.1:3000/control/...`. AdGuard is
basicAuth-only (design §9.3), so this password is reused in HA secrets later.

### 🔴 The setup wizard puts the admin UI on port 80, not 3000

Completing the wizard wrote `address: 0.0.0.0:80` (line 12 of `AdGuardHome.yaml`) — **not**
the `:3000` the wizard's own first screen shows. Symptom: every API call to `:3000` returns
**`HTTP 000` (connection refused)**, which looks like an auth or service failure and is
neither. Diagnose with `ss -tlnp`, not by re-checking credentials.

Corrected on this box back to `:3000`:
```bash
sudo cp /opt/adguard/conf/AdGuardHome.yaml /opt/adguard/conf/AdGuardHome.yaml.bak-port80
sudo sed -i '12s|address: 0.0.0.0:80|address: 0.0.0.0:3000|' /opt/adguard/conf/AdGuardHome.yaml
cd /opt/adguard && sudo docker compose restart
```
DNS kept resolving across the restart. A backup of the port-80 config is at
`AdGuardHome.yaml.bak-port80`.

### ✅ Trap §4.4 (SafeSearch master switch) reproduced on this live instance

`GET /control/safesearch/status` on the freshly-configured box returned **exactly** the
shape cold-open §4.4 predicted:

```json
{"enabled": false, "bing": true, "duckduckgo": true, "ecosia": true,
 "google": true, "pixabay": true, "yandex": true, "youtube": true}
```

**Every engine reads `true` while SafeSearch is OFF.** Reading the engine list in the UI
would have concluded it was working. **Set `enabled` explicitly and re-read the status.**

### Baseline before any blocking (so "after" is meaningful)

Captured 2026-08-17 with AdGuard running and nothing blocked:

| Domain | Resolved to |
|---|---|
| `youtube.com` | `172.217.215.190` |
| `googlevideo.com` | `108.177.122.147` |
| `youtubei.googleapis.com` | `172.217.118.4` |

**7 clients auto-detected, 0 configured.** No blocked services, no per-client rules yet.

### ⚠️ Password exposure — 2026-08-17

The first AdGuard admin password was **printed into the session transcript** by an `awk`
that dumped field 2 of the netrc file (field 2 of the `password` line is the password).
Garrett rotated it via the UI the same session. **When inspecting `~/.adguard-netrc`, print
field 1 only, or just `ls -l` it.**

## 4c. ✅ END-TO-END ACCEPTANCE TEST PASSED (runbook §7 shape)

**YouTube blocking works, per-client, verified by resolution.** Run 2026-08-17 against a
single volunteer device (the Mac at `192.168.1.180`), then rolled back.

### SafeSearch

Master switch set via `PUT /control/safesearch/settings` with `enabled` **and** all engines
in one body, then **re-read** — `enabled: true` confirmed, and persisted to
`AdGuardHome.yaml:148`.

⚠️ **Testing gotcha:** bare `google.com` does **not** show SafeSearch. The rewrite targets
**`www.google.com`** (what browsers actually request). A first test on `google.com` returned
a normal-looking address and briefly read as a failure. **The query log is the authority:**

```
www.google.com   FilteredSafeSearch   ['forcesafesearch.google.com.']
```

### YouTube blocking, per-client

Client added with `blocked_services: ["youtube"]`, `use_global_blocked_services: false`.
**Re-read after the write** (trap §4.1) — `filtering_enabled`, `safebrowsing_enabled`, and
`safe_search.enabled` all still `true`, i.e. nothing was silently zeroed.

| Domain | Baseline (before) | Blocked client | Query-log reason |
|---|---|---|---|
| `youtube.com` | `172.217.215.190` | **`0.0.0.0`** | `FilteredBlockedService` |
| `www.youtube.com` | — | **`0.0.0.0`** | `FilteredBlockedService` |
| `googlevideo.com` | `108.177.122.147` | **`0.0.0.0`** | `FilteredBlockedService` |
| `youtubei.googleapis.com` | `172.217.118.4` | **`0.0.0.0`** | `FilteredBlockedService` |
| `example.com` (control) | resolves | **still resolves** | `NotFilteredNotFound` |

### 🔑 Per-client targeting proven — the mechanism the whole design rests on

Same domain, same resolver, two source IPs, at the same moment:

| Source | `youtube.com` → |
|---|---|
| `192.168.1.180` (configured client) | **`0.0.0.0`** blocked |
| `192.168.1.234` (Pi 5, not configured) | `2607:f8b0:4002:c00::5b` normal |

**Kids restricted, parents untouched — empirically confirmed on this box**, not inferred.

### Rolled back

Test client deleted (`configured clients: 0`), and `youtube.com` verified resolving normally
again from the Mac. **No client entries remain.** The box is running with global SafeSearch
on and nothing else configured.

**136 built-in services** confirmed present, including `youtube`, `tiktok`, `instagram`,
`discord`, `snapchat`, `twitter`, `reddit`, `twitch` — matching the prior lab findings.
⚠️ The X id is **`twitter`**, not `x`.

## 4d. Household device inventory — identified 2026-08-17

Identified by MAC OUI lookup plus **Roku's own ECP API** (`http://<ip>:8060/query/device-info`),
which returns exact model names — far better than guessing from a vendor string.

| IP | MAC | Device | Role |
|---|---|---|---|
| `.82` | `50:b0:3b:38:80:58` | **PlayStation 5** (Sony Interactive) | kid |
| `.216` | `d4:be:dc:6d:57:3d` | **65" Roku TV** `65R4CX` | kid |
| `.228` | `c4:98:5c:ab:21:a2` | **55" TCL Roku TV** `55S425` | kid |
| `.230` | `d4:ab:cd:c0:d9:c2` | **55" TCL Roku TV** `55R625` | kid |
| `.238` | `2c:26:17:96:a2:77` | **Oculus/Meta VR headset** | kid? |
| `.180` | `26:d2:55:8f:35:8b` | **Garrett's Mac** (confirmed on-screen) | **parent** |
| `.215` | `76:ad:62:22:77:c4` | Apple device, randomized MAC | ❓ **unidentified** |
| `.250` | `b2:c7:43:f8:33:20` | Apple device, randomized MAC | ❓ **unidentified** |
| `.107` | `fc:65:de:6d:af:ee` | Amazon (Fire TV / Echo) | ? |
| `.85` | `ec:74:d7:88:45:0e` | Grandstream VoIP phone | infra |
| `.227` | `44:61:32:f8:0c:c2` | ecobee thermostat | infra |
| `.248` | `40:45:da:26:0d:c1` | Spreadtrum (budget tablet/phone?) | ? |
| `.113` | `b8:27:eb:ae:2a:5c` | **AdGuard Pi** (eth0) | infra |
| `.234` | `2c:cf:67:e2:f2:67` | **Pi 5 / Home Assistant** | infra |
| `.254` | `cc:ab:2c:cf:b9:41` | **HUMAX gateway** (not AT&T-branded) | infra |

⚠️ **All three Roku TVs stay network-connected in standby.** Powering one on produced **zero**
new ARP entries — a wake-and-diff identification strategy does not work on them. The ECP
query does.

⚠️ **`.215` and `.250` are still unidentified Apple devices.** One is likely the iPad. **Do
not create kid rules for either until confirmed** — blocking the wrong one hits a parent.

### 🔑 Apple "Private Wi-Fi Address" — Fixed is enough, Off is not required

Correction to earlier guidance in this session: the setting has **three** states, and the
distinction matters for DHCP reservations.

| Setting | Behaviour | Reservation holds? |
|---|---|---|
| **Off** | real hardware MAC | ✅ |
| **Fixed** | one private MAC, **stable per network** | ✅ **this is sufficient** |
| **Rotating** | MAC changes periodically | ❌ **silently breaks** |

Garrett's Mac is on **Fixed** (verified on-screen: `26:d2:55:8f:35:8b`, matching ARP).
**On each kid's iPad, confirm Fixed or Off** — Settings → Wi-Fi → ⓘ → Private Wi-Fi Address.
On Rotating, the device silently drops its reservation and its ruleset, becoming unfiltered.

### Client entries created — deliberately INERT

6 clients created, then **read back to verify** (trap §4.1): every one has
`filtering_enabled`, `safebrowsing_enabled`, and `safe_search.enabled` all `true`, with
**`blocked_services: []`**.

```
Oculus-VR · PARENT-mac-garrett · PS5 · Roku-55-R625 · Roku-55-S425 · Roku-65-livingrm
```

**Nothing is blocked.** Confirmed by resolution after creation — `youtube.com` and
`tiktok.com` both resolve normally. These are labelled containers with protections on;
adding a service id to one turns blocking on for that device only.

⚠️ **`curl -w` ate a `%-22s` from the surrounding printf** during creation, producing
garbled output that showed both `HTTP 000` and `HTTP 200` per client. **The write was
fine** — proven by reading the client list back. Another case where the output of the write
was not the evidence; the re-read was.

### Next: reserve these IPs at the gateway BEFORE relying on the rules

The gateway is a **HUMAX** at `192.168.1.254` (responds HTTP 302). Client entries key on IP
(cold-open §8) — an unreserved device that changes address **silently loses its ruleset**,
and a parent device that changes address **silently picks up the kid ruleset**.

## 5. Where the build stopped

**Done:** flashed · booted · identified · SSH + passwordless sudo · OS fully updated
(0 upgradable) · kernel `6.18.39+rpt-rpi-v7` + clean reboot · Docker 29.7.2 + Compose
v5.5.0 · **AdGuard `v0.107.78` running and resolving DNS** · admin UI moved back to `:3000`
· API credentials in `~/.adguard-netrc`.

**Runbook §1–§6 are complete** except per-client configuration.

**Not yet done — the actual parental controls:**

1. **SafeSearch** — set `enabled: true` (the master switch, trap §4.4) and **re-read
   `/control/safesearch/status` to confirm**, don't trust the write.
2. **YouTube blocking** — the built-in `youtube` service id (176 rules; bundles
   `googlevideo.com` so YouTube Music breaks — accepted per design §8).
3. **Per-client rules + allowance schedule** — ⚠️ the window is the hours the service is
   **AVAILABLE**, not blocked, and wrapping ranges (21:00→07:00) are rejected with HTTP 400.
   Cold-open §6 has the tested shape.
4. **Roku Live TV** needs a custom `$client` rule + cron (`adguard-rule-schedule.py`),
   because `time=` is accepted and silently ignored (trap §4.3).
5. **Never hand-write a client update** — `/clients/update` zeroes omitted fields while
   returning HTTP 200 (trap §4.1). Use `docs/reference/adguard-rmw.py`.
6. **Disable wlan0 before reserving the IP** at the gateway (runbook §3), or the wrong
   address gets reserved.
7. **Home Assistant integration** — the Pi 5 (`ssh kitchencom`, `192.168.1.234`) runs HA in
   Docker, `network_mode: host`. AdGuard is basicAuth-only, so the password goes in
   `secrets.yaml`.

## 6. Next session's literal first move

Everything through runbook §6 is done. Start at per-client configuration:

```bash
# SafeSearch master switch (trap §4.4) — then VERIFY by re-reading, not by the write
ssh adguard 'curl -s --netrc-file ~/.adguard-netrc http://127.0.0.1:3000/control/safesearch/status'
```

⚠️ **Verify every change by RESOLVING A DOMAIN**, never by the API's response. All four
cold-open §4 traps return success. Baseline to compare against is in §4b above.

**The household is NOT cut over** and must not be until: a **printed** rollback card at the
gateway (design §12), a **filtered** secondary resolver (cold-open §8 — an unfiltered
secondary converts enforcement into a suggestion), and a **fresh A2 card** (this Pi runs the
~6-year-old drawer-aged SanDisk — fine for testing, not for the box the house depends on).
Also replace the **under-spec PSU** (§3) first.

**Still open, unchanged:** the household is **not** cut over (design Phase 3), and must not
be until there is a **printed** rollback card at the gateway, a filtered secondary
resolver, and a **fresh A2 card** — the card in this Pi is the ~6-year-old drawer-aged
SanDisk, fine for testing, **not** for the box the house depends on.
