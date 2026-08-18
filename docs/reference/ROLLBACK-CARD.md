# 🛑 INTERNET NOT WORKING? — READ THIS FIRST

**Post this next to the gateway. Do not rely on a phone to find it — if this is the
problem, looking things up is exactly what stopped working.**

---

## Does this apply?

Symptoms that match **this** problem:

- Wi-Fi says **connected, full bars** — but nothing loads
- Websites hang, then "can't find the server" / "no internet connection"
- **Some apps still work for a few minutes**, then stop
- It affects **everyone in the house at once**

If Wi-Fi itself is down, or the modem lights are off/red, this is **not** the problem.
That is an ordinary internet outage — call the provider.

---

## THE FIX — under 60 seconds

A small computer (a Raspberry Pi) handles name lookups for the house. If it is off,
unplugged, or broken, nothing can find any website. This puts the house back on the
provider's own lookups.

### 1. Open the gateway settings

On any device still connected to the Wi-Fi, open a web browser and go to:

```
192.168.1.254
```

(Type it in the address bar exactly as shown. The password is on the sticker on the
gateway itself, unless it was changed.)

### 2. Find the DHCP / LAN settings

Look for a page called **Home Network**, **LAN**, **DHCP**, or **IP Allocation**.

### 3. Set DNS back to automatic

There will be **DNS server** fields, currently showing:

```
192.168.1.113
```

**Change it to Automatic / Obtain from provider / Default.**
If there is no automatic option, enter these two instead:

```
Primary:    1.1.1.1
Secondary:  8.8.8.8
```

### 4. Save, then restart devices

Save the change. **Each device needs to reconnect to pick it up** — turn Wi-Fi off and
on, or restart the device. The internet should work normally within a minute.

---

## ⚠️ What this turns off

**All parental controls stop working** — YouTube time limits, blocking, safe search.
Everything becomes unfiltered for every device.

**That is fine.** A working internet with no filtering beats a filtered internet that
does not work. Tell Garrett; it can be turned back on in a minute once the Pi is fixed.

---

## Before you do that — try this first (30 seconds)

The Pi is a **small black/clear box with a Raspberry Pi inside**, plugged into the router
by a network cable.

1. Is its **power light on**? If not → unplug the power, wait 10 seconds, plug it back in.
2. Wait **90 seconds** for it to start.
3. Try a website again.

**If that fixes it, nothing else is needed.** If not, do the gateway steps above.

---

## Details, for whoever is fixing it properly

| | |
|---|---|
| The Pi | `192.168.1.113`, hostname `adguard` |
| Admin page | `http://192.168.1.113:3000` |
| SSH | `ssh adguard` from Garrett's laptop |
| What runs on it | AdGuard Home in Docker (`cd /opt/adguard && sudo docker compose up -d`) |
| Gateway | HUMAX at `192.168.1.254` |

Quick check of whether the Pi is the problem, from a laptop terminal:

```
dig @192.168.1.113 example.com     # the Pi — silence or timeout means it is down
dig @1.1.1.1 example.com           # the internet itself — this working means it is DNS
```

**To re-enable filtering later:** set the gateway's DNS back to `192.168.1.113`.

---

*Fort Knox household DNS · card generated 2026-08-17 · repo: `docs/reference/ROLLBACK-CARD.md`*
