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

### 4.3 `ssh-keyscan` needed for the new alias

Adding `Host adguard` to `~/.ssh/config` gave `Host key verification failed` because the
key was known under the IP, not the alias. Fix: `ssh-keyscan -t ed25519 adguard >> ~/.ssh/known_hosts`.

## 5. Where the build stopped

**Done:** flashed, booted, identified, SSH + passwordless sudo, `apt update`,
`apt upgrade` (85 packages) run.

**Not started — the whole AdGuard stack:**

1. **Docker is NOT installed.** The runbook §5 assumes it. `curl -sSL https://get.docker.com | sh`,
   then add the user to the `docker` group.
2. **AdGuard container** — runbook §5. Pin **`adguard/adguardhome:v0.107.78`**, never
   `:latest`, never v0.108.x (beta). Image ships `arm/v7`, so this board is covered.
   `network_mode: host` is **required** — under bridge networking every query appears to
   come from the Docker gateway, destroying the per-client identification that per-client
   rules depend on (design §9.4).
3. **Initial config** — runbook §6, admin UI on `:3000`.
4. **Disable wlan0** (§1 above) **before** reserving the IP at the gateway (runbook §3).
5. **The four traps in cold-open §4 all still apply** to every AdGuard API call made from
   here on. Test by **resolving a domain**, never by reading the API's HTTP response.

## 6. Next session's literal first move

```bash
ssh adguard 'curl -sSL https://get.docker.com | sh'
```
then follow **runbook §5** verbatim. Everything before §5 is now done.

**Still open, unchanged:** the household is **not** cut over (design Phase 3), and must not
be until there is a **printed** rollback card at the gateway, a filtered secondary
resolver, and a **fresh A2 card** — the card in this Pi is the ~6-year-old drawer-aged
SanDisk, fine for testing, **not** for the box the house depends on.
