# Screensaver Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four enhancements to the merged screensaver card — query-string bugfix, shuffle-bag ordering, nested-album recursion, and a Ken-Burns intensity knob — preserving its pure-functions-+-thin-glue architecture.

**Architecture:** Three new pure functions (`stripMediaUrlQuery`, `shuffleOrder`, `selectSubdirectories`) + `resolveConfig` extension, all TDD'd; plus glue changes (recursive browse loop bounded by depth/folder constants, shuffle integration, a `--kb-intensity` CSS var) verified via the existing `demo/` harness (decision A — no DOM-test deps). Everything appends to / extends `custom_cards/screensaver-card/src/screensaver-card.ts`.

**Tech Stack:** Lit 3.3.3 + TypeScript, Vitest 4.x (node env, pure-fn tests), Node 24. Extends the merged card (8 pure fns + Lit component, 33 tests).

**Source-of-truth:** `docs/superpowers/specs/2026-06-08-screensaver-followups-design.md`

**Scope boundary:** v1 = the 4 enhancements above. NOT in scope: google_photos cloud source, in-card upload UI, per-type durations. Glue gets no automated DOM tests (decision A); pure fns get full TDD.

**Work from:** `custom_cards/screensaver-card/` on branch `feat/screensaver-followups`. `npm test` + `npm run typecheck` from that dir. Keep the existing 33 tests green throughout (append-only to pure fns; extend resolveConfig carefully).

**Tooling note:** a stray `.claude-flow/` dir may appear — gitignored, never commit it. Stage only the named files per task.

---

## Chunk 1: Pure functions (TDD)

### Task 1: `stripMediaUrlQuery` + apply to `selectDisplayMode` (query-string bugfix)

**Files:** Modify `src/screensaver-card.ts`; Test `test/strip-url.test.ts` (new)

**Note:** Resolves the documented deferral (`screensaver-card.ts:20-23`). First confirm the live-path exposure: `selectDisplayMode` uses `endsWith(ext)` which breaks on `photo.jpg?token=…`. (The live render loop uses `selectPlayableChildren`'s media_class filter, not extension-matching, so the live bug is dormant — but the deferral named `selectDisplayMode`, so we fix it + ship the reusable helper.)

- [ ] **Step 1: Write the failing test** — `test/strip-url.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { stripMediaUrlQuery } from "../src/screensaver-card";

describe("stripMediaUrlQuery", () => {
  it("returns a plain path unchanged", () => {
    expect(stripMediaUrlQuery("photo.jpg")).toBe("photo.jpg");
  });
  it("strips a query string", () => {
    expect(stripMediaUrlQuery("photo.jpg?token=abc")).toBe("photo.jpg");
  });
  it("strips a fragment", () => {
    expect(stripMediaUrlQuery("clip.mp4#t=10")).toBe("clip.mp4");
  });
  it("strips from the first of ? or # (query before fragment)", () => {
    expect(stripMediaUrlQuery("a.png?x=1#y")).toBe("a.png");
  });
  it("handles an empty string", () => {
    expect(stripMediaUrlQuery("")).toBe("");
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`npm test`, import error). PASTE.

- [ ] **Step 3: Implement** — append to `src/screensaver-card.ts`:
```typescript
// Strip ?query and #fragment from a media URL/path so extension-matching works
// on resolved media_source URLs (e.g. "photo.jpg?token=…"). Pure. (Closes the
// deferral noted on selectDisplayMode below.)
export function stripMediaUrlQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}
```
Then update `selectDisplayMode` to strip before extension-matching. Find its `.filter`/`endsWith` logic and apply `stripMediaUrlQuery(f)` to each filename before the `SUPPORTED.some(... endsWith)` check. Also update the `:20-23` deferral comment to note it's now resolved (e.g. "Resolved: stripMediaUrlQuery strips query/fragment before matching.").

- [ ] **Step 4: Run — verify PASS** (`npm test` → 33 + 5 new = 38; existing media-list tests still pass; `npm run typecheck` 0). PASTE both.

- [ ] **Step 5: Commit**
```bash
git add src/screensaver-card.ts test/strip-url.test.ts
git commit -m "fix: stripMediaUrlQuery + apply to selectDisplayMode (query-string deferral)"
```

### Task 2: `shuffleOrder` (Fisher-Yates, injectable rand)

**Files:** Modify `src/screensaver-card.ts`; Test `test/shuffle.test.ts` (new)

- [ ] **Step 1: Write the failing test** — `test/shuffle.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { shuffleOrder } from "../src/screensaver-card";

// Deterministic rand stub: returns a fixed sequence in [0,1).
const seqRand = (values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("shuffleOrder", () => {
  it("returns a new array, does not mutate input", () => {
    const input = [1, 2, 3];
    const out = shuffleOrder(input, seqRand([0, 0, 0]));
    expect(input).toEqual([1, 2, 3]);     // unchanged
    expect(out).not.toBe(input);          // new array
  });
  it("contains exactly the same elements (a permutation)", () => {
    const out = shuffleOrder([1, 2, 3, 4], seqRand([0.9, 0.1, 0.5, 0.2]));
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
  });
  it("is deterministic for a given rand", () => {
    const a = shuffleOrder([1, 2, 3, 4, 5], seqRand([0.1, 0.7, 0.3, 0.9]));
    const b = shuffleOrder([1, 2, 3, 4, 5], seqRand([0.1, 0.7, 0.3, 0.9]));
    expect(a).toEqual(b);
  });
  it("handles empty and single-element arrays", () => {
    expect(shuffleOrder([], seqRand([0]))).toEqual([]);
    expect(shuffleOrder([7], seqRand([0]))).toEqual([7]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`npm test`). PASTE.

- [ ] **Step 3: Implement** — append:
```typescript
// Fisher-Yates shuffle with injectable randomness (rand() -> [0,1)). Returns a NEW
// array; does not mutate input. Injectable rand keeps it deterministically testable
// (glue passes Math.random). Used for shuffle-bag photo ordering.
export function shuffleOrder<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run — verify PASS** (`npm test` → +4 = 42; `npm run typecheck` 0). PASTE.

- [ ] **Step 5: Commit**
```bash
git add src/screensaver-card.ts test/shuffle.test.ts
git commit -m "feat: shuffleOrder Fisher-Yates with injectable rand (TDD)"
```

### Task 3: `selectSubdirectories` (parallel to selectPlayableChildren, returns string[])

**Files:** Modify `src/screensaver-card.ts`; Test `test/subdirectories.test.ts` (new)

**Note:** PARALLEL predicate to `selectPlayableChildren` (NOT a mirror — returns bare `media_content_id` strings, since dirs carry no playable `kind`). Predicate: `can_expand === true && c.media_content_id` (the `&& media_content_id` guard mirrors the leaf fn's guard, preventing `undefined` ids).

- [ ] **Step 1: Write the failing test** — `test/subdirectories.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { selectSubdirectories } from "../src/screensaver-card";

const tree = (children: any[]) => ({ children }) as any;

describe("selectSubdirectories", () => {
  it("returns content-ids of expandable directories", () => {
    const out = selectSubdirectories(tree([
      { media_content_id: "x/sub1", can_expand: true },
      { media_content_id: "x/sub2", can_expand: true },
    ]));
    expect(out).toEqual(["x/sub1", "x/sub2"]);
  });
  it("skips leaves (can_expand false)", () => {
    const out = selectSubdirectories(tree([
      { media_content_id: "x/a.jpg", can_expand: false },
      { media_content_id: "x/sub", can_expand: true },
    ]));
    expect(out).toEqual(["x/sub"]);
  });
  it("skips a directory missing media_content_id", () => {
    const out = selectSubdirectories(tree([
      { can_expand: true },
      { media_content_id: "x/sub", can_expand: true },
    ]));
    expect(out).toEqual(["x/sub"]);
  });
  it("returns [] for empty or childless tree", () => {
    expect(selectSubdirectories(tree([]))).toEqual([]);
    expect(selectSubdirectories({} as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`npm test`). PASTE.

- [ ] **Step 3: Implement** — append (place near `selectPlayableChildren`):
```typescript
// Parallel predicate to selectPlayableChildren (NOT a mirror): returns the
// media_content_id strings of expandable subdirectories to recurse into. Dirs carry
// no playable kind, hence string[] not MediaItem[]. Pure. (HA browse_media is lazy/
// one-level — local_source.py:258-266 — so the glue browses each returned id.)
export function selectSubdirectories(browseTree?: { children?: BrowseChild[] }): string[] {
  const children = browseTree?.children ?? [];
  const dirs: string[] = [];
  for (const c of children) {
    if (c.can_expand === true && c.media_content_id) {
      dirs.push(c.media_content_id);
    }
  }
  return dirs;
}
```
(Note: `BrowseChild` type already exists in the file from `selectPlayableChildren`. Confirm it has `can_expand?` + `media_content_id?` — it does.)

- [ ] **Step 4: Run — verify PASS** (`npm test` → +4 = 46; `npm run typecheck` 0). PASTE.

- [ ] **Step 5: Commit**
```bash
git add src/screensaver-card.ts test/subdirectories.test.ts
git commit -m "feat: selectSubdirectories for nested-album recursion (TDD)"
```

### Task 4: `resolveConfig` extension — shuffle + ken_burns_intensity (TDD)

**Files:** Modify `src/screensaver-card.ts`; Test `test/resolve-config.test.ts` (extend existing)

**Note:** snake-in / camel-out. `shuffle:` → `shuffle` (default false). `ken_burns_intensity:` → `kenBurnsIntensity` with a **two-sided** clamp `Math.min(1, Math.max(0, n))` (NOT photoDuration's one-sided floor), default 0.5.

- [ ] **Step 1: Add failing tests** — append inside the existing `describe("resolveConfig", ...)` in `test/resolve-config.test.ts`:
```typescript
  it("defaults shuffle to false and kenBurnsIntensity to 0.5", () => {
    const c = resolveConfig({});
    expect(c.shuffle).toBe(false);
    expect(c.kenBurnsIntensity).toBe(0.5);
  });
  it("honors shuffle: true", () => {
    expect(resolveConfig({ shuffle: true }).shuffle).toBe(true);
  });
  it("clamps ken_burns_intensity to [0,1] (both ends) and reads snake_case", () => {
    expect(resolveConfig({ ken_burns_intensity: -0.5 }).kenBurnsIntensity).toBe(0);
    expect(resolveConfig({ ken_burns_intensity: 2 }).kenBurnsIntensity).toBe(1);
    expect(resolveConfig({ ken_burns_intensity: 0.3 }).kenBurnsIntensity).toBe(0.3);
  });
```

- [ ] **Step 2: Run — verify FAIL** (`npm test` — the 3 new fail; existing resolveConfig tests pass). PASTE.

- [ ] **Step 3: Implement** — extend `ScreensaverConfig` type (add `shuffle: boolean;` and `kenBurnsIntensity: number;`) and the `resolveConfig` return object:
```typescript
    shuffle: raw.shuffle === true,
    kenBurnsIntensity: Math.min(1, Math.max(0,
      typeof raw.ken_burns_intensity === "number" ? raw.ken_burns_intensity : 0.5)),
```
Add both to the returned object alongside the existing fields. (Keep all existing fields unchanged.)

- [ ] **Step 4: Run — verify PASS** (`npm test` → +3 = 49; existing config tests still pass; `npm run typecheck` 0). PASTE both.

- [ ] **Step 5: Commit**
```bash
git add src/screensaver-card.ts test/resolve-config.test.ts
git commit -m "feat: resolveConfig shuffle + kenBurnsIntensity (two-sided clamp, TDD)"
```

---

## Chunk 2: Glue integration + demo verification

### Task 5: Wire the four enhancements into the Lit component (glue)

**Files:** Modify `src/screensaver-card.ts` (the `ScreensaverCard` class)

**Note:** Decision A — NO automated DOM tests; gates are `npm run typecheck` 0 + the 49 pure-fn tests stay green + demo verification (Task 6). Delegate every decision to the pure fns. Add the two bounded-recursion constants as module-level tested-able constants.

- [ ] **Step 1: Add the recursion-bound constants** (module level, near the other consts):
```typescript
export const MAX_RECURSION_DEPTH = 3;     // root + 3 subfolder levels
export const MAX_BROWSE_FOLDERS = 50;     // hard cap on browse_media calls per activation
```

- [ ] **Step 2: Replace the single browse in `_startLoop` with a bounded recursive browse.**
Currently `_startLoop` does one `callWS(browse_media, …)` → `selectPlayableChildren`. Replace the collection with a helper `_collectMedia(rootContentId)` that:
- maintains a queue of `{contentId, depth}` starting at `{root, 0}` and a `foldersBrowsed` counter;
- while queue non-empty AND `foldersBrowsed < MAX_BROWSE_FOLDERS`: dequeue, `callWS(browse_media, contentId)`, `foldersBrowsed++`; accumulate `selectPlayableChildren(tree)` into items; if `depth < MAX_RECURSION_DEPTH`, enqueue each `selectSubdirectories(tree)` id at `depth+1`;
- wrap each `callWS` in try/catch → on error, skip that folder (don't abort the whole loop);
- respect the generation-token guard (re-check `gen !== this._gen` after each await, same as the existing loop's I-7/concurrency pattern) — bail if stale;
- return the accumulated `MediaItem[]`.
Then `_startLoop` uses `_collectMedia(buildBrowseContentId(this._cfg.mediaPath))` for `this._items`. Keep the existing `items.length === 0 → fallback` branch.

- [ ] **Step 3: Shuffle integration.**
After collecting items, if `this._cfg.shuffle`, set `this._items = shuffleOrder(this._items, Math.random)`. On wrap (when `nextMediaIndex` returns to 0 / the loop cycles), re-shuffle: `this._items = shuffleOrder(this._items, Math.random)`. (Polish — avoid placing the just-shown item first: implement if a one-liner, else leave a `// TODO defer: no-immediate-repeat on reshuffle` comment.)

- [ ] **Step 4: Ken-Burns intensity CSS var.**
In `render()` (or where the overlay element is created), set an inline style custom property `--kb-intensity: ${this._cfg.kenBurnsIntensity}` on the overlay. Update the `kb` keyframes to scale transform by the var, e.g. `transform: scale(calc(1 + 0.18 * var(--kb-intensity, 0.5))) translate(calc(-4% * var(--kb-intensity, 0.5)), calc(-3% * var(--kb-intensity, 0.5)))` at the `to` keyframe (so `0` = no movement, `1` = full current effect). Keep the existing animation duration.

- [ ] **Step 5: Verify typecheck + pure-fn tests unaffected.**
Run: `npm run typecheck && npm test`
Expected: typecheck 0; all 49 pure-fn tests still pass (no new tests here — glue is demo-verified). PASTE both.

- [ ] **Step 6: Commit**
```bash
git add src/screensaver-card.ts
git commit -m "feat: wire follow-ups into card glue (bounded recursion, shuffle, kb-intensity)"
```

### Task 6: Build + demo-harness verification (decision A visual gate)

**Files:** Modify `custom_cards/screensaver-card/demo/index.html` (extend the mock to exercise the new features)

- [ ] **Step 1: Build** — `npm run build` → emits `dist/screensaver-card.js`, exit 0. PASTE.

- [ ] **Step 2: Extend the demo mock** to exercise the new behavior. Update `demo/index.html`'s mock `callWS` so `browse_media` returns a tree WITH a subdirectory (a `can_expand: true` child), and a second `browse_media` for that subdir id returns more images — proving recursion. Set the card config to `{ media_path: "media", photo_duration: 3, shuffle: true, ken_burns_intensity: 1 }`. (Keep resolve_media returning the unsplash URLs.)

- [ ] **Step 3: Manual verification** (controller drives this with the browser tool, OR document for human):
Serve (`python3 -m http.server`) and open `demo/`. Verify by eye / via DOM eval:
- Recursion: items from BOTH the root and the subdirectory appear in the loop (more distinct photos than root-only).
- Shuffle: order differs from declaration order across reloads (shuffle: true).
- Ken-Burns intensity: at `ken_burns_intensity: 1` the pan/zoom is pronounced; set to `0` and confirm the image is static.
Document the result.

- [ ] **Step 4: Commit**
```bash
git add custom_cards/screensaver-card/demo/index.html
git commit -m "test: extend demo harness for recursion + shuffle + kb-intensity"
```

### Task 7: Final slice verification

- [ ] **Step 1: Full verification chain.**
Run:
```bash
cd custom_cards/screensaver-card && npm run typecheck && npm test && npm run build && \
echo "FOLLOWUPS SLICE VERIFIED"
```
Expected: typecheck 0, all tests pass (49: 33 original + 16 new — 5 strip + 4 shuffle + 4 subdir + 3 config), build emits dist, prints `FOLLOWUPS SLICE VERIFIED`. PASTE.

- [ ] **Step 2: Confirm clean tree + commit arc.**
Run: `git status --short` (empty) and `git log --oneline main..feat/screensaver-followups`.

---

## Done criteria
- 3 new pure functions (`stripMediaUrlQuery`, `shuffleOrder`, `selectSubdirectories`) + `resolveConfig` extension, all TDD'd; test count 33 → 49.
- `selectDisplayMode` strips query/fragment before extension-matching (deferral resolved).
- Glue: bounded recursive browse (`MAX_RECURSION_DEPTH=3`/`MAX_BROWSE_FOLDERS=50`, generation-token-guarded), shuffle-bag integration, `--kb-intensity` CSS var.
- `npm run typecheck` 0; `npm run build` emits dist; demo harness exercises + visually confirms recursion + shuffle + intensity.
- Config knobs: `shuffle` (default false), `ken_burns_intensity` (0–1, default 0.5) — snake-in/camel-out.
- Concurrency: the recursive browse respects the existing generation-token guard (no stale-loop regressions).
