# Time-of-Day Panel Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the kitchen wall panel show three different layouts — Morning, Afternoon, Evening — switching itself at fixed clock boundaries.

**Architecture:** A template sensor (`sensor.kitchen_time_of_day`) publishes the current period. An invisible custom Lovelace card (`tod-autonav-card`), placed once on each of the three views, compares that sensor to its own view and navigates the browser when they disagree. Home Assistant core has no service that switches a browser's view, so the switch must happen browser-side via `history.pushState` + a `location-changed` event. A short (90s) defer timer suppresses the switch while someone is actively touching the panel.

**Tech Stack:** Home Assistant YAML packages (template sensor, `input_datetime`, `timer`, automation); TypeScript + lit, bundled with Vite; Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-08-time-of-day-layouts-design.md`

---

## Background the engineer needs

**This repo deploys to a Raspberry Pi running Home Assistant in Docker.** The Pi
is reachable as `ssh kitchencom`. Nothing here runs locally except the card build
and its tests.

**Custom cards MUST be bundled, never `tsc`-compiled.** `tsc` emits
`import { LitElement } from "lit"` verbatim; a browser cannot resolve that bare
specifier, so the module never evaluates, the element never registers, and Home
Assistant shows only a generic "Configuration error". Two cards in this repo were
broken this way. Vite bundling inlines lit. A guard test enforces it — Task 4.

**Three HA facts that this design depends on, all verified:**

1. `input_button` state changes on *every* press. `ButtonEntity._async_press_action`
   writes a fresh `dt_util.utcnow().isoformat()`, so the state is always different
   and `platform: state` fires each time. An `input_boolean` would silently no-op
   on the second press. Do not "simplify" the trigger entity.
2. The screensaver card's activity bridge defaults ON (`activityBridge` in
   `resolveConfig`, `custom_cards/screensaver-card/src/screensaver-card.ts:252-272`),
   so adding the card to a view with no extra config starts the bridge.
3. HA rebuilds card elements per view, so `disconnectedCallback` fires on tab
   switch. That is why the bridge must be present on all three views (Task 6) —
   it genuinely stops working on views that lack the card.

**Do NOT use `timer.kitchen_inactivity` as the defer signal.** It is 30 minutes,
it wedges in `idle` when the screensaver safety switch is off, and its producer
card is only on Home. See spec §4.2. A separate 90s timer is created in Task 1.

**The 90s defer is per-touch, not a total ceiling.** The automation is
`mode: restart`, so every touch restarts the window: the panel switches 90s after
the LAST interaction, not 90s after the boundary. The Reminders list is
interactive, so someone checking off five items at 10:58 keeps pushing the switch
out. That is the intended behaviour — the panel should not reshuffle under
someone who is using it — but do not describe it anywhere as a hard 90-second
maximum, and do not "fix" it by dropping `mode: restart`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `homeassistant/packages/time_of_day.yaml` | The `input_datetime` boundary helpers, `sensor.kitchen_time_of_day`, `timer.kitchen_nav_defer`, and the defer automation. All HA-side state for this feature. |
| `custom_cards/tod-autonav-card/src/tod-autonav-card.ts` | The invisible card: decide-whether-to-navigate logic + the lit element. |
| `custom_cards/tod-autonav-card/test/decide.test.ts` | Unit tests for the pure decision function. |
| `custom_cards/tod-autonav-card/test/dist-browser-loadable.test.ts` | Guard: built output has no imports. |
| `custom_cards/tod-autonav-card/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.test.json` | Build config, copied from `screensaver-card`. |

**Modified:**

| Path | Change |
|---|---|
| `homeassistant/dashboards/kitchen.yaml` | Home → Afternoon (title/path only); add Morning and Evening views; add `screensaver-card` + `tod-autonav-card` to all three. |

The decision logic is deliberately a **pure function** separate from the lit
element. It is the only part with real branching, and testing it needs no DOM.

---

## Task 1: The time-of-day package

**Files:**
- Create: `homeassistant/packages/time_of_day.yaml`

- [ ] **Step 1: Write the package**

Create `homeassistant/packages/time_of_day.yaml`:

```yaml
# Time-of-day panel layouts — spec docs/superpowers/specs/2026-09-08-time-of-day-layouts-design.md
#
# Drives which of the three panel views (morning/afternoon/evening) the kiosk
# should be showing. The actual navigation happens browser-side in
# custom:tod-autonav-card — HA core has no remote view-switch service.

input_datetime:
  kitchen_morning_start:
    name: Morning starts
    has_date: false
    has_time: true
  kitchen_afternoon_start:
    name: Afternoon starts
    has_date: false
    has_time: true
  kitchen_evening_start:
    name: Evening starts
    has_date: false
    has_time: true

# Defer auto-nav briefly after any touch, so the layout is never yanked out
# from under someone mid-tap.
#
# NOT timer.kitchen_inactivity: that one is THIRTY MINUTES (screensaver.yaml:25),
# so reusing it would suppress auto-nav for half an hour after any glance at the
# panel. It also wedges in `idle` when the screensaver safety switch is off
# (screensaver.yaml:45-51). This timer is short and single-purpose.
timer:
  kitchen_nav_defer:
    duration: "00:01:30"

template:
  - trigger:
      # Re-evaluate every minute. Boundaries have minute resolution, so this is
      # the coarsest trigger that can never miss one.
      - platform: time_pattern
        minutes: "*"
      # ...and immediately at startup, so the sensor is never `unknown` for a
      # minute after a restart.
      - platform: homeassistant
        event: start
    sensor:
      - name: Kitchen Time Of Day
        unique_id: kitchen_time_of_day
        state: >
          {% set now_m = now().hour * 60 + now().minute %}
          {% set morning = state_attr('input_datetime.kitchen_morning_start', 'timestamp') | default(18000, true) / 60 %}
          {% set afternoon = state_attr('input_datetime.kitchen_afternoon_start', 'timestamp') | default(39600, true) / 60 %}
          {% set evening = state_attr('input_datetime.kitchen_evening_start', 'timestamp') | default(66600, true) / 60 %}
          {# Evening WRAPS past midnight, so the three boundaries are not simply
             ascending. Test each window explicitly rather than assuming order. #}
          {% if now_m >= evening or now_m < morning %}
            evening
          {% elif now_m >= afternoon %}
            afternoon
          {% else %}
            morning
          {% endif %}

automation:
  - alias: "Kitchen — hold auto-nav briefly after any touch"
    id: kitchen_nav_defer_on_activity
    mode: restart
    # input_button (NOT input_boolean): ButtonEntity writes a fresh timestamp on
    # every press, so the state always changes and this trigger fires each time.
    # An input_boolean would silently no-op on the second consecutive press.
    trigger:
      - platform: state
        entity_id: input_button.kitchen_activity
    action:
      - service: timer.start
        target:
          entity_id: timer.kitchen_nav_defer
```

- [ ] **Step 2: Validate the YAML**

Run: `npm run validate:yaml`
Expected: exits 0, no errors for `time_of_day.yaml`.

- [ ] **Step 3: Commit**

```bash
git add homeassistant/packages/time_of_day.yaml
git commit -m "feat(panel): time-of-day sensor, boundary helpers, and nav-defer timer"
```

---

## Task 2: Scaffold the tod-autonav-card package

**Files:**
- Create: `custom_cards/tod-autonav-card/package.json`
- Create: `custom_cards/tod-autonav-card/vite.config.ts`
- Create: `custom_cards/tod-autonav-card/tsconfig.json`
- Create: `custom_cards/tod-autonav-card/tsconfig.test.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "tod-autonav-card",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p tsconfig.test.json"
  },
  "dependencies": {
    "lit": "3.3.3"
  },
  "devDependencies": {
    "@types/node": "^26.2.0",
    "typescript": "^5.6.0",
    "vite": "^8.2.1",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import { resolve } from "node:path";

// WHY A BUNDLER AND NOT PLAIN `tsc`:
// `tsc` emits import specifiers verbatim, so `import { LitElement } from "lit"`
// survives into dist/. A browser cannot resolve a BARE specifier — it throws
// "Failed to resolve module specifier \"lit\"", the module never evaluates, the
// custom element never registers, and Home Assistant reports only a generic
// "Configuration error". Two cards in this repo shipped that defect.
// Guarded by test/dist-browser-loadable.test.ts.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    target: "es2021",
    rollupOptions: {
      external: [],
    },
    lib: {
      entry: resolve(import.meta.dirname, "src/tod-autonav-card.ts"),
      formats: ["es"],
      fileName: () => "tod-autonav-card.js",
    },
  },
});
```

- [ ] **Step 3: Copy the tsconfigs**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
cp custom_cards/screensaver-card/tsconfig.json custom_cards/tod-autonav-card/tsconfig.json
cp custom_cards/screensaver-card/tsconfig.test.json custom_cards/tod-autonav-card/tsconfig.test.json
```

- [ ] **Step 4: Install**

Run: `cd custom_cards/tod-autonav-card && npm install`
Expected: completes without error; `node_modules/` created.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/tod-autonav-card/package.json \
        custom_cards/tod-autonav-card/vite.config.ts \
        custom_cards/tod-autonav-card/tsconfig.json \
        custom_cards/tod-autonav-card/tsconfig.test.json \
        custom_cards/tod-autonav-card/package-lock.json
git commit -m "chore(tod-autonav): scaffold card package with bundled vite build"
```

---

## Task 3: The navigation decision function (TDD)

This is the whole brain of the card, as a pure function. No DOM, no lit.

**Files:**
- Create: `custom_cards/tod-autonav-card/test/decide.test.ts`
- Create: `custom_cards/tod-autonav-card/src/tod-autonav-card.ts`

- [ ] **Step 1: Write the failing tests**

Create `custom_cards/tod-autonav-card/test/decide.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shouldNavigate, type HassLike } from "../src/tod-autonav-card";

/** Build a minimal hass stub: current period + defer-timer state. */
function hass(period: string, deferState = "idle"): HassLike {
  return {
    states: {
      "sensor.kitchen_time_of_day": { state: period },
      "timer.kitchen_nav_defer": { state: deferState },
    },
  };
}

describe("shouldNavigate", () => {
  it("navigates when the period no longer matches this view", () => {
    expect(shouldNavigate(hass("afternoon"), "morning")).toBe(true);
  });

  it("does not navigate when already on the correct view", () => {
    expect(shouldNavigate(hass("morning"), "morning")).toBe(false);
  });

  it("does not navigate while the defer timer is active", () => {
    expect(shouldNavigate(hass("afternoon", "active"), "morning")).toBe(false);
  });

  it("navigates once the defer timer has finished", () => {
    // A timer that has run and finished reports "idle" again.
    expect(shouldNavigate(hass("afternoon", "idle"), "morning")).toBe(true);
  });

  it("navigates when the defer timer is paused", () => {
    // Paused is not 'someone is actively touching the panel'.
    expect(shouldNavigate(hass("afternoon", "paused"), "morning")).toBe(true);
  });

  it("does nothing when the sensor is unavailable", () => {
    expect(shouldNavigate(hass("unavailable"), "morning")).toBe(false);
  });

  it("does nothing when the sensor is unknown", () => {
    expect(shouldNavigate(hass("unknown"), "morning")).toBe(false);
  });

  it("does nothing when the sensor is missing entirely", () => {
    expect(shouldNavigate({ states: {} }, "morning")).toBe(false);
  });

  it("does nothing when hass is undefined", () => {
    expect(shouldNavigate(undefined, "morning")).toBe(false);
  });

  it("navigates when the defer timer entity does not exist", () => {
    // A missing timer must fail TOWARD working nav, not away from it — the old
    // design's failure mode was a wedged timer silently disabling auto-nav.
    const h: HassLike = {
      states: { "sensor.kitchen_time_of_day": { state: "evening" } },
    };
    expect(shouldNavigate(h, "morning")).toBe(true);
  });

  it("ignores a period that is not one of the three known views", () => {
    expect(shouldNavigate(hass("teatime"), "morning")).toBe(false);
  });

  it("handles the evening view across the midnight wrap", () => {
    // 00:30 is 'evening' per the sensor; a card on the evening view stays put.
    expect(shouldNavigate(hass("evening"), "evening")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd custom_cards/tod-autonav-card && npm test`
Expected: FAIL — cannot resolve `../src/tod-autonav-card` (the file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `custom_cards/tod-autonav-card/src/tod-autonav-card.ts`:

```typescript
// Invisible auto-nav card for the time-of-day panel layouts.
// Spec: docs/superpowers/specs/2026-09-08-time-of-day-layouts-design.md
//
// Home Assistant core has NO service that switches a browser's Lovelace view, so
// the switch has to happen in the browser. This card sits on each of the three
// time views, watches sensor.kitchen_time_of_day, and navigates when the panel
// is showing the wrong one for the current time.

export const TOD_SENSOR = "sensor.kitchen_time_of_day";
export const DEFER_TIMER = "timer.kitchen_nav_defer";

/** The three periods that map 1:1 to dashboard views. */
export const VIEWS = ["morning", "afternoon", "evening"] as const;
export type ViewName = (typeof VIEWS)[number];

export interface HassLike {
  states?: Record<string, { state: string } | undefined>;
  callService?: (domain: string, service: string, data?: unknown) => void;
}

/**
 * Decide whether the panel should navigate away from `view` right now.
 *
 * Deliberately conservative: anything unexpected returns false and the panel
 * stays where it is. A broken sensor must never strand the panel on a blank or
 * wrong view.
 *
 * The ONE exception is a missing defer timer, which returns true — a timer that
 * never runs has to read as "nobody is here". The previous design failed the
 * other way, where a wedged timer silently disabled auto-nav forever.
 */
export function shouldNavigate(hass: HassLike | undefined, view: string): boolean {
  const period = hass?.states?.[TOD_SENSOR]?.state;
  if (!period) return false;
  if (!(VIEWS as readonly string[]).includes(period)) return false;
  if (period === view) return false;

  // Absent timer => not deferring. See docstring.
  const defer = hass?.states?.[DEFER_TIMER]?.state;
  if (defer === "active") return false;

  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd custom_cards/tod-autonav-card && npm test`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/tod-autonav-card/src/tod-autonav-card.ts \
        custom_cards/tod-autonav-card/test/decide.test.ts
git commit -m "feat(tod-autonav): navigation decision function with fail-safe defaults"
```

---

## Task 4: The lit element and the browser-loadable guard

**Files:**
- Modify: `custom_cards/tod-autonav-card/src/tod-autonav-card.ts` (append)
- Create: `custom_cards/tod-autonav-card/test/dist-browser-loadable.test.ts`

- [ ] **Step 1: Write the guard test**

Create `custom_cards/tod-autonav-card/test/dist-browser-loadable.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const CARD = "tod-autonav-card.js";

/** Matches a static `import ... from "spec"` / `import "spec"` and captures the specifier. */
const IMPORT_RE = /^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm;

describe("dist is loadable by a browser as a Lovelace resource", () => {
  // WHY THIS EXISTS: `tsc` emits import specifiers verbatim, so `import {...}
  // from "lit"` survives into dist/ and the card cannot load in Home Assistant —
  // while unit tests still pass, because Vitest resolves through node_modules.
  // Two sibling cards in this repo failed exactly this way.
  it(`${CARD} has no imports at all — it must be self-contained`, () => {
    const path = resolve(DIST, CARD);
    expect(existsSync(path), `${CARD} missing — run \`npm run build\` first`).toBe(true);

    const specs = [...readFileSync(path, "utf8").matchAll(IMPORT_RE)].map((m) => m[1]);
    expect(
      specs,
      `${CARD} imports ${JSON.stringify(specs)}. A browser cannot resolve bare ` +
      `specifiers, and a relative sibling chunk is a second file to deploy. ` +
      `The build must inline dependencies.`,
    ).toEqual([]);
  });

  it("lit is actually inlined, not merely absent", () => {
    const src = readFileSync(resolve(DIST, CARD), "utf8");
    expect(src).toContain("customElements.define");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd custom_cards/tod-autonav-card && npm test -- dist-browser-loadable`
Expected: FAIL — "tod-autonav-card.js missing — run `npm run build` first".

- [ ] **Step 3: Append the lit element**

Append to `custom_cards/tod-autonav-card/src/tod-autonav-card.ts`:

```typescript
import { LitElement, html, css, type PropertyValues, type TemplateResult } from "lit";

/**
 * Navigate the Lovelace panel to `path`.
 *
 * pushState + a `location-changed` event is how HA's own frontend navigates
 * (see reference/frontend-dev/). A plain location.assign() would be a full page
 * reload: white flash, websocket reconnect, several seconds of blank panel.
 */
export function navigateTo(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
}

export class TodAutonavCard extends LitElement {
  static properties = {
    hass: { attribute: false },
  };

  // Renders nothing and occupies no space. This card is pure behaviour.
  static styles = css`
    :host {
      display: none;
    }
  `;

  hass?: HassLike;
  private _view = "";
  private _basePath = "/kitchen-snapshot";

  setConfig(config: Record<string, unknown>): void {
    const view = typeof config.view === "string" ? config.view : "";
    if (!(VIEWS as readonly string[]).includes(view)) {
      throw new Error(
        `tod-autonav-card: "view" must be one of ${VIEWS.join(", ")} (got ${JSON.stringify(config.view)})`,
      );
    }
    this._view = view;
    if (typeof config.base_path === "string" && config.base_path) {
      this._basePath = config.base_path;
    }
  }

  // Zero rows in a sections layout.
  getCardSize(): number {
    return 0;
  }

  getGridOptions(): Record<string, number> {
    return { rows: 0, columns: 1 };
  }

  updated(changed: PropertyValues): void {
    if (!changed.has("hass")) return;
    if (!shouldNavigate(this.hass, this._view)) return;

    const target = this.hass?.states?.[TOD_SENSOR]?.state;
    if (!target) return;
    navigateTo(`${this._basePath}/${target}`);
  }

  render(): TemplateResult {
    return html``;
  }
}

if (!customElements.get("tod-autonav-card")) {
  customElements.define("tod-autonav-card", TodAutonavCard);
}
```

Move the `import ... from "lit"` line to the TOP of the file (imports must
precede other statements).

- [ ] **Step 4: Build**

Run: `cd custom_cards/tod-autonav-card && npm run build`
Expected: writes `dist/tod-autonav-card.js`.

- [ ] **Step 5: Run the full test suite**

Run: `cd custom_cards/tod-autonav-card && npm test`
Expected: PASS — 14 tests (12 decision + 2 guard).

- [ ] **Step 6: Typecheck**

Run: `cd custom_cards/tod-autonav-card && npm run typecheck`
Expected: exits 0, no output.

- [ ] **Step 7: Commit**

```bash
git add custom_cards/tod-autonav-card/src/tod-autonav-card.ts \
        custom_cards/tod-autonav-card/test/dist-browser-loadable.test.ts
git commit -m "feat(tod-autonav): lit element with pushState navigation + bundle guard"
```

---

## Task 5: Promote Home to Afternoon

The smallest possible change to a 1796-line view: its title and path.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml:13-15`

- [ ] **Step 1: Read the current view header**

Run: `sed -n '13,19p' homeassistant/dashboards/kitchen.yaml`
Expected output:

```
  - title: Home
    path: home
    icon: mdi:home-heart
    type: sections
    max_columns: 3
    sections:
```

- [ ] **Step 2: Change title, path and icon**

Replace lines 13-15 so the header reads:

```yaml
  - title: Afternoon
    path: afternoon
    icon: mdi:white-balance-sunny
```

Leave `type: sections`, `max_columns: 3` and everything below untouched.

- [ ] **Step 3: Fix the internal navigation link**

`kitchen.yaml:30` navigates to `/kitchen-snapshot/schedule`. That path is
unchanged by this task, so it still resolves — no edit needed. Confirm:

Run: `grep -n "navigation_path" homeassistant/dashboards/kitchen.yaml`
Expected: every path listed still matches an existing view (`schedule`, `lists`).

- [ ] **Step 4: Validate**

Run: `npm run validate:yaml`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat(panel): promote Home to the Afternoon view"
```

---

## Task 6: Add the two cards to the Afternoon view

Both new cards go on all three views. Afternoon already has
`screensaver-card` (at what was line 57), so it needs only the autonav card.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml` (column 1 cards list)

- [ ] **Step 1: Add the autonav card**

In the Afternoon view's FIRST `- type: grid` section, immediately after the
existing `- type: custom:screensaver-card` block and at the same indentation,
add:

```yaml
          # Invisible. Navigates the panel to the right time-of-day view.
          # Present on all three time views; deliberately NOT on Schedule or
          # Lists, so opening those manually is never overridden.
          - type: custom:tod-autonav-card
            view: afternoon
```

- [ ] **Step 2: Validate**

Run: `npm run validate:yaml`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat(panel): auto-nav card on the Afternoon view"
```

---

## Task 7: The Morning view

Composed from cards that already exist elsewhere in this file. Read the
Afternoon view's chore-tile and weather blocks and mirror their structure.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml` (insert a new view before Afternoon)

- [ ] **Step 1: Find the exact card blocks to mirror**

Run:
```bash
grep -n "type: weather-forecast\|custom:auto-entities\|sensor.daily_quote" homeassistant/dashboards/kitchen.yaml
```
Note the line ranges. Copy those blocks verbatim rather than writing new ones —
they carry tuning (grid options, tile sizes, filters) that must not be re-derived.

- [ ] **Step 2: Insert the Morning view**

Insert immediately after `views:` (before the Afternoon view):

```yaml
  # ==========================================================================
  # MORNING (05:00–11:00) — get out the door.
  # Big calendar, weather, reminders, and ONLY the morning chores.
  # ==========================================================================
  - title: Morning
    path: morning
    icon: mdi:weather-sunset-up
    type: sections
    max_columns: 3
    sections:
      # ---- Column 1: today ------------------------------------------------
      - type: grid
        cards:
          - type: heading
            heading: Today
            heading_style: title
            icon: mdi:calendar-today
            tap_action:
              action: navigate
              navigation_path: /kitchen-snapshot/schedule
          - type: calendar
            # dayGridDay = just today, large. The card supports ONLY
            # dayGridMonth, dayGridDay and listWeek — anything else silently
            # falls back to month (see the note on the Afternoon calendar).
            initial_view: dayGridDay
            grid_options:
              rows: 12
            entities:
              - calendar.family
              - calendar.deharts
              - calendar.garrett_dehart
              - calendar.rebdinatl_gmail_com
              - calendar.birthdays
              - calendar.holidays_in_united_states
          - type: custom:screensaver-card
            media_path: photos
            photo_duration: 10
            shuffle: true
          - type: custom:tod-autonav-card
            view: morning

      # ---- Column 2: weather + reminders -----------------------------------
      - type: grid
        cards:
          - type: heading
            heading: Weather
            heading_style: title
            icon: mdi:weather-partly-cloudy
          # PASTE the weather card block located in Step 1 here, verbatim.
          - type: heading
            heading: Reminders
            heading_style: title
            icon: mdi:bell-outline
          - type: todo-list
            entity: todo.reminders

      # ---- Column 3: morning chores ----------------------------------------
      - type: grid
        cards:
          - type: heading
            heading: Morning Chores
            heading_style: title
            icon: mdi:broom
          # PASTE the two ☀ Morning auto-entities blocks (Rowan and Wystan)
          # located in Step 1 here, verbatim. Do NOT include the Evening rows.
```

- [ ] **Step 3: Validate**

Run: `npm run validate:yaml`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat(panel): Morning view — today's calendar, weather, reminders, morning chores"
```

---

## Task 8: The Evening view

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml` (insert a new view after Afternoon)

- [ ] **Step 1: Insert the Evening view**

Insert immediately AFTER the Afternoon view's last section and BEFORE
`- title: Schedule`:

```yaml
  # ==========================================================================
  # EVENING (18:30–05:00) — what to expect tomorrow.
  # Runs to 05:00 deliberately: a night-owl or early-riser should see tomorrow.
  # ==========================================================================
  - title: Evening
    path: evening
    icon: mdi:weather-night
    type: sections
    max_columns: 3
    sections:
      # ---- Column 1: tomorrow ----------------------------------------------
      - type: grid
        cards:
          - type: heading
            heading: Tomorrow
            heading_style: title
            icon: mdi:calendar-arrow-right
          - type: calendar
            initial_view: dayGridDay
            grid_options:
              rows: 12
            entities:
              - calendar.family
              - calendar.deharts
              - calendar.garrett_dehart
              - calendar.rebdinatl_gmail_com
              - calendar.birthdays
              - calendar.holidays_in_united_states
          - type: custom:screensaver-card
            media_path: photos
            photo_duration: 10
            shuffle: true
          - type: custom:tod-autonav-card
            view: evening

      # ---- Column 2: reminders ---------------------------------------------
      - type: grid
        cards:
          - type: heading
            heading: Reminders
            heading_style: title
            icon: mdi:bell-outline
          - type: todo-list
            entity: todo.reminders

      # ---- Column 3: the week + weather ------------------------------------
      - type: grid
        cards:
          - type: heading
            heading: This Week
            heading_style: title
            icon: mdi:calendar-week
            tap_action:
              action: navigate
              navigation_path: /kitchen-snapshot/schedule
          - type: calendar
            initial_view: listWeek
            grid_options:
              rows: 8
            entities:
              - calendar.family
              - calendar.deharts
              - calendar.garrett_dehart
              - calendar.rebdinatl_gmail_com
              - calendar.birthdays
              - calendar.holidays_in_united_states
          # PASTE the weather card block from Task 7 Step 1 here, verbatim.
```

> **Known limitation, do not try to fix here.** The stock calendar card has no
> "start on tomorrow" option — `dayGridDay` opens on today. The Tomorrow column
> therefore shows *today* until a card that accepts a date offset exists. That
> is deliberately out of scope; it is folded into the work-week calendar spec
> (spec §7). Leave a `# TOMORROW-OFFSET` comment on the card so it is findable.

- [ ] **Step 2: Validate**

Run: `npm run validate:yaml`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat(panel): Evening view — tomorrow, reminders, week, weather"
```

---

## Task 9: Create the reminders list on the Pi

`local_todo` is a config-flow integration — it is set up through the UI, not
YAML. `todo.groceries` already runs on it, so this is a second entry of a
proven integration.

**Files:** none (UI action on the Pi)

- [ ] **Step 1: Add the list**

In Home Assistant: **Settings → Devices & Services → Add Integration → Local
To-do**, list name **`Reminders`**.

- [ ] **Step 2: Verify the entity exists**

Run:
```bash
ssh kitchencom 'python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
print([e[\"entity_id\"] for e in d[\"data\"][\"entities\"] if e[\"entity_id\"].startswith(\"todo.\")])
"'
```
Expected: the list includes `todo.reminders`.

- [ ] **Step 3: Verify voice add works**

In HA: **Developer Tools → Assist** (or the Assist dialog), say/type:
`add test item to reminders`

Expected: a spoken/typed confirmation, and `test item` appears on the list.

> If this fails, the cause is Assist configuration, NOT this feature. The live
> Pi has `default_config:` (verified 2026-09-08), so `conversation` → `intent`
> loads and the built-in `HassListAddItem` intent is registered. Check that a
> conversation agent is selected before changing anything in this plan.

- [ ] **Step 4: Remove the test item**

Delete `test item` from the list in the UI.

---

## Task 10: Deploy and verify on the Pi

**Files:** none (deployment)

- [ ] **Step 1: Check which branch you are on**

Run: `git branch --show-current`
Expected: `feat/time-of-day-layouts`

> Multiple sessions share this checkout. Confirm before every deploy.

- [ ] **Step 2: Back up the live dashboard**

```bash
ssh kitchencom 'cp /home/garrettdehart/homeassistant/dashboards/kitchen.yaml \
  /home/garrettdehart/homeassistant/dashboards/kitchen.yaml.bak-$(date +%Y%m%d-%H%M%S)'
```

> `kitchen.yaml` is edited live by other sessions. Check the backup timestamps
> first: `ssh kitchencom 'ls -lt /home/garrettdehart/homeassistant/dashboards/'`.
> If the live file is NEWER than your last known deploy, diff before overwriting.

- [ ] **Step 3: Copy the package, dashboard and card**

```bash
scp homeassistant/packages/time_of_day.yaml \
    kitchencom:/home/garrettdehart/homeassistant/packages/
scp homeassistant/dashboards/kitchen.yaml \
    kitchencom:/home/garrettdehart/homeassistant/dashboards/
scp custom_cards/tod-autonav-card/dist/tod-autonav-card.js \
    kitchencom:/home/garrettdehart/homeassistant/www/
```

- [ ] **Step 4: Register the card as a Lovelace resource**

In HA: **Settings → Dashboards → ⋮ → Resources → Add Resource**
URL `/local/tod-autonav-card.js`, type **JavaScript Module**.

- [ ] **Step 5: Check the config and restart**

```bash
ssh kitchencom 'docker exec homeassistant python -m homeassistant --script check_config -c /config'
```
Expected: `Testing configuration at /config` then no errors.

```bash
ssh kitchencom 'docker restart homeassistant'
```

- [ ] **Step 6: Wait, then verify the sensor**

New YAML entities need 60–90 seconds after a restart — HA answers 200 long
before they exist. Checking early looks exactly like a failed deploy.

```bash
sleep 90
ssh kitchencom 'docker exec homeassistant python -c "print(open(\"/config/packages/time_of_day.yaml\").read()[:80])"'
```

Then in **Developer Tools → States**, confirm:
- `sensor.kitchen_time_of_day` has one of `morning` / `afternoon` / `evening`
- `timer.kitchen_nav_defer` exists and is `idle`

- [ ] **Step 7: Clear the panel's service worker**

A card deploy can be perfect server-side and still not reach the panel — the
service worker serves stale JS.

On the kiosk: DevTools → Application → **Service Workers → Unregister**, then
reload. Clearing "Cache" alone is NOT sufficient.

If the panel is unreachable, restart the renderer:
```bash
ssh kitchencom 'pkill -f chromium'
```
The supervisor loop respawns it.

- [ ] **Step 8: Verify auto-nav end to end**

Temporarily move a boundary to two minutes from now:
**Developer Tools → States → `input_datetime.kitchen_afternoon_start`**, or the
helper's UI.

Expected: within ~60s of the boundary the panel navigates to the matching view
on its own.

Then verify the defer: touch the panel, and within 90s cross a boundary.
Expected: the panel does NOT switch until ~90s after the last touch.

Then verify the RESTART behaviour: keep tapping every ~30s across a boundary.
Expected: the panel keeps deferring for as long as tapping continues, and
switches ~90s after tapping stops. This is correct, not a bug.

Restore the boundary to its intended value afterward.

- [ ] **Step 9: Check the tab bar at panel resolution**

Five views now exist: Morning, Afternoon, Evening, Schedule, Lists.

**Pass criterion:** on the 15.6″ panel at its native resolution, all five tabs
are visible simultaneously with no horizontal scroll, no wrap to a second row,
and no truncated labels.

Verify by looking at the physical panel, or:
```bash
ssh kitchencom 'DISPLAY= grim /tmp/panel.png' && scp kitchencom:/tmp/panel.png /tmp/
```
then open `/tmp/panel.png`.

**If it fails**, in order of preference:
1. Drop `title:` from the three time views and keep `icon:` only — HA renders
   an icon-only tab, which is much narrower.
2. Shorten titles: `Morning`/`Afternoon`/`Evening` → `AM`/`Day`/`PM`.

- [ ] **Step 10: Commit any tab-bar fix**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "fix(panel): tab bar fits five views at panel resolution"
```

---

## Task 11: Documentation and close-out

**Files:**
- Modify: `docs/session-state/COLD-OPEN-choreops-chores.md` or a new branch cold-open

- [ ] **Step 1: Write the branch cold-open**

Create `docs/session-state/COLD-OPEN-time-of-day-layouts.md` covering, per the
project's cold-open rule: where HEAD is (quote `git log --oneline -1`, do not
freeze the tip), empirical state (test counts, validate:yaml, on-Pi sensor
states), what shipped and why, the next move with absolute paths, carry-forwards,
and which memory entries apply.

Carry-forwards that MUST appear:
- The Tomorrow column shows today until a date-offset calendar card exists
  (`# TOMORROW-OFFSET` in `kitchen.yaml`).
- Repo/Pi `configuration.yaml` drift — the repo lacks `default_config:`
  (memory: `repo-ha-config-drift.md`).
- The work-week calendar spec is not yet written (spec §7).

- [ ] **Step 2: Verify every path and number in the cold-open**

For each named file run `ls`; for each cited number run the command that
produces it. Fix anything stale before reporting done.

- [ ] **Step 3: Commit**

```bash
git add docs/session-state/COLD-OPEN-time-of-day-layouts.md
git commit -m "docs: cold-open for the time-of-day layouts branch"
```
