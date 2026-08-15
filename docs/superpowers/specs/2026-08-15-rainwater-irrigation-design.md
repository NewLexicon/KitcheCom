# Rainwater Capture + Automated Irrigation — Design

**Date:** 2026-08-15
**Status:** DESIGN ONLY — nothing built, no hardware purchased, no code written.
**Branch:** `feat/irrigation`
**Blocked on:** Zigbee coordinator (shared gate with `feat/adaptive-lighting`), an
electrician conversation, and hardware purchases.

**This is not on the Tuesday 2026-08-18 path.** It is a post-deadline project captured while
the Pi was unavailable. Do not let it compete with the ChoreOps work.

---

## 1. What this is

Capture rainwater in IBC totes, pump it to landscape irrigation, and let Home Assistant decide
when to run — skipping days when it has rained or will rain, and refusing to run when the tanks
are too low to pump safely.

Two things make this more than a timer:

- **Tank level** decides whether irrigation *can* run (dry-running destroys a pump).
- **Rain data** decides whether it *should* run (avoids watering into a storm).

---

## 2. Site facts — decided, not assumptions

These came from the 2026-08-15 conversation and are settled:

| Fact | Consequence |
|---|---|
| **250-gal IBC totes** | Standard cage frame; top fill opening is the sensor mount point |
| **Totes in TOTAL SHADE** | No algae, no solar heat, no ultrasonic temp drift. **Paint is optional** — it was only ever an algae fix. |
| **Wood or tarp cage planned** | Must preserve **top access** over each fill opening |
| **Pi + antenna → ~15 ft → porch plug** | Through a **glass door**; glass is near-ideal for 2.4GHz |
| **Porch plug → 20–30 ft → pump** | Porch plug sits **between** coordinator and pump |
| **Porch plug is weather-protected** | Screened porch — the plug itself needs no outdoor rating |

### The mesh topology is good

```
[Pi + ZBDongle-P antenna] --15ft, glass--> [porch plug = ROUTER] --20-30ft--> [pump / outdoor devices]
```

A mains-powered Zigbee plug is a **router** and relays for everything downstream. This is the
textbook repeater layout and the geometry supports it.

Two caveats:

- **The porch plug must be mains-powered.** Battery Zigbee devices never route.
- **Zigbee self-organises; routes cannot be forced.** A device may bind directly to the
  coordinator on a weaker link. Mitigation: **pair every device in its final physical location**
  (same rule as the lighting package).

---

## 3. Architecture

### 3.1 Tank level — ultrasonic, non-contact

**Chosen: ESP32 + ultrasonic distance sensor per tote, running ESPHome (~$15-25/tank).**

Mounts in the top fill opening, measures the **air gap** down to the water, converts distance →
volume. Nothing touches the water, so nothing fouls or corrodes.

Rejected alternatives:
- **Submersible pressure transducer** — more accurate and immune to odd geometry, but it lives in
  the water and costs $40-80. Revisit only if ultrasonic proves unreliable.
- **Float switches** — cheap, but give "full/empty", not a level. **Keep as a possible independent
  low-level backstop**, not as the primary gauge.

**WiFi here, Zigbee elsewhere — deliberately.** HA does not care about protocol mixing. ESPHome is
first-class in HA and handles calibration and distance→volume math on-device, which is far nicer
than post-processing a generic Zigbee sensor. Use the right tool per device.

**Temperature compensation is NOT needed.** Ultrasonic readings drift with air temperature, but
total shade keeps air stable. Skip the temp sensor.

**⚠️ A sagging tarp inside the sensor cone reads as "full".** Ultrasonic returns the *first*
reflection. A rigid cage top with an opening over the fill port is strongly preferred over a loose
tarp.

### 3.2 Pump / valve switching — the safety-critical decision

**⚠️ DO NOT switch a mains water pump with a generic indoor smart plug.** Three compounding reasons:

1. **Outdoor rating** — anything exposed needs a real IP rating (IP44 min, IP65+ if weather-exposed).
   *The porch plug is sheltered, so this applies to hardware at the pump, not the porch.*
2. **Motor loads are not resistive loads.** A pump's startup inrush is several times its running
   current. A plug rated "10A" for lamps can weld its relay contacts shut on a motor. Check the
   **motor/inductive** rating specifically, not just the amp figure.
3. **GFCI is non-negotiable** for mains near water. A smart plug does not replace it.

**Preferred architecture — avoid switching mains at all:**

- **Low-voltage solenoid valve (24VAC, standard irrigation hardware)** controlled by HA. Same
  result, no relay in charge of a mains motor near water.
- If the **pump itself** must be switched: an **outdoor-rated contactor driven by a low-voltage
  signal** is the right pattern.

> **🚩 OPEN — ELECTRICIAN REQUIRED.** The wiring approach at the pump is out of scope for this
> document and should be reviewed by a licensed electrician looking at the actual installation.
> Mains + water + motor is the one area here where a general recommendation is not good enough.

### 3.3 Rain data

`weather.forecast_home` already exists (referenced in `homeassistant/dashboards/kitchen.yaml`) and
the **`weather.get_forecasts`** service is available in HA core (verified 2026-08-15 against
`reference/core-dev/homeassistant/components/weather/services.yaml`).

**⚠️ Forecast ≠ local truth — CONFIRMED, not a hypothetical.** `kitchen.yaml:13` records
`weather.forecast_home` as **Met.no** ("built-in, no API key", wired 2026-06-15). That is a
*regional* forecast: it will report rain for a shower three miles away and miss a cell that sits
over your yard. For irrigation this is usually acceptable — over-skipping is cheaper than
over-watering — but a **physical rain sensor or a personal weather station beats any forecast API**
if accuracy matters.

> **🚩 OPEN:** forecast-only, or add a physical rain sensor? Start forecast-only; add hardware if
> skip decisions prove wrong in practice.

### 3.4 Inlet protection

**Shade usually means trees**, and trees mean leaf and debris load in the capture path. Debris is
the single most likely thing to actually foul a rain-capture system, and it is far cheaper to keep
out than to clean out. It also clogs pump intakes.

**Plan for a leaf screen and/or a first-flush diverter on the inlet.** Not an HA concern — a
plumbing one — but it belongs in the build.

---

## 4. Automation logic

### Interlock ordering — level first, rain second

The ordering matters and is not arbitrary:

1. **HARD STOP if tank level below floor.** Protects the pump. A dry-run pump can destroy itself in
   minutes, and supply is genuinely variable in a rain-fed system. **This is the interlock that
   prevents damage.**
2. **SKIP if rain forecast** (next 12-24h) **or if it rained recently** (accumulated 24-48h).
   Prevents waste.
3. **RUNTIME CAP via `timer`.** A stuck automation must not be able to run the pump indefinitely.
4. **MANUAL OVERRIDE `input_boolean`.** Same safety-switch pattern as
   `input_boolean.kitchen_screensaver_enabled` in `homeassistant/packages/screensaver.yaml` and
   `adaptive_lighting_enabled` in `homeassistant/packages/lighting.yaml`. Anything that actuates
   hardware on a schedule gets a documented off-switch.

**The naive rule — "don't water if it is raining right now" — is wrong.** It fails to skip the day
*after* a soaking, and it fails to skip ahead of a forecast storm. Use recent-accumulation plus
forecast, not instantaneous condition.

### Sketch (NOT validated — no entities exist yet)

```
IF   input_boolean.irrigation_enabled == on
AND  sensor.tank_total_gallons        >  <floor>
AND  forecast precipitation next 24h  <  <threshold>
AND  accumulated rain last 48h        <  <threshold>
THEN start timer.irrigation_runtime
     open valve / start pump
WHEN timer finishes OR level drops below floor
     close valve / stop pump
```

Thresholds are deliberately unset — they depend on tank capacity, pump rate, and what is being
watered. Tune on real hardware.

---

## 5. Build order

Each step is independently verifiable. Do not skip ahead.

1. **Zigbee coordinator online.** ZBDongle-P + extension cable, ZHA added, at least one device
   paired. *(Shared gate with `feat/adaptive-lighting` — see `homeassistant/packages/lighting.yaml` §4 step 0.)*
2. **Porch plug paired and confirmed routing.** ZHA visualisation shows it as a router with
   children.
3. **Tank sensing first, before any switching.** ESP32 + ultrasonic → HA. Verify readings track
   real level across a fill/draw cycle. **Level is the safety interlock; it must be trustworthy
   before anything can actuate.**
4. **Electrician conversation** about the pump/valve approach. Do not buy switching hardware first.
5. **Switching hardware** per §3.2.
6. **Automation**, dry-run with the valve disconnected, then live.

**Rationale for 3-before-5:** the level sensor is the thing that prevents pump damage. Building
actuation before sensing means the first live run has no interlock.

---

## 6. Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | **Pump electrical approach** — solenoid vs contactor vs other. **Electrician.** | §3.2, build step 5 |
| 2 | Forecast-only, or add a physical rain sensor? | §3.3, tuning |
| 3 | How many totes? (Affects sensor count and total-volume template) | §3.1 |
| 4 | Pump specs — voltage, current, inrush | §3.2 |
| 5 | Threshold values (level floor, rain thresholds, runtime cap) | §4 — tune on hardware |

---

## 7. What is deliberately NOT in scope

- **Potable water.** This is landscape irrigation only. Nothing here is designed or safe for
  drinking water.
- **Freeze protection.** Not addressed. Relevant before winter — tanks and lines need draining or
  protection in freezing climates.
- **Zone control / multiple irrigation circuits.** Single circuit assumed. Multi-zone is a later
  extension.
- **Grey-water or municipal top-up.** Rain-fed only.

---

## 8. Related work

- `homeassistant/packages/lighting.yaml` (branch `feat/adaptive-lighting`) — **shares the Zigbee
  coordinator gate.** Read its §4 step 0 for the dongle decision (ZBDongle-P, CC2652P, extension
  cable not included) and the `/dev/serial/by-id/` and pair-in-final-location gotchas.
- `homeassistant/packages/screensaver.yaml` — the `input_boolean` + `timer` safety pattern this
  design reuses.
- `docs/session-state/2026-08-15-att-network-control-feasibility.md` (branch
  `research/att-network-control`) — unrelated subject, but the same lesson applies: **verify the
  enforcement/hardware layer before designing on top of it.**
