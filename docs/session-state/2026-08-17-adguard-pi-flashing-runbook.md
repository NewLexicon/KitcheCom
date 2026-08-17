# AdGuard Pi Flashing Runbook — Fort Knox Phase 2

**Branch:** `fort-knox` (worktree: `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox`)
**Design:** `docs/superpowers/specs/2026-08-16-parental-controls-design.md`
**Written:** 2026-08-17, before the hardware was identified conclusively.

> **GATE LIFTED 2026-08-17** by Garrett — the Tuesday deliverable is being handled in a
> separate session, so it no longer blocks this work. The original gate (design §13) was
> about not spending the pre-deadline evening here; that reasoning no longer applies.
>
> **Two physical blockers remain, and they are the real constraint:**
> 1. **No microSD reader attached** (§0 called this the most likely thing to stall the
>    evening — it did).
> 2. **Must be flashed at home.** §1 bakes the Wi-Fi SSID into the card *before first
>    boot*; flashing from the work network burns in the wrong SSID.
>
> **Already done for you (2026-08-17), so flashing night is shorter:** every software
> claim in §5–§6 was verified against a live v0.107.78 container on the Mac — image
> version + architectures, the `youtube` service contents, SafeSearch's engine list and
> its master-switch gotcha, the scheduling limitation, and the client-update trap (with a
> tested helper now in `docs/reference/adguard-rmw.py`). See
> `docs/session-state/2026-08-17-adguard-api-lab-findings.md`.
>
> **👉 If you cannot flash tonight, `docs/session-state/2026-08-17-phase1-device-controls-runbook.md`
> needs no hardware at all** and delivers the download-approval capability that was the
> original ask.

**Scope of this runbook:** Phase 2 only — get AdGuard Home running on the old Pi and
test it against one volunteer device. **It does not change household DNS.** That is
Phase 3, gated separately, and it requires the posted rollback card (§8 below).

---

## 0. Hardware identification — resolve before flashing

Two photos were taken 2026-08-17 (`IMG_3269`, `IMG_3270`, in `~/Downloads`). They
confirm a **full-size Raspberry Pi** — bare PCB, 40-pin GPIO header, microSD slot
labeled `MICRO SD CARD`, Elpida DRAM (`B8132B4PB-8D-F`), clear acrylic case, factory
Data Matrix with date code `18/09`.

**What is NOT yet confirmed:** the exact model. Both photos show the underside; the
model name is silkscreened on the top. Inference from the visible evidence is
**Pi 3 Model B or 3 B+**, which satisfies design §11 (Pi 3B+ or newer, wired Ethernet).
A Pi 2 Model B is visually near-identical from below and would also work for plain DNS.

**Do not flash until identified.** Cheapest path — boot it and ask (this is design §11
pre-flight #1, the gate on this whole phase):

```bash
cat /proc/cpuinfo | grep -E 'Model|Revision'
cat /sys/firmware/devicetree/base/model; echo
```

Reading the running system beats reading silkscreen through a case. If it turns out to
be a **Pi Zero / Zero 2 W**, stop and re-read design §11 pre-flight #1 — the Zero 2 W is
explicitly *not recommended* as the household's primary resolver (2.4GHz-only Wi-Fi, no
Ethernet make link reliability the dominant risk, regardless of adequate CPU), and the
plan changes.

**A note on the original description:** this was described as "an old USB mini plug,"
which initially read as a USB dongle — a real concern, since a Zigbee ZBDongle-P (also
on this project's shopping list, per memory `S2299`/`10786`) cannot run AdGuard at all.
The photos ruled that out. Recorded so the ambiguity isn't re-litigated.

### The SD card that's already in it

`IMG_3270` shows a **SanDisk Ultra 32GB** card seated in the slot.

1. **Its contents are unknown.** Assume it holds an old project. **Flashing erases it.**
   If anything on it matters, image it first: `sudo dd if=/dev/diskN of=~/pi-old.img bs=1m`
2. **It is ~6+ years old and was in a drawer.** Old cards fail silently — they write
   fine, then corrupt weeks later. For the box the whole house depends on for name
   resolution, **use a fresh A2 card** (~$8–10). The old card is fine for Phase 2
   testing; do not carry it into Phase 3.

### Prerequisites to have in hand

- [ ] **A microSD reader for the laptop.** Most modern laptops lack a slot. This is the
      single most likely thing to stall the evening.
- [ ] Fresh microSD card (32GB is ample; AdGuard needs ~100MB)
- [ ] Pi's own power supply — per memory `pi-power-and-kiosk-login`, **do not** power a
      Pi from a monitor's USB-C or a laptop dock. That lesson cost real time on the Pi 5.
- [ ] Ethernet cable + a free router/switch port (recommended for the primary resolver)

---

## 1. Flash the card — no monitor, no keyboard, no Ethernet-to-laptop needed

**Answering the question that prompted this runbook:** you do **not** need an Ethernet
cable between the Pi and your computer. Wi-Fi credentials are baked into the card
*before first boot*, and the Pi joins the network on its own.

1. Install **Raspberry Pi Imager** (raspberrypi.com/software).
2. Insert the microSD card into the laptop.
3. **Choose OS:** Raspberry Pi OS **Lite (64-bit)** — no desktop. This box is a headless
   appliance; the desktop wastes RAM and SD lifespan.
   - *Contrast with the Pi 5*, which runs Desktop deliberately because it drives the
     kiosk (memory `hardware-deployment-phase-live`). Different job, different choice.
   - If the board turns out to be a Pi 2 or early 3, use **32-bit Lite** — the 3 B+ and
     earlier have limited 64-bit support and 32-bit is the safe default.
4. **Click the gear / "Edit Settings"** and set:
   - Hostname: `adguard` (reachable as `adguard.local`)
   - Username + password — **not** the default `pi`
   - ☑ **Configure wireless LAN** → your *home* SSID + password, country `US`
   - ☑ **Enable SSH** → "Allow public-key authentication only", and paste
     `~/.ssh/id_ed25519.pub` so it works passwordless like `ssh kitchencom` already does
5. Write, then eject.

> **Flash at home, not at work.** The SSID baked in must be the home network. Flashing
> at the office means redoing it.

---

## 2. First boot and SSH in

Insert the card, connect Ethernet if using it, then power on. Allow ~90s for first boot
(it expands the filesystem and reboots once).

```bash
ping -c 3 adguard.local
ssh <user>@adguard.local
```

**If `adguard.local` doesn't resolve**, find it on the network:

```bash
# The AT&T gateway's device list is served unauthenticated (per the 2026-08-15 probe)
curl -s http://192.168.1.254/cgi-bin/devices.ha | grep -oE '192\.168\.1\.[0-9]+' | sort -u
```

Then confirm the model per §0 before going further.

### Add an SSH alias

Mirror the existing `kitchencom` pattern in `~/.ssh/config`:

```
Host adguard
    HostName adguard.local
    User <user>
    IdentityFile ~/.ssh/id_ed25519
```

**macOS gotcha, already learned on this project:** the first local-network connection
from a new terminal may need macOS's *Local Network* permission granted to the terminal
app. See memory `pi-ssh-access-from-claude`.

---

## 3. Reserve the IP at the gateway — do this before installing

A DNS server must not change address. Design §9.4 depends on stable client identity, and
this box *is* a client of the gateway.

At `http://192.168.1.254` → **IP Allocation** (`ipalloc.ha`), assign a fixed address —
e.g. `192.168.1.53` (`.53` is a nice mnemonic; DNS is port 53). The Pi 5 already holds
`.234` per memory `pi-ssh-access-from-claude`; **do not disturb it.**

Record the chosen IP here once assigned: `__________`

---

## 4. Update and install Docker

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot          # if the kernel updated
```

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group to take effect
docker run --rm hello-world     # verifies the daemon
```

---

## 5. Run AdGuard Home

Pin the version. Design §4.1 specifies **v0.107.78** — the current stable. **Do not use
`:latest`**, and do not use v0.108.x, which is still beta.

✅ **Re-verified against the live registry 2026-08-17:** v0.107.78 is still the newest
stable (newer tags are `v0.108.0-b.90` / `beta` / `edge`), pushed 2026-07-13.

🔑 **The image ships `arm64`, `arm/v7`, and `arm/v6`, so it runs on this board either
way.** The §0 model question does **not** gate the container — it only decides the 32- vs
64-bit **OS** choice in §1 step 3. One less thing to discover at flashing time.

```bash
sudo mkdir -p /opt/adguard/{work,conf}
```

`/opt/adguard/docker-compose.yml`:

```yaml
services:
  adguardhome:
    image: adguard/adguardhome:v0.107.78
    container_name: adguardhome
    restart: unless-stopped
    network_mode: host          # required: DNS needs port 53 on the host
    volumes:
      - /opt/adguard/work:/opt/adguardhome/work
      - /opt/adguard/conf:/opt/adguardhome/conf
```

```bash
cd /opt/adguard && sudo docker compose up -d
sudo docker ps          # expect adguardhome, status Up
```

**Why `network_mode: host`:** AdGuard must see real client source IPs. Under bridge
networking every query appears to come from the Docker gateway, which destroys per-client
identification — and per-client rules are the entire point (design §9.4).

**Possible port-53 conflict:** Raspberry Pi OS Lite normally has nothing on 53, but if
the container fails to bind:

```bash
sudo ss -lnup | grep ':53'
# if systemd-resolved holds it:
sudo systemctl disable --now systemd-resolved
sudo sh -c 'echo "nameserver 1.1.1.1" > /etc/resolv.conf'
```

---

## 6. Initial configuration

Open `http://<pi-ip>:3000` and complete setup. Admin interface on **:3000** (leave :80
free), DNS on **:53**. Set a strong admin password — design §9.3 notes the AdGuard API
is **basicAuth only, no tokens**, so this password ends up in HA secrets.

Then configure per the design:

- **§9.1 Safe search** → enable for Google, Bing, DuckDuckGo, YouTube. Native feature,
  cannot be disabled client-side. Engine list verified against a live v0.107.78 on
  2026-08-17 (also supports Yandex, Ecosia, Pixabay).
  - ⚠️ **`enabled` is a SEPARATE master switch from the per-engine flags.** A stock
    instance reports `enabled: false` while every engine already reads `true` — so the
    engines look on and SafeSearch is off. Setting engines without setting `enabled` does
    nothing. Confirm with:
    ```bash
    curl -s --netrc-file ~/.adguard-netrc http://<pi-ip>:3000/control/safesearch/status
    ```
- **§8 Blocked services** → use the **built-in "YouTube" service entry**, not a
  hand-written domain list. It already bundles `youtubei.googleapis.com`,
  `googlevideo.com` (wildcard), etc.
  - **Accepted collateral damage:** this also blocks **YouTube Music**, and **YouTube
    Kids cannot be separated** (shared API host). Both were decided in design §8.
  - **Not affected:** Google Search, Gmail, Workspace, Classroom, Drive.
- **Clients** → add one entry per device by IP or MAC. There is **no first-class "group"
  object** (design §9.4) — per-kid grouping is our naming convention, not a feature.

### The household layout — scheduled for kids, always-open for parents

Verified working 2026-08-17 (lab findings §4b). **Requires no cron** — the schedule is a
per-client field, so this is pure config:

| Client | `blocked_services` | `blocked_services_schedule` |
|---|---|---|
| each kid device | `["youtube"]` | allow **07:00–21:00** (Sat/Sun later if wanted) |
| each parent device | `[]` | none needed — nothing to pause |

> 🔴 **The window is an ALLOWANCE window, not a blocking window.** Enter the hours YouTube
> should be **available**. Verified by resolution: inside the window YouTube resolves,
> outside it returns `0.0.0.0`. Entering `21:00–07:00` to mean "block overnight" inverts
> the rule — blocked all day, allowed all night.
>
> 🔴 **Overnight ranges are rejected** — `21:00→07:00` returns
> `HTTP 400 ... start 21h0m0s is greater or equal to end 7h0m0s`. Not a workaround
> problem: the same-day allowance `07:00–21:00` already means "blocked overnight."

In the API the times are **milliseconds since local midnight** (`07:00` = `25200000`,
`21:00` = `75600000`) with a per-client `time_zone`. In the UI they are ordinary time
pickers. Set them in the UI unless scripting.

**Parent devices need reserved IPs too** (§3) — a client entry keys on address, so a
parent laptop that changes IP silently loses its exemption and starts getting the
kid ruleset.

### The scheduling limitation — read before assuming

Design §9.2: AdGuard's built-in per-client schedule is a **"Pause service blocking"**
window — an *inverted allowance* window that applies **only to the blocked-services
list**. It does **not** schedule custom rules or blocklists.

Bedtime cutoffs and YouTube windows go through blocked-services, so they work within the
built-in scheduler. Anything needing time-scheduled *custom rules* requires cron against
the REST API — and `/clients/update` takes the **whole client object**, so
**read-modify-write is mandatory**.

> 🔴 **PROVEN 2026-08-17, and worse than "drops omitted fields."** A partial write to
> `/clients/update` returned **HTTP 200** while silently turning OFF `filtering_enabled`,
> `safebrowsing_enabled`, `parental_enabled`, **and** SafeSearch on that client — every
> protection, with a success response. A cron job written the obvious way disables a kid's
> filtering *while appearing to work*; the only symptom is that the internet quietly
> starts working. Same shape as the ChoreOps penalty-sign bug.
>
> **Do not hand-write client updates. Use the tested helper:**
> `docs/reference/adguard-rmw.py` (GET → mutate one key → POST the whole object, then
> verify and exit non-zero if anything is off).
> ```bash
> export ADGUARD_URL=http://<pi-ip>:3000 ADGUARD_USER=admin ADGUARD_PASS=...
> docs/reference/adguard-rmw.py set kid-laptop '{"blocked_services":["youtube"]}'
> ```
> Full evidence: `docs/session-state/2026-08-17-adguard-api-lab-findings.md` §3.

⚠️ **Avoid `!` in the admin password.** In a `curl -u` string it triggers shell history
expansion and produces silent 401s that look like wrong credentials. Cost a cycle in the
lab. Either pick a password without it, or use `--netrc-file`.

---

## 7. Test against ONE volunteer device — this is the Phase 2 finish line

**Do not touch gateway DHCP yet.** Manually point a single device — your own laptop or
phone — at the Pi's IP as its DNS server.

```bash
# From the volunteer device
nslookup youtube.com <pi-ip>        # expect a blocked/zero answer when the rule is on
nslookup github.com  <pi-ip>        # expect a normal answer
```

Then confirm in the AdGuard UI → **Query Log** that queries are attributed to the right
client (not to a Docker gateway address — if they are, revisit `network_mode: host`).

**Phase 2 acceptance:**

- [ ] Model identified and recorded (§0)
- [ ] Pi reachable at a reserved IP via SSH key
- [ ] AdGuard v0.107.78 running, survives `sudo reboot`
- [ ] Safe search on for all four engines
- [ ] YouTube blocked-service toggles correctly for one test client
- [ ] Query log attributes queries to the correct client IP
- [ ] Volunteer device restored to normal DNS afterward

Stop here. Phase 3 is a separate session.

---

## 8. Before Phase 3 — the rollback card (design §12)

Phase 3 makes this box household-wide DNS. **A single point of failure for name
resolution in the whole house.** Do not cut over without this **printed and physically
posted** near the gateway:

> **IF THE INTERNET IS DOWN HOUSE-WIDE**
> 1. Browser → `http://192.168.1.254`
> 2. Log in (access code on the gateway label)
> 3. **Home Network → DHCP / IP Allocation** → set DNS back to **Automatic**
> 4. Restart Wi-Fi on affected devices
> Restores normal resolution in under 60 seconds.

Printed, not only in the repo — the failure it addresses may be one where looking things
up is itself impaired. That is the whole point.

Phase 3 also requires the **secondary resolver on the Pi 5** plus `bakito/adguardhome-sync`
(design §4.1). **Both resolvers must be filtered.** Handing out a public resolver as
secondary silently converts enforcement into a suggestion — devices will use whichever
answers first.

---

## 9. What this runbook does NOT do

- Change household DNS (Phase 3)
- Set up the Pi 5 secondary or config sync (Phase 3)
- Touch any device/OS controls (Phase 1 — independent, zero network risk, can be done
  anytime including before Tuesday)
- Build the HA panel or tamper alerting (Phase 4)
- Build the ChoreOps points→minutes bridge (design §14, deferred)

---

## Traps — inherited from this project's hard-won list

1. **A deployed file is not a running file.** Bit this project three times. After any
   config change, verify the *running* state, not the file.
2. **Verify hardware, don't infer it.** The BGW320-500 was asserted to have "Device
   Access Schedules" from model-family knowledge; probing proved it does not. §0 exists
   for that reason.
3. **`vcgencmd get_throttled` reading `0x0` proves nothing after a reboot** — the counter
   resets at boot. Relevant if this old Pi shows power flakiness.
4. **Never chain Pi power through a monitor or dock.** Its own adapter, into the wall.
5. **Old SD cards fail silently.** Fresh card before Phase 3.
