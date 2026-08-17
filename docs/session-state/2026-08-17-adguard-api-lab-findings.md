# AdGuard API Lab — design claims verified against a live v0.107.78

**Branch:** `fort-knox`
**Date:** 2026-08-17
**Method:** real `adguard/adguardhome:v0.107.78` container on the Mac (ports 3053/15353),
driven through the REST API, then destroyed. **No Pi, no SD card, no household DNS.**

## Why this exists

The Tuesday gate on Phase 2 was lifted (Tuesday work is proceeding in a separate
session). Phase 2 §1–§7 still cannot run — see "What is still blocked" — but **every
software claim in the design could be tested without any of that hardware.**

This retires the design risk ahead of the hardware. When the Pi is flashable, §5–§6 of the
Phase 2 runbook become transcription rather than discovery.

---

## 1. 🔴 One design error found — §8 domain list

**Design §8 and Phase 2 runbook §6 both claim the YouTube blocked-service bundles
`yt3.ggpht.com`.** It does not. The live ruleset contains:

```
||ggpht.cn^
||ggpht.com^
```

The **parent domain**, not that host. This is *broader* than documented, not narrower —
`||ggpht.com^` blocks all Google user-content CDN traffic, not just YouTube avatars.
No action needed, but the doc should say what the product does.

Everything else in §8 verified exactly:

| Design §8 claim | Verdict |
|---|---|
| Built-in service id is `youtube` | ✅ real id, 1 of 136 services |
| Bundles `youtubei.googleapis.com` | ✅ present (plus `youtube.googleapis.com`, `youtubeembeddedplayer.googleapis.com`) |
| Bundles `googlevideo.com` | ✅ present |
| Bundles `youtube.com`, `youtu.be`, `youtube-nocookie.com` | ✅ all present |
| Bundles `yt3.ggpht.com` | ❌ **it is `ggpht.com` / `ggpht.cn`** |
| YouTube Kids not separable | ✅ **zero** services match "kid" — no separate entry exists |
| Google Search / Gmail / Classroom / Drive unaffected | ✅ none appear in the 176-rule set |

**Total: 176 rules** in the `youtube` service.

## 2. ✅ The collateral damage is real — proven by resolution, not by reading

DNS queries through the running filter:

```
youtube.com           -> 0.0.0.0     BLOCKED
googlevideo.com       -> 0.0.0.0     BLOCKED
music.youtube.com     -> 0.0.0.0     BLOCKED   <- YouTube Music, as §8 predicted
github.com            -> 140.82.112.4    normal
google.com            -> 74.125.141.138  normal
classroom.google.com  -> 74.125.136.139  normal
```

**YouTube Music breaking is confirmed, not theoretical.** Design §8 accepted this
trade-off; it is now evidenced. Classroom and Search are genuinely untouched — the
reassurance in §8 holds.

## 3. 🔴 The read-modify-write trap is WORSE than the design says

Design §9.3 warns `/clients/update` takes the whole object and "a naive write silently
drops omitted fields." **Confirmed, and the blast radius is larger than described.**

Created a client with every protection on, then sent a partial update changing only
`blocked_services`:

```
BEFORE                          AFTER a naive partial POST (HTTP 200)
parental_enabled     = True  -> False
safebrowsing_enabled = True  -> False
filtering_enabled    = True  -> False
safe_search.enabled  = True  -> False
blocked_services=['youtube'] -> []
```

**It returns HTTP 200.** Every protection on that client silently switched off, with a
success response and no warning. A cron job written the obvious way would disable
filtering for a kid's device *while appearing to succeed* — and the only symptom would be
that the internet quietly started working.

> **This is precisely the ChoreOps penalty-sign shape** (memory
> `choreops-content-is-generated-json`): a write path that validates, returns success, and
> stores something other than what was intended. The design flagged the resemblance; the
> lab confirms it is the same defect class.

**The fix is verified.** `rmw.py` (below) does GET → mutate one key → POST the whole
object:

```
AFTER read-modify-write: blocked_services=[] AND
parental/safebrowsing/filtering/safe_search all still True   -> PASS
```

### The working helper

Saved at `docs/reference/adguard-rmw.py`, **tested end-to-end against the live container**
— happy paths, dry-run, unknown client, bad JSON, bad auth, unreachable host, and both
clobber cases. Exit 0 on success, 1 on every failure, so it is cron-safe.

Three non-obvious things it encodes:

1. **AdGuard sends no `WWW-Authenticate` challenge.** Python's `HTTPBasicAuthHandler`
   waits for a 401 to react to, so lazy auth never fires and every call 401s. **The
   `Authorization` header must be sent preemptively.** Cost a debugging cycle here.
2. **The payload is `{"name": <client>, "data": {<entire client object>}}`** — the name
   appears twice, outside and inside.
3. **It checks the absolute state, not just the delta** — see below.

### ⚠️ A trap found in the helper itself, while testing it

The first version compared before/after and reported "protections intact" when the write
caused no *new* damage. Running it against a client that was **already** clobbered printed:

```
ok: kid-laptop updated, protections intact
  {"filtering_enabled": false, "safebrowsing_enabled": false, ... }
```

Literally true, and dangerously reassuring — the exact scenario a nightly cron hits if
anyone breaks a client by hand. **A delta check is not a safety check.** Fixed: it now
also asserts the absolute state, and on an unprotected client it warns, prints the repair
command, and exits 1:

```
WARNING: kid-laptop written OK, but these are OFF: filtering_enabled, ...
  (not caused by this write -- pre-existing. Repair with: ...)
exit=1
```

Worth generalizing: *this project's traps keep taking the shape of a check that passes
because of what it failed to look at.* Same family as the Grocy test that asserted
`amount` stayed `1.5` and thereby locked in the bug.

## 4. ✅ SafeSearch — §9.1 exactly right

`/control/safesearch/status` on a stock instance:

```json
{"enabled": false, "google": true, "bing": true, "duckduckgo": true,
 "youtube": true, "yandex": true, "ecosia": true, "pixabay": true}
```

Design §9.1's engine list is correct and complete.

⚠️ **`enabled` is a separate master switch from the per-engine flags.** Stock is
`enabled: false` with all engines `true` — i.e. **SafeSearch is OFF out of the box despite
every engine reading `true`.** Setting engines without setting `enabled` does nothing.
Easy to misread in the UI and in the API.

## 4b. 🔑 Per-client scheduling is NATIVE — no cron needed for the household's actual rule

**Added 2026-08-17 after Garrett asked whether specific devices can be scheduled while
the parents' devices stay open.** Answer: yes, and it needs **no cron at all** — which
materially simplifies the plan.

### Per-client blocking, proven

Two clients on one instance, queried at the same moment:

```
kid-ipad   (registered IP)   youtube.com -> 0.0.0.0            BLOCKED
other IP   (not kid-ipad)    youtube.com -> 142.251.107.190    normal
github.com (kid-ipad)        -> 140.82.112.4                   normal
```

Clients are identified by IP/MAC and each carries its own `blocked_services`. Parent
devices get `blocked_services: []` and are never blocked, at any hour.

### The schedule is a per-client field, not a global one

`blocked_services_schedule` lives **on the client object**, with its own `time_zone`:

```json
"blocked_services_schedule": {
  "time_zone": "America/New_York",
  "mon": {"start": 25200000, "end": 75600000}
}
```

**Times are milliseconds since local midnight.** `25200000` = 07:00, `75600000` = 21:00.
Per-day-of-week keys (`mon`…`sun`), so weekends can differ.

**This means the household's stated rule — YouTube off on a schedule for the kids, always
available for the parents — is pure config.** No cron job, and therefore §3's
`/clients/update` trap is **off the critical path** for it. The trap only re-enters if
something later scripts changes (e.g. the ChoreOps points→minutes bridge, design §14).

### ⚠️ The window is INVERTED — it is an ALLOWANCE window

Verified in both directions against a live instance:

| Condition | Result |
|---|---|
| now **inside** the window | YouTube **resolves** (allowed) |
| now **outside** the window | YouTube **blocked** (`::` / `0.0.0.0`) |

So a "block at bedtime" rule is entered as the **daytime allowance**: `07:00–21:00`.
Entering `21:00–07:00` intending "block overnight" would block all day and allow all night
— the exact inversion §9.2 warned about, now confirmed by resolution rather than by
reading docs.

### ⚠️ Overnight windows are REJECTED outright

```
mon 21:00 -> 07:00
HTTP 400: failed to process request body: weekday Monday:
          bad day range: start 21h0m0s is greater or equal to end 7h0m0s
```

Not a quirk to work around — the API refuses a wrapping range. Because the window is an
*allowance*, this does not block the use case: the legal same-day window `07:00–21:00`
already implies "blocked overnight." Recorded so nobody fights the 400.

Also accepted: `00:00–24:00` (`end` may be `86400000`), but **not** `86399000`.

## 4c. Contraband sites + Roku Live TV — TWO mechanisms, and only one is schedulable

**Added 2026-08-17 after Garrett asked for TikTok/Instagram/Discord and Roku Live TV.**
All verified against a live instance. **The split below is the load-bearing fact.**

### The good news: most of the list is built-in

Of 136 built-in services, these are already present with maintained rule sets:

| Requested | Built-in id | Rules |
|---|---|---|
| TikTok | `tiktok` | 33 |
| Instagram | `instagram` | 72 |
| Discord | `discord` | 27 |
| Snapchat | `snapchat` | 6 |
| Twitch | `twitch` | 6 |
| Reddit | `reddit` | 5 |
| Facebook | `facebook` | 443 |
| X / Twitter | `twitter` (name: "X (formerly Twitter)") | 23 |
| Roblox, Steam, Netflix, Telegram, WhatsApp, Discord, OnlyFans, 4chan, Omegle-likes… | see full list | — |

**Anything on this list inherits the per-client scheduler from §4b** — same allowance
window as YouTube, same per-device exemption for parents. Prefer a built-in id over a
hand-written rule *every time*: it is maintained upstream and it is schedulable.

⚠️ **`x` is not an id — use `twitter`.** ⚠️ **There is no `roku` service.**

### Roku Live TV needs a custom rule — and custom rules are NOT schedulable

`$client` scoping works, verified by resolution:

```
from kid-roku:   therokuchannel.roku.com -> 0.0.0.0   BLOCKED
from other IP:   therokuchannel.roku.com -> 13.32.179.80   normal
```

So a rule like `||therokuchannel.roku.com^$client='kid-roku'` blocks on one device only.
**But a client object has no field for custom rules** — its only rule-bearing fields are
`blocked_services` and `blocked_services_schedule`. Custom rules live globally in
`user_rules` and are scoped by the `$client` modifier instead.

### 🔴 The `time=` modifier is ACCEPTED AND SILENTLY IGNORED

The obvious workaround — a time-limited custom rule — **does not work, and fails in the
worst possible way.** Tested:

| Rule | Window contains now? | Result |
|---|---|---|
| `\|\|plainrule.com^$client='kid-roku'` (control) | n/a | **blocked** ✅ |
| `\|\|timetest.com^$client='kid-roku',time=09:59-11:59` | **yes** | **NOT blocked** ❌ |
| `\|\|timetest.com^$client='kid-roku',time=13:59-15:59` | no | not blocked |

`POST /control/filtering/set_rules` returns success and the rule is stored verbatim —
it simply never fires. The control rule proves the syntax is otherwise fine.

**This is the project's recurring shape again** (ChoreOps penalty sign, the Grocy test
that locked in a bug, the helper that reported "protections intact"): *it looks
configured, reports success, and does nothing.* A parent would reasonably believe Roku
Live TV was on a bedtime schedule while it was never blocked at all.

**Consequence:** custom-rule blocking is **all-day or nothing** unless a cron job adds and
removes the rule — which is exactly the cron path design §9.2 described, and it must use
read-modify-write (§3).

### Practical recommendation

| Want | Use | Schedulable? |
|---|---|---|
| TikTok / Instagram / Discord / etc. | **built-in blocked-services** | ✅ yes, per client |
| Roku Live TV, and any site with no built-in service | custom rule + `$client` | ❌ all-day only |
| A broad curated contraband list | **subscribed blocklist** (below) | ❌ all-day only |

Since the kids' devices should arguably have TikTok/Discord blocked **all day** rather
than only at bedtime, the non-schedulability of custom rules may not matter. Decide
per-category rather than assuming everything needs a schedule.

### Subscribed blocklists — better than a hand-maintained list

AdGuard's Hostlists Registry has **64 curated, auto-updating lists** (default update
interval **24h**). Verified by subscribing two on a live instance:

| List | Registry id | Rules pulled |
|---|---|---|
| **HaGeZi's Encrypted DNS/VPN/TOR/Proxy Bypass** | 52 | **16,585** |
| Perflyst/Dandelion Sprout Smart-TV Blocklist | 7 | 159 |

URL shape: `https://adguardteam.github.io/HostlistsRegistry/assets/filter_<id>.txt`

> 🔑 **List 52 closes the DoH bypass — the biggest hole in the whole design.**
> Design §5 concedes DNS "is not an enforcement boundary" and §7.1 notes AppLocker is what
> stops portable browsers. This list attacks the same problem from the network side.
> Verified live:
> ```
> dns.google -> 0.0.0.0     cloudflare-dns.com -> ::
> nordvpn.com -> ::         protonvpn.com -> 0.0.0.0
> github.com -> 140.82.112.4  (normal)
> ```
> **Strongly recommended for Phase 3.** It does not make DNS an enforcement boundary, but
> it raises the bypass cost from "install a browser" to "know what you are doing."

Other relevant lists: **HaGeZi's Gambling** (47), **Anti-Piracy** (46), **URL Shortener**
(68), **Game Console Adblock** (6), and the graded HaGeZi tiers Normal (34) / Pro (48) /
Ultimate (49) / Pro++ (51). **Do not stack Ultimate/Pro++ blindly** — breakage rises with
tier, and false positives on a household resolver surface as "the internet is broken."

⚠️ **Blocklists are global, not per-client.** A subscribed list applies to everyone
including the parents. To exempt parent devices, either keep contraband on per-client
built-in services, or add allowlist rules scoped with `$client`.

## 4d. Scheduling a custom rule with cron — built and tested

**Added 2026-08-17: Garrett asked directly whether the block can be removed at noon and
re-added at midnight.** Yes. `docs/reference/adguard-rule-schedule.py` does it, tested
end-to-end against a live instance.

```
MIDNIGHT: ./adguard-rule-schedule.py block roku-live
          -> therokuchannel.roku.com resolves to ::        BLOCKED
NOON:     ./adguard-rule-schedule.py allow roku-live
          -> therokuchannel.roku.com resolves to 13.32.179.37   ALLOWED
```

Cron on the Pi:

```cron
ADGUARD_URL=http://127.0.0.1:3000
ADGUARD_USER=admin
ADGUARD_PASS=...
0 12 * * * /opt/adguard/adguard-rule-schedule.py allow roku-live >>/var/log/kc-sched.log 2>&1
0  0 * * * /opt/adguard/adguard-rule-schedule.py block roku-live >>/var/log/kc-sched.log 2>&1
```

Verified properties:

- **Idempotent** — a second `block` prints "already block (no change)". Safe if cron
  double-fires or the Pi reboots and re-runs.
- **Survives a reboot** — restarted AdGuard mid-block; rule and marker persisted, DNS
  still `::`.
- **Preserves hand-written rules** — `set_rules` replaces the *entire* list, so the
  script does read-modify-write and only touches its own marked block. Verified with two
  hand-written rules present across a full block→allow cycle.
- **Exit 0/1** for cron alerting; verifies after writing rather than trusting HTTP 200.

### 🔴 The trap this script hit while being written: inline comments break rules

The first version marked its rules with a **trailing** comment so it could find them:

```
||therokuchannel.roku.com^$client='kid-roku'   ! kc-sched:roku-live
```

**AdGuard stores this happily, reports success, and the rule never blocks.** It does not
strip inline trailing comments, so the whole line fails to parse. Proven side by side:

```
||therokuchannel.roku.com^$client='kid-roku'   ! kc-sched:roku-live   -> 13.32.179.80  NOT blocked
||therokuchannel.roku.com^$client='kid-roku'                          -> ::            blocked
```

**The marker must be its own line, above the rule.** The script now does that, and
additionally fails with exit 1 if it ever finds a marker appended inline.

> **Fourth firing of this project's signature failure shape** — after the ChoreOps penalty
> sign, the Grocy test that locked in a bug, the `time=` modifier, and the helper that
> reported "protections intact." *Stored successfully, reported success, did nothing.*
> Note it was caught only because the test asserted on **actual DNS resolution** rather
> than on the API's 200 or on the rule list's contents. Checking the write would have
> passed; checking the effect failed.

## 5. ✅ Scheduling — §9.2 exactly right (with a correction)

⚠️ **§9.2 says the built-in schedule applies "only to the blocked-services list." That is
correct — but do not read it as "so bedtime needs cron."** For a rule expressed entirely
in blocked-services (which YouTube is), the built-in per-client scheduler is sufficient.
See §4b. Cron is required only for time-scheduled **custom rules / blocklists**, which
this household's stated requirements do not need.

- `/control/blocked_services/get` returns keys `['schedule', 'ids']` — the schedule
  belongs to the blocked-services object.
- `/control/filtering/status` returns `['filters','whitelist_filters','user_rules',
  'interval','enabled']` — **no schedule key of any kind.**

**Custom rules genuinely cannot be scheduled.** The cron + REST workaround in §9.2 is
required, not a workaround for a feature we failed to find. Combined with §3, that cron
job **must** use read-modify-write.

## 6. ✅ Version pin and architecture — §4.1 confirmed live

Checked against the Docker registry, not from memory:

- **v0.107.78 is the newest stable.** Newer tags are `v0.108.0-b.90` / `beta` / `edge`.
  Design §4.1's "do not spec against v0.108" is current as of 2026-08-17.
- Image pushed 2026-07-13.
- **Architectures: `arm64`, `arm/v7`, `arm/v6`, amd64, 386, ppc64le.**

> 🔑 **This partly de-risks the §0 hardware unknown.** The image runs on a Pi 3B/3B+
> *either way* — `arm/v7` covers 32-bit, `arm64` covers 64-bit. The board's exact model
> still determines the **OS** choice (Phase 2 §1 step 3), but it does **not** gate the
> container. One less thing to discover on flashing night.

## 7. Minor: the admin password will bite you in shell

`LabPassw0rd!x9` in a `curl -u` string got mangled by shell history expansion → silent
401s that look like wrong credentials. Used a `--netrc-file` instead.

**Pick an admin password without `!` for the real deployment**, or always use netrc.
Phase 2 §6 says this password ends up in HA secrets, so it will be scripted.

---

## What is still blocked (unchanged by lifting the Tuesday gate)

1. **No SD card reader attached.** `diskutil list external physical` → empty. Phase 2 §0
   called this "the single most likely thing to stall the evening." It did.
2. **Not on the home network.** Currently `10.250.4.64` behind gateway `10.48.73.1`.
   Phase 2 §1 bakes the SSID into the card *before first boot* — **flashing from here
   burns in the wrong network.** Flash at home.
3. **Old Pi model still unidentified** (Phase 2 §0). Less urgent now per §6 above, but
   still gates the 32- vs 64-bit OS choice.

Raspberry Pi Imager **is** installed. Docker **is** working.

## What this changes for flashing night

Phase 2 §5–§6 are now transcription, not discovery:

- The pinned image is confirmed to exist and to support the target arch.
- The `youtube` service id is confirmed real, with known contents.
- SafeSearch's master-switch gotcha is known in advance.
- The client-update trap is proven, with a working helper already written.

**Phase 2 §7's acceptance checklist is unchanged** — none of this substitutes for testing
against a real client device on the real network. What it removes is the risk of
discovering an API misunderstanding at 11pm with the household's DNS half-configured.
