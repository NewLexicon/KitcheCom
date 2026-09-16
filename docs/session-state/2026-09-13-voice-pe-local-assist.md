# Session state — Voice PE + local Assist pipeline

**Date:** 2026-09-13
**Branch:** `feat/time-of-day-layouts` (light-mode arc parked mid-stream, tree clean)

---

## Status

**Done:** Established that HA on the Pi had NO voice stack whatsoever, and that
the Voice PE puck is unprovisioned.

**In progress:** Deploying Whisper + Piper + openWakeWord as a Wyoming compose
stack on the Pi.

**Next:** Garrett onboards the puck over BLE (must happen at the hardware — not
doable over SSH), selecting the local pipeline. Then Grocy voice commands and
light/panel control.

---

## Empirical findings (2026-09-13)

Do NOT re-derive these; they were measured, not assumed.

| Fact | Value | How verified |
|---|---|---|
| HA config-entry domains | analytics, backup, bluetooth, choreops, go2rtc, google, google_translate, grocy, hacs, local_todo, met, mobile_app, radio_browser, shopping_list, sun, zha | `core.config_entries` |
| Voice domains present | **NONE** (no esphome/assist_pipeline/wyoming/cloud/stt/tts) | same |
| ESP/voice devices in registry | none — 5 apparent hits were HACS/Backup false matches | `core.device_registry` |
| `_esphomelib._tcp` on LAN | **no advertiser** (Mac `dns-sd`, 8s + full service sweep) | mDNS |
| HA config dir | `/home/garrettdehart/homeassistant` → `/config` | `docker inspect` mounts |
| HA container creation | **plain `docker run`, NOT compose** (no compose labels) | `docker inspect` labels |
| HA network mode | `host`, restart `unless-stopped` | `docker inspect` |
| `default_config:` on Pi | **present** — ESPHome discovery + Assist available, nothing to install HA-side | `configuration.yaml` |
| Pi thermal | 59.8 C idle, `throttled=0x0` at 1d4h uptime (so NOT post-reboot noise) | `vcgencmd` |
| Pi RAM / CPU / disk | 5.8 GiB available / 4 cores / 99 GB free / aarch64 | `free`, `nproc`, `df` |
| Wyoming arm64 support | whisper, piper, openwakeword ALL publish arm64 | `docker manifest inspect` |
| Ports 10300/10200/10400 | all free | `ss -tln` |
| Compose version | v5.1.4 | `docker compose version` |

### The Espressif red herring
`192.168.1.251` (`a4:cf:99` = Espressif OUI) pings but has **6053, 80, 8266 all
closed**. It is some other ESP gadget (plug/bulb class), *not* the Voice PE.
Don't chase it. `.234` is the Pi, per existing memory.

---

## Decisions & reasoning

1. **Local STT/TTS, not HA Cloud.** Garrett's call (free). Validated as viable:
   RAM and arm64 images are fine. Residual risk is thermal under sustained
   Whisper load — memory records throttling ~2min into full load. Whisper runs
   in *bursts*, not sustained, so expected OK. **Unproven until a real utterance
   happens.**

2. **Separate compose stack, do NOT fold HA in.** HA was created via bare
   `docker run` with `network_mode: host`. Absorbing it into compose would mean
   recreating the running container — needless risk to a live family panel. The
   voice stack is self-contained; HA reaches it over `localhost:<port>`.

3. **Whisper model = `base`, not `tiny`.** Primary users are kids; child speech
   is the hard case for STT. Start at the better model, fall back to `tiny` only
   if latency is annoying in practice.

4. **Pinned image tags** (whisper `3.8.0`, piper `2.5.2`, openwakeword `2.1.0`),
   matching the house convention established in `grocy/docker-compose.yml`.
   `:latest` would silently move.

5. **Ordering is load-bearing: containers BEFORE puck onboarding.** The BLE
   onboarding flow asks you to pick a pipeline at the end. With no local STT/TTS
   running, the only dropdown option is HA Cloud (not subscribed) → half-configured
   device and a repeat trip through onboarding.

---

## Gotchas

- **`timeout` does not exist on macOS.** Use `ssh -o ConnectTimeout=`.
- **Don't pipe `docker manifest inspect` through local grep in an `ssh "..."`
  one-liner** — the pipe runs locally on the Mac and silently eats the output.
  Run the whole extraction remotely inside single quotes.
- **Grocy: the Pi's 9283 is the family's REAL shopping list.** All voice→Grocy
  work gets built against the Mac sandbox at `localhost:9284` first.
- Voice PE is **2.4GHz-only**; home 2.4GHz is ch10, and a hidden AP on ch44 has
  caused trouble before (see memory `pi-wifi-cochannel-interference`).

---

## Wyoming integrations registered (2026-09-13, later in session)

All three added to HA and confirmed in the registries:

| Config entry | Host:port | Entity |
|---|---|---|
| faster-whisper | 127.0.0.1:10300 | `stt.faster_whisper` |
| piper | 127.0.0.1:10200 | `tts.piper` |
| openwakeword | 127.0.0.1:10400 | `wake_word.openwakeword` |

### The "Failed to connect" false alarm — READ THIS BEFORE DEBUGGING A REPEAT

The first Add-Integration attempt showed **"Failed to connect"** on
localhost:10300. It was a **form-entry issue, not a backend problem** — the
retry with identical infrastructure succeeded.

Three theories were raised and **all three were DISPROVEN by test**. Do not
re-chase them:

1. ~~HA on a bridge network can't see the containers~~ — HA is `network_mode:
   host`; `localhost` is correct.
2. ~~`localhost` resolves to IPv6 `::1` and the containers are IPv4-only~~ —
   `::1:10300` handshakes fine.
3. ~~Wyoming protocol mismatch~~ — a real `Describe` handshake returned `info`.

The decisive test, which should be the FIRST move if this recurs — it runs the
exact function whose `None` return produces "Failed to connect":

```bash
ssh kitchencom 'docker exec homeassistant python -c "
import asyncio
from homeassistant.components.wyoming.data import WyomingService
async def main():
    svc = await WyomingService.create(\"127.0.0.1\", 10300)
    print(svc, svc.get_name() if svc else None)
asyncio.run(main())
"'
```
It printed `faster-whisper` while the UI was still erroring — proving the
backend healthy and isolating the fault to the form.

## Carry-forwards / open items

- **`calendar.family` is still a placeholder** in `packages/calendar.yaml` on the
  Pi. The `KitchenAddCalendarEvent` intent_script is LIVE but points at a
  non-existent calendar entity. See `deploy/CALENDAR_VOICE.md`.
- **That intent assumed a GEMINI conversation agent.** Local Assist's default
  agent does intent matching, not LLM parsing — it will NOT turn "add dentist
  Tuesday at 3pm" into that intent. Decide later: keep Gemini for conversation,
  or rebuild the intent for local.
- **Pi DNS is `192.168.1.113` (the AdGuard box).** Old HA logs (July 12) show
  `ClientConnectorDNSError` reaching met.no. Stale, possibly resolved — but it's
  the thread to pull if the weather card is ever flaky.
- **Thermal under real Whisper load is still unproven.** Idle after deploy was
  60.9 C / `throttled=0x0`. Check `vcgencmd get_throttled` after the kids have
  actually used it.

---

## SSID migration attempt — FAILED and reverted (2026-09-14/15)

**Outcome: reverted. The panel is back on `ThunderEnlighten`. The puck is still
unprovisioned. Voice stack is untouched and healthy.**

### Why any of this was attempted

The Voice PE puck is **2.4GHz-only**. All three radios (2.4 ch10 + two 5GHz)
broadcast ONE SSID `ThunderEnlighten`, so the BGW320-500's **band steering** kept
handing the puck a 5GHz radio it cannot see. Improv BLE pairing succeeded; the
wifi join then failed and the flow bounced back to the network-name field.

Fix = make the names distinct. Garrett chose to rename **2.4GHz** (not 5GHz) to
avoid every computer/TV relearning a network.

### What actually happened

1. Added `ThunderEnlighten-2G` to the netplan YAML **alongside** the existing AP
   (so no stranding in either direction). Verified: both NM profiles generated,
   both band-locked `bg`, PSK matched.
2. Garrett renamed 2.4GHz at the gateway. The Pi appeared ONCE at `.234` (seen
   from the wired AdGuard Pi) then vanished.
3. ~20 minutes of false diagnosis followed — see the VPN trap below.
4. Channel had auto-moved ch10 → ch7; pinned back to 10. Did not help.
5. Reverted the SSID to `ThunderEnlighten`. Pi returned in <2 min. HA 200, all
   five containers healthy.

### Root cause (best available evidence)

**The Pi lost power and rebooted mid-migration** (`who -b` = 17:38, no shutdown
record, container uptimes reset 18h/46h → 4h). After the reboot the netplan YAML
**no longer contained the `-2G` stanza at all** (`grep -c` = 0 in both files),
though the already-generated `/run` NM profile lingered. So the Pi had no
persistent config for the renamed network and could not rejoin.

NOT interference, NOT the channel — both were chased and neither was the cause.

### TWO TRAPS — both now in the memory layer

1. **[[vpn-hides-the-whole-lan]]** — the work VPN (`utun11`) captures ALL of
   192.168.1.0/24. Every host including the GATEWAY reads 100% loss while
   internet still works and `en0` looks active. `ping -b en0` does NOT bypass it.
   **Run `route -n get default` BEFORE diagnosing any unreachable-Pi symptom.**
2. **[[pi-wifi-is-netplan-managed]]** — `nmcli con add` / `con mod` does not
   persist; netplan owns wlan0 AND eth0. An `nmcli`-set eth0 DHCP method reverted
   to `link-local` on reboot, which is why the ethernet rescue path evaporated.

### State right now

| Item | State |
|---|---|
| Pi | `192.168.1.234` on `ThunderEnlighten`, HA 200, 5 containers healthy |
| netplan YAML | `-2G` stanza GONE (wiped by the reboot); backup at `.bak-presssid-20260914-172907` |
| eth0 | DOWN / `link-local` (netplan reverted the DHCP change) |
| Gateway 2.4GHz | `ThunderEnlighten`, channel pinned to **10** (was Automatic) |
| Voice PE puck | still unprovisioned, still blinking |
| Wyoming stack | healthy, untouched throughout |

### Next move — DO NOT repeat the 2.4GHz rename

Rename the **5GHz** SSID to `ThunderEnlighten-5G` instead. It never touches the
Pi, so nothing can be stranded and no reboot can eat the config. Cost is
rejoining phones/laptops/TVs once each.

If the 2.4GHz rename is ever retried anyway: put the `-2G` stanza in the netplan
YAML, **reboot the Pi deliberately first**, and confirm the stanza SURVIVES the
reboot before touching the gateway.
