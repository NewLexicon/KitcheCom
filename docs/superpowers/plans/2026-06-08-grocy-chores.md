# Grocy Chores Slice — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom `grocy-chores-card` (Lit/TS) that renders chores from the Grocy HACS integration's `sensor.grocy_chores` attribute array and marks them done via `grocy.execute_chore`, plus the deploy/install wiring to run Grocy as a headless backend.

**Architecture:** Grocy runs as a headless Docker service; its HACS integration surfaces chores as ONE `sensor.grocy_chores` whose `attributes.chores[]` is an array of chore objects. A custom Lit card (mirroring the proven `screensaver-card` pattern) reads that array, renders rows with the `kitchencom` theme, and fires `grocy.execute_chore` (chore_id + a configured `done_by` user id) on a per-row ✓ Done button. Native Grocy UI is never shown on the kitchen screen.

**Tech Stack:** Lit 3.3.3, TypeScript 5.6, Vitest 4 (node env), Docker (`lscr.io/linuxserver/grocy`, arm64), Home Assistant Container + HACS.

**Spec:** `docs/superpowers/specs/2026-06-08-grocy-chores-slice-design.md` (read it first — especially §3 source-verification, §4 data contract, §5 three verification tiers, §7 boundary amendment).

**Prerequisite reality (from spec §5):** Tier-1 (pure-function TDD) needs nothing but the repo. Tier-2 (live round-trip) needs a dev-HA with HACS + grocy integration wired against the live local Grocy container (already running: `docker` name `grocy`, host 9283). Tier-3 (on-kitchen-screen) is Pi-blocked — out of scope here.

---

## Chunk 1: Card scaffold + Tier-1 pure-function core (TDD)

This chunk produces a fully unit-tested pure-function core with ZERO HA/Grocy dependency, operating on captured fixtures. It is achievable now, in CI. Mirrors `custom_cards/screensaver-card/` exactly.

### Task 1: Scaffold the card package

**Files:**
- Create: `custom_cards/grocy-chores-card/package.json`
- Create: `custom_cards/grocy-chores-card/tsconfig.json`
- Create: `custom_cards/grocy-chores-card/tsconfig.test.json`
- Create: `custom_cards/grocy-chores-card/vitest.config.ts`

- [ ] **Step 1: Copy the proven scaffold from screensaver-card**

Mirror `custom_cards/screensaver-card/{package.json,tsconfig.json,tsconfig.test.json,vitest.config.ts}`, changing only the package `name` to `grocy-chores-card`. The screensaver `package.json` is the source of truth:

```json
{
  "name": "grocy-chores-card",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc",
    "typecheck": "tsc --noEmit -p tsconfig.test.json"
  },
  "dependencies": { "lit": "3.3.3" },
  "devDependencies": { "vitest": "^4.1.8", "typescript": "^5.6.0" }
}
```

`vitest.config.ts` (node env, identical to screensaver):
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

`tsconfig.test.json` (identical to screensaver):
```json
{ "extends": "./tsconfig.json", "include": ["src", "test"] }
```
For `tsconfig.json`, copy `custom_cards/screensaver-card/tsconfig.json` verbatim.

- [ ] **Step 2: Install deps**

Run: `cd custom_cards/grocy-chores-card && npm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-chores-card/package.json custom_cards/grocy-chores-card/tsconfig.json custom_cards/grocy-chores-card/tsconfig.test.json custom_cards/grocy-chores-card/vitest.config.ts custom_cards/grocy-chores-card/package-lock.json
git commit -m "chore: scaffold grocy-chores-card package (mirrors screensaver-card)"
```

---

### Task 2: OQ-1 — capture the real chore fixture (live-read, blocks the view-model shape)

**This task resolves OQ-1 from the spec.** The exact `sensor.grocy_chores` attribute field names are NOT yet known. They must be read from the live entity before the view-model is designed, or the parsing code is a guess.

**Files:**
- Create: `custom_cards/grocy-chores-card/test/fixtures/chores-sensor.json`

- [ ] **Step 1: Read the live entity shape**

The local Grocy container is running (host 9283). Two paths to the real attribute shape:
- **Preferred (ground truth):** in a dev-HA with the grocy integration wired (see Chunk 3 Task 9 for setup; this task may be deferred until that exists), open Developer Tools → States → `sensor.grocy_chores`, copy the full attributes JSON.
- **Fallback (if dev-HA not yet stood up):** read the integration's `as_dict()` serialization directly from the Grocy REST API: `curl -H "GROCY-API-KEY: <key>" http://localhost:9283/api/chores` and map fields to what the integration's `sensor.py`/`const.py` expose (the integration wraps `pygrocy` `Chore.as_dict()`).

Capture a representative `chores[]` array (≥2 chores: one due-today, one overdue) into the fixture file. Record the EXACT field names observed (e.g. `chore_id` vs `id`, `next_estimated_execution_time` vs `next_execution`, overdue flag presence) as a comment block at the top of the fixture or in the commit message — downstream tasks depend on these names.

- [ ] **Step 2: Commit the fixture**

```bash
git add custom_cards/grocy-chores-card/test/fixtures/chores-sensor.json
git commit -m "test: capture real sensor.grocy_chores fixture (resolves OQ-1)"
```

> **Blocking note for the implementer:** Tasks 3–4 reference fields by name. Use the ACTUAL names from this fixture, not the illustrative names in the plan. If a field the plan assumes (e.g. an overdue flag) does not exist, derive it (e.g. compare `next_estimated_execution_time` to now) and note the deviation.

---

### Task 3: Pure function — parse chores[] → row view-models (TDD)

**Files:**
- Create: `custom_cards/grocy-chores-card/src/grocy-chores-card.ts` (pure functions first; Lit class added in Chunk 2)
- Create: `custom_cards/grocy-chores-card/test/parse-chores.test.ts`

- [ ] **Step 1: Write the failing test**

Using the REAL field names from the Task 2 fixture. Illustrative (adjust names to fixture):
```ts
import { describe, it, expect } from "vitest";
import { parseChores } from "../src/grocy-chores-card";
import fixture from "./fixtures/chores-sensor.json";

describe("parseChores", () => {
  it("maps each chore to a row view-model with id, name, dueLabel", () => {
    const rows = parseChores(fixture.attributes.chores);
    expect(rows.length).toBe(fixture.attributes.chores.length);
    expect(rows[0]).toHaveProperty("id");
    expect(rows[0]).toHaveProperty("name");
    expect(rows[0]).toHaveProperty("dueLabel");
  });
  it("returns [] for undefined/empty input (fail-safe, never throws)", () => {
    expect(parseChores(undefined)).toEqual([]);
    expect(parseChores([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd custom_cards/grocy-chores-card && npx vitest run test/parse-chores.test.ts`
Expected: FAIL — `parseChores` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/grocy-chores-card.ts`, export a `ChoreRow` type and `parseChores(chores)` that maps the array to `{ id, name, dueLabel }` (field names per fixture), and returns `[]` for nullish/empty input. Follow the screensaver-card's fail-safe style (any missing data → safe empty, never throw).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/parse-chores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-chores-card/src/grocy-chores-card.ts custom_cards/grocy-chores-card/test/parse-chores.test.ts
git commit -m "feat: parseChores pure function (chores[] -> row view-models)"
```

---

### Task 4: Pure functions — overdue computation + sort order (TDD)

**Files:**
- Modify: `custom_cards/grocy-chores-card/src/grocy-chores-card.ts`
- Create: `custom_cards/grocy-chores-card/test/overdue-and-sort.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isOverdue, sortChoreRows } from "../src/grocy-chores-card";

const NOW = new Date("2026-06-08T12:00:00Z").getTime();

describe("isOverdue", () => {
  it("true when due time is before now", () => {
    expect(isOverdue("2026-06-07T00:00:00Z", NOW)).toBe(true);
  });
  it("false when due time is in the future", () => {
    expect(isOverdue("2026-06-09T00:00:00Z", NOW)).toBe(false);
  });
  it("false (fail-safe) for missing/unparseable due", () => {
    expect(isOverdue(undefined, NOW)).toBe(false);
    expect(isOverdue("not-a-date", NOW)).toBe(false);
  });
});

describe("sortChoreRows", () => {
  it("orders overdue first, then by soonest due", () => {
    const rows = [
      { id: 1, name: "B", due: "2026-06-10T00:00:00Z" },
      { id: 2, name: "A", due: "2026-06-07T00:00:00Z" },
      { id: 3, name: "C", due: "2026-06-09T00:00:00Z" },
    ];
    const sorted = sortChoreRows(rows as any, NOW);
    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/overdue-and-sort.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

Add `isOverdue(dueIso, now)` (parse-guarded; `Number.isNaN` → false) and `sortChoreRows(rows, now)` (overdue-first, then ascending due). Pass `now` as a parameter — do NOT call `Date.now()` inside the pure functions, so tests are deterministic (matches screensaver's testability discipline).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/overdue-and-sort.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add custom_cards/grocy-chores-card/src/grocy-chores-card.ts custom_cards/grocy-chores-card/test/overdue-and-sort.test.ts
git commit -m "feat: isOverdue + sortChoreRows pure functions (overdue-first ordering)"
```

---

### Task 5: Pure function — execute_chore call payload builder + done_by guard (TDD)

This encodes the spec's `done_by` v1 decision: absent/invalid `done_by` → no mutation path.

**Files:**
- Modify: `custom_cards/grocy-chores-card/src/grocy-chores-card.ts`
- Create: `custom_cards/grocy-chores-card/test/execute-payload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildExecutePayload, canMarkDone } from "../src/grocy-chores-card";

describe("canMarkDone", () => {
  it("false when done_by is absent/empty (read-only mode)", () => {
    expect(canMarkDone(undefined)).toBe(false);
    expect(canMarkDone("")).toBe(false);
  });
  it("true when a done_by id is configured", () => {
    expect(canMarkDone("1")).toBe(true);
  });
});

describe("buildExecutePayload", () => {
  it("builds the grocy.execute_chore service data", () => {
    expect(buildExecutePayload(42, "1")).toEqual({
      chore_id: 42,
      done_by: "1",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/execute-payload.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`canMarkDone(doneBy)` → boolean (truthy non-empty string). `buildExecutePayload(choreId, doneBy)` → `{ chore_id, done_by }` matching the verified service signature (spec §3). (Optional `track_execution_now`/`skipped` omitted — YAGNI; add only if a later requirement needs them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/execute-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/grocy-chores-card/src/grocy-chores-card.ts custom_cards/grocy-chores-card/test/execute-payload.test.ts
git commit -m "feat: execute_chore payload builder + done_by guard (v1 read-only fallback)"
```

---

## Chunk 2: Lit card glue + mark-done wiring

Thin Lit glue over the tested pure functions. Per screensaver precedent, the glue itself is verified by manual/browser check (Tier-2), not DOM unit tests — the testable logic already lives in the pure functions.

### Task 6: The Lit card class (render rows)

**Files:**
- Modify: `custom_cards/grocy-chores-card/src/grocy-chores-card.ts`

- [ ] **Step 1: Add the LitElement class**

Below the pure functions, add a `GrocyChoresCard extends LitElement` that:
- accepts `setConfig(config)` reading `entity` (default `sensor.grocy_chores`) and `done_by` (optional). **Config-key note:** this 2-field config is simple enough to read snake_case keys directly in `setConfig` — a `resolveConfig` pure function (like screensaver's 5-field `resolveConfig` at `screensaver-card.ts:88-99`) is OPTIONAL here, not required. Don't add one unless config grows.
- on `hass` setter, reads `hass.states[entity].attributes.chores`, runs `parseChores` → `sortChoreRows(rows, Date.now())`.
- renders rows via `html`; applies an `overdue` CSS class when `isOverdue(...)`; styles with CSS custom properties so the `kitchencom` theme drives colors (mirror screensaver's `css` block + theme-var usage).
- registers via the **guarded define footer — mirror `screensaver-card.ts:269-271` verbatim** (the only registration footer that card has):
  ```ts
  if (!customElements.get("grocy-chores-card")) {
    customElements.define("grocy-chores-card", GrocyChoresCard);
  }
  ```
- **separately AUTHOR a `window.customCards` entry** (NOT a copy — screensaver-card has none; this is new work, good practice for the HA card picker):
  ```ts
  (window as any).customCards = (window as any).customCards || [];
  (window as any).customCards.push({ type: "grocy-chores-card", name: "Grocy Chores", description: "Chores from Grocy" });
  ```

`Date.now()` is called HERE in the glue (not in pure functions) — acceptable, matches screensaver.

- [ ] **Step 2: Build to verify it compiles**

Run: `cd custom_cards/grocy-chores-card && npm run build`
Expected: emits `dist/grocy-chores-card.js`, no errors.

- [ ] **Step 3: Typecheck + full test suite (regression guard)**

Run: `npm run typecheck && npx vitest run`
Expected: 0 type errors; all pure-function tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add custom_cards/grocy-chores-card/src/grocy-chores-card.ts
git commit -m "feat: GrocyChoresCard Lit element renders chore rows (overdue-styled)"
```

---

### Task 7: Mark-done button wiring

**Files:**
- Modify: `custom_cards/grocy-chores-card/src/grocy-chores-card.ts`

- [ ] **Step 1: Add the ✓ Done button + handler**

In render, when `canMarkDone(this._config.done_by)` is true, render a per-row ✓ button whose click calls:
```ts
this.hass.callService("grocy", "execute_chore", buildExecutePayload(row.id, this._config.done_by));
```
When `canMarkDone` is false, render rows read-only (no button) — the spec's v1 fallback. Optionally show a one-time hint that `done_by` is unconfigured.

- [ ] **Step 2: Build + typecheck + tests**

Run: `npm run build && npm run typecheck && npx vitest run`
Expected: emits dist, 0 type errors, all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-chores-card/src/grocy-chores-card.ts
git commit -m "feat: mark-done button wires execute_chore (gated on configured done_by)"
```

---

### Task 8: Demo harness (offline visual check)

**Files:**
- Create: `custom_cards/grocy-chores-card/demo/index.html`

- [ ] **Step 1: Build a static demo page**

Mirror `custom_cards/screensaver-card/demo/index.html`: load the built `dist/grocy-chores-card.js`, stub a `hass` object whose `states["sensor.grocy_chores"].attributes.chores` = the Task 2 fixture array, instantiate the card. Lets the card be eyeballed in a plain browser with NO HA — offline visual confirmation of rows + overdue styling before the dev-HA round-trip.

> **Load-bearing — keep the import map verbatim.** The screensaver demo's `<script type="importmap">` block (`demo/index.html:9-11`) remaps the bare `lit` specifier to a jsdelivr `+esm` URL. `tsc` does NOT bundle bare specifiers, so the built JS has a bare `import ... from "lit"` the browser cannot resolve without this map. Copy that import-map block exactly (it'll be identical — same `lit` dep) or the demo renders a blank page with an uncaught module-resolution error.

- [ ] **Step 2: Verify in browser**

Open `custom_cards/grocy-chores-card/demo/index.html` in a browser. Confirm rows render, overdue chores styled distinctly. (If `done_by` stubbed, the ✓ button shows but won't round-trip — that's Tier-2.)

- [ ] **Step 3: Commit**

```bash
git add custom_cards/grocy-chores-card/demo/index.html
git commit -m "test: offline demo harness for grocy-chores-card visual check"
```

---

## Chunk 3: Deploy wiring + Tier-2 live round-trip

### Task 9: Grocy backend — compose fragment + INSTALL.md phase

**Files:**
- Create: `deploy/grocy/docker-compose.grocy.yml`
- Modify: `deploy/INSTALL.md` (new phase between Phase A and Phase B, or as "Phase B.0 — Grocy backend")

- [ ] **Step 1: Write the compose fragment**

`deploy/grocy/docker-compose.grocy.yml`:
```yaml
services:
  grocy:
    image: lscr.io/linuxserver/grocy:latest   # arm64 multi-arch — auto-selects aarch64 on Pi 5
    container_name: grocy
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./grocy-config:/config
    ports:
      - "9283:80"
    restart: unless-stopped
```

- [ ] **Step 2: Add the INSTALL.md Grocy-backend phase**

Insert a phase documenting: run the compose; browse `http://<pi-host>:9283` (default login admin/admin — change it); Grocy → Manage API keys → create one. Then the HACS wiring:
1. Install HACS (if not present).
2. HACS → custom repo `https://github.com/custom-components/grocy` (type: Integration) → download → restart HA.
3. Settings → Devices & Services → Add → Grocy. **Config-flow note (OQ-3 / spec §4.2):** URL = `http://<pi-host>` (NO port, NO path); **Port = `9283`** (the published host port — do NOT leave it at the 9192 default); paste the API key.
4. The integration's entities are **disabled by default** — enable `sensor.grocy_chores`.
5. Card resource: copy `custom_cards/grocy-chores-card/dist/grocy-chores-card.js` to `/config/www/`; register `/local/grocy-chores-card.js` (module) per the Phase C pattern.

- [ ] **Step 3: Commit**

```bash
git add deploy/grocy/docker-compose.grocy.yml deploy/INSTALL.md
git commit -m "docs: deploy Grocy backend (compose + INSTALL phase, HACS wiring, port note)"
```

---

### Task 10: Tier-2 live round-trip verification (dev-HA)

**This is the tier that proves the slice works (spec §5 Tier 2). Not Pi-blocked — runs on the Mac against the live Grocy container.**

**Files:** none (verification task; produces a checked result, not code).

- [ ] **Step 1: Stand up a dev-HA with HACS + grocy integration**

Run a throwaway HA Container locally, install HACS, add the grocy integration, point its config-flow at the local Grocy (`http://host.docker.internal` or the Mac's LAN IP, Port 9283, API key). Enable `sensor.grocy_chores`. *(This is the one-time setup the spec §5 Tier-2 prerequisite calls out — budget it.)*

- [ ] **Step 2: Confirm OQ-1 against the live entity**

Developer Tools → States → `sensor.grocy_chores`. Confirm the Task 2 fixture matches the live attribute shape. If it drifted, update the fixture + re-run the pure-function suite.

- [ ] **Step 3: Render the card against real data**

Register the built card resource in dev-HA; add it to a dashboard pointed at `sensor.grocy_chores` with a valid `done_by`. Confirm rows render with real chores, overdue styling correct.

- [ ] **Step 4: The round-trip — mark done**

Press ✓ Done on a chore. Then open **Grocy's own UI** (`localhost:9283` → Chores) and confirm the execution **tracked** (last-tracked timestamp updated, next-due advanced). This is the proof the mutation path round-trips.

- [ ] **Step 5: Record the result**

Append a short verification note to the slice's session-state/handoff: which HA + Grocy versions, that the round-trip succeeded (or the exact failure). Do NOT claim the slice "works" until this step passes (verification-before-completion discipline).

---

## Chunk 4: Boundary amendment + placeholder reconciliation

### Task 11: Record the zero-custom-Python boundary amendment in the parent spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` (§6b table + boundary paragraph, lines ~109–112)

- [ ] **Step 1: Amend parent spec §6b**

Update the "Chore rotation/reminders" row (parent spec `:109`) from "helpers + automations (`packages/`) | No — config first" to reference the Grocy adoption, and add a note under the Boundary paragraph (`:112`): the zero-custom-Python boundary is crossed for the household-ops domain via the **runtime HACS-installed grocy integration** (chores + later stock/recipes/shopping/meals). **Repo `custom_components/` stays empty** — HACS installs into HA's config dir on the Pi, nothing is vendored. (The `custom_components/ # EMPTY-RESERVED` marker is in the parent spec's directory tree at `:38`, not in the §6b table you're editing — leave that marker accurate; the dir stays empty on disk.) Cross-reference this slice spec (`2026-06-08-grocy-chores-slice-design.md`).

- [ ] **Step 2: Reconcile the `todo.chores` placeholder**

INSTALL.md line 42 lists `todo.chores` as a placeholder to replace with a real entity id. Chores now come from Grocy, not a `todo` list — update that carry-forward: `todo.chores` is superseded by `sensor.grocy_chores` for the chores domain (leave `todo.groceries` for now; groceries is a later Grocy slice but not built yet).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md deploy/INSTALL.md
git commit -m "docs: record zero-custom-Python boundary amendment (Grocy adoption) in parent spec"
```

---

## Done criteria

- Chunk 1: all pure-function tests green in CI (Tier-1), fixture captures real chore shape (OQ-1).
- Chunk 2: card builds, renders rows + overdue styling, mark-done gated on `done_by`; offline demo confirms visuals.
- Chunk 3: compose + INSTALL phase authored; **Tier-2 live round-trip verified** (mark done → tracked in Grocy) — the proof the slice works.
- Chunk 4: parent §6b boundary amendment recorded; `todo.chores` placeholder reconciled.
- Tier-3 (on-kitchen-screen) explicitly deferred to Pi (slice D) — NOT a done-criterion here.
