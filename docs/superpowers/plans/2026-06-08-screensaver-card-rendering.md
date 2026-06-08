# Screensaver Card Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the KitchenCOM screensaver card from pure logic into a real Lit custom element — a full-screen idle overlay that fades in on `input_boolean.kitchen_idle`, loops local photos (Ken-Burns + crossfade) and videos, with an ambient gradient+clock fallback when no media exists.

**Architecture:** Thin Lit component over tested pure functions (testing-decision A). Every decision (idle? which view? next index? re-resolve?) is a unit-tested pure function in `src/screensaver-card.ts`; the Lit component is glue that calls them, fetches media via HA `media_source` WS (browse → lazy resolve, re-resolving expiring URLs per I-7), renders DOM, and runs CSS animations. Depends only on Lit + the `hass` object. Emits/mutates nothing.

**Tech Stack:** Lit 3.3.3 + TypeScript, Vitest 4.x (node env for pure fns), Node 24. Extends the merged card at `custom_cards/screensaver-card/` (currently `isScreensaverActive` + `selectDisplayMode`, 9 tests).

**Source-of-truth:** `docs/superpowers/specs/2026-06-08-screensaver-card-rendering-design.md`

**Scope boundary:** v1 = one flat media folder, sequential loop, 5 config knobs. NOT in scope: shuffle, nested-album recursion, per-type durations, configurable Ken-Burns intensity, cloud photos, in-card upload UI, DOM/component tests (decision A keeps rendering verified by one manual browser check, not automated DOM tests).

**Work from:** the foundation card dir `custom_cards/screensaver-card/`. Run tests with `npm test` and `npm run typecheck` from that dir. All pure-function tests must keep the existing 9 green.

---

## Chunk 1: Pure functions (TDD) + tsconfig prerequisite

### Task 0: tsconfig DOM lib prerequisite

**Files:**
- Modify: `custom_cards/screensaver-card/tsconfig.json`

**Note:** The card will use DOM types (`HTMLElement`, `<img>`/`<video>`, `customElements`, `hass.callWS`). The deferred Task-5 Minor comes due now. This is config-only — no test, just verify typecheck still passes.

- [ ] **Step 1: Add the DOM lib to tsconfig**

In `tsconfig.json` `compilerOptions`, add a `lib` line (keeps the existing `target: ES2021`):
```json
"lib": ["ES2021", "DOM", "DOM.Iterable"],
```

- [ ] **Step 2: Verify typecheck + tests still green**

Run: `cd custom_cards/screensaver-card && npm run typecheck && npm test`
Expected: typecheck exit 0; 9 tests still pass (no behavior change).

- [ ] **Step 3: Commit**

```bash
git add custom_cards/screensaver-card/tsconfig.json
git commit -m "chore: add DOM lib to screensaver-card tsconfig (rendering prerequisite)"
```

### Task 1: Extend `isScreensaverActive` with configurable idle entity (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/idle-state.test.ts`

**Note:** Backward-compatible — the existing 4 idle tests call `isScreensaverActive(hass)` with one arg and must still pass. We add an optional second param defaulting to `IDLE_ENTITY`.

- [ ] **Step 1: Add a failing test for the configurable entity**

Append inside the existing `describe("isScreensaverActive", ...)` in `test/idle-state.test.ts`:
```typescript
  it("uses a custom idle entity when provided", () => {
    const hass = { states: { "input_boolean.den_idle": { state: "on" } } } as any;
    expect(isScreensaverActive(hass, "input_boolean.den_idle")).toBe(true);
  });
  it("defaults to input_boolean.kitchen_idle when no entity given", () => {
    const hass = { states: { "input_boolean.kitchen_idle": { state: "on" } } } as any;
    expect(isScreensaverActive(hass)).toBe(true);
  });
```

- [ ] **Step 2: Run — verify the custom-entity test FAILS**

Run: `npm test`
Expected: the custom-entity test fails (the fn ignores the 2nd arg, looks up the wrong entity → false). The default test passes (existing behavior). Existing 4 idle tests still pass.

- [ ] **Step 3: Implement the optional param**

Change `isScreensaverActive` in `src/screensaver-card.ts` to:
```typescript
export function isScreensaverActive(hass?: HassLike, idleEntity: string = IDLE_ENTITY): boolean {
  return hass?.states?.[idleEntity]?.state === "on";
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test`
Expected: all idle tests pass (existing 4 + 2 new), media tests untouched. Then `npm run typecheck` exit 0.

- [ ] **Step 5: Commit**

```bash
git add custom_cards/screensaver-card
git commit -m "feat: configurable idle entity on isScreensaverActive (backward-compatible)"
```

### Task 2: `buildBrowseContentId` (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/media-source.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`test/media-source.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildBrowseContentId } from "../src/screensaver-card";

describe("buildBrowseContentId", () => {
  it("builds the local media-source id from a folder name", () => {
    expect(buildBrowseContentId("media")).toBe("media-source://media_source/local/media");
  });
  it("trims leading/trailing slashes from the path", () => {
    expect(buildBrowseContentId("/photos/")).toBe("media-source://media_source/local/photos");
  });
  it("defaults to 'media' when path is empty", () => {
    expect(buildBrowseContentId("")).toBe("media-source://media_source/local/media");
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (import error: not exported). Run `npm test`.

- [ ] **Step 3: Implement** — append to `src/screensaver-card.ts`:
```typescript
// Build the media_source content id for HA's browse_media WS from a folder path.
// Source contract: "local" is the source_dir_id; format media-source://media_source/local/<dir>.
export function buildBrowseContentId(mediaPath: string): string {
  const dir = (mediaPath || "media").replace(/^\/+|\/+$/g, "") || "media";
  return `media-source://media_source/local/${dir}`;
}
```

- [ ] **Step 4: Run — verify PASS** (`npm test` → 9 + new; `npm run typecheck` exit 0).

- [ ] **Step 5: Commit**
```bash
git add custom_cards/screensaver-card
git commit -m "feat: buildBrowseContentId for media_source browsing (TDD)"
```

### Task 3: `selectPlayableChildren` (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/playable-children.test.ts` (new)

**Note:** Filters an HA `BrowseMedia` tree (`.children[]`, each with `media_class`, `can_play`, `can_expand`, `media_content_id`) to playable leaves. Source-grounded predicate: keep `can_expand === false && can_play === true`; map `media_class` "image"/"video" → `kind`. Returns `MediaItem[]` ({contentId, kind}). v1 flat — no recursion.

- [ ] **Step 1: Write the failing test**

`test/playable-children.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { selectPlayableChildren } from "../src/screensaver-card";

const tree = (children: any[]) => ({ children }) as any;

describe("selectPlayableChildren", () => {
  it("keeps playable image and video leaves with contentId + kind", () => {
    const out = selectPlayableChildren(tree([
      { media_content_id: "x/a.jpg", media_class: "image", can_play: true, can_expand: false },
      { media_content_id: "x/b.mp4", media_class: "video", can_play: true, can_expand: false },
    ]));
    expect(out).toEqual([
      { contentId: "x/a.jpg", kind: "image" },
      { contentId: "x/b.mp4", kind: "video" },
    ]);
  });
  it("skips directories (can_expand true)", () => {
    const out = selectPlayableChildren(tree([
      { media_content_id: "x/sub", media_class: "directory", can_play: false, can_expand: true },
      { media_content_id: "x/a.jpg", media_class: "image", can_play: true, can_expand: false },
    ]));
    expect(out).toEqual([{ contentId: "x/a.jpg", kind: "image" }]);
  });
  it("skips non-image/video media classes", () => {
    const out = selectPlayableChildren(tree([
      { media_content_id: "x/song.mp3", media_class: "music", can_play: true, can_expand: false },
    ]));
    expect(out).toEqual([]);
  });
  it("returns [] for an empty or childless tree", () => {
    expect(selectPlayableChildren(tree([]))).toEqual([]);
    expect(selectPlayableChildren({} as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`npm test`).

- [ ] **Step 3: Implement** — append to `src/screensaver-card.ts`:
```typescript
// A playable media leaf the loop cycles. contentId feeds resolve_media; url/resolvedAt
// are the lazy-resolve cache, stamped by the Lit glue loop (NOT here). See spec §2.
export type MediaItem = {
  contentId: string;
  kind: "image" | "video";
  url?: string;
  resolvedAt?: number;
};

type BrowseChild = {
  media_content_id?: string;
  media_class?: string;
  can_play?: boolean;
  can_expand?: boolean;
};

// Filter an HA browse_media tree to ordered playable image/video leaves (spec M-13).
// Predicate (browse_media.py:106-120): can_expand === false && can_play === true.
export function selectPlayableChildren(browseTree?: { children?: BrowseChild[] }): MediaItem[] {
  const children = browseTree?.children ?? [];
  const items: MediaItem[] = [];
  for (const c of children) {
    if (c.can_expand === false && c.can_play === true && c.media_content_id) {
      if (c.media_class === "image" || c.media_class === "video") {
        items.push({ contentId: c.media_content_id, kind: c.media_class });
      }
    }
  }
  return items;
}
```

- [ ] **Step 4: Run — verify PASS** (`npm test`; `npm run typecheck` exit 0).

- [ ] **Step 5: Commit**
```bash
git add custom_cards/screensaver-card
git commit -m "feat: selectPlayableChildren filters browse tree to MediaItem[] (TDD)"
```

### Task 4: `nextMediaIndex` (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/next-index.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`test/next-index.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { nextMediaIndex } from "../src/screensaver-card";

describe("nextMediaIndex", () => {
  it("advances by one", () => { expect(nextMediaIndex(0, 3)).toBe(1); });
  it("wraps around at the end", () => { expect(nextMediaIndex(2, 3)).toBe(0); });
  it("returns 0 for a single item", () => { expect(nextMediaIndex(0, 1)).toBe(0); });
  it("returns 0 when count is 0 (no items, safe)", () => { expect(nextMediaIndex(0, 0)).toBe(0); });
  it("handles an out-of-range current index defensively", () => { expect(nextMediaIndex(99, 3)).toBe(0); });
});
```

- [ ] **Step 2: Run — verify FAIL** (`npm test`).

- [ ] **Step 3: Implement** — append:
```typescript
// Next loop index with wrap-around. count 0 => 0 (caller shows fallback instead).
export function nextMediaIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}
```
Note: `nextMediaIndex(99, 3)` → `100 % 3` = 1? The test expects 0 — adjust impl to guard out-of-range current:
```typescript
export function nextMediaIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  if (current < 0 || current >= count) return 0;
  return (current + 1) % count;
}
```

- [ ] **Step 4: Run — verify PASS** (`npm test`; `npm run typecheck`).

- [ ] **Step 5: Commit**
```bash
git add custom_cards/screensaver-card
git commit -m "feat: nextMediaIndex loop wrap-around (TDD)"
```

### Task 5: `resolveConfig` with defaults + clamp (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/resolve-config.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`test/resolve-config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/screensaver-card";

describe("resolveConfig", () => {
  it("applies all defaults for empty config", () => {
    expect(resolveConfig({})).toEqual({
      mediaPath: "media",
      photoDuration: 10,
      transitionDuration: 1.5,
      idleEntity: "input_boolean.kitchen_idle",
      showClock: true,
    });
  });
  it("honors provided overrides", () => {
    const c = resolveConfig({ media_path: "photos", photo_duration: 20, show_clock: false });
    expect(c.mediaPath).toBe("photos");
    expect(c.photoDuration).toBe(20);
    expect(c.showClock).toBe(false);
  });
  it("clamps photo_duration to a 2s floor", () => {
    expect(resolveConfig({ photo_duration: 0 }).photoDuration).toBe(2);
    expect(resolveConfig({ photo_duration: -5 }).photoDuration).toBe(2);
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`npm test`).

- [ ] **Step 3: Implement** — append:
```typescript
export type ScreensaverConfig = {
  mediaPath: string;
  photoDuration: number;
  transitionDuration: number;
  idleEntity: string;
  showClock: boolean;
};

const PHOTO_DURATION_FLOOR = 2;

// Apply defaults + clamp to raw card YAML config (spec §2 defaults table).
export function resolveConfig(raw: Record<string, unknown> = {}): ScreensaverConfig {
  const photo = typeof raw.photo_duration === "number" ? raw.photo_duration : 10;
  return {
    mediaPath: typeof raw.media_path === "string" && raw.media_path ? raw.media_path : "media",
    photoDuration: Math.max(PHOTO_DURATION_FLOOR, photo),
    transitionDuration:
      typeof raw.transition_duration === "number" ? raw.transition_duration : 1.5,
    idleEntity:
      typeof raw.idle_entity === "string" && raw.idle_entity ? raw.idle_entity : IDLE_ENTITY,
    showClock: raw.show_clock === undefined ? true : Boolean(raw.show_clock),
  };
}
```

- [ ] **Step 4: Run — verify PASS** (`npm test`; `npm run typecheck`).

- [ ] **Step 5: Commit**
```bash
git add custom_cards/screensaver-card
git commit -m "feat: resolveConfig defaults + photo_duration clamp (TDD)"
```

### Task 6: `shouldReResolve` expiry policy (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Test: `custom_cards/screensaver-card/test/should-reresolve.test.ts` (new)

**Note:** The I-7 fix. Resolved URLs are signed + expire (`CONTENT_AUTH_EXPIRY_TIME` = 24h). Re-resolve once `now - resolvedAt` passes `ttl - SAFETY_MARGIN`, or if never resolved. All times epoch SECONDS.

- [ ] **Step 1: Write the failing test**

`test/should-reresolve.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { shouldReResolve } from "../src/screensaver-card";

const DAY = 3600 * 24;

describe("shouldReResolve", () => {
  it("re-resolves when never resolved (undefined)", () => {
    expect(shouldReResolve(undefined, 1000)).toBe(true);
  });
  it("does not re-resolve a freshly resolved url", () => {
    expect(shouldReResolve(1000, 1000 + 60)).toBe(false); // 60s old, well within ttl
  });
  it("re-resolves once within the safety margin of expiry", () => {
    // ttl 24h, margin 300s → re-resolve after DAY-300 elapsed
    expect(shouldReResolve(0, DAY - 299)).toBe(true);
    expect(shouldReResolve(0, DAY - 301)).toBe(false);
  });
  it("honors a custom ttl", () => {
    expect(shouldReResolve(0, 100, 200)).toBe(false);   // 100s old, ttl 200, margin 300 => 100 >= -100 => true? see impl
  });
});
```
(Note: the custom-ttl case is sensitive to margin > ttl; the impl below clamps the threshold to ≥0 so a short ttl re-resolves promptly. Adjust the expected value after seeing impl behavior — the goal is: short ttl ⇒ re-resolve sooner.)

- [ ] **Step 2: Run — verify FAIL** (`npm test`).

- [ ] **Step 3: Implement** — append:
```typescript
// Resolved media URLs are signed + time-limited (resolve_media `expires`,
// default CONTENT_AUTH_EXPIRY_TIME = 24h). Re-resolve before expiry (spec I-7).
export const RESOLVE_TTL_SECONDS = 3600 * 24; // CONTENT_AUTH_EXPIRY_TIME
export const RESOLVE_SAFETY_MARGIN_SECONDS = 300;

// All times epoch seconds. True = the url is missing/stale and must be re-resolved.
export function shouldReResolve(
  resolvedAt: number | undefined,
  now: number,
  ttlSeconds: number = RESOLVE_TTL_SECONDS,
): boolean {
  if (resolvedAt === undefined) return true;
  const threshold = Math.max(0, ttlSeconds - RESOLVE_SAFETY_MARGIN_SECONDS);
  return now - resolvedAt >= threshold;
}
```

- [ ] **Step 4: Reconcile the custom-ttl test with impl, then run — verify PASS**

With the impl: `shouldReResolve(0, 100, 200)` → threshold `max(0, 200-300)=0` → `100 - 0 >= 0` → **true**. Update that test's expectation to `toBe(true)` with a comment "short ttl (< margin) ⇒ threshold 0 ⇒ always re-resolve, which is the safe behavior." Then:
Run: `npm test` → all pass; `npm run typecheck` exit 0.

- [ ] **Step 5: Commit**
```bash
git add custom_cards/screensaver-card
git commit -m "feat: shouldReResolve expiry policy for signed media URLs (TDD, I-7)"
```

---

## Chunk 2: Lit component (glue) + manual browser verification

### Task 7: The Lit `screensaver-card` component (glue)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts` (append the Lit class + `customElements.define`)
- Modify: `custom_cards/screensaver-card/package.json` (ensure `lit` is a dependency — it already is)

**Note:** This is the thin glue shell (decision A → NO automated DOM tests; verified manually in Task 8). It must compile (`npm run typecheck`) and not break the pure-function tests. Keep ALL decisions delegated to the pure functions above. Use Lit's reactive `hass` property (M-9 pattern). Implement: idle fade in/out; browse-on-activate; lazy resolve with `shouldReResolve`; photo (Ken-Burns + crossfade) / video render; error→skip (M-14/4c); fallback gradient+clock; clean teardown on inactive.

- [ ] **Step 1: Write the Lit component**

Append to `src/screensaver-card.ts`:
```typescript
import { LitElement, html, css, nothing, type PropertyValues } from "lit";

type HassWS = HassLike & { callWS?: (msg: Record<string, unknown>) => Promise<any> };

export class ScreensaverCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _active: { state: true },
    _mode: { state: true },
    _currentUrl: { state: true },
    _currentKind: { state: true },
    _now: { state: true },
  };

  hass?: HassWS;
  private _cfg: ScreensaverConfig = resolveConfig({});
  private _rawConfig: Record<string, unknown> = {};
  private _active = false;
  private _mode: "media" | "fallback" = "fallback";
  private _items: MediaItem[] = [];
  private _index = 0;
  private _currentUrl = "";
  private _currentKind: "image" | "video" = "image";
  private _now = "";
  private _timer?: ReturnType<typeof setTimeout>;
  private _clock?: ReturnType<typeof setInterval>;
  private _loopRunning = false;

  setConfig(config: Record<string, unknown>): void {
    this._rawConfig = config ?? {};
    this._cfg = resolveConfig(this._rawConfig);
  }

  // HA sets hass on every state change — our reactivity entry point (M-9).
  updated(changed: PropertyValues): void {
    if (changed.has("hass")) {
      const active = isScreensaverActive(this.hass, this._cfg.idleEntity);
      if (active !== this._active) {
        this._active = active;
        active ? this._startLoop() : this._stopLoop();
      }
    }
  }

  private async _startLoop(): Promise<void> {
    if (this._loopRunning) return;
    this._loopRunning = true;
    this._tickClock();
    this._clock = setInterval(() => this._tickClock(), 1000);
    try {
      const tree = await this.hass?.callWS?.({
        type: "media_source/browse_media",
        media_content_id: buildBrowseContentId(this._cfg.mediaPath),
      });
      this._items = selectPlayableChildren(tree);
    } catch {
      this._items = [];
    }
    this._mode = this._items.length === 0 ? "fallback" : "media";
    this._index = -1;
    if (this._mode === "media") this._advance();
  }

  private async _advance(): Promise<void> {
    if (!this._active || this._items.length === 0) return;
    this._index = nextMediaIndex(this._index < 0 ? this._items.length - 1 : this._index, this._items.length);
    const item = this._items[this._index];
    const now = Math.floor(Date.now() / 1000);
    if (shouldReResolve(item.resolvedAt, now)) {
      try {
        const res = await this.hass?.callWS?.({
          type: "media_source/resolve_media",
          media_content_id: item.contentId,
        });
        item.url = res?.url;
        item.resolvedAt = now;
      } catch {
        return this._skip(); // resolve failed → skip
      }
    }
    // M-2: if resolve succeeded but returned no url, item.resolvedAt is now stamped,
    // so this item stays permanently skipped on future passes (shouldReResolve→false,
    // url still undefined). Intentional — a broken item must not freeze the loop (spec 4c).
    if (!item.url) return this._skip();
    this._currentUrl = item.url;
    this._currentKind = item.kind;
    if (item.kind === "image") {
      this._timer = setTimeout(() => this._advance(), this._cfg.photoDuration * 1000);
    }
    // video advances on its 'ended' event (see render)
  }

  private _skip(): void {
    if (this._active) this._timer = setTimeout(() => this._advance(), 0);
  }

  private _stopLoop(): void {
    this._loopRunning = false;
    if (this._timer) clearTimeout(this._timer);
    if (this._clock) clearInterval(this._clock);
    this._timer = this._clock = undefined;
    this._currentUrl = "";
  }

  private _tickClock(): void {
    const d = new Date();
    this._now = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopLoop();
  }

  render() {
    if (!this._active) return nothing;
    return html`
      <div class="overlay">
        ${this._mode === "media" && this._currentUrl
          ? this._currentKind === "image"
            ? html`<img class="media kenburns" src=${this._currentUrl} @error=${this._skip} />`
            : html`<video class="media" src=${this._currentUrl} autoplay muted
                @ended=${this._advance} @error=${this._skip}></video>`
          : html`<div class="fallback"></div>`}
        ${this._cfg.showClock ? html`<div class="clock">${this._now}</div>` : nothing}
      </div>
    `;
  }

  static styles = css`
    .overlay { position: fixed; inset: 0; background: #000; z-index: 9999;
      animation: fadein 0.8s ease; overflow: hidden; }
    .media { width: 100%; height: 100%; object-fit: cover; }
    .kenburns { animation: kb 14s ease-in-out infinite alternate; }
    .fallback { width: 100%; height: 100%;
      background: linear-gradient(120deg,#0f1115,#1b2130,#243657,#1b2130);
      background-size: 300% 300%; animation: grad 18s ease infinite; }
    .clock { position: absolute; bottom: 28px; left: 32px; color: #e8edf6;
      font: 800 56px/1 -apple-system, system-ui, sans-serif; letter-spacing: -1px;
      text-shadow: 0 2px 12px rgba(0,0,0,.6); }
    @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
    @keyframes kb { from { transform: scale(1) translate(0,0) } to { transform: scale(1.18) translate(-4%,-3%) } }
    @keyframes grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  `;
}

if (!customElements.get("screensaver-card")) {
  customElements.define("screensaver-card", ScreensaverCard);
}
```

- [ ] **Step 2: Verify typecheck + pure-function tests unaffected**

Run: `cd custom_cards/screensaver-card && npm run typecheck && npm test`
Expected: typecheck exit 0; all pure-function tests still pass (the Lit class adds no test failures; decision A = no DOM tests). If `lit` types are missing, confirm `npm install` ran (lit is already a dep).

- [ ] **Step 3: Commit**
```bash
git add custom_cards/screensaver-card
git commit -m "feat: Lit screensaver-card component (glue over tested pure fns)"
```

### Task 8: Manual browser verification harness + build

**Files:**
- Create: `custom_cards/screensaver-card/demo/index.html`
- Modify: `custom_cards/screensaver-card/package.json` (add a `build` check if needed — `tsc` already present)

**Note:** Decision A's one manual check — prove the card visibly renders on the Mac with a mocked `hass` (no Pi, no live HA). This is a dev harness, not shipped to the Pi.

- [ ] **Step 1: Build the card to JS**

Run: `cd custom_cards/screensaver-card && npm run build`
Expected: `dist/screensaver-card.js` emitted, exit 0. (If `build` is `tsc`, it compiles `src` → `dist`.)

- [ ] **Step 2: Create a manual demo harness**

`custom_cards/screensaver-card/demo/index.html`:
```html
<!doctype html>
<meta charset="utf-8" />
<title>screensaver-card demo</title>
<style>body{margin:0;background:#222}</style>
<!-- C-1: the built dist/screensaver-card.js has a bare `import ... from "lit"`.
     tsc does NOT bundle bare specifiers, so a browser can't resolve "lit" without
     this import map. (Production on the Pi resolves lit via HA's module system;
     this map is demo-only.) -->
<script type="importmap">
{ "imports": { "lit": "https://cdn.jsdelivr.net/npm/lit@3.3.3/+esm" } }
</script>
<script type="module">
  import { ScreensaverCard } from "../dist/screensaver-card.js";
  const card = document.createElement("screensaver-card");
  card.setConfig({ media_path: "media", photo_duration: 4, show_clock: true });
  // Mock hass: idle ON, and a callWS that returns 2 fake images.
  const fakeTree = { children: [
    { media_content_id: "a", media_class: "image", can_play: true, can_expand: false },
    { media_content_id: "b", media_class: "image", can_play: true, can_expand: false },
  ]};
  const urls = {
    a: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200",
    b: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200",
  };
  card.hass = {
    states: { "input_boolean.kitchen_idle": { state: "on" } },
    callWS: async (m) =>
      m.type === "media_source/browse_media" ? fakeTree
      : m.type === "media_source/resolve_media" ? { url: urls[m.media_content_id], mime_type: "image/jpeg" }
      : null,
  };
  document.body.appendChild(card);
  // Toggle idle off/on after 12s to eyeball fade-out/in + a fallback test.
  window.toggleIdle = (on) => { card.hass = { ...card.hass, states: { "input_boolean.kitchen_idle": { state: on ? "on" : "off" } } }; };
</script>
<p style="color:#888;font:14px sans-serif">Open devtools. Expect: full-screen overlay, two photos cross-cycling every ~4s with Ken-Burns. Run <code>toggleIdle(false)</code> in console → overlay disappears; <code>toggleIdle(true)</code> → returns.</p>
```

- [ ] **Step 3: Manually verify in a browser**

Run: `cd custom_cards/screensaver-card && python3 -m http.server 8000` then open `http://localhost:8000/demo/`.
Verify by eye:
- Full-screen dark overlay fades in.
- Two photos cycle (~4s each) with a slow Ken-Burns pan/zoom.
- In console, `toggleIdle(false)` → overlay disappears; `toggleIdle(true)` → returns.
- (Optional) point `media_path` at an empty-children tree → fallback gradient + clock shows.
Document the result in the commit message / report. (This is a human-eyeball gate per decision A; if running headless, note that the harness exists and was syntax/build-verified, and defer the visual check.)

- [ ] **Step 4: Commit**
```bash
git add custom_cards/screensaver-card/demo
git commit -m "test: manual browser demo harness for screensaver-card (decision A visual check)"
```

### Task 9: Wire the card into the dashboard snapshot + final verification

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

**Note:** The foundation dashboard referenced the screensaver only in a comment. Now that the card exists, instantiate it (still gated by the idle automation at runtime — the card renders `nothing` when not active, so it's safe to always include).

- [ ] **Step 1: Add the card to the dashboard**

In `homeassistant/dashboards/kitchen.yaml`, replace the trailing screensaver COMMENT block with an actual card entry. The view is a `sections` layout where each section is a `grid` with a `cards:` list — **append this entry to the FIRST grid section's `cards:` list** (it self-hides when inactive, so placement is cosmetic):
```yaml
          - type: custom:screensaver-card
            media_path: media
            photo_duration: 10
            # idle_entity defaults to input_boolean.kitchen_idle
```
Keep the existing standard cards. Update the trailing comment to note the JS resource registration is still a hardware-phase INSTALL.md step.

- [ ] **Step 2: Validate the dashboard YAML**

Run (from repo root): `python3 -m yamllint -c .yamllint homeassistant/dashboards/kitchen.yaml ; echo "exit: $?"`
Expected: exit 0.

- [ ] **Step 3: Full slice verification**

Run:
```bash
cd custom_cards/screensaver-card && npm run typecheck && npm test && npm run build && cd ../.. && \
python3 -m yamllint -c .yamllint homeassistant/ && echo "RENDER SLICE VERIFIED"
```
Expected: typecheck 0, all pure-function tests pass, build emits dist, yaml validates, prints `RENDER SLICE VERIFIED`.

- [ ] **Step 4: Commit**
```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat: instantiate custom:screensaver-card in kitchen dashboard"
```

---

## Done criteria
- All pure functions (8 total: 2 existing + 6 added/extended) unit-tested; the existing 9 tests stay green and new tests pass.
- `npm run typecheck` exit 0 (DOM lib added; component + tests type-check).
- `npm run build` emits `dist/screensaver-card.js`.
- The Lit component compiles and delegates every decision to a tested pure function (decision A: glue is thin, verified by one manual browser check).
- Manual browser demo shows: idle-fade overlay, Ken-Burns photo loop, fallback gradient+clock, clean fade-out on inactive.
- Dashboard instantiates `custom:screensaver-card`; yaml validates.
- Hardware-phase carry-forwards (resource registration, real codec validation) remain documented in INSTALL.md — not silently dropped.
