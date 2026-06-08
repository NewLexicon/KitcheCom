# KitchenCOM Foundation Slice Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the file-based scaffold of the KitchenCOM Home Assistant kitchen hub — HA config workspace + Layout-B dashboard skeleton + kiosk deploy unit + a tested screensaver custom card stub — all runnable/testable on a Mac, ready to copy onto a Pi when hardware arrives.

**Architecture:** KitchenCOM is built *on* Home Assistant (Pi OS + HA Container), not as a standalone app. This slice produces the version-controlled artifacts: an HA `/config` tree (keystone `configuration.yaml` wiring `packages/`, `themes/`, `dashboards/`), a Lit/TS custom screensaver card that reacts to `input_boolean.kitchen_idle`, and a systemd kiosk unit. No live HA instance or Pi is needed — config is validated with yamllint and the card is unit-tested with Vitest.

**Tech Stack:** Home Assistant (YAML config + Lovelace), Lit 3.3.3 + TypeScript (custom card), Vitest 4.x (card tests), Node 24, yamllint (config validation). Reference source: `reference/core-dev` (HA core), `reference/frontend-dev` (HA frontend card patterns).

**Source-of-truth:** `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md`

**Scope boundary (this slice):** SCAFFOLD ONLY. NOT in this slice: live Gemini/Google OAuth setup, the calendar `intent_script` (C-4), full voice-pipeline config, mobile sync, real media playback polish. Those are later spec→plan cycles. This slice = the skeleton everything later hangs on, with the screensaver card's idle-reactivity as the one piece of real tested logic.

---

## Chunk 1: HA config workspace + dashboard skeleton + kiosk unit

### Task 1: Repo workspace skeleton + config validation harness

**Files:**
- Create: `homeassistant/configuration.yaml`
- Create: `homeassistant/packages/.gitkeep`, `homeassistant/themes/.gitkeep`, `homeassistant/dashboards/.gitkeep`
- Create: `homeassistant/README.md`
- Create: `.yamllint`
- Create: `package.json` (repo root — holds the `validate:yaml` + later card scripts)

- [ ] **Step 1: Write the failing validation test (a yamllint run that must pass on our config)**

Create `.yamllint` (relaxed rules suited to HA config — HA YAML uses long lines and custom tags):

```yaml
extends: relaxed
rules:
  line-length: disable
  comments:
    min-spaces-from-content: 1
  truthy:
    allowed-values: ['true', 'false', 'on']  # HA uses 'on'
```

Add to root `package.json`:

```json
{
  "name": "kitchencom",
  "private": true,
  "scripts": {
    "validate:yaml": "yamllint -c .yamllint homeassistant/"
  }
}
```

- [ ] **Step 2: Confirm the linter is installed and runnable (the real PASS gate is Step 5)**

A linter against an empty tree does NOT "fail" like a TDD test — yamllint returns exit 0 with nothing to lint. So this step just confirms the tool works; the meaningful validation gate is Step 5 (after `configuration.yaml` exists).

Run: `yamllint -c .yamllint homeassistant/ ; echo "exit: $?"`
Expected: `exit: 0` with no output (nothing to lint yet). If `yamllint: command not found`: run `pip install yamllint` first, then re-run and expect `exit: 0`.

(Optional negative check — proves the harness catches real errors: create a throwaway `homeassistant/_bad.yaml` containing `foo: [unclosed`, run the lint → expect non-zero exit, then delete `_bad.yaml`.)

- [ ] **Step 3: Write the minimal keystone `configuration.yaml`**

This is the load-bearing glue (spec §2). Without it, packages/themes/dashboards never load. HA's `CONF_MODE` defaults to `MODE_STORAGE` (`reference/core-dev/homeassistant/components/lovelace/const.py:84`), so the YAML dashboard MUST be explicitly registered:

```yaml
# KitchenCOM — Home Assistant keystone config.
# Wires packages, themes, and the committed dashboard snapshot together.
# Dashboard runs in STORAGE mode live (phone drag-edit); kitchen.yaml below is a
# committed YAML-mode SNAPSHOT registered as a SEPARATE dashboard for review/recovery.

homeassistant:
  packages: !include_dir_named packages

frontend:
  themes: !include_dir_merge_named themes

lovelace:
  mode: storage  # live dashboards stay drag-and-drop editable (Balanced decision, spec §2)
  dashboards:
    kitchen-snapshot:
      mode: yaml
      title: Kitchen (snapshot)
      filename: dashboards/kitchen.yaml
      show_in_sidebar: true
```

- [ ] **Step 4: Create the directory keepers + README**

Create empty `homeassistant/packages/.gitkeep`, `homeassistant/themes/.gitkeep`, `homeassistant/dashboards/.gitkeep`.

Create `homeassistant/README.md`:

```markdown
# KitchenCOM HA config

Deployed to the Pi's Home Assistant `/config` directory (Pi OS + HA Container).

## Dashboard mode (Balanced decision — spec §2)
- The LIVE kitchen dashboard runs in **storage mode** → drag-and-drop editable from the
  phone/Companion app. It is NOT this file tree (storage mode lives in HA's `.storage/`).
- `dashboards/kitchen.yaml` is a committed **YAML-mode SNAPSHOT** registered as a separate
  dashboard ("Kitchen (snapshot)") for version-control, review, and disaster recovery.
- To update the snapshot: export the live dashboard's YAML and paste it into kitchen.yaml.

## Layout (keystone)
`configuration.yaml` wires `packages/` (helpers+automations), `themes/` (look),
and registers the snapshot dashboard. Nothing in `packages/`/`themes/` loads without it.
```

- [ ] **Step 5: Run validation to verify it PASSES**

Run: `yamllint -c .yamllint homeassistant/ ; echo "exit: $?"`
Expected: PASS (exit 0). yamllint validates YAML syntax; HA custom tags (`!include_dir_named`) are tolerated by relaxed mode since they're valid YAML tags.

- [ ] **Step 6: Commit**

```bash
git add homeassistant/ .yamllint package.json
git commit -m "feat: HA config workspace + keystone configuration.yaml"
```

### Task 2: KitchenCOM theme (the premium look, version-controlled)

**Files:**
- Create: `homeassistant/themes/kitchencom.yaml`

- [ ] **Step 1: Write the theme (HA theme = a YAML map of CSS variables)**

Mirror HA's theme variable names (verified pattern: HA themes set `--primary-color` etc.). Dark, premium kitchen aesthetic per Layout B:

```yaml
KitchenCOM:
  # Base palette — dark premium smart-display
  primary-color: "#2d6cff"
  accent-color: "#2d6cff"
  primary-background-color: "#0f1115"
  secondary-background-color: "#1b2130"
  card-background-color: "#1b2130"
  primary-text-color: "#e8edf6"
  secondary-text-color: "#cdd6e6"
  # Touch-friendly sizing
  ha-card-border-radius: "14px"
  # Glanceable headers
  app-header-background-color: "#0f1115"
  app-header-text-color: "#e8edf6"
```

- [ ] **Step 2: Validate**

Run: `yamllint -c .yamllint homeassistant/themes/kitchencom.yaml ; echo "exit: $?"`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add homeassistant/themes/kitchencom.yaml
git commit -m "feat: KitchenCOM premium theme"
```

### Task 3: Layout-B dashboard snapshot (standard HA cards in a grid)

**Files:**
- Create: `homeassistant/dashboards/kitchen.yaml`

**Note:** This uses STANDARD HA cards only (Balanced decision — content tiles stay editable). The hero/grid uses HA's native `grid` + `vertical-stack` cards. Entity ids here are PLACEHOLDERS to be wired on real hardware (documented inline). The custom screensaver card is referenced but its resource is registered later (Task 5 builds the card; its HA resource registration is a hardware-phase step, noted inline).

- [ ] **Step 1: Write the Layout-B dashboard YAML**

```yaml
# Layout B — Tile Grid (spec §1 Decision 6). Standard HA cards only.
# Entity ids are PLACEHOLDERS — wire to real entities on hardware setup.
title: Kitchen
views:
  - title: Home
    type: sections
    sections:
      # Hero column — clock/weather/voice anchor (Layout B left hero)
      - type: grid
        cards:
          - type: clock            # native HA clock card
          - type: weather-forecast
            entity: weather.home   # PLACEHOLDER
          - type: button
            name: Hold to talk
            icon: mdi:microphone
            tap_action:
              action: assist        # opens HA Assist (voice) — native
      # Groceries
      - type: grid
        cards:
          - type: todo-list
            entity: todo.groceries  # PLACEHOLDER (local_todo canonical, spec M-2)
      # Calendar + chores
      - type: grid
        cards:
          - type: calendar
            entities:
              - calendar.family     # PLACEHOLDER
          - type: todo-list
            entity: todo.chores     # PLACEHOLDER
# Screensaver: the custom card (custom:screensaver-card) overlays via the
# kitchen_idle automation (packages/screensaver.yaml, Task 4). Its JS resource is
# registered in HA on hardware setup — see deploy/INSTALL.md.
```

- [ ] **Step 2: Validate**

Run: `yamllint -c .yamllint homeassistant/dashboards/kitchen.yaml ; echo "exit: $?"`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat: Layout-B dashboard snapshot (standard cards)"
```

### Task 4: Idle automation package (input_boolean + automation skeleton)

**Files:**
- Create: `homeassistant/packages/screensaver.yaml`

**Note:** Implements the reactive-card idle model (spec §5). `input_boolean.kitchen_idle` is the native flag (verified: `reference/core-dev/homeassistant/components/input_boolean`). Motion trigger is OPTIONAL and GATED (M-11). The touch→timer bridge (M-10) is documented as a carry-forward to be wired on hardware.

- [ ] **Step 1: Write the package**

```yaml
# Screensaver idle state (spec §5 reactive-card model).
# The custom screensaver card subscribes to input_boolean.kitchen_idle and fades
# in/out IN PLACE (no view switching — HA core has no native remote view-switch).

input_boolean:
  kitchen_idle:
    name: Kitchen Idle
    icon: mdi:television-ambient-light

timer:
  kitchen_inactivity:
    duration: "00:03:00"   # 3 min default; tune on hardware

automation:
  - alias: "Kitchen — go idle when inactivity timer finishes"
    trigger:
      - platform: event
        event_type: timer.finished
        event_data:
          entity_id: timer.kitchen_inactivity
    action:
      - service: input_boolean.turn_on
        target:
          entity_id: input_boolean.kitchen_idle

  - alias: "Kitchen — wake on activity ping (M-10 browser->HA bridge)"
    # The kiosk fires input_button.kitchen_activity on touch (wired on hardware,
    # see deploy/INSTALL.md). That restarts the inactivity timer and clears idle.
    trigger:
      - platform: state
        entity_id: input_button.kitchen_activity
    action:
      - service: input_boolean.turn_off
        target:
          entity_id: input_boolean.kitchen_idle
      - service: timer.start
        target:
          entity_id: timer.kitchen_inactivity

input_button:
  kitchen_activity:
    name: Kitchen Activity Ping

# OPTIONAL motion wake (M-11 — gated): uncomment and set your motion entity on hardware.
# automation manual add:
#   - alias: "Kitchen — wake on motion"
#     trigger: { platform: state, entity_id: binary_sensor.kitchen_motion, to: "on" }
#     action: [ { service: input_button.press, target: { entity_id: input_button.kitchen_activity } } ]
```

- [ ] **Step 2: Validate**

Run: `yamllint -c .yamllint homeassistant/packages/screensaver.yaml ; echo "exit: $?"`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add homeassistant/packages/screensaver.yaml
git commit -m "feat: idle-state package (kitchen_idle + activity bridge skeleton)"
```

---

## Chunk 2: Screensaver custom card (the one piece of real tested code) + kiosk deploy

### Task 5: Screensaver card project scaffold + idle-reactivity (TDD)

**Files:**
- Create: `custom_cards/screensaver-card/package.json`
- Create: `custom_cards/screensaver-card/tsconfig.json`
- Create: `custom_cards/screensaver-card/vitest.config.ts`
- Create: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/idle-state.test.ts`

**Note:** The card's CORE TESTABLE LOGIC is: "given a `hass` object, is the screensaver active?" — i.e. it reads `hass.states['input_boolean.kitchen_idle'].state === 'on'`. We test that pure decision (spec §5 / M-9: Lit reactive `hass` property, pattern from `reference/frontend-dev/src/panels/lovelace/cards/hui-entity-card.ts:67,111`). We do NOT test rendering/animation here (DOM/visual — out of unit scope, validated on hardware).

- [ ] **Step 1: Scaffold the card project**

`custom_cards/screensaver-card/package.json`:

```json
{
  "name": "screensaver-card",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": { "lit": "3.3.3" },
  "devDependencies": { "vitest": "^4.1.8", "typescript": "^5.6.0" }
}
```

`custom_cards/screensaver-card/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`custom_cards/screensaver-card/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write the failing test**

`custom_cards/screensaver-card/test/idle-state.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isScreensaverActive } from "../src/screensaver-card";

const hassWith = (state: string) => ({
  states: { "input_boolean.kitchen_idle": { state } },
}) as any;

describe("isScreensaverActive", () => {
  it("is active when kitchen_idle is on", () => {
    expect(isScreensaverActive(hassWith("on"))).toBe(true);
  });
  it("is inactive when kitchen_idle is off", () => {
    expect(isScreensaverActive(hassWith("off"))).toBe(false);
  });
  it("is inactive when the entity is missing (fail-safe: never trap the screen)", () => {
    expect(isScreensaverActive({ states: {} } as any)).toBe(false);
  });
  it("is inactive when hass is undefined", () => {
    expect(isScreensaverActive(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it FAILS**

Run: `cd custom_cards/screensaver-card && npm install && npm test`
Expected: FAIL — vitest reports a collection/IMPORT error (the test file can't import `isScreensaverActive` because `src/screensaver-card.ts` doesn't exist yet), shown as "1 failed (1), no tests" — NOT a failed assertion. That's the correct red state.

- [ ] **Step 4: Write the minimal implementation**

`custom_cards/screensaver-card/src/screensaver-card.ts`:

```typescript
// Pure idle-decision logic — the card's one piece of real, testable logic.
// Reads input_boolean.kitchen_idle from hass (spec §5 reactive-card model, M-9).
// Fail-safe: any missing/unknown state => inactive, so the screensaver can never
// trap the screen if the entity is absent.

export const IDLE_ENTITY = "input_boolean.kitchen_idle";

export function isScreensaverActive(hass: any): boolean {
  return hass?.states?.[IDLE_ENTITY]?.state === "on";
}
```

- [ ] **Step 5: Run test to verify it PASSES**

Run: `npm test`
Expected: PASS (4 passing).

- [ ] **Step 6: Commit**

```bash
git add custom_cards/screensaver-card
git commit -m "feat: screensaver card idle-state logic (TDD, 4 tests)"
```

### Task 6: Screensaver card — media-list resilience logic (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/media-list.test.ts`

**Note:** Spec §4c resilience: missing dir / empty / corrupt → never a broken grid. We test the pure logic that decides "do we show media, or the fallback?" — independent of actual file IO (which is HA `media_source` at runtime).

- [ ] **Step 1: Write the failing test**

`custom_cards/screensaver-card/test/media-list.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selectDisplayMode } from "../src/screensaver-card";

describe("selectDisplayMode", () => {
  it("shows media when the list has supported files", () => {
    expect(selectDisplayMode(["a.jpg", "b.mp4"])).toBe("media");
  });
  it("shows fallback when the list is empty", () => {
    expect(selectDisplayMode([])).toBe("fallback");
  });
  it("shows fallback when the list is null/undefined (missing dir)", () => {
    expect(selectDisplayMode(undefined)).toBe("fallback");
  });
  it("ignores unsupported file types, shows fallback if none remain", () => {
    expect(selectDisplayMode(["notes.txt", "thumbs.db"])).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run test to verify it FAILS**

Run: `npm test`
Expected: FAIL — `selectDisplayMode` not exported.

- [ ] **Step 3: Add the minimal implementation**

Append to `src/screensaver-card.ts`:

```typescript
// Supported media extensions. Pi-5 codec note (M-8): HEVC/H.265 hardware decode is
// limited on Pi 5 — validate video formats on real hardware. Conservative default set.
const SUPPORTED = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"];

export function selectDisplayMode(files: string[] | undefined | null): "media" | "fallback" {
  if (!files || files.length === 0) return "fallback";
  const usable = files.filter((f) =>
    SUPPORTED.some((ext) => f.toLowerCase().endsWith(ext))
  );
  return usable.length > 0 ? "media" : "fallback";
}
```

- [ ] **Step 4: Run test to verify it PASSES**

Run: `npm test`
Expected: PASS (8 passing total).

- [ ] **Step 5: Commit**

```bash
git add custom_cards/screensaver-card
git commit -m "feat: screensaver media-list resilience logic (TDD)"
```

### Task 7: Kiosk deploy unit + install runbook

**Files:**
- Create: `deploy/kiosk/kitchencom-kiosk.service`
- Create: `deploy/kiosk/start-kiosk.sh`
- Create: `deploy/INSTALL.md`

**Note:** Pi OS native systemd unit (the I-6 reason for Container over OS — spec §6a). These are deploy artifacts; not unit-tested (no Pi). `INSTALL.md` is the Phase A–E runbook and carries the hardware-phase TODOs (M-8 codec validation, M-10 activity-ping wiring, M-12 auth choice, screensaver resource registration, placeholder entity wiring).

- [ ] **Step 1: Write the kiosk launch script**

`deploy/kiosk/start-kiosk.sh`:

```bash
#!/usr/bin/env bash
# Launch Chromium full-screen at the KitchenCOM dashboard (Pi OS).
set -euo pipefail
HA_URL="${HA_URL:-http://localhost:8123/kitchen-snapshot}"
# Disable screen blanking during active use (screensaver != display-off, spec §4d)
xset s off -dpms || true
exec chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --check-for-update-interval=31536000 \
  "$HA_URL"
```

- [ ] **Step 2: Write the systemd unit**

`deploy/kiosk/kitchencom-kiosk.service`:

```ini
[Unit]
Description=KitchenCOM Chromium Kiosk
After=graphical.target

[Service]
Type=simple
Environment=DISPLAY=:0
ExecStart=/home/pi/kitchencom/deploy/kiosk/start-kiosk.sh
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
```

- [ ] **Step 3: Write the install runbook**

`deploy/INSTALL.md`:

```markdown
# KitchenCOM Install Runbook (Pi 5 — Pi OS + HA Container)

## Phase A — OS + HA
1. Flash Raspberry Pi OS (64-bit) to NVMe SSD; keep SD/USB for media.
2. Install Docker; run the Home Assistant Container image; complete onboarding.

## Phase B — Integrations (HA UI, mostly clicks)
- Add **Google Gemini** integration (paste API key); enable the Assist LLM API on it.
- Add **Google Calendar / Tasks / Photos** (OAuth, family account).
- Build the **Assist voice pipeline**: USB mic → Gemini STT → conversation → Gemini TTS → speaker.

## Phase C — Deploy these files
1. Copy `homeassistant/*` into HA's `/config`.
2. Copy `custom_cards/screensaver-card` build output into `/config/www/`; **register the
   resource** (Settings → Dashboards → Resources → `/local/screensaver-card.js`, module).
3. Restart HA; check Config validity.

## Phase D — Kiosk
1. Copy repo to `/home/pi/kitchencom`; `chmod +x deploy/kiosk/start-kiosk.sh`.
2. `sudo cp deploy/kiosk/kitchencom-kiosk.service /etc/systemd/system/`
3. `sudo systemctl enable --now kitchencom-kiosk`

## Phase E — Mobile
- Family installs HA Companion app, signs in on the home network.

## HARDWARE-PHASE TODOs (carry-forwards from design)
- [ ] **M-12 kiosk auth:** choose long-lived access token vs `trusted_networks` for the kiosk; wire it.
- [ ] **M-10 activity bridge:** wire kiosk touch → `input_button.kitchen_activity` press (e.g. via a tap-action on the dashboard or a small JS ping) so the HA idle timer resets on touch.
- [ ] **M-8 codec validation:** test screensaver video formats on the actual Pi 5 (HEVC/H.265 hw decode limited).
- [ ] **C-4 calendar-by-voice:** add a custom `intent_script` for calendar event creation (calendar has no built-in add intent; only `CREATE_EVENT_SERVICE`). Separate plan.
- [ ] **Placeholders:** replace `weather.home`, `todo.groceries`, `todo.chores`, `calendar.family` with real entity ids.
- [ ] **M-2 canonical list:** confirm `local_todo` canonical + Google Tasks mirror.
```

- [ ] **Step 4: Make the script executable + sanity-check it parses**

Run: `chmod +x deploy/kiosk/start-kiosk.sh && bash -n deploy/kiosk/start-kiosk.sh && echo "syntax OK"`
Expected: `syntax OK` (bash -n checks syntax without executing).

- [ ] **Step 5: Commit**

```bash
git add deploy/
git commit -m "feat: Pi OS kiosk systemd unit + install runbook with hardware TODOs"
```

### Task 8: Root README + final slice verification

**Files:**
- Create: `README.md` (repo root)

- [ ] **Step 1: Write the root README**

```markdown
# KitchenCOM

A Raspberry Pi 5 kitchen touchscreen hub built **on Home Assistant** (Pi OS + HA Container).

- **Design spec:** `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md`
- **Cold-open briefing:** `docs/session-state/2026-06-07-ha-pivot-architecture-locked.md`

## Layout
- `homeassistant/` — HA `/config` tree (keystone `configuration.yaml`, packages, theme, dashboard snapshot)
- `custom_cards/screensaver-card/` — the one custom card (Lit/TS, idle-reactive)
- `deploy/` — Pi OS kiosk systemd unit + `INSTALL.md` runbook
- `reference/` — upstream HA source, read-only (gitignored)

## Develop on a Mac (no Pi needed)
- Validate config: `npm run validate:yaml`
- Test the card: `cd custom_cards/screensaver-card && npm install && npm test`

## Deploy
See `deploy/INSTALL.md`.
```

- [ ] **Step 2: Run the full slice verification (everything green on the Mac)**

Run:
```bash
npm run validate:yaml && \
cd custom_cards/screensaver-card && npm install && npm test && cd ../.. && \
bash -n deploy/kiosk/start-kiosk.sh && echo "SLICE VERIFIED"
```
Expected: yaml validates, 9 card tests pass, kiosk script syntax OK, prints `SLICE VERIFIED`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: root README + foundation slice complete"
```

---

## Done criteria
- `npm run validate:yaml` passes (HA config tree is syntactically valid).
- Screensaver card: 9 Vitest tests pass (idle-state + media-resilience logic).
- Kiosk script syntax-checks.
- All hardware-dependent work is captured as explicit TODOs in `deploy/INSTALL.md`, not silently dropped.
- The repo can be copied to a Pi and followed via `INSTALL.md` to a running hub.
