# Sleep Mode, Settings Drawer, Photos Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PIN-gated settings drawer, a photos overlay (see + hide), and an overnight Sleep Mode to the kitchen panel.

**Architecture:** One new bundled Lovelace card, `panel-tools-card`, draws corner icons, the drawer, the photos overlay and (Phase B) the wake layer. Photo moves run inside the HA container through `shell_command` and a small Python script. Sleep is decided in HA (template sensors) and enforced on the Pi by a user service that drives `wlopm`.

**Tech Stack:** TypeScript + Lit 3 + Vite (bundled, like the sibling cards), Vitest, HA YAML packages, Python 3 stdlib + pytest, `python3-websockets` on the Pi, systemd user units.

**Spec:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md`

---

## Phasing — read this first

**Phase A (Tasks 1–12) ships whatever the touch test says:** photos overlay + settings drawer (view times, theme, screensaver delay).

**Task 13 is a hard gate:** the spec §7 panel touch test. Phase B does not start until it passes.

**Phase B (Tasks 14–20): Sleep Mode.** The HA sleep package, the wake layer, the Pi service. If Task 13's step 6 fails, Phase B is cancelled and nothing built in Phase A is wasted.

**Network:** Tasks 1–11 and 14–18 are laptop-only. Tasks 12, 13, 19 and 20 need the **home network with the GSU VPN disconnected** (`nc -z -G 6 192.168.1.234 22`) and Garrett at the panel.

## Corrections to the spec, made while planning (verified in source)

1. **Media ids are NOT percent-encoded, so the filename gets zero decodes, not one.** HA builds local ids from the raw path: `reference/core-dev/homeassistant/components/media_source/local_source.py:250` — `identifier=f"{source_dir_id}/{path.relative_to(...)}"`. The card takes the text after `…/local/photos/` verbatim. Calling `decodeURIComponent` would break a file named `50%off.jpg`. Spec §5's "decode exactly once" is superseded by this.
2. **No `configuration.yaml` change is needed.** `homeassistant/configuration.yaml:7` loads `packages: !include_dir_named packages`, so `shell_command:` can live in a package. An HA restart is still required.
3. **Taps in the drawer/overlay already count as activity.** `screensaver-card` listens on `window` in the capture phase (`screensaver-card.ts:425-428`) and is on all three time views (`kitchen.yaml` lines 50, 454, 2310). No extra wiring needed.
4. **⚠ Needs Garrett's OK — the woken override also clears when the screensaver re-engages.** The spec says woken clears "at the next sleep start". Taken literally, a kid tapping at 2 am keeps the screen on for the rest of the night. Task 14 also clears it when `input_boolean.kitchen_idle` turns on, so the panel goes back to sleep once the screensaver delay passes after the last touch. If Garrett prefers the spec's literal behavior, delete the third trigger in Task 14.
5. **⚠ Flag, not fixed here — the theme switch resets on every HA restart.** `homeassistant/packages/theme.yaml` sets `initial: Dark`, so a Light choice made in the drawer reverts to Dark on restart. Ask Garrett whether to remove `initial:`. That's a one-line change, kept out of this plan because it changes existing behavior.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `custom_cards/screensaver-card/src/media-browse.ts` | create | Shared media-folder walk: supported extensions, browse id, leaf/dir selection, bounded BFS. The one place "what is in rotation" is defined. |
| `custom_cards/screensaver-card/src/screensaver-card.ts` | modify | Re-export from `media-browse.ts`; `_collectMedia` delegates to `collectPlayable`. |
| `custom_cards/screensaver-card/test/collect-playable.test.ts` | create | Tests for the extracted BFS. |
| `custom_cards/panel-tools-card/` (package.json, tsconfig*.json, vite.config.ts, vitest.config.ts) | create | Package scaffold, copied from tod-autonav-card. |
| `custom_cards/panel-tools-card/src/logic.ts` | create | Pure logic: entity ids, filename/hex, PIN, paging, skipped files, minute steps, time format, shell response parsing, wake-layer decision. No Lit import. |
| `custom_cards/panel-tools-card/src/panel-tools-card.ts` | create | Lit glue: corner icons, PIN pad, drawer, photos overlay, (B) wake layer. |
| `custom_cards/panel-tools-card/test/logic.test.ts` | create | Unit tests for `logic.ts`. |
| `custom_cards/panel-tools-card/test/dist-browser-loadable.test.ts` | create | Bundle guard (bare imports = unloadable card). |
| `homeassistant/kitchencom/photo_move.py` | create | Runs in the HA container: `list` / `hide <hex>` / `unhide <hex>`. |
| `homeassistant/kitchencom/test_photo_move.py` | create | pytest for the script. |
| `homeassistant/packages/photos.yaml` | create | `shell_command` entries. |
| `homeassistant/packages/screensaver.yaml` | modify | `input_number.kitchen_screensaver_minutes`; every `timer.start` of `kitchen_inactivity` passes a duration from it. |
| `homeassistant/packages/sleep.yaml` | create (B) | Sleep helpers, window sensor, should-sleep sensor, woken-clear automation. |
| `homeassistant/dashboards/kitchen.yaml` | modify | Add `custom:panel-tools-card` to the three time views. |
| `deploy/homeassistant/dev-setup.sh` | modify | Copy `homeassistant/kitchencom/` + create media folders in the dev rig. |
| `deploy/sleep/kitchen_sleepd.py` | create (B) | Pi service: HA websocket → `wlopm`, fails on. |
| `deploy/sleep/test_kitchen_sleepd.py` | create (B) | pytest for the decision logic and message parsing. |
| `deploy/sleep/kitchen-sleepd.service` | create (B) | systemd user unit. |
| `deploy/sleep/README.md` | create (B) | Install, token, how to spot "start limit hit", recovery. |
| `deploy/INSTALL.md` | modify | Card resource + photo script deploy steps. |

---

# PHASE A — ships regardless of the touch test

### Task 1: Extract the shared media-browse module from screensaver-card

Pure refactor. Screensaver behavior must not change; its 109 tests must stay green.

**Files:**
- Create: `custom_cards/screensaver-card/src/media-browse.ts`
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts` (lines 17–95 and 369–373 move out; `_collectMedia` at 472–497)
- Test: `custom_cards/screensaver-card/test/collect-playable.test.ts`

- [ ] **Step 1: Record the baseline**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card && npx vitest run 2>&1 | tail -4`
Expected: `Tests  109 passed (109)`

- [ ] **Step 2: Write the failing test for `collectPlayable`**

Create `custom_cards/screensaver-card/test/collect-playable.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectPlayable, type BrowseTree } from "../src/media-browse";

const ROOT = "media-source://media_source/local/photos";
const leaf = (name: string, cls = "image") => ({
  media_content_id: `${ROOT}/${name}`, media_class: cls, can_play: true, can_expand: false,
});
const dir = (name: string) => ({
  media_content_id: `${ROOT}/${name}`, media_class: "directory", can_play: false, can_expand: true,
});

function fakeBrowse(trees: Record<string, BrowseTree | Error>) {
  const calls: string[] = [];
  const browse = async (id: string) => {
    calls.push(id);
    const t = trees[id];
    if (t instanceof Error) throw t;
    return t;
  };
  return { browse, calls };
}

describe("collectPlayable", () => {
  it("collects leaves from the root and its subfolders, root first", async () => {
    const { browse } = fakeBrowse({
      [ROOT]: { children: [dir("trip"), leaf("a.jpg")] },
      [`${ROOT}/trip`]: { children: [leaf("trip/b.mp4", "video")] },
    });
    const items = await collectPlayable(browse, ROOT);
    expect(items.map((i) => i.contentId)).toEqual([`${ROOT}/a.jpg`, `${ROOT}/trip/b.mp4`]);
    expect(items[1].kind).toBe("video");
  });

  it("skips a folder whose browse fails and keeps walking", async () => {
    const { browse } = fakeBrowse({
      [ROOT]: { children: [dir("bad"), leaf("a.jpg")] },
      [`${ROOT}/bad`]: new Error("boom"),
    });
    const items = await collectPlayable(browse, ROOT);
    expect(items.map((i) => i.contentId)).toEqual([`${ROOT}/a.jpg`]);
  });

  it("stops and returns what it has once isStale() turns true", async () => {
    let stale = false;
    const { browse, calls } = fakeBrowse({
      [ROOT]: { children: [dir("trip"), leaf("a.jpg")] },
      [`${ROOT}/trip`]: { children: [leaf("trip/b.jpg")] },
    });
    const wrapped = async (id: string) => { const t = await browse(id); stale = true; return t; };
    const items = await collectPlayable(wrapped, ROOT, () => stale);
    expect(calls).toEqual([ROOT]);
    expect(items).toEqual([]);
  });

  it("treats an undefined tree (no hass) as an empty folder", async () => {
    const items = await collectPlayable(async () => undefined, ROOT);
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run test/collect-playable.test.ts`
Expected: FAIL. Vite can't resolve `../src/media-browse`.

- [ ] **Step 4: Create `media-browse.ts`**

Move the code below out of `screensaver-card.ts` verbatim. The comments come with it; only the `SUPPORTED` name changes, and `collectPlayable` is new (lifted from `_collectMedia`).

```ts
// The one definition of "what is in rotation", shared by screensaver-card and
// panel-tools-card so the screensaver and the photos overlay can never disagree.
// No Lit import: this module is pure and must stay importable from node tests.

// Supported media extensions. Pi-5 codec note (M-8): HEVC/H.265 hardware decode is
// limited on Pi 5 — validate video formats on real hardware. Conservative default set.
export const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"];

// Strip ?query and #fragment from a media URL/path so extension-matching works
// on resolved media_source URLs (e.g. "photo.jpg?token=…"). Pure.
export function stripMediaUrlQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

// Build the media_source content id for HA's browse_media WS from a folder path.
// Source contract: "local" is the source_dir_id; format media-source://media_source/local/<dir>.
export function buildBrowseContentId(mediaPath: string): string {
  const dir = (mediaPath || "media").replace(/^\/+|\/+$/g, "") || "media";
  return `media-source://media_source/local/${dir}`;
}

export type BrowseChild = {
  media_content_id?: string;
  media_class?: string;
  can_play?: boolean;
  can_expand?: boolean;
};

export type BrowseTree = { children?: BrowseChild[] };

/** A playable leaf: what the screensaver cycles and the photos overlay shows. */
export type BrowseLeaf = { contentId: string; kind: "image" | "video" };

// Filter an HA browse_media tree to ordered playable image/video leaves (spec M-13).
// Predicate (browse_media.py:106-120): can_expand === false && can_play === true.
export function selectPlayableChildren(browseTree?: BrowseTree): BrowseLeaf[] {
  const children = browseTree?.children ?? [];
  const items: BrowseLeaf[] = [];
  for (const c of children) {
    if (c.can_expand === false && c.can_play === true && c.media_content_id) {
      if (c.media_class === "image" || c.media_class === "video") {
        items.push({ contentId: c.media_content_id, kind: c.media_class });
      }
    }
  }
  return items;
}

// Parallel predicate to selectPlayableChildren (NOT a mirror): returns the
// media_content_id strings of expandable subdirectories to recurse into. Dirs carry
// no playable kind, hence string[] not BrowseLeaf[]. Pure. (HA browse_media is lazy/
// one-level — local_source.py:258-266 — so the caller browses each returned id.)
export function selectSubdirectories(browseTree?: BrowseTree): string[] {
  const children = browseTree?.children ?? [];
  const dirs: string[] = [];
  for (const c of children) {
    if (c.can_expand === true && c.media_content_id) {
      dirs.push(c.media_content_id);
    }
  }
  return dirs;
}

// Bounded recursive browse limits (I-1). HA browse_media is lazy/one-level, so the
// walk recurses itself. Cap depth + total folder calls per walk.
export const MAX_RECURSION_DEPTH = 3;     // root + 3 subfolder levels
export const MAX_BROWSE_FOLDERS = 50;     // hard cap on browse_media calls per walk

/** Bounded BFS over the media tree. A folder whose browse throws is skipped (and
 *  does not count toward the cap — unchanged from the original _collectMedia).
 *  isStale is re-checked after every await; once true, return what we have. */
export async function collectPlayable(
  browse: (contentId: string) => Promise<BrowseTree | undefined>,
  rootContentId: string,
  isStale: () => boolean = () => false,
): Promise<BrowseLeaf[]> {
  const queue: { contentId: string; depth: number }[] = [{ contentId: rootContentId, depth: 0 }];
  let foldersBrowsed = 0;
  const items: BrowseLeaf[] = [];
  while (queue.length > 0 && foldersBrowsed < MAX_BROWSE_FOLDERS) {
    const { contentId, depth } = queue.shift()!;
    let tree: BrowseTree | undefined;
    try {
      tree = await browse(contentId);
    } catch {
      continue;
    }
    foldersBrowsed++;
    if (isStale()) return items;
    items.push(...selectPlayableChildren(tree));
    if (depth < MAX_RECURSION_DEPTH) {
      for (const id of selectSubdirectories(tree)) {
        queue.push({ contentId: id, depth: depth + 1 });
      }
    }
  }
  return items;
}
```

- [ ] **Step 5: Rewire `screensaver-card.ts`**

1. Delete the definitions now in `media-browse.ts`: `SUPPORTED` (line 19), `stripMediaUrlQuery`, `buildBrowseContentId`, the `BrowseChild` type, `selectPlayableChildren`, `selectSubdirectories`, `MAX_RECURSION_DEPTH`, `MAX_BROWSE_FOLDERS`. Keep their explanatory comments only in `media-browse.ts`.
2. Directly under the `lit` imports, add:

```ts
import {
  SUPPORTED_EXTENSIONS, stripMediaUrlQuery, buildBrowseContentId, selectPlayableChildren,
  selectSubdirectories, collectPlayable, MAX_RECURSION_DEPTH, MAX_BROWSE_FOLDERS,
  type BrowseChild, type BrowseLeaf,
} from "./media-browse";

// Re-exported so existing tests and importers keep working unchanged.
export {
  SUPPORTED_EXTENSIONS, stripMediaUrlQuery, buildBrowseContentId, selectPlayableChildren,
  selectSubdirectories, collectPlayable, MAX_RECURSION_DEPTH, MAX_BROWSE_FOLDERS,
};
```

3. In `selectDisplayMode`, replace `SUPPORTED.some(` with `SUPPORTED_EXTENSIONS.some(`.
4. Replace the `MediaItem` type's first two fields so it builds on `BrowseLeaf`:

```ts
export type MediaItem = BrowseLeaf & {
  url?: string;
  resolvedAt?: number;
  /** Set lazily the first time the image decodes; undefined until then.
   *  Videos are never paired, so this stays undefined for them. */
  orientation?: Orientation;
};
```

5. Replace the body of `_collectMedia` (keep its leading comment):

```ts
  private async _collectMedia(rootContentId: string, gen: number): Promise<MediaItem[]> {
    return collectPlayable(
      (id) => this.hass?.callWS?.({ type: "media_source/browse_media", media_content_id: id }),
      rootContentId,
      () => gen !== this._gen,
    );
  }
```

If TypeScript reports `BrowseChild` as unused after the edit, drop it from the import.

- [ ] **Step 6: Run the whole suite, typecheck, build**

Run: `npx vitest run 2>&1 | tail -4 && npm run typecheck && npm run build`
Expected: `Tests  113 passed (113)` (109 + 4), typecheck clean, build writes `dist/screensaver-card.js`.

- [ ] **Step 7: Re-run the bundle guard against the fresh build**

Run: `npx vitest run test/dist-browser-loadable.test.ts`
Expected: PASS. The shared module is inlined, so `dist/` still has no imports.

- [ ] **Step 8: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current   # expect feat/time-of-day-layouts
git add custom_cards/screensaver-card/src/media-browse.ts custom_cards/screensaver-card/src/screensaver-card.ts custom_cards/screensaver-card/test/collect-playable.test.ts
git commit -m "refactor(screensaver): extract media-browse so the photos overlay shares it"
```

---

### Task 2: Scaffold the panel-tools-card package

**Files:**
- Create: `custom_cards/panel-tools-card/package.json`, `tsconfig.json`, `tsconfig.test.json`, `vite.config.ts`, `vitest.config.ts`, `src/panel-tools-card.ts` (stub), `test/dist-browser-loadable.test.ts`

- [ ] **Step 1: Create the package files**

`custom_cards/panel-tools-card/package.json`:

```json
{
  "name": "panel-tools-card",
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

`custom_cards/panel-tools-card/tsconfig.json`. The `include` adds the shared screensaver module, which the card imports:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "strict": true,
    "allowImportingTsExtensions": false,
    "outDir": "dist"
  },
  "include": ["src", "../screensaver-card/src/media-browse.ts"]
}
```

`custom_cards/panel-tools-card/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src", "test", "../screensaver-card/src/media-browse.ts"]
}
```

`custom_cards/panel-tools-card/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { resolve } from "node:path";

// Bundled, not tsc'd: a bare `lit` import in dist/ makes the card unloadable and HA
// shows only "Configuration error" (memory: cards-must-be-bundled). Guarded by
// test/dist-browser-loadable.test.ts.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    target: "es2021",
    rollupOptions: { external: [] },
    lib: {
      entry: resolve(import.meta.dirname, "src/panel-tools-card.ts"),
      formats: ["es"],
      fileName: () => "panel-tools-card.js",
    },
  },
});
```

`custom_cards/panel-tools-card/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

`custom_cards/panel-tools-card/src/panel-tools-card.ts` (stub, replaced in Task 9):

```ts
import { LitElement, html } from "lit";

export class PanelToolsCard extends LitElement {
  setConfig(_config: Record<string, unknown>): void {}
  render() { return html``; }
}

if (!customElements.get("panel-tools-card")) {
  customElements.define("panel-tools-card", PanelToolsCard);
}
```

`custom_cards/panel-tools-card/test/dist-browser-loadable.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const CARD = "panel-tools-card.js";
const IMPORT_RE = /^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm;

describe("dist is loadable by a browser as a Lovelace resource", () => {
  // A bare `lit` specifier (or a sibling chunk) in dist/ means the module never
  // evaluates in HA while unit tests still pass. Two cards here shipped that way.
  it(`${CARD} has no imports at all`, () => {
    const path = resolve(DIST, CARD);
    expect(existsSync(path), `${CARD} missing — run \`npm run build\` first`).toBe(true);
    const specs = [...readFileSync(path, "utf8").matchAll(IMPORT_RE)].map((m) => m[1]);
    expect(specs).toEqual([]);
  });

  it("lit and the shared media-browse module are inlined", () => {
    const src = readFileSync(resolve(DIST, CARD), "utf8");
    expect(src).toContain("customElements.define");
  });
});
```

- [ ] **Step 2: Install, build, run the guard**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/panel-tools-card && npm install && npm run build && npx vitest run`
Expected: `Tests  2 passed (2)`.

- [ ] **Step 3: Confirm `dist/` and `node_modules/` are ignored like the siblings**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM && git status --porcelain custom_cards/panel-tools-card`
Expected: `dist/` and `node_modules/` absent from the list. If they show up, add `custom_cards/panel-tools-card/dist/` and `custom_cards/panel-tools-card/node_modules/` to `.gitignore`, mirroring the existing entries for the sibling cards (`grep -n custom_cards .gitignore`).

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add custom_cards/panel-tools-card .gitignore
git commit -m "chore(panel-tools): scaffold bundled card package with dist guard"
```

---

### Task 3: Pure logic — filenames and UTF-8 hex

**Files:**
- Create: `custom_cards/panel-tools-card/src/logic.ts`
- Test: `custom_cards/panel-tools-card/test/logic.test.ts`

- [ ] **Step 1: Write the failing tests**

`custom_cards/panel-tools-card/test/logic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { topLevelFilename, hexEncodeUtf8, isSupportedName, isVideoName } from "../src/logic";

const ROOT = "media-source://media_source/local/photos";

describe("topLevelFilename", () => {
  it("returns the raw name for a top-level file", () => {
    expect(topLevelFilename(`${ROOT}/Rowan's birthday.jpg`, "photos")).toBe("Rowan's birthday.jpg");
  });
  it("does NOT percent-decode — HA ids are raw paths (local_source.py:250)", () => {
    expect(topLevelFilename(`${ROOT}/50%off.jpg`, "photos")).toBe("50%off.jpg");
    expect(topLevelFilename(`${ROOT}/a%20b.jpg`, "photos")).toBe("a%20b.jpg");
  });
  it("returns null for a file in a subfolder (hide is top-level only)", () => {
    expect(topLevelFilename(`${ROOT}/trip/a.jpg`, "photos")).toBeNull();
  });
  it("does not mistake the sibling hidden folder for the photos folder", () => {
    expect(topLevelFilename("media-source://media_source/local/photos-hidden/a.jpg", "photos")).toBeNull();
  });
  it("returns null for the folder itself", () => {
    expect(topLevelFilename(ROOT, "photos")).toBeNull();
    expect(topLevelFilename(`${ROOT}/`, "photos")).toBeNull();
  });
});

describe("hexEncodeUtf8", () => {
  it("encodes ASCII", () => {
    expect(hexEncodeUtf8("a b")).toBe("612062");
  });
  it("encodes UTF-8 bytes, not UTF-16 code units", () => {
    expect(hexEncodeUtf8("é")).toBe("c3a9");
  });
  it("encodes an emoji as its four UTF-8 bytes", () => {
    expect(hexEncodeUtf8("🐟")).toBe("f09f909f");
  });
  it("emits only lowercase hex, whatever the name contains", () => {
    expect(hexEncodeUtf8(`Rowan's "best" day.jpg`)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("isSupportedName / isVideoName", () => {
  it("accepts the screensaver's extensions, case-insensitively", () => {
    expect(isSupportedName("a.JPG")).toBe(true);
    expect(isSupportedName("clip.webm")).toBe(true);
  });
  it("rejects HEIC", () => {
    expect(isSupportedName("IMG_3702.HEIC")).toBe(false);
  });
  it("judges a name containing # or ? by its real extension", () => {
    expect(isSupportedName("Party #2.jpg")).toBe(true);
    expect(isSupportedName("what?.png")).toBe(true);
  });
  it("identifies videos", () => {
    expect(isVideoName("clip.MP4")).toBe(true);
    expect(isVideoName("a.jpg")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/panel-tools-card && npx vitest run test/logic.test.ts`
Expected: FAIL. Vite can't resolve `../src/logic`.

- [ ] **Step 3: Implement**

`custom_cards/panel-tools-card/src/logic.ts`:

```ts
// Pure logic for panel-tools-card. No Lit import, so it runs under node tests.
import { SUPPORTED_EXTENSIONS, buildBrowseContentId } from "../../screensaver-card/src/media-browse";

/** The text after `<photos folder>/` in a media-source id, or null if the id is not a
 *  file directly inside that folder. NO percent-decoding: HA builds these ids from the
 *  raw filesystem path (local_source.py:250), so decoding would corrupt a name that
 *  genuinely contains "%". */
export function topLevelFilename(contentId: string, mediaPath: string): string | null {
  const prefix = `${buildBrowseContentId(mediaPath)}/`;
  if (!contentId.startsWith(prefix)) return null;
  const rest = contentId.slice(prefix.length);
  if (!rest || rest.includes("/")) return null;
  return rest;
}

/** UTF-8 bytes as lowercase hex. The filename crosses HA's shell_command, which
 *  shlex-splits the rendered template, so it must contain nothing to split or quote.
 *  Hex of JS char codes would be wrong for accents and emoji — encode the bytes. */
export function hexEncodeUtf8(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
}

const VIDEO_EXTENSIONS = [".mp4", ".webm"];

// Raw filenames / media-source ids, NOT resolved URLs — so no stripMediaUrlQuery:
// it cuts at "#"/"?", and "Party #2.jpg" is a perfectly good photo name.
export function isSupportedName(name: string): boolean {
  const n = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => n.endsWith(ext));
}

export function isVideoName(name: string): boolean {
  const n = name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => n.endsWith(ext));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/logic.test.ts`
Expected: `13 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/panel-tools-card/src/logic.ts custom_cards/panel-tools-card/test/logic.test.ts
git commit -m "feat(panel-tools): filename and UTF-8 hex logic for photo moves"
```

---

### Task 4: Pure logic — PIN, paging, skipped files, minutes, times, shell responses

**Files:**
- Modify: `custom_cards/panel-tools-card/src/logic.ts`
- Modify: `custom_cards/panel-tools-card/test/logic.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `test/logic.test.ts`, and extend its import line to:
`import { topLevelFilename, hexEncodeUtf8, isSupportedName, isVideoName, isValidPin, checkPin, pageSlice, findSkipped, stepMinutes, toTimeInput, fromTimeInput, parseShellResponse } from "../src/logic";`

```ts
describe("PIN", () => {
  it("a valid configured PIN is exactly four digits", () => {
    expect(isValidPin("0412")).toBe(true);
    expect(isValidPin("412")).toBe(false);
    expect(isValidPin("04a2")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
  it("matches only the configured PIN", () => {
    expect(checkPin("0412", "0412")).toBe(true);
    expect(checkPin("0413", "0412")).toBe(false);
  });
  it("never matches when the configured PIN is invalid (fails closed)", () => {
    expect(checkPin("", "")).toBe(false);
    expect(checkPin("412", "412")).toBe(false);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it("slices a page and reports the page count", () => {
    expect(pageSlice(items, 1, 12)).toEqual({ items: items.slice(12, 24), page: 1, pages: 3 });
  });
  it("clamps an out-of-range page (list shrank after a hide)", () => {
    expect(pageSlice(items, 9, 12).page).toBe(2);
    expect(pageSlice(items, -1, 12).page).toBe(0);
  });
  it("an empty list is one empty page", () => {
    expect(pageSlice([], 0, 12)).toEqual({ items: [], page: 0, pages: 1 });
  });
});

describe("findSkipped", () => {
  it("lists files on disk that are not in rotation", () => {
    expect(findSkipped(["a.jpg", "b.heic"], ["a.jpg"])).toEqual(["b.heic"]);
  });
  it("lists files HA puts in rotation that the panel cannot show", () => {
    expect(findSkipped(["c.heic"], ["c.heic"])).toEqual(["c.heic"]);
  });
  it("is empty when everything on disk shows", () => {
    expect(findSkipped(["a.jpg", "v.mp4"], ["a.jpg", "v.mp4"])).toEqual([]);
  });
  it("is sorted", () => {
    expect(findSkipped(["z.heic", "a.heic"], [])).toEqual(["a.heic", "z.heic"]);
  });
});

describe("stepMinutes", () => {
  it("steps by the delta", () => {
    expect(stepMinutes("30.0", 5)).toBe(35);
    expect(stepMinutes("30", -5)).toBe(25);
  });
  it("clamps to 5..120", () => {
    expect(stepMinutes("5", -5)).toBe(5);
    expect(stepMinutes("120", 5)).toBe(120);
  });
  it("treats an unknown state as the 30-minute default", () => {
    expect(stepMinutes("unknown", 5)).toBe(35);
    expect(stepMinutes(undefined, 0)).toBe(30);
  });
});

describe("time formats", () => {
  it("HA state -> <input type=time> value", () => {
    expect(toTimeInput("06:30:00")).toBe("06:30");
    expect(toTimeInput("unknown")).toBe("");
    expect(toTimeInput(undefined)).toBe("");
  });
  it("<input type=time> value -> input_datetime.set_datetime time", () => {
    expect(fromTimeInput("06:30")).toBe("06:30:00");
    expect(fromTimeInput("")).toBeNull();
    expect(fromTimeInput("25:00")).toBeNull();
  });
});

describe("parseShellResponse", () => {
  const wrap = (stdout: string) => ({ response: { stdout, stderr: "", returncode: 0 } });
  it("parses a successful listing", () => {
    expect(parseShellResponse(wrap('{"ok": true, "photos": ["a.jpg"], "hidden": []}')))
      .toEqual({ ok: true, photos: ["a.jpg"], hidden: [] });
  });
  it("passes a script rejection through", () => {
    expect(parseShellResponse(wrap('{"ok": false, "error": "no such photo"}')))
      .toEqual({ ok: false, error: "no such photo" });
  });
  it("turns garbage or a missing response into an error, never a throw", () => {
    expect(parseShellResponse(wrap("Traceback ...")).ok).toBe(false);
    expect(parseShellResponse(undefined).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/logic.test.ts`
Expected: FAIL. `isValidPin` (and the rest) aren't exported yet.

- [ ] **Step 3: Implement — append to `src/logic.ts`**

```ts
// ── PIN (kid-proof, not secure: checked in the browser, committed in kitchen.yaml) ──
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Fails closed: an invalid configured PIN never matches anything. */
export function checkPin(entered: string, configured: string): boolean {
  return isValidPin(configured) && entered === configured;
}

// ── Photos grid ────────────────────────────────────────────────────────────────
export const PAGE_SIZE = 12;
export const HIDDEN_PATH = "photos-hidden";

export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * size, p * size + size), page: p, pages };
}

/** Files on disk the panel will not show: either HA did not list them, or HA listed
 *  them but the browser cannot play them (HEIC). */
export function findSkipped(diskNames: string[], rotationNames: string[]): string[] {
  const shown = new Set(rotationNames.filter(isSupportedName));
  return diskNames.filter((n) => !shown.has(n)).sort();
}

// ── Settings ───────────────────────────────────────────────────────────────────
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 120;
export const MINUTES_DEFAULT = 30;

export function stepMinutes(state: string | undefined, delta: number): number {
  const cur = Number.parseFloat(state ?? "");
  const base = Number.isFinite(cur) ? Math.round(cur) : MINUTES_DEFAULT;
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, base + delta));
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toTimeInput(state: string | undefined): string {
  const m = /^(\d{2}:\d{2})(:\d{2})?$/.exec(state ?? "");
  return m && HHMM.test(m[1]) ? m[1] : "";
}

export function fromTimeInput(value: string): string | null {
  return HHMM.test(value) ? `${value}:00` : null;
}

// ── shell_command responses ────────────────────────────────────────────────────
export type ShellResult =
  | { ok: true; photos?: string[]; hidden?: string[]; name?: string }
  | { ok: false; error: string };

/** shell_command returns {stdout, stderr, returncode}; photo_move.py prints one JSON
 *  object on stdout. Anything else becomes an error the overlay can show. */
export function parseShellResponse(res: unknown): ShellResult {
  const stdout = (res as { response?: { stdout?: unknown } } | undefined)?.response?.stdout;
  if (typeof stdout !== "string") return { ok: false, error: "No response from Home Assistant" };
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && parsed.ok === true) return parsed;
    if (parsed && parsed.ok === false) return { ok: false, error: String(parsed.error ?? "Rejected") };
  } catch {
    /* fall through */
  }
  return { ok: false, error: "Unexpected response from the photo script" };
}

// ── Entities ───────────────────────────────────────────────────────────────────
export const ENTITIES = {
  idle: "input_boolean.kitchen_idle",
  activity: "input_button.kitchen_activity",
  morningStart: "input_datetime.kitchen_morning_start",
  afternoonStart: "input_datetime.kitchen_afternoon_start",
  eveningStart: "input_datetime.kitchen_evening_start",
  theme: "input_select.kitchen_theme",
  screensaverMinutes: "input_number.kitchen_screensaver_minutes",
} as const;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/logic.test.ts && npm run typecheck`
Expected: `31 passed`, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/panel-tools-card/src/logic.ts custom_cards/panel-tools-card/test/logic.test.ts
git commit -m "feat(panel-tools): PIN, paging, skipped-file, settings and response logic"
```

---

### Task 5: `photo_move.py` — the script that runs inside the HA container

**Files:**
- Create: `homeassistant/kitchencom/photo_move.py`
- Test: `homeassistant/kitchencom/test_photo_move.py`

- [ ] **Step 1: Write the failing tests**

`homeassistant/kitchencom/test_photo_move.py`:

```python
import os

import pytest

import photo_move as pm


def hx(name):
    return name.encode("utf-8").hex()


@pytest.fixture
def dirs(tmp_path):
    photos = tmp_path / "photos"
    hidden = tmp_path / "photos-hidden"
    photos.mkdir()
    return photos, hidden


def run(dirs, *args):
    photos, hidden = dirs
    return pm.run(["photo_move.py", *args], str(photos), str(hidden))


@pytest.mark.parametrize("name", [
    "a.jpg",
    "Rowan's birthday.jpg",
    'the "best" day.jpg',
    "café.jpg",
    "🐟 fishy.jpg",
    "50%off.jpg",
])
def test_hide_moves_any_real_filename_to_the_sibling_folder(dirs, name):
    photos, hidden = dirs
    (photos / name).write_bytes(b"x")
    out = run(dirs, "hide", hx(name))
    assert out == {"ok": True, "name": name}
    assert not (photos / name).exists()
    assert (hidden / name).read_bytes() == b"x"


def test_unhide_restores(dirs):
    photos, hidden = dirs
    hidden.mkdir()
    (hidden / "a.jpg").write_bytes(b"x")
    assert run(dirs, "unhide", hx("a.jpg")) == {"ok": True, "name": "a.jpg"}
    assert (photos / "a.jpg").exists()


def test_unhide_collision_gets_a_suffix_and_never_overwrites(dirs):
    photos, hidden = dirs
    hidden.mkdir()
    (photos / "a.jpg").write_bytes(b"keep")
    (photos / "a (2).jpg").write_bytes(b"keep2")
    (hidden / "a.jpg").write_bytes(b"back")
    assert run(dirs, "unhide", hx("a.jpg")) == {"ok": True, "name": "a (3).jpg"}
    assert (photos / "a.jpg").read_bytes() == b"keep"
    assert (photos / "a (2).jpg").read_bytes() == b"keep2"
    assert (photos / "a (3).jpg").read_bytes() == b"back"


@pytest.mark.parametrize("arg", [
    "",              # empty
    "6",             # odd length
    "ZZ",            # not hex
    "6A",            # uppercase: the card only emits lowercase
    "ff",            # valid hex, invalid UTF-8
])
def test_rejects_bad_hex(dirs, arg):
    out = run(dirs, "hide", arg)
    assert out["ok"] is False


@pytest.mark.parametrize("name", ["a/b.jpg", "..", ".hidden.jpg", "a\\b.jpg", "a\x00.jpg"])
def test_rejects_names_that_are_not_a_bare_filename(dirs, name):
    out = run(dirs, "hide", hx(name))
    assert out["ok"] is False


def test_rejects_a_symlink_that_escapes_the_folder(dirs, tmp_path):
    photos, _ = dirs
    outside = tmp_path / "secret.jpg"
    outside.write_bytes(b"s")
    os.symlink(outside, photos / "evil.jpg")
    out = run(dirs, "hide", hx("evil.jpg"))
    assert out["ok"] is False
    assert outside.exists()


def test_missing_photo_is_an_error_not_a_crash(dirs):
    assert run(dirs, "hide", hx("nope.jpg")) == {"ok": False, "error": "no such photo"}


def test_extra_arguments_are_refused(dirs):
    # shell_command shlex-splits the rendered template; a caller smuggling a space
    # into name_hex arrives here as extra argv entries.
    assert run(dirs, "hide", "61", "62")["ok"] is False


def test_list_returns_sorted_files_and_skips_dotfiles_and_folders(dirs):
    photos, _ = dirs
    for n in ["b.jpg", "a.HEIC", ".DS_Store"]:
        (photos / n).write_bytes(b"x")
    (photos / "trip").mkdir()
    assert run(dirs, "list") == {"ok": True, "photos": ["a.HEIC", "b.jpg"], "hidden": []}


def test_main_always_exits_zero_and_prints_json(dirs, capsys, monkeypatch):
    photos, hidden = dirs
    monkeypatch.setenv("KC_PHOTOS_DIR", str(photos))
    monkeypatch.setenv("KC_HIDDEN_DIR", str(hidden))
    assert pm.main(["photo_move.py", "hide", "zz"]) == 0
    assert '"ok": false' in capsys.readouterr().out
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM && python3 -m pytest homeassistant/kitchencom -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'photo_move'`.

- [ ] **Step 3: Implement**

`homeassistant/kitchencom/photo_move.py`:

```python
#!/usr/bin/env python3
"""Hide / unhide / list screensaver photos. Runs INSIDE the HA container.

Called by shell_command (homeassistant/packages/photos.yaml):
    photo_move.py list
    photo_move.py hide   <utf-8 filename as lowercase hex>
    photo_move.py unhide <utf-8 filename as lowercase hex>

WHY HEX: HA renders a templated shell_command and shlex-splits it, then runs it
without a shell. A filename with a space or a quote would arrive mangled or split.
Hex has nothing to split or quote. Spec: docs/superpowers/specs/
2026-10-21-sleep-settings-photos-design.md §5.

WHY A SIBLING FOLDER: screensaver-card recurses into subfolders of photos/, so
photos/hidden/ would stay in rotation. Hidden files live in photos-hidden/.

Always exits 0 and prints exactly one JSON object; the card reads stdout.
"""
import json
import os
import sys

DEFAULT_PHOTOS = "/config/media/photos"
DEFAULT_HIDDEN = "/config/media/photos-hidden"
HEX = set("0123456789abcdef")


class Rejected(Exception):
    pass


def decode_name(arg):
    if not arg or len(arg) % 2 or not set(arg) <= HEX:
        raise Rejected("filename is not lowercase hex")
    try:
        name = bytes.fromhex(arg).decode("utf-8")
    except UnicodeDecodeError:
        raise Rejected("filename is not UTF-8")
    if (not name or name.startswith(".") or "/" in name or "\\" in name
            or "\x00" in name):
        raise Rejected("not a bare filename")
    return name


def inside(folder, name):
    """Full path of name in folder, refusing anything that resolves elsewhere."""
    real_folder = os.path.realpath(folder)
    path = os.path.realpath(os.path.join(folder, name))
    if os.path.dirname(path) != real_folder:
        raise Rejected("path escapes the folder")
    return path


def move(name, src_dir, dst_dir):
    src = inside(src_dir, name)
    if not os.path.isfile(src):
        raise Rejected("no such photo")
    os.makedirs(dst_dir, exist_ok=True)
    stem, ext = os.path.splitext(name)
    for n in range(1, 1000):
        candidate = name if n == 1 else f"{stem} ({n}){ext}"
        dst = inside(dst_dir, candidate)
        try:
            # link() refuses to overwrite, so a collision can never destroy a file
            # even if two moves race. Same filesystem: both folders are under /config/media.
            os.link(src, dst)
        except FileExistsError:
            continue
        os.unlink(src)
        return candidate
    raise Rejected("too many files with that name")


def list_dir(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(
        n for n in os.listdir(folder)
        if not n.startswith(".") and os.path.isfile(os.path.join(folder, n))
    )


def run(argv, photos_dir, hidden_dir):
    try:
        if len(argv) == 2 and argv[1] == "list":
            return {"ok": True, "photos": list_dir(photos_dir), "hidden": list_dir(hidden_dir)}
        if len(argv) == 3 and argv[1] == "hide":
            return {"ok": True, "name": move(decode_name(argv[2]), photos_dir, hidden_dir)}
        if len(argv) == 3 and argv[1] == "unhide":
            return {"ok": True, "name": move(decode_name(argv[2]), hidden_dir, photos_dir)}
        raise Rejected("usage: list | hide <hex> | unhide <hex>")
    except Rejected as e:
        return {"ok": False, "error": str(e)}
    except OSError as e:
        return {"ok": False, "error": f"file error: {e.strerror}"}


def main(argv):
    out = run(
        argv,
        os.environ.get("KC_PHOTOS_DIR", DEFAULT_PHOTOS),
        os.environ.get("KC_HIDDEN_DIR", DEFAULT_HIDDEN),
    )
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest homeassistant/kitchencom -q`
Expected: `23 passed`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add homeassistant/kitchencom/photo_move.py homeassistant/kitchencom/test_photo_move.py
git commit -m "feat(photos): container-side hide/unhide/list script with hex filenames"
```

---

### Task 6: HA package — photo shell commands

**Files:**
- Create: `homeassistant/packages/photos.yaml`

- [ ] **Step 1: Write the package**

```yaml
# Photos overlay transport — spec docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md §5
#
# The panel's photos overlay hides/unhides screensaver photos by MOVING files
# between /config/media/photos and the SIBLING /config/media/photos-hidden (not a
# subfolder: screensaver-card recurses, so photos/hidden/ would stay in rotation).
#
# name_hex is the UTF-8 filename as lowercase hex. With a template, HA shlex-splits
# the rendered command and runs it WITHOUT a shell, so hex — nothing to split or
# quote — is the only form every real filename survives. photo_move.py rejects
# anything that is not exactly one lowercase-hex argument.
#
# The card calls these with return_response and reads stdout (one JSON object).
shell_command:
  kitchen_photo_list: "python3 /config/kitchencom/photo_move.py list"
  kitchen_photo_hide: "python3 /config/kitchencom/photo_move.py hide {{ name_hex }}"
  kitchen_photo_unhide: "python3 /config/kitchencom/photo_move.py unhide {{ name_hex }}"
```

- [ ] **Step 2: Lint**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM && npm run validate:yaml`
Expected: no errors for `photos.yaml`.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add homeassistant/packages/photos.yaml
git commit -m "feat(photos): shell_command transport for the photos overlay"
```

---

### Task 7: Screensaver delay as a setting

**Files:**
- Modify: `homeassistant/packages/screensaver.yaml` (the `timer:` block ~line 23, and each of the 4 `timer.start` actions targeting `timer.kitchen_inactivity`)

- [ ] **Step 1: Add the helper**

Directly above `timer:` in `screensaver.yaml`, add:

```yaml
input_number:
  # Screensaver delay, editable from the panel's settings drawer (2026-10-21).
  # No `initial:` so the value survives restarts. ⚠ An input_number with no
  # restored state starts at `min` — set it to 30 once right after first deploy
  # (plan Task 12), or the screensaver drops to 5 minutes.
  kitchen_screensaver_minutes:
    name: Screensaver delay
    min: 5
    max: 120
    step: 5
    unit_of_measurement: min
    mode: slider
    icon: mdi:timer-sand
```

Change the timer's comment so nobody "fixes" the default back:

```yaml
timer:
  kitchen_inactivity:
    # Fallback only. Every timer.start below passes a duration from
    # input_number.kitchen_screensaver_minutes; this value applies only if one doesn't.
    duration: "00:30:00"
```

- [ ] **Step 2: Pass the duration in every `timer.start`**

Find them: `grep -n "timer.start" homeassistant/packages/screensaver.yaml`. Expect 4: the enable automation, the wake automation, the startup automation, and one more. Read each one; if the fourth isn't a start of `kitchen_inactivity`, leave it alone. To every `timer.start` whose target is `timer.kitchen_inactivity`, add the same `data:` block, so each looks like:

```yaml
      - service: timer.start
        target:
          entity_id: timer.kitchen_inactivity
        data:
          # Clamped to the helper's own range; an unknown state falls back to 30.
          duration: >
            {% set m = states('input_number.kitchen_screensaver_minutes') | float(30) | int %}
            {% set m = [5, [m, 120] | min] | max %}
            {{ '%02d:%02d:00' % (m // 60, m % 60) }}
```

- [ ] **Step 3: Lint**

Run: `npm run validate:yaml`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add homeassistant/packages/screensaver.yaml
git commit -m "feat(screensaver): delay comes from an input_number the drawer can set"
```

---

### Task 8: Dev-rig support for the photo script

The dev HA (port 8124, HA 2025.7) can prove the `shell_command` → script → response chain and the timer duration template without the Pi.

**Files:**
- Modify: `deploy/homeassistant/dev-setup.sh`

- [ ] **Step 1: Read the assembly section**

Run: `grep -n "packages\|themes\|www\|mkdir\|cp " deploy/homeassistant/dev-setup.sh`
Find where `packages/` gets copied into `$DEV_CONFIG`.

- [ ] **Step 2: Add the script dir and media folders**

Immediately after the line that copies `packages/`, add:

```bash
# Photos overlay (2026-10-21): shell_command runs /config/kitchencom/photo_move.py,
# and the script works on /config/media/photos and the SIBLING photos-hidden.
rm -rf "$DEV_CONFIG/kitchencom"
cp -R "$REPO_ROOT/homeassistant/kitchencom" "$DEV_CONFIG/kitchencom"
rm -f "$DEV_CONFIG/kitchencom/test_photo_move.py"
mkdir -p "$DEV_CONFIG/media/photos" "$DEV_CONFIG/media/photos-hidden"
```

- [ ] **Step 3: Check `media_dirs` in the dev config**

Run: `grep -n "media_dirs" -A2 deploy/homeassistant/dev-configuration.yaml`
If it's missing, add this under its `homeassistant:` key, matching the Pi (`homeassistant/configuration.yaml:16-17`):

```yaml
  media_dirs:
    local: /config/media
```

- [ ] **Step 4: Bring the rig up and verify the chain**

```bash
GROCY_API_KEY=unused deploy/homeassistant/dev-setup.sh
docker compose -f deploy/homeassistant/docker-compose.ha-dev.yml up -d
printf 'x' > "deploy/homeassistant/dev-config/media/photos/Rowan's \"best\" day.jpg"
```

Wait ~90 s (new YAML entities appear late — memory `ha-yaml-entities-appear-late.md`). Then create a long-lived token in the dev UI (http://localhost:8124 → Profile → Security) and:

```bash
TOKEN=...   # dev rig token, never commit
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  'http://localhost:8124/api/services/shell_command/kitchen_photo_list?return_response' | python3 -m json.tool
NAME_HEX=$(python3 -c "print(\"Rowan's \\\"best\\\" day.jpg\".encode().hex())")
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name_hex\": \"$NAME_HEX\"}" \
  'http://localhost:8124/api/services/shell_command/kitchen_photo_hide?return_response' | python3 -m json.tool
ls deploy/homeassistant/dev-config/media/photos-hidden
```

Expected: the list response's `service_response.stdout` contains `"photos": ["Rowan's \"best\" day.jpg"]`. The hide returns `"ok": true`, and `photos-hidden/` now holds the file. If `python3` isn't found inside the container, stop: the Pi's HA image is the same family, so the command path in `photos.yaml` would need changing.

- [ ] **Step 5: Verify the timer duration template**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "input_number.kitchen_screensaver_minutes", "value": 45}' \
  http://localhost:8124/api/services/input_number/set_value
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "input_button.kitchen_activity"}' http://localhost:8124/api/services/input_button/press
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8124/api/states/timer.kitchen_inactivity | python3 -m json.tool
```

Expected: `attributes.duration` is `0:45:00` and the state is `active`. If the wake automation is gated on something the dev rig lacks, check `input_boolean.kitchen_screensaver_enabled` and turn it on first.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add deploy/homeassistant/dev-setup.sh deploy/homeassistant/dev-configuration.yaml
git commit -m "chore(dev-ha): stage the photo script and media folders in the dev rig"
```

---

### Task 9: The card — corner icons, PIN pad, settings drawer

**Files:**
- Modify: `custom_cards/panel-tools-card/src/panel-tools-card.ts` (replace the stub entirely)

- [ ] **Step 1: Write the card (photos overlay methods come in Task 10)**

```ts
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { buildBrowseContentId, collectPlayable } from "../../screensaver-card/src/media-browse";
import {
  ENTITIES, HIDDEN_PATH, PAGE_SIZE, checkPin, findSkipped, fromTimeInput, hexEncodeUtf8,
  isSupportedName, isValidPin, isVideoName, pageSlice, parseShellResponse, stepMinutes,
  toTimeInput, topLevelFilename, type ShellResult,
} from "./logic";

// Panel tools: ⚙ (PIN → settings drawer) and 🖼 (photos overlay), on every time view.
// Spec: docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md
//
// Taps in here already count as activity: screensaver-card's bridge listens on
// window in the capture phase, and it is on all three views.
// Layering: everything here sits BELOW the screensaver overlay (z-index 9999), so
// when the screensaver engages it covers an open drawer — and updated() closes it.

type EntityState = { state: string; attributes?: Record<string, unknown> };
type Hass = {
  states: Record<string, EntityState | undefined>;
  callService: (
    domain: string, service: string, data?: unknown,
    target?: unknown, notify?: boolean, returnResponse?: boolean,
  ) => Promise<any>;
  callWS: (msg: Record<string, unknown>) => Promise<any>;
};

type Mode = "closed" | "pin" | "drawer" | "photos";
type Tile = { contentId: string; kind: "image" | "video"; name: string | null };

export class PanelToolsCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _mode: { state: true },
    _pin: { state: true },
    _pinError: { state: true },
    _error: { state: true },
    _tab: { state: true },
    _page: { state: true },
    _tiles: { state: true },
    _hidden: { state: true },
    _skipped: { state: true },
    _urls: { state: true },
    _selected: { state: true },
    _busy: { state: true },
  };

  hass?: Hass;
  private _cfgPin = "";
  private _mediaPath = "photos";
  private _loadGen = 0;

  _mode: Mode = "closed";
  _pin = "";
  _pinError = false;
  _error = "";
  _tab: "rotation" | "hidden" = "rotation";
  _page = 0;
  _tiles: Tile[] = [];
  _hidden: string[] = [];
  _skipped: string[] = [];
  _urls: Record<string, string> = {};
  _selected: string | null = null;
  _busy = false;

  setConfig(config: Record<string, unknown>): void {
    const pin = typeof config.pin === "string" ? config.pin : String(config.pin ?? "");
    if (!isValidPin(pin)) {
      throw new Error('panel-tools-card: "pin" must be exactly 4 digits, quoted (pin: "0412")');
    }
    this._cfgPin = pin;
    if (typeof config.media_path === "string" && config.media_path) {
      this._mediaPath = config.media_path;
    }
  }

  getCardSize(): number {
    return 0;
  }

  getGridOptions(): Record<string, number> {
    return { rows: 0, columns: 1 };
  }

  updated(changed: PropertyValues): void {
    // Screensaver engaged → close and re-lock. A kid must never find an open drawer.
    if (changed.has("hass") && this._mode !== "closed" && this._state(ENTITIES.idle) === "on") {
      this._close();
    }
  }

  private _state(entityId: string): string | undefined {
    return this.hass?.states[entityId]?.state;
  }

  private _close(): void {
    this._mode = "closed";
    this._pin = "";
    this._pinError = false;
    this._clearPhotos();
  }

  private async _call(domain: string, service: string, data: Record<string, unknown>, entityId: string): Promise<void> {
    try {
      await this.hass?.callService(domain, service, data, { entity_id: entityId });
      this._error = "";
    } catch (e) {
      this._error = `Couldn't save: ${(e as Error)?.message ?? e}`;
    }
  }

  // ── PIN ──────────────────────────────────────────────────────────────────────
  private _pressDigit(d: string): void {
    if (this._pin.length >= 4) return;
    this._pin += d;
    this._pinError = false;
    if (this._pin.length < 4) return;
    const ok = checkPin(this._pin, this._cfgPin);
    this._pin = "";
    if (ok) this._mode = "drawer";
    else this._pinError = true;
  }

  private _renderPin(): TemplateResult {
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
    return html`
      <div class="scrim" @click=${() => this._close()}></div>
      <div class="pin" role="dialog" aria-label="Parent PIN">
        <div class="pin-title">${this._pinError ? "Wrong PIN" : "Parent PIN"}</div>
        <div class="pin-dots">${[0, 1, 2, 3].map((i) => html`<span class=${i < this._pin.length ? "on" : ""}></span>`)}</div>
        <div class="pin-pad">
          ${digits.map((d) => d === ""
            ? html`<span></span>`
            : html`<button @click=${() => (d === "⌫" ? (this._pin = this._pin.slice(0, -1)) : this._pressDigit(d))}>${d}</button>`)}
        </div>
      </div>`;
  }

  // ── Drawer ───────────────────────────────────────────────────────────────────
  private _timeRow(label: string, entityId: string): TemplateResult {
    return html`
      <label class="row">
        <span>${label}</span>
        <input type="time" .value=${toTimeInput(this._state(entityId))}
          @change=${(e: Event) => {
            const t = fromTimeInput((e.target as HTMLInputElement).value);
            if (t) void this._call("input_datetime", "set_datetime", { time: t }, entityId);
          }} />
      </label>`;
  }

  // Phase B (Task 16) adds the Sleep section here.
  protected _renderSleepSection(): TemplateResult | typeof nothing {
    return nothing;
  }

  private _renderDrawer(): TemplateResult {
    const theme = this._state(ENTITIES.theme);
    const minutes = this._state(ENTITIES.screensaverMinutes);
    const setMinutes = (delta: number) =>
      this._call("input_number", "set_value", { value: stepMinutes(minutes, delta) }, ENTITIES.screensaverMinutes);
    return html`
      <div class="scrim" @click=${() => this._close()}></div>
      <aside class="drawer" role="dialog" aria-label="Settings">
        <header><h2>Settings</h2><button class="x" @click=${() => this._close()} aria-label="Close">✕</button></header>
        ${this._renderSleepSection()}
        <section>
          <h3>Views switch at</h3>
          ${this._timeRow("Morning", ENTITIES.morningStart)}
          ${this._timeRow("Afternoon", ENTITIES.afternoonStart)}
          ${this._timeRow("Evening", ENTITIES.eveningStart)}
        </section>
        <section>
          <h3>Theme</h3>
          <div class="seg">
            ${["Dark", "Light"].map((opt) => html`
              <button class=${theme === opt ? "on" : ""}
                @click=${() => this._call("input_select", "select_option", { option: opt }, ENTITIES.theme)}>${opt}</button>`)}
          </div>
        </section>
        <section>
          <h3>Screensaver after</h3>
          <div class="stepper">
            <button @click=${() => setMinutes(-5)} aria-label="Less">−</button>
            <span>${stepMinutes(minutes, 0)} min</span>
            <button @click=${() => setMinutes(5)} aria-label="More">+</button>
          </div>
        </section>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
      </aside>`;
  }

  // ── Photos (Task 10 fills these in) ──────────────────────────────────────────
  private _clearPhotos(): void {
    this._loadGen++;
    this._tiles = [];
    this._hidden = [];
    this._skipped = [];
    this._urls = {};
    this._selected = null;
    this._page = 0;
    this._error = "";
    this._busy = false;
  }

  private async _openPhotos(): Promise<void> {
    this._mode = "photos";
  }

  private _renderPhotos(): TemplateResult | typeof nothing {
    return nothing;
  }

  // Phase B (Task 16) adds the wake layer here.
  protected _renderWakeLayer(): TemplateResult | typeof nothing {
    return nothing;
  }

  render(): TemplateResult {
    return html`
      ${this._renderWakeLayer()}
      ${this._mode === "closed" ? html`
        <div class="corner">
          <button @click=${() => void this._openPhotos()} aria-label="Photos">🖼</button>
          <button @click=${() => { this._mode = "pin"; }} aria-label="Settings">⚙</button>
        </div>` : nothing}
      ${this._mode === "pin" ? this._renderPin() : nothing}
      ${this._mode === "drawer" ? this._renderDrawer() : nothing}
      ${this._mode === "photos" ? this._renderPhotos() : nothing}`;
  }

  static styles = css`
    :host { display: block; height: 0; }
    button { font: inherit; color: inherit; cursor: pointer; touch-action: manipulation; }
    .corner { position: fixed; right: 12px; bottom: 12px; z-index: 50; display: flex; gap: 8px; }
    .corner button { width: 48px; height: 48px; border-radius: 24px; border: none; font-size: 22px;
      background: var(--kc-tools-bg, rgba(0, 0, 0, 0.35)); opacity: 0.6; }
    .scrim { position: fixed; inset: 0; z-index: 9000; background: rgba(0, 0, 0, 0.45); }
    .pin { position: fixed; z-index: 9001; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 320px; padding: 24px; border-radius: 16px; text-align: center;
      background: var(--kc-card-bg, var(--card-background-color, #1c1c1c));
      color: var(--kc-card-fg, var(--primary-text-color, #fff)); }
    .pin-title { font-size: 20px; margin-bottom: 12px; }
    .pin-dots { display: flex; justify-content: center; gap: 12px; margin-bottom: 16px; }
    .pin-dots span { width: 14px; height: 14px; border-radius: 7px; border: 2px solid currentColor; }
    .pin-dots span.on { background: currentColor; }
    .pin-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .pin-pad button { height: 64px; font-size: 26px; border-radius: 12px; border: none;
      background: var(--kc-tools-key, rgba(127, 127, 127, 0.2)); }
    .drawer { position: fixed; z-index: 9001; top: 0; right: 0; bottom: 0; width: 420px; max-width: 90vw;
      overflow-y: auto; padding: 20px 24px; box-sizing: border-box;
      background: var(--kc-card-bg, var(--card-background-color, #1c1c1c));
      color: var(--kc-card-fg, var(--primary-text-color, #fff)); }
    .drawer header { display: flex; justify-content: space-between; align-items: center; }
    .drawer h2 { margin: 0; font-size: 26px; }
    .drawer h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; margin: 20px 0 8px; }
    .x { border: none; background: none; font-size: 24px; width: 48px; height: 48px; }
    .row { display: flex; justify-content: space-between; align-items: center; min-height: 52px; font-size: 18px; }
    .row input { font-size: 18px; padding: 6px 8px; }
    .seg, .stepper { display: flex; gap: 8px; align-items: center; }
    .seg button, .stepper button { min-width: 64px; height: 48px; border-radius: 10px; border: none; font-size: 18px;
      background: var(--kc-tools-key, rgba(127, 127, 127, 0.2)); }
    .seg button.on { background: var(--kc-hero-fg, #4fc3f7); color: #000; }
    .stepper span { min-width: 90px; text-align: center; font-size: 20px; }
    .error { color: var(--kc-error, #ef5350); }
  `;
}

if (!customElements.get("panel-tools-card")) {
  customElements.define("panel-tools-card", PanelToolsCard);
}
```

- [ ] **Step 2: Typecheck, test, build**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/panel-tools-card && npm run typecheck && npm run build && npx vitest run`
Expected: typecheck clean (unused imports like `collectPlayable` are allowed, because `noUnusedLocals` is off), `33 passed`.

- [ ] **Step 3: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/panel-tools-card/src/panel-tools-card.ts
git commit -m "feat(panel-tools): corner icons, PIN pad and settings drawer"
```

---

### Task 10: The card — photos overlay

**Files:**
- Modify: `custom_cards/panel-tools-card/src/panel-tools-card.ts` (replace `_openPhotos` and `_renderPhotos`; add the methods below; append CSS)

- [ ] **Step 1: Replace `_openPhotos` and add the loaders**

```ts
  private async _shell(service: string, data: Record<string, unknown>): Promise<ShellResult> {
    try {
      const res = await this.hass?.callService("shell_command", service, data, undefined, false, true);
      return parseShellResponse(res);
    } catch (e) {
      return { ok: false, error: `Home Assistant refused: ${(e as Error)?.message ?? e}` };
    }
  }

  private async _openPhotos(): Promise<void> {
    const tab = this._mode === "photos" ? this._tab : "rotation";
    const page = this._mode === "photos" ? this._page : 0;
    this._mode = "photos";
    this._clearPhotos();
    this._tab = tab;
    this._page = page;
    const hass = this.hass;
    if (!hass) return;
    const gen = this._loadGen;
    this._busy = true;
    // Same walk as screensaver-card (shared media-browse), so the counts agree.
    const [leaves, listing] = await Promise.all([
      collectPlayable(
        (id) => hass.callWS({ type: "media_source/browse_media", media_content_id: id }),
        buildBrowseContentId(this._mediaPath),
        () => gen !== this._loadGen,
      ),
      this._shell("kitchen_photo_list", {}),
    ]);
    if (gen !== this._loadGen) return;
    const shown = leaves.filter((l) => isSupportedName(l.contentId));
    this._tiles = shown.map((l) => ({ ...l, name: topLevelFilename(l.contentId, this._mediaPath) }));
    if (listing.ok) {
      this._hidden = listing.hidden ?? [];
      const rotationNames = leaves
        .map((l) => topLevelFilename(l.contentId, this._mediaPath))
        .filter((n): n is string => n !== null);
      this._skipped = findSkipped(listing.photos ?? [], rotationNames);
    } else {
      this._error = listing.error;
    }
    this._busy = false;
    void this._resolvePage();
  }

  private _list(): Tile[] {
    if (this._tab === "rotation") return this._tiles;
    const root = buildBrowseContentId(HIDDEN_PATH);
    return this._hidden.map((n): Tile => ({ contentId: `${root}/${n}`, kind: isVideoName(n) ? "video" : "image", name: n }));
  }

  /** Resolve URLs for the visible page only. Called after every page/tab change with
   *  _urls already emptied, so off-screen images are released (renderer memory). */
  private async _resolvePage(): Promise<void> {
    const gen = this._loadGen;
    const { items } = pageSlice(this._list(), this._page, PAGE_SIZE);
    for (const t of items) {
      if (t.kind !== "image" || this._urls[t.contentId]) continue;
      try {
        const res = await this.hass?.callWS({ type: "media_source/resolve_media", media_content_id: t.contentId });
        if (gen !== this._loadGen) return;
        if (res?.url) this._urls = { ...this._urls, [t.contentId]: res.url };
      } catch {
        // Tile stays a placeholder.
      }
    }
  }

  private _goto(tab: "rotation" | "hidden", page: number): void {
    this._loadGen++;
    this._tab = tab;
    this._page = page;
    this._urls = {};
    this._selected = null;
    void this._resolvePage();
  }

  private async _move(service: "kitchen_photo_hide" | "kitchen_photo_unhide", name: string): Promise<void> {
    this._busy = true;
    const r = await this._shell(service, { name_hex: hexEncodeUtf8(name) });
    this._busy = false;
    this._selected = null;
    if (!r.ok) {
      this._error = r.error;
      return;
    }
    await this._openPhotos();
  }
```

- [ ] **Step 2: Replace `_renderPhotos`**

```ts
  private _renderPhotos(): TemplateResult {
    const list = this._list();
    const { items, page, pages } = pageSlice(list, this._page, PAGE_SIZE);
    const isHidden = this._tab === "hidden";
    return html`
      <div class="photos" role="dialog" aria-label="Photos">
        <header>
          <h2>Photos</h2>
          <div class="seg">
            <button class=${!isHidden ? "on" : ""} @click=${() => this._goto("rotation", 0)}>In rotation (${this._tiles.length})</button>
            <button class=${isHidden ? "on" : ""} @click=${() => this._goto("hidden", 0)}>Hidden (${this._hidden.length})</button>
          </div>
          <button class="x" @click=${() => this._close()} aria-label="Close">✕</button>
        </header>
        ${this._skipped.length && !isHidden ? html`
          <p class="note">Not shown on the panel (${this._skipped.length}): ${this._skipped.join(", ")}.
            HEIC and other unsupported formats need converting to JPEG.</p>` : nothing}
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        ${this._busy && !list.length ? html`<p class="note">Loading…</p>` : nothing}
        <div class="grid">
          ${items.map((t) => {
            const url = this._urls[t.contentId];
            const selected = this._selected === t.contentId;
            return html`
              <div class="tile ${selected ? "sel" : ""}" @click=${() => { this._selected = selected ? null : t.contentId; }}>
                ${t.kind === "video"
                  ? html`<div class="ph">▶<small>${t.name ?? "video"}</small></div>`
                  : url
                    ? html`<img src=${url} loading="lazy" decoding="async" alt="" />`
                    : html`<div class="ph">…</div>`}
                ${selected
                  ? t.name === null
                    ? html`<div class="act"><small>In a subfolder — move it off-panel</small></div>`
                    : html`<div class="act"><button ?disabled=${this._busy}
                        @click=${(e: Event) => { e.stopPropagation(); void this._move(isHidden ? "kitchen_photo_unhide" : "kitchen_photo_hide", t.name!); }}>
                        ${isHidden ? "Show again" : "Hide"}</button></div>`
                  : nothing}
              </div>`;
          })}
        </div>
        ${pages > 1 ? html`
          <footer class="stepper">
            <button ?disabled=${page === 0} @click=${() => this._goto(this._tab, page - 1)}>‹</button>
            <span>${page + 1} / ${pages}</span>
            <button ?disabled=${page >= pages - 1} @click=${() => this._goto(this._tab, page + 1)}>›</button>
          </footer>` : nothing}
      </div>`;
  }
```

- [ ] **Step 3: Append to `static styles`**

```css
    .photos { position: fixed; inset: 0; z-index: 9001; overflow-y: auto; padding: 16px 24px; box-sizing: border-box;
      background: var(--kc-card-bg, var(--card-background-color, #1c1c1c));
      color: var(--kc-card-fg, var(--primary-text-color, #fff)); }
    .photos header { display: flex; align-items: center; gap: 16px; }
    .photos h2 { margin: 0; font-size: 26px; flex: 0 0 auto; }
    .photos header .seg { flex: 1; }
    .note { opacity: 0.8; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
    .tile { position: relative; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden;
      background: var(--kc-tools-key, rgba(127, 127, 127, 0.2)); }
    .tile.sel { outline: 3px solid var(--kc-hero-fg, #4fc3f7); }
    .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ph { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center;
      justify-content: center; font-size: 32px; gap: 6px; }
    .ph small { font-size: 12px; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .act { position: absolute; inset: auto 0 0 0; padding: 8px; display: flex; justify-content: center;
      background: rgba(0, 0, 0, 0.6); color: #fff; }
    .act button { height: 44px; padding: 0 20px; border-radius: 10px; border: none; font-size: 17px;
      background: var(--kc-hero-fg, #4fc3f7); color: #000; }
    footer.stepper { justify-content: center; }
```

- [ ] **Step 4: Typecheck, test, build, guard**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/panel-tools-card && npm run typecheck && npm run build && npx vitest run`
Expected: clean, `33 passed`.

- [ ] **Step 5: Smoke-test against the dev rig**

Copy `dist/panel-tools-card.js` into `deploy/homeassistant/dev-config/www/`, register `/local/panel-tools-card.js?v=1` as a module resource in the dev UI, and add the card to any dev dashboard with `pin: "1234"`. Put two JPEGs and one `.heic` into `dev-config/media/photos/`. Check:
- 🖼 shows 2 tiles and the note lists the `.heic`.
- Selecting a tile → **Hide** → it moves to the Hidden tab, and the file is now in `media/photos-hidden/`.
- **Show again** restores it.
- ⚙ → a wrong PIN shows "Wrong PIN"; `1234` opens the drawer; changing Screensaver to 45 updates `input_number.kitchen_screensaver_minutes`.

- [ ] **Step 6: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/panel-tools-card/src/panel-tools-card.ts
git commit -m "feat(panel-tools): photos overlay with paging, hide/unhide and skipped-file note"
```

---

### Task 11: Dashboard placement + install docs

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml` (three time views, next to each `custom:screensaver-card`: lines ~50, ~454, ~2310)
- Modify: `deploy/INSTALL.md` (card resources section, ~line 43–75)

- [ ] **Step 1: Ask Garrett for the PIN**

Don't invent one. Tell him it gets **committed to git** (kitchen.yaml is tracked), so it should be a code he uses nowhere else.

- [ ] **Step 2: Add the card to the three time views**

Directly after each `- type: custom:tod-autonav-card` block on the Morning, Afternoon and Evening views, add (same indentation):

```yaml
          # ⚙ settings drawer + 🖼 photos overlay (spec 2026-10-21). Renders two
          # small fixed corner icons; takes no grid space. The PIN is kid-proof,
          # NOT secure — it is in git and readable by the panel user.
          - type: custom:panel-tools-card
            pin: "<Garrett's 4 digits, quoted>"
            media_path: photos
```

Don't add it to Schedule or Lists: those views aren't on the kiosk's time rotation.

- [ ] **Step 3: Lint**

Run: `npm run validate:yaml`
Expected: clean.

- [ ] **Step 4: Add the INSTALL steps**

In `deploy/INSTALL.md`'s card-resources step, add `/local/panel-tools-card.js?v=1` to the module list, then add this subsection:

```markdown
### Photos overlay script (panel-tools-card, 2026-10-21)

The overlay moves photos with `shell_command` → `/config/kitchencom/photo_move.py`.
Deploy the script (NOT its test) into the HA config dir and restart HA:

    scp homeassistant/kitchencom/photo_move.py kitchencom:/home/garrettdehart/homeassistant/kitchencom/
    scp homeassistant/packages/photos.yaml kitchencom:/home/garrettdehart/homeassistant/packages/

Hidden photos live in `/config/media/photos-hidden/` — a SIBLING of `photos/`, never a
subfolder (the screensaver recurses into subfolders). Restoring a photo by hand is just
moving it back.

After the first deploy, set `input_number.kitchen_screensaver_minutes` to **30**: with no
restored state it starts at its minimum, 5.
```

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add homeassistant/dashboards/kitchen.yaml deploy/INSTALL.md
git commit -m "feat(panel): place panel-tools-card on the time views; install steps"
```

---

### Task 12: Deploy Phase A to the Pi — NEEDS HOME NETWORK + GARRETT AT THE PANEL

- [ ] **Step 1: Network gate**

Ask Garrett to **disconnect the GSU VPN**: it routes all of 192.168.1.0/24 into the tunnel (memory `vpn-hides-the-whole-lan.md`). Then:
`nc -z -G 6 192.168.1.234 22 && echo "PI UP" || echo "PI DOWN"`
If the Pi is down, stop here.

- [ ] **Step 2: Confirm the photos folder (settles the two conflicting memory notes)**

Run: `ssh kitchencom 'sudo docker exec homeassistant ls /config/media; sudo docker exec homeassistant sh -c "ls /config/media/photos | head -3; command -v python3"'`
Expected: `photos` is listed and `python3` resolves. If photos live elsewhere, update `DEFAULT_PHOTOS`/`DEFAULT_HIDDEN` in `photo_move.py` and `media_path` in kitchen.yaml before going on. Then correct the stale note: update `screensaver-media-mount-boundary.md` in `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/` to say photos now live at `/config/media/photos` (it describes the older `media/media/` layout).

- [ ] **Step 3: Deploy the HA side**

Take timestamped backups of every file you'll overwrite (`kitchen.yaml.bak-<reason>-<stamp>` convention), then copy `photo_move.py`, `photos.yaml` and `screensaver.yaml`. **Before copying `screensaver.yaml`, diff it against the Pi's live copy**: packages can drift too. Restart HA, wait ~90 s, then check that `shell_command.kitchen_photo_list` and `input_number.kitchen_screensaver_minutes` exist (recorder DB, not the registry — memory `entity-registry-is-not-live-state.md`). Set the minutes to 30.

- [ ] **Step 4: Deploy the dashboard**

`kitchen.yaml` is contested: rebuild from the **live** file. Run `deploy/deploy-dashboard.sh --check` first. On drift, `--pull`, commit, re-apply Task 11's three card blocks onto the pulled file, then run `deploy/deploy-dashboard.sh`.

- [ ] **Step 5: Deploy the card**

Copy `custom_cards/panel-tools-card/dist/panel-tools-card.js` to `/config/www/`, register `/local/panel-tools-card.js?v=1` (module), **and copy the rebuilt `screensaver-card.js`** (Task 1 changed its source) with its `?v=` bumped. Then clear the kiosk's **Service Worker**, not just the Cache (memory `kiosk-service-worker-serves-stale-js.md`).

- [ ] **Step 6: Verify at the panel, with Garrett**

1. The screensaver still cycles photos after the delay. This is the regression check for the Task 1 refactor.
2. The corner icons are visible on Morning, Afternoon and Evening, and don't cover a chore tile or other control.
3. 🖼: the count looks right, a HEIC (if any) is listed as not shown, and hide → the photo leaves the next screensaver run → Show again.
4. ⚙: a wrong PIN is refused; the right PIN opens the drawer. Changing Evening start by a minute makes the view switch within a minute. Theme toggles. The screensaver delay changes.
5. Leave the drawer open until the screensaver engages: the drawer must be closed and locked afterwards.
6. The `<input type="time">` picker is usable by touch on the kiosk. If it isn't, note it, and the fix is replacing it with hour/minute steppers.

- [ ] **Step 7: Commit anything the deploy changed** (a pulled kitchen.yaml, path fixes). Record what was verified in the cold-open doc's §4e.

---

# GATE

### Task 13: Panel touch test — spec §7, verbatim — NEEDS GARRETT AT THE PANEL

Phase B starts only if this passes. Run it exactly as written in spec §7 (`/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md`):

- [ ] **Step 1: Make every test tap harmless:** `input_boolean.kitchen_idle` on, so the screensaver covers the dashboard.
- [ ] **Step 2:** Step 0, the baseline: `ssh kitchencom 'sudo libinput list-devices'`. Note the touch device.
- [ ] **Step 3:** Step 1: `ssh kitchencom 'WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/$(id -u) wlopm --off "*"'`, then wait about 1 minute.
- [ ] **Step 4:** Step 2: is the touch device still listed?
- [ ] **Step 5:** Step 3: `sudo libinput debug-events` while Garrett taps. Do events arrive?
- [ ] **Step 6:** Step 4: does `input_button.kitchen_activity`'s state (its last-pressed timestamp) change after a tap?
- [ ] **Step 7:** Step 5: `wlopm --on "*"`.
- [ ] **Step 8:** Step 6: `libinput list-devices` again, then Garrett taps a harmless control. Does touch work?
- [ ] **Step 9: Record the outcome** in spec §7 and in the cold-open doc, then route:
  - **Step 6 fails → STOP. Phase B cancelled.** Phase A stays shipped.
  - 2–4 and 6 pass → Phase B as written.
  - 2–3 pass, 4 fails → Phase B with the evdev wake (Task 18 Step 4).
  - 2 or 3 fails, 6 passes → Phase B without tap-to-wake: skip Task 16's wake layer. The panel wakes only at sleep end.

---

# PHASE B — Sleep Mode (only after Task 13 passes)

### Task 14: HA sleep package

**Files:**
- Create: `homeassistant/packages/sleep.yaml`

- [ ] **Step 1: Write the package**

```yaml
# Sleep Mode — spec docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md §3
#
# HA decides; the Pi enforces. deploy/sleep/kitchen_sleepd.py watches
# binary_sensor.kitchen_should_sleep over the websocket and runs wlopm.
# When in doubt anywhere in this chain, the screen comes ON.

input_boolean:
  kitchen_sleep_enabled:
    name: Kitchen Sleep Mode
    icon: mdi:sleep
  # Set by a wake tap (panel-tools-card's wake layer, or the Pi's evdev fallback).
  kitchen_sleep_woken:
    name: Kitchen Sleep Woken
    icon: mdi:gesture-tap

input_datetime:
  kitchen_sleep_start:
    name: Sleep starts
    has_date: false
    has_time: true
  kitchen_sleep_end:
    name: Sleep ends
    has_date: false
    has_time: true

template:
  - trigger:
      - platform: time_pattern
        minutes: "*"
      - platform: homeassistant
        event: start
      - platform: state
        entity_id:
          - input_datetime.kitchen_sleep_start
          - input_datetime.kitchen_sleep_end
    binary_sensor:
      - name: Kitchen Sleep Window
        unique_id: kitchen_sleep_window
        # `is number`, NOT `default(..., true)`: midnight is timestamp 0, which is
        # falsy, and the default-filter version silently treats 00:00 as unset
        # (the same trap 229f9ee fixed in time_of_day.yaml). Equal start/end, or
        # either unset, means no window.
        state: >
          {% set now_m = now().hour * 60 + now().minute %}
          {% set s = state_attr('input_datetime.kitchen_sleep_start', 'timestamp') %}
          {% set e = state_attr('input_datetime.kitchen_sleep_end', 'timestamp') %}
          {% if s is not number or e is not number %}
            false
          {% else %}
            {% set s = (s / 60) | int %}
            {% set e = (e / 60) | int %}
            {% if s == e %}
              false
            {% elif s < e %}
              {{ s <= now_m < e }}
            {% else %}
              {{ now_m >= s or now_m < e }}
            {% endif %}
          {% endif %}

  - binary_sensor:
      - name: Kitchen Should Sleep
        unique_id: kitchen_should_sleep
        state: >
          {{ is_state('input_boolean.kitchen_sleep_enabled', 'on')
             and is_state('binary_sensor.kitchen_sleep_window', 'on')
             and not is_state('input_boolean.kitchen_sleep_woken', 'on') }}

automation:
  - id: kitchen_sleep_clear_woken
    alias: "Kitchen: clear the sleep wake override"
    description: >
      A wake tap holds the screen on. It is released when the window opens or
      closes, and when the screensaver re-engages, so a 2am tap does not keep the
      screen on all night (plan correction 4 — remove the third trigger to get the
      spec's literal "until next sleep start").
    mode: single
    trigger:
      - platform: state
        entity_id: binary_sensor.kitchen_sleep_window
        to: "on"
      - platform: state
        entity_id: binary_sensor.kitchen_sleep_window
        to: "off"
      - platform: state
        entity_id: input_boolean.kitchen_idle
        to: "on"
    condition:
      - condition: state
        entity_id: input_boolean.kitchen_sleep_woken
        state: "on"
    action:
      - service: input_boolean.turn_off
        target:
          entity_id: input_boolean.kitchen_sleep_woken
```

- [ ] **Step 2: Lint**

Run: `npm run validate:yaml`

- [ ] **Step 3: Verify the window logic in the dev rig**

Run `GROCY_API_KEY=unused deploy/homeassistant/dev-setup.sh`, restart the dev container, and wait ~90 s. With `$TOKEN`, use `input_datetime.set_datetime` to set each case relative to the current time, wait up to a minute, and read `binary_sensor.kitchen_sleep_window`:

| start | end | expected |
|---|---|---|
| now−10 min | now+10 min | on |
| now+10 min | now+20 min | off |
| now−10 min | now−5 min (wraps midnight) | on |
| 00:00 | now+10 min | on — the midnight trap |
| 06:00 | 06:00 | off |

Then: enabled on + window on → `kitchen_should_sleep` on. Woken on → off. Set `input_boolean.kitchen_idle` on → woken clears → should_sleep back on.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add homeassistant/packages/sleep.yaml
git commit -m "feat(sleep): HA sleep window, should-sleep sensor and wake override"
```

---

### Task 15: Logic for the wake layer and sleep entities

**Files:**
- Modify: `custom_cards/panel-tools-card/src/logic.ts`, `custom_cards/panel-tools-card/test/logic.test.ts`

- [ ] **Step 1: Failing tests (append; add `shouldShowWakeLayer` to the import)**

```ts
describe("shouldShowWakeLayer", () => {
  const st = (s?: string) => ({ "binary_sensor.kitchen_should_sleep": s === undefined ? undefined : { state: s } });
  it("shows while HA says sleep", () => {
    expect(shouldShowWakeLayer(st("on"), 0, 1000)).toBe(true);
  });
  it("lingers after a wake tap so the trailing click is swallowed", () => {
    expect(shouldShowWakeLayer(st("off"), 2500, 1000)).toBe(true);
    expect(shouldShowWakeLayer(st("off"), 2500, 3000)).toBe(false);
  });
  it("is absent when awake, unknown, or the sensor is missing (never block the panel)", () => {
    expect(shouldShowWakeLayer(st("off"), 0, 1000)).toBe(false);
    expect(shouldShowWakeLayer(st("unavailable"), 0, 1000)).toBe(false);
    expect(shouldShowWakeLayer(st(), 0, 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure:** `npx vitest run test/logic.test.ts` → FAIL (`shouldShowWakeLayer` not exported).

- [ ] **Step 3: Implement — append to `logic.ts` and extend `ENTITIES`**

Add to the `ENTITIES` object:

```ts
  shouldSleep: "binary_sensor.kitchen_should_sleep",
  sleepEnabled: "input_boolean.kitchen_sleep_enabled",
  sleepWoken: "input_boolean.kitchen_sleep_woken",
  sleepStart: "input_datetime.kitchen_sleep_start",
  sleepEnd: "input_datetime.kitchen_sleep_end",
```

Append:

```ts
/** How long the wake layer stays after a tap. The tap's pointerdown records the wake;
 *  its click fires on pointerup. If the layer vanished first, that click would land on
 *  whatever is underneath — on Morning, a chore tile. */
export const WAKE_LINGER_MS = 1500;

export function shouldShowWakeLayer(
  states: Record<string, { state: string } | undefined>,
  lingerUntil: number,
  now: number,
): boolean {
  return states[ENTITIES.shouldSleep]?.state === "on" || now < lingerUntil;
}
```

- [ ] **Step 4: Run to verify pass:** `npx vitest run test/logic.test.ts && npm run typecheck` → `34 passed` in logic.test.ts.

- [ ] **Step 5: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/panel-tools-card/src/logic.ts custom_cards/panel-tools-card/test/logic.test.ts
git commit -m "feat(panel-tools): wake-layer decision with click-swallowing linger"
```

---

### Task 16: The card — wake layer and Sleep section

**Files:**
- Modify: `custom_cards/panel-tools-card/src/panel-tools-card.ts`

Skip Step 1 if Task 13 ruled out tap-to-wake ("2 or 3 fails"). Do Step 2 in every Phase B case.

- [ ] **Step 1: Wake layer**

Add `shouldShowWakeLayer` and `WAKE_LINGER_MS` to the `./logic` import. Add a field `private _lingerUntil = 0;`. Replace `_renderWakeLayer`:

```ts
  // Above EVERYTHING, including the screensaver overlay (9999): during sleep the
  // screensaver is up too, and this layer must own the tap. One tap = woken override
  // + activity press (clears idle) and nothing beneath receives it.
  protected _renderWakeLayer(): TemplateResult | typeof nothing {
    if (!this.hass || !shouldShowWakeLayer(this.hass.states, this._lingerUntil, Date.now())) return nothing;
    return html`<div class="wake" @pointerdown=${this._wake} @click=${this._swallow}></div>`;
  }

  private _swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  private _wake = (e: Event): void => {
    this._swallow(e);
    this._lingerUntil = Date.now() + WAKE_LINGER_MS;
    setTimeout(() => this.requestUpdate(), WAKE_LINGER_MS + 50);
    const target = (entity_id: string) => ({ entity_id });
    void this.hass?.callService("input_boolean", "turn_on", {}, target(ENTITIES.sleepWoken)).catch(() => undefined);
    void this.hass?.callService("input_button", "press", {}, target(ENTITIES.activity)).catch(() => undefined);
  };
```

Append to `static styles`:

```css
    .wake { position: fixed; inset: 0; z-index: 10000; background: transparent; touch-action: none; }
```

- [ ] **Step 2: Sleep section in the drawer**

Replace `_renderSleepSection`:

```ts
  protected _renderSleepSection(): TemplateResult {
    const on = this._state(ENTITIES.sleepEnabled) === "on";
    return html`
      <section>
        <h3>Sleep</h3>
        <div class="seg">
          <button class=${on ? "on" : ""} @click=${() => this._call("input_boolean", "turn_on", {}, ENTITIES.sleepEnabled)}>On</button>
          <button class=${!on ? "on" : ""} @click=${() => this._call("input_boolean", "turn_off", {}, ENTITIES.sleepEnabled)}>Off</button>
        </div>
        ${this._timeRow("Screen off at", ENTITIES.sleepStart)}
        ${this._timeRow("Screen on at", ENTITIES.sleepEnd)}
      </section>`;
  }
```

- [ ] **Step 3: Typecheck, test, build:** `npm run typecheck && npm run build && npx vitest run` → clean, guard passes.

- [ ] **Step 4: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/panel-tools-card/src/panel-tools-card.ts
git commit -m "feat(panel-tools): wake layer above the screensaver and sleep settings"
```

---

### Task 17: Pi sleep service — decision logic and message parsing

**Files:**
- Create: `deploy/sleep/kitchen_sleepd.py` (logic half), `deploy/sleep/test_kitchen_sleepd.py`

- [ ] **Step 1: Failing tests**

`deploy/sleep/test_kitchen_sleepd.py`:

```python
import pytest

import kitchen_sleepd as sd

E = sd.ENTITY


@pytest.mark.parametrize("should_sleep,expected", [
    ("on", "off"),
    ("off", "on"),
    ("unavailable", "on"),
    ("unknown", "on"),
    (None, "on"),
])
def test_connected_follows_ha_and_anything_unclear_is_on(should_sleep, expected):
    assert sd.desired(should_sleep, True, None, 100.0, "on") == expected


def test_disconnected_holds_dark_screen_within_grace():
    assert sd.desired(None, False, 100.0, 100.0 + sd.GRACE_S - 1, "off") == "off"


def test_disconnected_past_grace_turns_on():
    assert sd.desired(None, False, 100.0, 100.0 + sd.GRACE_S, "off") == "on"


def test_disconnected_never_turns_a_lit_screen_off():
    assert sd.desired(None, False, 100.0, 101.0, "on") == "on"


def test_startup_with_unknown_output_turns_on():
    # A reboot during the sleep window lit the screen (start-kiosk-wayland.sh:31);
    # we don't know the output state, so assert on until HA says otherwise.
    assert sd.desired(None, False, 0.0, 0.0, None) == "on"


def test_state_from_added():
    msg = {"type": "event", "event": {"a": {E: {"s": "on", "a": {}}}}}
    assert sd.state_from_event(msg, E) == "on"


def test_state_from_changed():
    msg = {"type": "event", "event": {"c": {E: {"+": {"s": "off"}}}}}
    assert sd.state_from_event(msg, E) == "off"


def test_attribute_only_change_is_no_change():
    msg = {"type": "event", "event": {"c": {E: {"+": {"a": {"x": 1}}}}}}
    assert sd.state_from_event(msg, E) is None


def test_removed_entity_reads_unavailable():
    msg = {"type": "event", "event": {"r": [E]}}
    assert sd.state_from_event(msg, E) == "unavailable"


def test_other_entities_are_ignored():
    msg = {"type": "event", "event": {"a": {"light.x": {"s": "on"}}}}
    assert sd.state_from_event(msg, E) is None


class FakeApply:
    def __init__(self, ok=True):
        self.calls = []
        self.ok = ok

    def __call__(self, want):
        self.calls.append(want)
        return self.ok


def test_daemon_turns_on_at_start_then_follows_ha():
    apply = FakeApply()
    d = sd.Daemon(apply, now=0.0)
    d.reconcile(0.0)
    d.on_connected()
    d.on_state("on", 1.0)
    d.on_state("on", 2.0)          # no repeat call for the same state
    d.on_state("off", 3.0)
    assert apply.calls == ["on", "off", "on"]


def test_daemon_disconnect_then_grace_relights():
    apply = FakeApply()
    d = sd.Daemon(apply, now=0.0)
    d.on_connected()
    d.on_state("on", 1.0)
    d.on_disconnect(10.0)
    d.reconcile(10.0 + sd.GRACE_S - 1)
    d.reconcile(10.0 + sd.GRACE_S)
    assert apply.calls == ["off", "on"]


def test_daemon_retries_a_failed_wlopm_on_the_next_tick():
    apply = FakeApply(ok=False)
    d = sd.Daemon(apply, now=0.0)
    d.reconcile(0.0)
    apply.ok = True
    d.reconcile(15.0)
    assert apply.calls == ["on", "on"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM && python3 -m pytest deploy/sleep -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'kitchen_sleepd'`.

- [ ] **Step 3: Implement the logic half**

`deploy/sleep/kitchen_sleepd.py`:

```python
#!/usr/bin/env python3
"""KitchenCOM panel sleep: HA's binary_sensor.kitchen_should_sleep -> wlopm.

Spec: docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md §3.
Runs as a systemd USER service (deploy/sleep/kitchen-sleepd.service), started
from the labwc autostart so the Wayland session exists.

FAILS ON. Every unclear case — unknown state, HA unreachable for GRACE_S, a bad
token, a crash (the unit's ExecStopPost) — ends with the screen lit.
"""
import json
import logging
import os
import subprocess
import time

ENTITY = "binary_sensor.kitchen_should_sleep"
GRACE_S = 300          # HA unreachable this long while dark -> turn on
TICK_S = 15            # reconcile cadence (grace checks, wlopm retries)
RETRY_S = 30           # reconnect backoff
HA_URL = os.environ.get("KC_HA_WS", "ws://localhost:8123/api/websocket")
TOKEN_PATH = os.path.expanduser(os.environ.get("KC_TOKEN_FILE", "~/.config/kitchencom/ha-token"))

log = logging.getLogger("kitchen-sleepd")


def desired(should_sleep, connected, down_since, now, current):
    """'on' or 'off' — what the panel output should be right now."""
    if connected:
        return "off" if should_sleep == "on" else "on"
    if current == "off" and down_since is not None and now - down_since < GRACE_S:
        return "off"
    return "on"


def state_from_event(msg, entity_id):
    """State from a subscribe_entities event, or None if this event doesn't change it."""
    ev = msg.get("event") or {}
    added = (ev.get("a") or {}).get(entity_id)
    if added is not None:
        return added.get("s")
    changed = (ev.get("c") or {}).get(entity_id)
    if changed is not None:
        return (changed.get("+") or {}).get("s")
    if entity_id in (ev.get("r") or []):
        return "unavailable"
    return None


class Daemon:
    def __init__(self, apply, now):
        self.apply = apply
        self.connected = False
        self.down_since = now
        self.should_sleep = None
        self.current = None     # unknown at start: reboot may have lit it

    def reconcile(self, now):
        want = desired(self.should_sleep, self.connected, self.down_since, now, self.current)
        if want != self.current and self.apply(want):
            self.current = want

    def on_connected(self):
        self.connected = True
        self.down_since = None

    def on_state(self, state, now):
        self.should_sleep = state
        self.reconcile(now)

    def on_disconnect(self, now):
        self.connected = False
        self.down_since = now
        self.should_sleep = None
        self.reconcile(now)


def apply_wlopm(want):
    try:
        r = subprocess.run(["wlopm", f"--{want}", "*"], timeout=10,
                           capture_output=True, text=True)
    except (OSError, subprocess.TimeoutExpired) as e:
        log.warning("wlopm --%s failed: %s", want, e)
        return False
    if r.returncode != 0:
        log.warning("wlopm --%s exit %s: %s", want, r.returncode, r.stderr.strip())
        return False
    log.info("output %s", want)
    return True
```

- [ ] **Step 4: Run to verify pass:** `python3 -m pytest deploy/sleep -q` → `17 passed`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add deploy/sleep/kitchen_sleepd.py deploy/sleep/test_kitchen_sleepd.py
git commit -m "feat(sleep): fail-on decision logic and websocket event parsing for the Pi"
```

---

### Task 18: Pi sleep service — websocket loop, systemd unit, docs

**Files:**
- Modify: `deploy/sleep/kitchen_sleepd.py` (append the I/O half)
- Create: `deploy/sleep/kitchen-sleepd.service`, `deploy/sleep/README.md`
- Modify: `deploy/kiosk/labwc-autostart`

- [ ] **Step 1: Append the websocket loop to `kitchen_sleepd.py`**

```python
class AuthFailed(Exception):
    pass


def read_token():
    with open(TOKEN_PATH, encoding="utf-8") as f:
        return f.read().strip()


async def session(daemon):
    import websockets  # apt: python3-websockets. Lazy so the tests don't need it.

    async with websockets.connect(HA_URL, ping_interval=20, ping_timeout=20, max_size=2**20) as ws:
        json.loads(await ws.recv())                      # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": read_token()}))
        res = json.loads(await ws.recv())
        if res.get("type") != "auth_ok":
            raise AuthFailed(res.get("message", res.get("type")))
        await ws.send(json.dumps({"id": 1, "type": "subscribe_entities", "entity_ids": [ENTITY]}))
        daemon.on_connected()
        log.info("connected; watching %s", ENTITY)
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "result" and not msg.get("success"):
                raise RuntimeError(f"subscribe failed: {msg.get('error')}")
            if msg.get("type") == "event":
                state = state_from_event(msg, ENTITY)
                if state is not None:
                    daemon.on_state(state, time.monotonic())


async def run():
    import asyncio

    daemon = Daemon(apply_wlopm, now=time.monotonic())
    daemon.reconcile(time.monotonic())                   # reconcile on start: lit

    async def ticker():
        while True:
            await asyncio.sleep(TICK_S)
            daemon.reconcile(time.monotonic())

    asyncio.get_running_loop().create_task(ticker())
    while True:
        try:
            await session(daemon)
            log.warning("HA closed the connection")
        except AuthFailed as e:
            log.error("HA rejected the token (%s) — screen will relight after %ss", e, GRACE_S)
        except Exception as e:  # noqa: BLE001 — any failure must leave us retrying, lit
            log.warning("HA connection failed: %s", e)
        daemon.on_disconnect(time.monotonic())
        await asyncio.sleep(RETRY_S)


if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(run())
```

- [ ] **Step 2: Re-run the tests:** `python3 -m pytest deploy/sleep -q` → `17 passed`, so the lazy import keeps the tests websocket-free.

- [ ] **Step 3: The systemd user unit**

`deploy/sleep/kitchen-sleepd.service`:

```ini
# KitchenCOM panel sleep — install to ~/.config/systemd/user/ (see deploy/sleep/README.md).
# Started from the labwc autostart, so it never runs before the Wayland session exists.
[Unit]
Description=KitchenCOM panel sleep (HA -> wlopm)
# These two MUST live in [Unit]. Under [Service] systemd ignores them silently, and a
# crash-looping service would flicker the screen all night (crash -> ExecStopPost on
# -> restart -> reconcile off -> crash). Hitting the limit stops the unit for good,
# and ExecStopPost leaves the screen ON.
StartLimitIntervalSec=600
StartLimitBurst=5

[Service]
Type=simple
Environment=WAYLAND_DISPLAY=wayland-0
ExecStart=/usr/bin/python3 /home/garrettdehart/kitchencom/deploy/sleep/kitchen_sleepd.py
# Runs however the service exits, crash included: never leave the panel dark.
# systemd does not glob, so wlopm receives a literal "*", which is what it wants.
ExecStopPost=/usr/bin/wlopm --on *
Restart=always
RestartSec=30
```

- [ ] **Step 4 (only if Task 13 routed to evdev): local touch wake**

Append to `kitchen_sleepd.py`, and start it from `run()` with `asyncio.get_running_loop().create_task(evdev_wake(daemon))` when the env var `KC_EVDEV_DEVICE` is set:

```python
async def evdev_wake(daemon):
    """Light the screen on any touch while dark, then tell HA (the wake layer can't:
    Chromium never saw the tap). Needs `python3-evdev` and the user in group `input`.
    KC_EVDEV_DEVICE = the touch device path from `libinput list-devices` (Task 13)."""
    import asyncio
    import urllib.request
    import evdev

    dev = evdev.InputDevice(os.environ["KC_EVDEV_DEVICE"])
    base = HA_URL.replace("ws://", "http://").replace("/api/websocket", "")

    def post(path, entity_id):
        req = urllib.request.Request(
            f"{base}/api/services/{path}", method="POST",
            data=json.dumps({"entity_id": entity_id}).encode(),
            headers={"Authorization": f"Bearer {read_token()}", "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5).read()

    async for ev in dev.async_read_loop():
        if ev.type == evdev.ecodes.EV_KEY and ev.value == 1 and daemon.current == "off":
            if daemon.apply("on"):
                daemon.current = "on"
            for path, eid in (("input_boolean/turn_on", "input_boolean.kitchen_sleep_woken"),
                              ("input_button/press", "input_button.kitchen_activity")):
                try:
                    await asyncio.to_thread(post, path, eid)
                except Exception as e:  # noqa: BLE001
                    log.warning("wake report %s failed: %s", eid, e)
```

Both calls are required: without `woken`, the sleep sensor turns the screen straight back off; without `activity`, the screensaver stays up.

- [ ] **Step 5: Start it from the labwc autostart**

Append to `deploy/kiosk/labwc-autostart`:

```sh
# Panel sleep service (2026-10-21) — started here, not at boot, so the Wayland
# session exists before it runs wlopm. See deploy/sleep/README.md.
systemctl --user start kitchen-sleepd.service &
```

- [ ] **Step 6: `deploy/sleep/README.md`**

```markdown
# Panel sleep service

HA decides (`binary_sensor.kitchen_should_sleep`, packages/sleep.yaml); this service
turns the panel output off/on with `wlopm`. It **fails on**: unknown state, HA gone for
5 minutes, a bad token, or a crash all leave the screen lit.

## Install (on the Pi)

    sudo apt install python3-websockets          # + python3-evdev only for the evdev fallback
    mkdir -p ~/.config/kitchencom ~/.config/systemd/user
    # HA → Profile → Security → Long-lived access token, named "kitchen-sleepd":
    printf '%s' '<token>' > ~/.config/kitchencom/ha-token && chmod 600 ~/.config/kitchencom/ha-token
    cp ~/kitchencom/deploy/sleep/kitchen-sleepd.service ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user start kitchen-sleepd.service
    journalctl --user -u kitchen-sleepd -f        # expect "connected; watching ..."

The token is never committed. If it is revoked, the service logs "HA rejected the token"
and the screen relights after 5 minutes.

## ⚠ When Sleep Mode silently stops working

If the service crashes 5 times in 10 minutes, systemd gives up. The screen stays **on**
(correct), but Sleep Mode is off and **the panel shows no sign of it**. Check:

    systemctl --user status kitchen-sleepd.service    # "start-limit-hit" / failed

Find the cause in `journalctl --user -u kitchen-sleepd`, fix it, then:

    systemctl --user reset-failed kitchen-sleepd.service
    systemctl --user start kitchen-sleepd.service

A reboot also clears it.
```

- [ ] **Step 7: Validate the unit file syntax locally if possible** (`systemd-analyze` isn't on macOS). Instead: `grep -n "StartLimit" deploy/sleep/kitchen-sleepd.service` must show both lines **above** `[Service]`. On the Pi (Task 19), run `systemd-analyze --user verify ~/.config/systemd/user/kitchen-sleepd.service`.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add deploy/sleep deploy/kiosk/labwc-autostart
git commit -m "feat(sleep): Pi websocket service, fail-on systemd unit and recovery docs"
```

---

### Task 19: Deploy Phase B — NEEDS HOME NETWORK + GARRETT AT THE PANEL

- [ ] **Step 1:** Network gate, same as Task 12 Step 1.
- [ ] **Step 2:** Back up the Pi's live packages, then copy `sleep.yaml`, restart HA, and wait ~90 s. Check all five sleep entities exist (recorder DB).
- [ ] **Step 3:** Copy the rebuilt `panel-tools-card.js`, bump `?v=`, and clear the kiosk Service Worker.
- [ ] **Step 4:** Pull the repo onto the Pi (`~/kitchencom`) and install the service per `deploy/sleep/README.md`. Run `systemd-analyze --user verify` on the unit and confirm `connected; watching` in the journal.
- [ ] **Step 5:** Update the Pi's `~/.config/labwc/autostart`. **Append** the line; don't clobber the file.

---

### Task 20: Verify Sleep Mode at the panel — NEEDS GARRETT

- [ ] **Step 1: The stacking check (spec §3).** Set a sleep window starting 2 minutes from now and lasting 10, with Sleep on, and force `input_boolean.kitchen_idle` on. When the screen goes dark, Garrett taps **where a chore tile would be on Morning**. Expected: the screen lights, the screensaver is dismissed, and **no claim dialog appears**. A claim dialog means the wake layer is under the screensaver overlay. Fix the stacking before going on; HA's card wrappers may be the stacking context.
- [ ] **Step 2: Lag.** The screen turns off within ~2 s of the window opening, and lights within ~2 s of the tap.
- [ ] **Step 3: Fail-on.** While dark: `systemctl --user stop kitchen-sleepd` → the screen lights (ExecStopPost). Start it again → dark again. While dark: stop HA's container → the screen lights within ~5 min.
- [ ] **Step 4: Reboot during the window** → the panel comes up and goes dark once the service connects.
- [ ] **Step 5: Touch after wake.** After the window ends, touch works on a harmless control (the spec §7 step 6 risk, now under real conditions).
- [ ] **Step 6: The 4am restart.** With Sleep active, run `deploy/kiosk/restart-kiosk-renderer.sh` by hand. The screen must stay dark.
- [ ] **Step 7: Record the results** in the cold-open doc §4e and update memory `sleep-settings-photos-designed.md`, which now becomes "built". Commit.

---

## Self-review (done while writing)

- **Spec coverage.**
  - §2 card + corner icons + activity: Tasks 9–10, correction 3.
  - §3 HA side: Task 14.
  - §3 wake layer + stacking: Tasks 16 and 20.1.
  - §3 Pi websocket, reconcile, fail-on, RestartSec/StartLimit in [Unit], recovery doc: Tasks 17–18.
  - §3 evdev fallback with both calls: Task 18.4.
  - §4 PIN in git: Task 11.
  - §4 drawer contents and screensaver delay: Tasks 7 and 9.
  - §5 overlay, skipped files, videos, sibling folder, hex/UTF-8, zero decodes, collisions, real path, restart lag, memory budget: Tasks 3–6, 10 and 12.2.
  - §6 deploy constraints: Tasks 12 and 19.
  - §7 test: Task 13.
- **Placeholder scan.** The PIN is intentionally Garrett's choice (Task 11 Step 1). No other gaps.
- **Type consistency.**
  - `collectPlayable` / `BrowseLeaf` / `BrowseTree`: defined in Task 1, used in Tasks 9–10.
  - `ShellResult` / `parseShellResponse`: Task 4 → Task 10.
  - `ENTITIES` keys: Task 4 + Task 15, used in Tasks 9 and 16.
  - `shouldShowWakeLayer(states, lingerUntil, now)`: Task 15 → Task 16.
  - `Daemon(apply, now)` / `on_connected` / `on_state(state, now)` / `on_disconnect(now)`: Task 17 → Task 18.
