# Household Parental Controls — Design

**Date:** 2026-08-16
**Branch:** `feat/parental-controls`
**Status:** Design approved. No implementation. Execution gated on the Tuesday deliverable.
**Supersedes:** the "unresearched" enforcement flag in memory `v3-internet-time-as-chore-reward.md`
**Builds on:** `docs/session-state/2026-08-15-att-network-control-feasibility.md` (branch `research/att-network-control`)

---

## 1. Goal

Establish layered parental controls across every screen in the house: admin approval
for software installation, scheduled access to YouTube (including the Roku app),
age-appropriate content ratings, bedtime internet cutoffs, and per-device activity
visibility — surfaced in KitchenCOM where practical.

The stated ambition was "Fort Knox." This document is deliberate about where that is
achievable and where it is not, because a parental control that is believed to work
and does not is worse than none. That failure shape is already on record in this
project: the ChoreOps penalty-sign bug was silent and gameplay-breaking.

## 2. The governing constraint

A network filter sees **who connects, to where, and when**. It does not see content.
Essentially all traffic is TLS-encrypted, so DNS-layer filtering can observe that a
device reached `youtubei.googleapis.com` at 21:14 but cannot see which video, and
cannot see its rating.

Three consequences drive the entire architecture:

1. **Scheduling access to a service is achievable** at the network layer. This is the
   capability the AT&T gateway lacks and the reason a DNS layer exists at all.
2. **Rating-based blocking is not achievable** at the network layer, at any price, by
   any product. Ratings are enforced per-service, inside each service's own settings.
3. **Download approval is not achievable** at the network layer. A download is an
   HTTPS request indistinguishable from a page load. Install gating is an operating
   system function.

Therefore no single layer is sufficient, and the design is explicitly about **overlap**:
DNS is strong on appliances and weak on the Windows laptop; OS controls are strong on
the laptop and impossible on the Roku. Every device is covered by at least one layer
it cannot edit.

## 3. Hardware and platform inventory

| Device | Count | Primary control layer | Notes |
|---|---|---|---|
| Windows laptop | 1 | OS (Standard account + AppLocker) | Weakest DNS device; strongest OS device |
| iPads | 2 | OS (Screen Time + Ask to Buy) | DNS-strong, cannot easily change resolver |
| PS5 | 1 | Vendor controls + DNS | Full-featured parental controls |
| Roku TVs | n | **DNS only** | See §7.4 — vendor controls are near-useless |
| Alexa devices | n | DNS only | Appliance |
| Cosmo watch | 1 | DNS only (if on Wi-Fi) | May use cellular; see §10 |
| Raspberry Pi 5 | 1 | — | Existing: HA + kiosk. Becomes DNS **secondary** |
| Raspberry Pi (older, ≥4yr) | 1 | — | Becomes DNS **primary**. Model unverified — §11 pre-flight #1 gates Phase 2 |

## 4. Architecture

Three layers. Each covers the others' gaps.

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 3 — KitchenCOM / Home Assistant                        │
│ Visibility, override buttons, tamper alerting, ChoreOps hook │
│ (reads and drives Layer 1 via REST; observes only)           │
└──────────────────────────────────────────────────────────────┘
             ▲                                   ▲
┌────────────┴──────────────┐   ┌────────────────┴─────────────┐
│ Layer 1 — DNS enforcement │   │ Layer 2 — Device/OS controls │
│ AdGuard Home ×2 (Pi pair) │   │ Per-device, configured once  │
│ Reaches EVERY device      │   │ Reaches only managed devices │
│ Scheduling, SafeSearch,   │   │ Installs, ratings, app time  │
│ service blocks, DNS logs  │   │                              │
└───────────────────────────┘   └──────────────────────────────┘
```

### 4.1 Layer 1 — DNS enforcement

**AdGuard Home v0.107.78** (current stable; v0.108.0 is beta — do not spec against it).

- **Primary:** the older Pi. Wired Ethernet required (see §11).
- **Secondary:** the Pi 5, running a mirrored config.
- **Sync:** `bakito/adguardhome-sync`, one-way primary → replica, ~10min cadence.
- Both resolvers are filtered, so the secondary is **not** a bypass. This is the key
  structural decision: it buys graceful failover *and* real enforcement, which a
  single box cannot provide simultaneously.
- The AT&T gateway hands out both IPs via DHCP. The gateway itself is otherwise
  untouched — its `.234` reservation for the Pi 5 and all documented network
  assumptions remain valid.

**Why the old Pi is primary:** the Pi 5 is the active development box. It is rebooted
constantly, drives the kiosk, and has a documented history of brownouts. Household DNS
belongs on a boring appliance configured once and never touched. The development box
is the backup, not the critical path.

**Deployment:** separate Docker container on the Pi 5 (not an HA add-on), so HA
restarts do not disturb DNS. On the old Pi, a bare install is fine.

### 4.2 Layer 2 — Device/OS controls

This layer delivers download approval and content ratings. DNS was never going to.

### 4.3 Layer 3 — KitchenCOM visibility

Home Assistant panel: per-device status, current block state, manual overrides, and
tamper alerting. **Read-and-drive, never authoritative** — if HA is down, enforcement
continues unaffected. This isolation is deliberate.

## 5. Enforcement posture — stated honestly

**DNS filtering is a strong speed bump and an excellent monitoring layer. It is not an
enforcement boundary.** Three bypasses exist and are not obscure:

1. **Manual DNS change** on the laptop → mitigated by the Standard (non-admin) account,
   which prevents editing network adapter settings.
2. **DNS-over-HTTPS** → partially mitigated. AdGuard has **no built-in DoH-blocking
   toggle** (contrary to common belief). Blocking `use-application-dns.net` discourages
   Firefox's automatic DoH; HaGeZi-style blocklists cover known DoH servers. **Neither
   stops a hardcoded DoH client**, which connects to an IP over 443 and never queries
   our resolver. AppLocker (§7.1) is the real mitigation, by preventing unapproved
   browsers from running at all.

   ✅ **The HaGeZi list is now identified and verified (2026-08-17):** *HaGeZi's Encrypted
   DNS/VPN/TOR/Proxy Bypass*, Hostlists Registry **id 52**
   (`https://adguardteam.github.io/HostlistsRegistry/assets/filter_52.txt`), **16,585
   rules**, auto-updating every 24h. Confirmed by resolution to block `dns.google`,
   `cloudflare-dns.com`, `nordvpn.com`, and `protonvpn.com` while leaving normal traffic
   alone. **Add it in Phase 3.** It does not change the "not an enforcement boundary"
   verdict — a hardcoded DoH client still wins — but it raises the bypass cost from
   "install a browser" to "know what you are doing," which is the realistic threat model
   for a 12-year-old. Detail: `docs/session-state/2026-08-17-adguard-api-lab-findings.md` §4c.
3. **Cellular / hotspot** → not mitigable at the network layer. Out of scope.

Consequently, **AppLocker and tamper alerting carry more weight than the DNS layer**
on the Windows laptop. The DNS layer's real value is that it is the only layer reaching
the Roku, PS5, Alexas, and iPads — devices where no other handle exists.

## 6. Posture: transparent

The kids are told what is filtered, what the schedules are, and that activity is
visible. Tamper alerting becomes a stated house rule ("don't change DNS settings")
rather than a hidden tripwire, which makes it materially more effective as deterrence
and avoids an adversarial cat-and-mouse dynamic with a 12-year-old.

## 7. Per-platform detail

### 7.1 Windows laptop — Standard account + AppLocker

- **Standard (non-admin) user account per kid.** Every installer triggers a UAC prompt
  requiring the admin password.
- **Correction to a common expectation:** this is a **local prompt requiring the
  password typed at the machine** — *not* a remote approval sent to a phone. Microsoft
  Family Safety's "Ask to buy" covers Microsoft Store **paid** apps, in-app purchases,
  and subscriptions. Free Store apps do not prompt unless downloads are restricted
  outright, and **non-Store `.exe` installers never generate a phone notification.**
  Since `.exe` installers are how software actually gets installed, remote approval is
  not available for the case that matters.
- **AppLocker allow-listing.** Confirmed working on **Windows 11 Home and Pro** — the
  Enterprise/Education restriction was lifted in KB 5024351, contrary to most guides
  online. Home lacks `gpedit.msc`, so configuration is via PowerShell/CSP.
- AppLocker is what stops portable browsers, which is what closes the DoH bypass.
- **Smart App Control is not a parental control** — it is a malware-reputation feature
  and will not block a legitimately-signed game. Not used here.

### 7.2 iPads — Screen Time + Ask to Buy

- Family Sharing with **Ask to Buy**: every install attempt sends a push notification
  to the parent's phone, approved or denied from the lock screen. This *is* genuine
  remote approval — the iPads are the one platform where it works as imagined.
- Screen Time: content ratings, app limits, downtime.
- Restrict changes to DNS/VPN/profile settings under Screen Time restrictions.

### 7.3 PS5 — vendor controls

- **Age-level restrictions** (Child / Early Teens / Late Teens): confirmed. Games above
  the level will not launch without Family Manager approval.
- **Play-time limits**: confirmed, per-day-of-week, with forced logout on expiry.
- **Spending: a monthly wallet cap, not per-item approval.** Set to zero to block
  purchases. Unlike Apple's Ask to Buy, there is no approve-each-purchase prompt, and
  downloads of already-owned or free content within the age level are not individually
  approved.
- All settings remotely manageable from the PlayStation App.

### 7.4 Roku — DNS only

**The weakest platform in the stack. Do not over-promise it.**

- **No per-app lock exists.** YouTube cannot be PIN-locked. Repeatedly confirmed by
  Roku community moderators.
- **Rating filters apply only to The Roku Channel** (and Live TV / antenna input).
  They have **zero effect** on YouTube, Netflix, or any third-party app.
- Parental controls are **account-wide, not per-profile**. No per-kid profiles.
- **Therefore:** remove the YouTube app, set a 4-digit PIN gating channel additions
  (which prevents re-adding it), and rely on DNS for everything else.

**Roku Live TV / The Roku Channel via DNS (added 2026-08-17, verified):** there is **no
built-in `roku` blocked-service** among the 136 available, so this needs a custom rule
scoped to the device:

```
||therokuchannel.roku.com^$client='kid-roku'
```

Verified blocking on that client only, with other devices resolving normally.

🔴 **This cannot be put on a schedule.** Custom rules are not covered by the per-client
scheduler, and the `time=` modifier is **accepted and silently ignored** — the rule stores
successfully and never fires (verified with a control rule proving the syntax is otherwise
valid). **Custom-rule blocking is all-day or nothing** unless cron adds/removes the rule.
Given §7.4's overall weakness, all-day is likely the right posture for the Roku anyway.

### 7.5 Alexa / Cosmo watch

Appliance-tier. DNS layer only, plus whatever vendor controls exist. The Cosmo watch
may operate over cellular, in which case the DNS layer does not reach it at all —
flagged as a known gap, not a defect.

## 8. YouTube handling

**Decision: block YouTube and YouTube Kids together.** They share the API host
`youtubei.googleapis.com`, so separating them is not cleanly achievable at DNS level.
Blocking both keeps the rule consistent and requires no per-kid exceptions.

- **Use AdGuard's built-in "YouTube" blocked-service entry**, not a hand-written domain
  list. It already bundles `youtube.com`, `youtu.be`, `youtube-nocookie.com`,
  `youtubei.googleapis.com`, `googlevideo.com` (wildcard), `ggpht.com`, and others —
  **176 rules total**, enumerated from a live v0.107.78 on 2026-08-17.
  ⚠️ *Corrected 2026-08-17:* this list previously said `yt3.ggpht.com`. The real rule is
  the parent domain `||ggpht.com^` (plus `||ggpht.cn^`) — **broader** than documented, so
  all Google user-content CDN traffic is blocked, not just YouTube avatars. Verified in
  `docs/session-state/2026-08-17-adguard-api-lab-findings.md` §1.
- **Known collateral damage, accepted:** blocking `googlevideo.com` also disables
  **YouTube Music** and can affect other Google media sharing that CDN.
- **Not affected:** Google Search, Gmail, and Workspace are on separate domains and
  continue to work normally. Google Classroom and Drive are unaffected by targeted
  YouTube blocking.

### 8.1 YouTube content visibility

Domain-level DNS logs show *that* YouTube was used and when — never what was watched.
For actual watch history, use Google's own supervision rather than the network:

- **Google Family Link** for both kids; watch history is reviewable via
  My Activity → YouTube History.
- **Age-13 policy correction:** the long-standing rule that a teen unilaterally
  "graduates" out of supervision at 13 was **reversed in early 2026**. Google's current
  documentation states children need **parent approval to stop supervision until they
  turn 18**. The child cannot end it unilaterally; the parent can, at any time. For the
  12-year-old this is decisive — supervision does not expire next birthday.
- **Real limits:** supervision governs the *Google account*, not the device. A
  signed-out browser, a school account, or a friend's device sidesteps it. Content
  controls for supervised teens are three coarse tiers, not per-channel.

## 9. Scheduling and safe search

### 9.1 Safe search — native, no workaround

AdGuard enforces SafeSearch for **Google, Bing, DuckDuckGo, and YouTube** (plus Yandex,
Ecosia, Pixabay), settable globally and per client. Cannot be disabled from the client.

### 9.2 Scheduling — requires a cron workaround

**Correction to a common expectation.** AdGuard's built-in per-client schedule is a
**"Pause service blocking" window** — an *inverted allowance* window that applies
**only to the client's blocked-services list**. It does **not** schedule custom filtering
rules or blocklists (open feature requests #1203, #7146).

Practically:

- **Bedtime cutoffs and YouTube schedules go through blocked-services**, which is the
  right mechanism and works within the built-in schedule.
- **Anything requiring time-scheduled custom rules needs cron hitting the REST API.**

✅ **Verified against a live v0.107.78 on 2026-08-17** — both points hold, and the
household's stated rule (YouTube scheduled off for kids, always available on parent
devices) sits **entirely inside the built-in scheduler with no cron**. Two empirical
additions:

- **The inversion is real and was confirmed by resolution**, not just by reading: inside
  the window YouTube resolves; outside it returns `0.0.0.0`. Enter the hours YouTube
  should be *available*.
- **Wrapping/overnight ranges are rejected outright** — `21:00→07:00` returns `HTTP 400
  ... start 21h0m0s is greater or equal to end 7h0m0s`. Harmless given the inversion (the
  same-day allowance already implies blocked overnight), but it will look like a bug at
  the console if unexpected.

Detail: `docs/session-state/2026-08-17-adguard-api-lab-findings.md` §4b.

### 9.3 REST API notes

Documented OpenAPI 3.0.3. Relevant endpoints: `GET /clients`, `POST /clients/add`,
`POST /clients/update`. The Client schema carries `blocked_services`,
`blocked_services_schedule`, `filtering_enabled`, `safe_search`, `upstreams`. Schedule
objects use IANA `time_zone` plus per-weekday `start`/`end` in ms from midnight.

**Two mandatory implementation gotchas:**

1. **Auth is basicAuth only** — no API tokens. The admin password lives in HA secrets.
2. **`/clients/update` requires the whole client object.** A naive write silently drops
   omitted fields. **Read-modify-write is mandatory.** This is exactly the silent-
   corruption shape that produced the ChoreOps penalty-sign bug; treat it with the
   same caution.

### 9.4 Client identification

AdGuard identifies clients by IP, MAC, CIDR, or ClientID. **There is no first-class
"group" object** — each client is configured individually, or a CIDR covers a range.
Per-kid grouping is a naming convention in our config, not an AdGuard feature.
DHCP reservations at the gateway are required so client identity is stable.

## 10. Home Assistant integration

The official AdGuard integration exists and is core-supported, exposing 6 switches
(Protection, Filtering, Safe Browsing, Parental Control, Safe Search, Query Log),
8 sensors, and 5 actions (add/enable/disable/remove filter URL, refresh).

**Critical limitation: the HA integration is global-only.** There is **no entity or
service for per-client control.** All per-kid behavior must be driven through
`rest_command` calls against the AdGuard REST API directly, subject to §9.3's
read-modify-write requirement.

**Also note:** turning off the Query Log switch stops all sensor updates.

### 10.1 Panel contents

- Per-device online status and current block state
- Manual override buttons (grant/revoke access now)
- Daily/weekly per-device domain activity summary
- Tamper alert history

### 10.2 Tamper alerting

Notify the parent's phone when:

- A device stops querying our resolvers (suggesting a DNS change)
- A device reaches a known DoH endpoint
- A device drops off the network unexpectedly during a restricted window

Given §5, **detection is doing work that prevention cannot.** In a household with a
transparent posture (§6), a prompt "I see you changed the DNS settings" is a stronger
deterrent than a technical block a motivated kid would treat as a puzzle.

### 10.3 Statistics caveat

`adguardhome-sync` replicates **config only — not query logs or statistics.** HA sensors
read from whichever instance they point at, so activity reporting should target the
**primary** (old Pi). If the primary is down, reporting gaps are expected; enforcement
continues on the secondary.

## 11. Pre-flight checks (verify, do not assume)

Per the project's standing discipline of probing hardware rather than asserting from
model-family knowledge — the lesson from the BGW320-500 correction:

1. **Old Pi model and RAM.** A Pi 3B+ or newer with **wired Ethernet** is required.
   A Pi 2 works for plain DNS. **A Zero 2 W is not recommended** as the household's
   primary resolver — 2.4GHz-only Wi-Fi and no Ethernet make link reliability the
   dominant risk for a DNS server, regardless of adequate CPU.
2. **Old Pi storage health.** Old SD cards fail silently. Verify before relying on it.
3. **Windows edition and build.** Confirm Windows 11 and build ≥2004-equivalent for
   AppLocker; confirm whether Home or Pro to choose the configuration path.
4. **Re-run the gateway sitemap probe** (§9 of the AT&T feasibility doc) to confirm no
   firmware update added scheduling capability that would simplify this.
5. **Confirm the Cosmo watch's connectivity** — Wi-Fi or cellular determines whether
   the DNS layer reaches it at all.

## 12. Rollback

Because DNS is a household-wide single point of failure, a written rollback is
mandatory before cutover:

> On the AT&T gateway DHCP page, set DNS back to automatic. Restores normal
> resolution house-wide in under 60 seconds.

This is printed and physically posted, not only stored in the repo — the failure mode
it addresses is one where looking things up may itself be impaired.

## 13. Sequencing

**Gate: nothing in this document executes until the calendar and chore chart are
delivered and verified working.** The commitment deadline is Tuesday 2026-08-18. The
network layer touches household-wide DNS and the Pi 5, and destabilizing either during
that week is an unacceptable trade.

| Phase | Contents | Risk | Gate |
|---|---|---|---|
| **0** | Pre-flight checks (§11) | None — read-only | Anytime |
| **1** | Layer 2: device/OS controls on all platforms | None — vendor settings only, no network or Pi changes | Anytime |
| **2** | AdGuard on old Pi, tested against a single volunteer device | Low — not yet household DNS | After Tuesday |
| **3** | Secondary on Pi 5 + sync; DHCP cutover | **High** — household-wide | After Tuesday, with rollback posted |
| **4** | HA panel, reporting, tamper alerting | Low | After Phase 3 stable |
| **5** | ChoreOps hook (design only — see §14) | None | Deferred |

Phase 1 is deliberately first: it carries zero network risk, requires no hardware, and
delivers the download-approval capability that was the original ask.

## 14. ChoreOps hook — design only, not built

The `v3-internet-time-as-chore-reward.md` mechanics (points → internet minutes, kid
chooses the device) were sound but blocked on the enforcement layer. **This design
unblocks them**: per-client `blocked_services` toggling via the REST API is exactly the
handle that was missing.

Shape it correctly now, build later:

- HA holds the minute balance as a `counter` per kid (the stateful controller the
  feasibility doc identified as necessary).
- Spending decrements the counter and clears the client's blocked-services entry.
- Exhaustion or bedtime restores it.
- **Requires read-modify-write on `/clients/update`** (§9.3).

Not in scope for this build. Recorded so the DNS layer is shaped to accept it.

## 15. Explicit non-goals

Stated so expectations are on record:

- **No TLS interception.** Video titles, search terms, and page URLs will not be
  visible from network data. This is a deliberate choice against an invasive posture
  that also breaks apps and is fragile.
- **No rating-based network blocking.** Not achievable by any product. Ratings are
  per-service settings.
- **No coverage of cellular or off-network use.**
- **No remote approval for Windows desktop installers** (§7.1).
- **No separation of YouTube from YouTube Kids** (§8).
- **No per-app locking on Roku** (§7.4).

## 16. Success criteria

1. A kid cannot install software on any managed device without a parent's password or
   phone approval.
2. YouTube — including the Roku app — is unavailable outside its scheduled window.
3. SafeSearch is enforced on all major search engines and cannot be disabled client-side.
4. Internet access ends at bedtime per device and resumes in the morning.
5. Per-device domain-level activity is reviewable in KitchenCOM.
6. YouTube watch history is reviewable via Family Link.
7. A DNS bypass attempt on the laptop generates a phone alert.
8. Either Pi can fail without the household losing internet.
9. Rollback restores normal DNS in under 60 seconds.

---

## Appendix A — Corrections absorbed during design

Recorded because several are contrary to widely-repeated online guidance, and future
sessions should not "fix" this document back toward the common but wrong claims:

| Claim | Status | Correction |
|---|---|---|
| Roku can PIN-lock individual apps | **FALSE** | No per-app lock exists. Rating filters cover only The Roku Channel. |
| Windows install approval reaches the parent's phone | **PARTIAL** | Store paid apps only. `.exe` installers give a local UAC prompt. |
| AdGuard schedules arbitrary rules per client | **PARTIAL** | Schedules pause *blocked-services* only; other rules need cron + API. |
| AdGuard blocks DoH out of the box | **FALSE** | No toggle. Hand-rolled blocklist, ineffective against hardcoded DoH clients. |
| Google supervision ends at 13 | **FALSE (reversed 2026)** | Persists to 18 without parental consent to end it. |
| AppLocker is Enterprise/Education only | **FALSE (outdated)** | Windows 11 Home and Pro both supported per KB 5024351. |
| HA's AdGuard integration allows per-client control | **FALSE** | Global-only. Per-client requires direct REST calls. |
| PS5 approves each purchase | **PARTIAL** | Monthly wallet cap, not per-item approval. |
| Custom rules support a `time=` modifier | **FALSE (silently)** | Accepted and stored by the API, then **never enforced**. Verified 2026-08-17 with a control rule. Looks configured, does nothing. |
| Roku Live TV can be blocked by a built-in service | **FALSE** | No `roku` service among the 136. Needs a custom `$client` rule — which cannot be scheduled. |
| Blocked-services scheduling covers custom rules | **FALSE** | Only `blocked_services`. A client object has no custom-rule field at all. |

## Appendix B — Sources

- AdGuard Home releases and configuration wiki; OpenAPI spec (`openapi/openapi.yaml`)
- Home Assistant AdGuard integration documentation
- Google For Families, supervision policy (answer 7106787)
- Microsoft Learn, AppLocker requirements (KB 5024351)
- Microsoft Support, Family Safety spending limits
- Roku support, parental controls (article 208755938)
- PlayStation support, PS5 parental controls and spending limits
- `bakito/adguardhome-sync`
- `docs/session-state/2026-08-15-att-network-control-feasibility.md` (branch `research/att-network-control`)
