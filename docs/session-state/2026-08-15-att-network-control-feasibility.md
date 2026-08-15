# AT&T Network Control — Feasibility Findings

**Date:** 2026-08-15
**Branch:** `research/att-network-control`
**Type:** Research spike. No implementation. No design approved.
**Closes:** the "unresearched" flag in memory `v3-internet-time-as-chore-reward.md`

---

## 1. The question

Can we schedule per-device internet access (TVs / computers / PS5) through the AT&T
gateway — and can that later back a points→internet-minutes reward in ChoreOps?

The memory entry `v3-internet-time-as-chore-reward.md` (2026-08-13) flagged the
enforcement layer as unresearched and said to check it *before* designing reward
mechanics, because it constrains everything above it. This doc is that check.

## 2. Hardware — verified, not assumed

Probed live at `http://192.168.1.254` on 2026-08-15:

| Field | Value |
|---|---|
| Manufacturer | HUMAX |
| Model Number | **BGW320-500** |
| Serial | D93LA0QJ990551 |
| Software Version | **6.34.7** |
| Web server | lighttpd/1.4.69, CGI pages at `/cgi-bin/*.ha` |

Read without authentication from `/cgi-bin/sysinfo.ha`.

## 3. Headline finding — no native scheduling

**The BGW320-500 on firmware 6.34.7 has no per-device time scheduling.**

Evidence: `/cgi-bin/sitemap.ha` is the gateway's own complete page index. All 37 pages:

```
apphosting  broadbandconfig  broadbandstatistics  devices  dhcpserver  diag
dosprotect  etherlan  events  fiberstat  firewall  home  ip6lan  ipalloc
ippass  lanstatistics  logs  nattable  packetfilter  pshosts  remoteaccess
reset  restart  routerpasswd  securityoptions  services  sitemap  speed
sysinfo  syslog  update  voice  voiceconfig  voicestat  wconfig_unified  wmacauth
```

There is **no** `restrictions`, `schedule`, `accesscontrol`, `parentalcontrol`, or
`macfiltering` page. Direct probes of those URLs return **HTTP 400**. The only
"schedule" strings anywhere in the UI are JavaScript `setTimeout()` calls and
decorative `Block*.gif` banner images.

> **Correction recorded.** Earlier in this session I stated that BGW gateways expose
> "Device Access Schedules" with per-device time-of-day windows. That is true of some
> BGW-family firmware but **is not true of this unit**. The claim was made from general
> model-family knowledge before probing the actual hardware. The sitemap overrides it.
> Anchor future work to this doc, not to that claim.

### What the gateway *does* offer

- **Packet Filter** (`packetfilter.ha`) — MAC/IP allow-block rules. Binary on/off. No time dimension.
- **IP Allocation** (`ipalloc.ha`) — DHCP fixed allocation. Already in use to pin the Pi at `.234`.
- **Device list** (`devices.ha`) — full inventory, served unauthenticated (~151KB).

Blocking a device is possible. Blocking it *on a schedule* is not.

## 4. The two gaps

Two separate capability gaps, and they are not the same size:

1. **Scheduling gap** — no wall-clock windows ("PS5 blocked 9pm–3pm weekdays").
   This is what was actually asked for. Not natively available.
2. **Budget gap** — no consumable duration balance ("90 minutes, spend it whenever").
   This is what points→minutes requires. Not available on *any* consumer gateway;
   it is a fundamentally different model from wall-clock windows.

Gap 1 could be closed with automation against the gateway. Gap 2 cannot be closed at
the gateway at all — it needs a stateful controller that tracks consumption and
toggles enforcement. That controller could be Home Assistant, but only if it has a
reliable enforcement handle to pull.

## 5. Options for closing the gaps

### Option A — Scrape the CGI UI from Home Assistant
HA drives `packetfilter.ha` with the device access code to toggle blocks on a schedule.

- Closes gap 1; with HA holding the balance, could close gap 2.
- **Fragile.** No API — this is form-scraping an authenticated CGI interface.
  AT&T pushes firmware without consent; a markup change silently breaks it.
  Firmware here is already at 6.34.7 and will keep moving.
- Access code is printed on the device label and must be stored as an HA secret.
- Verdict: works until it doesn't, and it fails *silently* — the failure mode is
  "the block quietly stops applying," which is the worst possible failure for a
  parental control.

### Option B — Dedicated firewall/router downstream of the gateway
Put OPNsense/pfSense, or an appliance like Firewalla, between the BGW and the devices.
BGW goes to IP-passthrough or bridge; the new device owns DHCP and policy.

- Closes both gaps properly. Real per-device schedules, real duration budgets,
  real APIs designed to be automated.
- Costs money and a network re-architecture. Touches the Pi's `.234` reservation and
  every documented network assumption in `docs/session-state/`.
- Verdict: the correct long-term answer if internet time is genuinely going to be a
  reward currency. Over-built if the goal is just "PS5 off at bedtime."

### Option C — Device-native controls
Console/OS-level: PS5 parental controls, per-TV settings, Screen Time / Family Link.

- Free, immediate, no network work, and enforces *per-account* rather than per-device
  (survives a kid switching devices — which a MAC-based gate does not).
- Not centralized, not automatable, doesn't integrate with ChoreOps, and each platform
  has its own UI.
- Verdict: unglamorous, but for wall-clock bedtime limits it solves the actual problem
  today with zero fragility. Worth taking seriously before building anything.

## 6. Recommendation

**Do not build Option A.** A silently-failing parental control is worse than none, and
tying ChoreOps rewards to a scraper that AT&T can break on any firmware push would put
gameplay-visible breakage on an uncontrolled schedule. The ChoreOps penalty-sign bug
from this session is the cautionary shape: silent, and gameplay-breaking.

**For the near term, Option C.** It costs nothing and needs no branch.

**If internet-time-as-currency is genuinely wanted, Option B is the honest path** —
and it should be priced as a hardware + network project, not as a KitchenCOM feature.
The V3 memory entry's instinct was right: the enforcement layer constrains everything,
and this gateway can't carry the design.

## 7. Consequences for the V3 idea

`v3-internet-time-as-chore-reward.md` should be updated: the enforcement question is
now **researched and answered — the current gateway cannot support it.** The reward
mechanics (points → minutes, kid picks device) remain sound as a *design*, but they
are blocked on hardware, not on ChoreOps work. Nothing on `feat/choreops-chores`
depends on this.

## 8. What was NOT done

- No changes to gateway configuration. Read-only probing throughout.
- No authenticated access — no device access code was entered.
- No `packetfilter.ha` rules created, modified, or deleted.
- No KitchenCOM code written. No design approved. No implementation plan.

## 9. Reproducing the probe

```bash
# Model + firmware. The cookie jar matters: without a session the value cells
# render blank and only the field labels come back.
curl -s -c /tmp/gw.jar -b /tmp/gw.jar http://192.168.1.254/cgi-bin/sysinfo.ha \
  | sed 's/<[^>]*>/|/g' | tr -s '|' '\n' | grep -viE '^\s*$' \
  | grep -A1 -iE "model number|software version"

# Full page index — the authoritative capability list. Expect 37 pages.
curl -s -c /tmp/gw.jar -b /tmp/gw.jar http://192.168.1.254/cgi-bin/sitemap.ha \
  | grep -oE 'href="/cgi-bin/[^"]+"' | sort -u
```

Both verified working 2026-08-15. Sitemap count confirmed at 37.

If a future firmware adds a scheduling page, it will appear in that sitemap. Re-run
the second command before assuming this doc is still current.
