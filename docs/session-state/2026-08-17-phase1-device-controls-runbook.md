# Device/OS Controls Runbook — Fort Knox Phase 1

**Branch:** `fort-knox` (worktree: `/Users/jdehart1/___Code_DEV/KitchenCOM-fortknox`)
**Design:** `docs/superpowers/specs/2026-08-16-parental-controls-design.md` (Layer 2, §7)
**Companion:** `docs/session-state/2026-08-17-adguard-pi-flashing-runbook.md` (Phase 2 — gated)
**Written:** 2026-08-17.

> **NOT GATED.** Design §13 marks Phase 1 **"Anytime"** — zero network risk, no Pi, no
> DNS, no hardware purchase. It is the only Fort Knox phase that can run before the
> Tuesday 2026-08-18 deliverable, and design §13 states it is *deliberately first*
> because it delivers **the download-approval capability that was the original ask.**

**Do not let this wait on Phase 2.** Phase 2 needs an SD reader, a fresh card, and an
identified board. Phase 1 needs an afternoon and the admin passwords you already have.

---

## 0. What Phase 1 actually buys you

Against the design's success criteria (§16), Phase 1 alone closes:

| # | Criterion | Phase 1 delivers |
|---|---|---|
| 1 | No installs without a parent | ✅ **Fully** — all four platforms |
| 3 | SafeSearch enforced | ⚠️ Partial — per-account only, not network-wide |
| 4 | Access ends at bedtime | ⚠️ Partial — iPad/PS5 only; Roku + laptop need DNS |
| 6 | YouTube history reviewable | ✅ **Fully** — Family Link, no network dependency |

Criteria 2, 5, 7, 8, 9 are DNS-layer and remain open until Phases 2–3.

**Read §5 of the design before promising anything to anyone.** DNS is a speed bump, not a
boundary — and Layer 2 is the layer that actually *enforces*. That asymmetry is the whole
reason this phase is first.

### The one pre-flight this phase needs

Design §11 pre-flight **#3**: *confirm Windows 11 and whether it is Home or Pro* — that
choice picks the §2.2 configuration path (Home has no `gpedit.msc`). Read-only, 10
seconds, from the laptop:

```powershell
Get-ComputerInfo -Property WindowsProductName, OsBuildNumber
```

The other four pre-flights in §11 are Phase 2/3 concerns (Pi model, SD health, gateway
re-probe, Cosmo connectivity) and do not block anything here.

### Ordering within Phase 1

Do them in this order. It is cheapest-first and front-loads the irreversible-feeling one.

1. **§1 Family Link** — do this first. It is account-level, affects both kids everywhere,
   and the age-18 policy point (below) is the single highest-value fact in this document.
2. **§2 Windows laptop** — the longest task; budget ~45 min.
3. **§3 iPads** — the platform where everything works as imagined; ~15 min each.
4. **§4 PS5** — ~15 min, mostly from the phone app.
5. **§5 Roku** — ~10 min, but read §7.4 first so you do not over-promise it.

---

## 1. Google Family Link — both kids

Design §8.1. This is account supervision, not device control, and it is the **only**
source of actual YouTube watch history. DNS will never provide this (§8.1: domain logs
show *that* YouTube was used, never *what* was watched).

1. Install **Family Link** on the parent phone.
2. Add both kids' Google accounts to the family group.
3. Per kid → **Controls → Content restrictions → YouTube** — set the supervision tier.
4. Verify history is visible: **My Activity → YouTube History** for that child.

> **🔑 The age-13 correction — do not let anyone tell you otherwise.**
> The long-repeated rule that a teen unilaterally "graduates" out of supervision at 13
> was **reversed in early 2026**. Google's current documentation requires **parent
> approval to stop supervision until age 18**. The child cannot end it; the parent can,
> anytime.
>
> **For the 12-year-old this is decisive — supervision does not expire next birthday.**
> Design Appendix A records this as contrary to widely-repeated online guidance; a future
> session must not "correct" it back.

**Real limits, state them honestly** (design §8.1): supervision governs the *Google
account*, not the device. A signed-out browser, a school account, or a friend's phone
sidesteps it entirely. Content controls for supervised teens are **three coarse tiers**,
not per-channel curation.

---

## 2. Windows laptop — Standard account + AppLocker

Design §7.1. The **weakest DNS device and the strongest OS device** in the house (§3) —
which is exactly why the OS layer carries the weight here.

### 2.1 Standard accounts (do this first — it is 90% of the value)

1. **Settings → Accounts → Other users** → confirm each kid has a **Standard** account.
2. **Confirm the parent admin account has a password set.** A blank admin password makes
   every UAC prompt a single click and silently voids this entire section.
3. Test it: sign in as the kid, try to run any `.exe` installer → expect a UAC prompt
   demanding the admin password.

> **⚠️ Correction to the original ask — remote approval does NOT exist here.**
> This is a **local prompt requiring the password typed at the machine**, not a phone
> notification. Microsoft Family Safety's "Ask to buy" covers Microsoft Store **paid**
> apps, in-app purchases, and subscriptions only. Free Store apps do not prompt, and
> **non-Store `.exe` installers never generate a phone notification.**
>
> Since `.exe` installers are how software actually gets installed, **remote approval is
> unavailable for the case that matters.** The iPads (§3) are the one platform where the
> original vision works as imagined. Set expectations accordingly — design §15 lists this
> as an explicit non-goal, on record.

### 2.2 AppLocker allow-listing

This is what stops **portable browsers**, which is what closes the DoH bypass (§7.1) —
the bypass that would otherwise walk straight around the entire Phase 2/3 DNS layer.
Without it, a kid downloads portable Firefox, enables DNS-over-HTTPS, and Layers 1 is
blind.

> **Works on Windows 11 Home and Pro.** The Enterprise/Education-only restriction was
> **lifted in KB 5024351**, contrary to most guides still online. Design Appendix A flags
> this — do not let a stale guide talk you out of it.

Home lacks `gpedit.msc`, so configure via **PowerShell/CSP**, elevated:

```powershell
# The service AppLocker depends on. Default is Manual — it must be Automatic,
# or rules silently stop enforcing after the next reboot.
Set-Service -Name AppIDSvc -StartupType Automatic
Start-Service AppIDSvc
Get-Service AppIDSvc      # expect Status Running, StartType Automatic
```

Generate default rules (allow Program Files + Windows, which implicitly denies the user's
Downloads folder — where portable browsers land):

```powershell
# Inspect the effective policy before and after
Get-AppLockerPolicy -Effective -Xml > "$env:USERPROFILE\applocker-before.xml"
```

Build the rule set from the default template, then apply:

```powershell
$rules = New-AppLockerPolicy -RuleType Publisher, Hash, Path `
    -User Everyone -Optimize -FileInformation (
        Get-ChildItem 'C:\Program Files\*','C:\Windows\*' -Recurse -Include '*.exe' `
        -ErrorAction SilentlyContinue | Get-AppLockerFileInformation)
Set-AppLockerPolicy -PolicyObject $rules -Merge
```

**Verify enforcement, do not assume it** (trap #1 — *a deployed file is not a running
file*, and it has bitten this project three times):

1. Sign in as the kid.
2. Download any portable app to `Downloads` and run it.
3. **Expect:** "This app has been blocked by your system administrator."
4. Confirm ordinary installed apps still launch. If they do not, the rule set is too
   tight — reapply from `applocker-before.xml`.
5. **Reboot and re-test.** This is where a Manual `AppIDSvc` reveals itself.

> **Smart App Control is not a parental control** (§7.1). It is a malware-reputation
> feature and will happily run a legitimately-signed game. Not used here — do not
> substitute it for AppLocker.

### 2.3 SafeSearch on the laptop

Account-level SafeSearch via Family Link covers signed-in Chrome. It does **not** survive
signing out or a different browser. **Network-enforced SafeSearch is Phase 2** (design
§9.1 — AdGuard enforces it for Google/Bing/DuckDuckGo/YouTube and it *cannot* be disabled
client-side). Treat the Phase 1 version as partial.

---

## 3. iPads ×2 — Screen Time + Ask to Buy

Design §7.2. **The one platform where remote approval genuinely works as imagined.**

1. **Family Sharing → Ask to Buy**, enabled per child.
   - Every install attempt sends a **push notification to the parent's phone**, approved
     or denied from the lock screen. This is the real thing, not §2's local prompt.
2. **Screen Time** per device:
   - Content ratings
   - App limits
   - **Downtime** (this is the iPad's bedtime cutoff — it does not need DNS)
3. **🔑 Restrict changes to DNS/VPN/profile settings** under Screen Time restrictions.

> **Do not skip step 3.** The iPads are described as "DNS-strong, cannot easily change
> resolver" (§3) — *that is only true if this restriction is set.* Leaving profile/VPN
> changes unlocked lets a kid install a VPN profile and bypass Phases 2–3 entirely,
> converting the strongest DNS platform into the weakest. This one toggle is what makes
> the §3 inventory claim true.

Verify: as the child, attempt a free App Store install → expect the parent phone to buzz.
Then attempt to change DNS in Wi-Fi settings → expect it to be blocked.

---

## 4. PS5 — vendor controls

Design §7.3. All of this is remotely manageable from the **PlayStation App**, so most of
it can be done from the couch.

1. **Age-level restriction** — Child / Early Teens / Late Teens. Games above the level
   will not launch without Family Manager approval. Confirmed working.
2. **Play-time limits** — per-day-of-week, with **forced logout** on expiry. Confirmed.
   This is the PS5's bedtime cutoff; like the iPads, it does not need DNS.
3. **Spending — set the monthly wallet cap to zero.**

> **⚠️ Spending is a monthly wallet cap, not per-item approval** (§7.3). Unlike Apple's
> Ask to Buy, **there is no approve-each-purchase prompt.** Downloads of already-owned or
> free content within the age level are **not individually approved**. Setting the cap to
> zero blocks purchases; it does not create an approval queue. Do not expect §3's
> notification behavior here.

---

## 5. Roku TVs — set the PIN, expect little

Design §7.4: **"The weakest platform in the stack. Do not over-promise it."**

What does **not** exist, all repeatedly confirmed by Roku community moderators:

- **No per-app lock.** YouTube **cannot** be PIN-locked. There is no setting for this.
- **Rating filters apply only to The Roku Channel** (and Live TV / antenna input). They
  have **zero effect** on YouTube, Netflix, or any third-party app.
- Parental controls are **account-wide, not per-profile.** No per-kid profiles exist.

Therefore, the only two moves available:

1. **Remove the YouTube app** from each Roku.
2. **Set a 4-digit PIN gating channel additions** — this is what prevents re-adding it.

Everything else on Roku is DNS's job (Phase 2/3). Success criterion #2 — "YouTube,
including the Roku app, is unavailable outside its scheduled window" — **cannot be met by
Phase 1.** The PIN is a speed bump on re-adding; the actual block is DNS.

---

## 6. Phase 1 acceptance

- [ ] Family Link active for **both** kids; YouTube history visible in My Activity
- [ ] Every kid Windows account is **Standard**, and the **admin account has a password**
- [ ] Kid account triggers a UAC password prompt on any `.exe` installer
- [ ] `AppIDSvc` is **Running** and **Automatic**
- [ ] Portable app in `Downloads` is blocked for the kid account — **verified after a reboot**
- [ ] Ordinary installed apps still launch for the kid account
- [ ] Ask to Buy on for both iPads — parent phone buzzes on a test install
- [ ] **Screen Time restricts DNS/VPN/profile changes on both iPads**
- [ ] iPad Downtime + PS5 play-time limits set to the intended bedtime
- [ ] PS5 age level set; wallet cap **zero**
- [ ] YouTube removed from each Roku; 4-digit channel-add PIN set
- [ ] Nothing in this phase touched the network, the gateway, or either Pi

**When this list is complete, the original ask — "kids can't install things without me" —
is delivered**, on every platform where it is technically possible, with the Windows and
PS5 exceptions documented above rather than glossed.

---

## 7. What this runbook does NOT do

- Any DNS filtering, blocklists, or network-wide SafeSearch (Phases 2–3)
- Any change to the AT&T gateway, household DHCP, or either Pi (Phase 3)
- Bedtime cutoffs for **Roku or the Windows laptop** — those are DNS-only (Phase 3)
- The HA panel, reporting, or tamper alerting (Phase 4)
- The ChoreOps points→minutes bridge (design §14, deferred)

---

## Traps

1. **A deployed file is not a running file.** Bit this project three times. AppLocker is
   exactly this shape — a policy can be applied and not enforced. **Reboot and re-test**
   (§2.2), do not trust the apply step.
2. **`AppIDSvc` defaults to Manual.** Rules appear to work until the next reboot, then
   silently stop. The most likely way this phase quietly fails weeks later.
3. **A blank admin password voids §2 entirely.** Every UAC prompt becomes one click.
4. **Stale guides will say AppLocker is Enterprise-only.** It is not, since KB 5024351.
5. **Do not promise phone-approval on Windows or PS5.** Only the iPads do that. Design
   §15 lists both as explicit non-goals so this stays on record.
6. **Verify, don't infer** — the same discipline that caught the BGW320-500's missing
   "Device Access Schedules". Every claim above is testable from a kid account; test it
   from a kid account, not from admin.
