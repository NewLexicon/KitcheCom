# Sleep Mode, Settings Drawer, Photos Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PIN-gated settings drawer, a photos overlay (see + hide), and an overnight Sleep Mode to the kitchen panel.

**Architecture:** One new bundled Lovelace card, `panel-tools-card`, draws corner icons, the drawer and the photos overlay. Photo moves run inside the HA container through `shell_command` and a small Python script. Sleep (Phase B, revised 2026-10-22) is "black, not off": an HA template sensor marks the sleep window and `screensaver-card` shows plain black instead of photos while idle inside it — no Pi-side code.

**Tech Stack:** TypeScript + Lit 3 + Vite (bundled, like the sibling cards), Vitest, HA YAML packages, Python 3 stdlib + pytest.

**Spec:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md`

---

## Phasing — read this first

**Phase A (Tasks 1–12) ships whatever the touch test says:** photos overlay + settings drawer (view times, theme, screensaver delay).

**Task 13 was the gate:** the spec §7 panel touch test. ✅ Run 2026-10-22 — output-off doesn't stick on this monitor, so Phase B was redesigned.

**Phase B (Tasks 14–17, rewritten 2026-10-22): Sleep Mode as "black, not off".** The HA sleep package and night-wake duration, the screensaver's sleeping state, the drawer's Sleep section, then deploy. The old Tasks 14–20 (wake layer, woken flag, Pi `wlopm` service) are deleted.

**Network:** Tasks 1–11 and 14–16 are laptop-only. Tasks 12, 13 and 17 need the **home network with the GSU VPN disconnected** (`nc -z -G 6 192.168.1.234 22`) and Garrett at the panel.

## Corrections to the spec, made while planning (verified in source)

1. **Media ids are NOT percent-encoded, so the filename gets zero decodes, not one.** HA builds local ids from the raw path: `reference/core-dev/homeassistant/components/media_source/local_source.py:250` — `identifier=f"{source_dir_id}/{path.relative_to(...)}"`. The card takes the text after `…/local/photos/` verbatim. Calling `decodeURIComponent` would break a file named `50%off.jpg`. Spec §5's "decode exactly once" is superseded by this.
2. **No `configuration.yaml` change is needed.** `homeassistant/configuration.yaml:7` loads `packages: !include_dir_named packages`, so `shell_command:` can live in a package. An HA restart is still required.
3. **Taps in the drawer/overlay already count as activity.** `screensaver-card` listens on `window` in the capture phase (`screensaver-card.ts:425-428`) and is on all three time views (`kitchen.yaml` lines 50, 454, 2310). No extra wiring needed.
4. **(Superseded 2026-10-22 — there is no woken override in the revised Phase B.)** ~~Needs Garrett's OK — the woken override also clears when the screensaver re-engages.** The spec says woken clears "at the next sleep start". Taken literally, a kid tapping at 2 am keeps the screen on for the rest of the night. Task 14 also clears it when `input_boolean.kitchen_idle` turns on, so the panel goes back to sleep once the screensaver delay passes after the last touch. If Garrett prefers the spec's literal behavior, delete the third trigger in Task 14.~~
5. **(Resolved 2026-10-21 — `initial: Dark` removed with Garrett's OK, Task 7.)** The theme switch reset on every HA restart. `homeassistant/packages/theme.yaml` sets `initial: Dark`, so a Light choice made in the drawer reverts to Dark on restart. Ask Garrett whether to remove `initial:`. That's a one-line change, kept out of this plan because it changes existing behavior.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `custom_cards/screensaver-card/src/media-browse.ts` | create | Shared media-folder walk: supported extensions, browse id, leaf/dir selection, bounded BFS. The one place "what is in rotation" is defined. |
| `custom_cards/screensaver-card/src/screensaver-card.ts` | modify | Re-export from `media-browse.ts`; `_collectMedia` delegates to `collectPlayable`. |
| `custom_cards/screensaver-card/test/collect-playable.test.ts` | create | Tests for the extracted BFS. |
| `custom_cards/panel-tools-card/` (package.json, tsconfig*.json, vite.config.ts, vitest.config.ts) | create | Package scaffold, copied from tod-autonav-card. |
| `custom_cards/panel-tools-card/src/logic.ts` | create | Pure logic: entity ids, filename/hex, PIN, paging, skipped files, minute steps, time format, shell response parsing, sleep hint. No Lit import. |
| `custom_cards/panel-tools-card/src/panel-tools-card.ts` | create | Lit glue: corner icons, PIN pad, drawer (incl. Sleep section), photos overlay. |
| `custom_cards/panel-tools-card/test/logic.test.ts` | create | Unit tests for `logic.ts`. |
| `custom_cards/panel-tools-card/test/dist-browser-loadable.test.ts` | create | Bundle guard (bare imports = unloadable card). |
| `homeassistant/kitchencom/photo_move.py` | create | Runs in the HA container: `list` / `hide <hex>` / `unhide <hex>`. |
| `homeassistant/kitchencom/test_photo_move.py` | create | pytest for the script. |
| `homeassistant/packages/photos.yaml` | create | `shell_command` entries. |
| `homeassistant/packages/screensaver.yaml` | modify | `input_number.kitchen_screensaver_minutes`; every `timer.start` of `kitchen_inactivity` passes a duration from it. |
| `homeassistant/packages/sleep.yaml` | create (B) | Sleep helpers + window sensor. Phase B's own file table (under "PHASE B") lists every B file. |
| `homeassistant/dashboards/kitchen.yaml` | modify | Add `custom:panel-tools-card` to the three time views. |
| `deploy/homeassistant/dev-setup.sh` | modify | Copy `homeassistant/kitchencom/` + create media folders in the dev rig. |
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
- Modify: `homeassistant/packages/theme.yaml` (remove `initial: Dark` — Garrett approved 2026-10-21)

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

- [ ] **Step 3: Stop the theme resetting on restart (approved 2026-10-21)**

In `homeassistant/packages/theme.yaml`, delete the line `    initial: Dark` under
`input_select.kitchen_theme`, and put this comment in its place at the same indent:

```yaml
    # No `initial:` (removed 2026-10-21): it reset a Light choice made from the
    # panel's settings drawer back to Dark on every HA restart. input_select
    # restores its last state; the apply automation re-applies it on start.
```

- [ ] **Step 4: Lint**

Run: `npm run validate:yaml`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add homeassistant/packages/screensaver.yaml homeassistant/packages/theme.yaml
git commit -m "feat(screensaver): delay comes from an input_number the drawer can set; theme survives restarts"
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

- [ ] **Step 1: The PIN**

Garrett chose **`0510`** on 2026-10-21, knowing it is committed to git (kitchen.yaml is tracked).

- [ ] **Step 2: Add the card to the three time views**

Directly after each `- type: custom:tod-autonav-card` block on the Morning, Afternoon and Evening views, add (same indentation):

```yaml
          # ⚙ settings drawer + 🖼 photos overlay (spec 2026-10-21). Renders two
          # small fixed corner icons; takes no grid space. The PIN is kid-proof,
          # NOT secure — it is in git and readable by the panel user.
          - type: custom:panel-tools-card
            pin: "0510"
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

### Task 13: Panel touch test — ✅ RUN 2026-10-22; it changed Phase B

Run with Garrett at the panel; the full record is in spec §7 "Result". **`wlopm --off` does not
stick:** ~9.5 s later the ViewSonic hotplugs and labwc (not kanshi) turns the output back on.
Touch survived (step 6 passed). Garrett chose **"black, not off"** (approach B) and accepted the
backlight glow. Spec §3 was rewritten; the old Phase B (Pi service, wlopm, systemd unit, HA token
on the Pi, wake layer, woken flag, evdev fallback) is **deleted** and replaced by Tasks 14–17
below.

---

# PHASE B — Sleep Mode, "black, not off" (spec §3, revised 2026-10-22)

**What it does:** during the sleep window, once the panel is idle, the screensaver shows plain
black instead of photos. A tap wakes it exactly as today, for **2 minutes** at night. No Pi-side
code at all.

**Network:** Tasks 14–16 are laptop-only (Task 14 needs Docker Desktop for the dev-HA rig).
Task 17 needs the **home network with the GSU VPN disconnected** and Garrett at the panel.

**Phase B file structure**

| File | Status | Responsibility |
|---|---|---|
| `homeassistant/packages/sleep.yaml` | create | Sleep helpers + `binary_sensor.kitchen_sleep_window` (plain template, raw times). |
| `homeassistant/packages/screensaver.yaml` | modify | Wake + HA-startup automations restart the timer at `00:02:00` inside the window. |
| `deploy/homeassistant/dev-setup.sh` | modify | Stage `sleep.yaml` in the dev rig. |
| `deploy/homeassistant/dev-token.py` | create | Print an access token for the dev rig's `dev` user (no UI clicking). |
| `deploy/homeassistant/check-sleep-window.py` | create | Dev-rig check of the window sensor + night-wake duration. |
| `deploy/tools/ha-recorder-state.py` | create | Read an entity's latest state + attributes from the Pi's recorder DB — no token needed. |
| `custom_cards/screensaver-card/src/screensaver-card.ts` | modify | `displayState()`, `sleep_entity` config, three-state lifecycle, black render. |
| `custom_cards/screensaver-card/test/display-state.test.ts` | create | Pure-function tests incl. fail-on. |
| `custom_cards/screensaver-card/test/sleep-lifecycle.test.ts` | create | Element-level tests: no `<img>` while sleeping, no change while not idle, in-flight resolve, no browse at night. |
| `custom_cards/screensaver-card/test/resolve-config.test.ts` | modify | `sleepEntity` default + override. |
| `custom_cards/panel-tools-card/src/logic.ts` | modify | Sleep entity ids + `showSleepHint()`. |
| `custom_cards/panel-tools-card/test/logic.test.ts` | modify | `showSleepHint` tests. |
| `custom_cards/panel-tools-card/src/panel-tools-card.ts` | modify | Fill in `_renderSleepSection()` (the hook already exists). |

---

### Task 14: HA sleep package, night-wake duration, dev-rig checks

**Files:**
- Create: `homeassistant/packages/sleep.yaml`
- Modify: `homeassistant/packages/screensaver.yaml` (the automations at `:84` and `:105`)
- Modify: `deploy/homeassistant/dev-setup.sh:59-64`
- Create: `deploy/homeassistant/dev-token.py`, `deploy/homeassistant/check-sleep-window.py`
- Create: `deploy/tools/ha-recorder-state.py`

- [ ] **Step 1: Create `homeassistant/packages/sleep.yaml`**

```yaml
# Sleep Mode — spec docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md §3
# ("black, not off", revised 2026-10-22).
#
# During the sleep window the idle screensaver shows plain black instead of
# photos: screensaver-card reads binary_sensor.kitchen_sleep_window. Nothing here
# touches the display — `wlopm --off` does not stick on this ViewSonic (labwc
# relights it ~10 s later, spec §7 Result).
#
# Sleep needs the screensaver: go-idle is gated on
# input_boolean.kitchen_screensaver_enabled (screensaver.yaml), so with that
# switch off the panel never idles and therefore never sleeps.

input_boolean:
  # No `initial:` — restores across restarts. Off until set in the drawer.
  kitchen_sleep_enabled:
    name: Sleep mode
    icon: mdi:sleep

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
  # A PLAIN template sensor, deliberately NOT trigger-based like time_of_day.yaml:
  # HA re-renders it every minute (it uses now()) AND immediately when a helper it
  # reads changes, so a drawer edit takes effect at once.
  - binary_sensor:
      - name: Kitchen sleep window
        unique_id: kitchen_sleep_window
        icon: mdi:weather-night
        # RAW times, no fallback (unlike time_of_day.yaml:61-63): 00:00 is a real
        # choice, start == end is an EMPTY window (00:00 -> 00:00 included), and an
        # unavailable helper means not sleeping.
        state: >
          {% set s = state_attr('input_datetime.kitchen_sleep_start', 'timestamp') %}
          {% set e = state_attr('input_datetime.kitchen_sleep_end', 'timestamp') %}
          {% if not is_state('input_boolean.kitchen_sleep_enabled', 'on') or s is none or e is none %}
            false
          {% else %}
            {% set s = (s | int) // 60 %}
            {% set e = (e | int) // 60 %}
            {% set n = now().hour * 60 + now().minute %}
            {% if s == e %}
              false
            {% elif s < e %}
              {{ s <= n and n < e }}
            {% else %}
              {{ n >= s or n < e }}
            {% endif %}
          {% endif %}
```

- [ ] **Step 2: Night-wake duration in `screensaver.yaml`**

The same duration template appears **three** times. Change only the two under the aliases
`"Kitchen — wake on activity ping (M-10 browser->HA bridge)"` (`:84`) and
`"Kitchen — start inactivity timer on HA startup"` (`:105`). **Leave** the one under
`"Kitchen — start inactivity timer when the screensaver is enabled"` (`:68`): someone switching
the screensaver on is awake anyway.

In each of those two automations, replace:

```yaml
        data:
          # Clamped to the helper's own range; an unknown state falls back to 30.
          duration: >
            {% set m = states('input_number.kitchen_screensaver_minutes') | float(30) | int %}
            {% set m = [5, [m, 120] | min] | max %}
            {{ '%02d:%02d:00' % (m // 60, m % 60) }}
```

with:

```yaml
        data:
          # Night wake (spec §3): inside the sleep window a tap (or an HA restart)
          # lights the panel for 2 minutes, not the full delay. Otherwise clamped to
          # the helper's own range; an unknown state falls back to 30.
          duration: >
            {% if is_state('binary_sensor.kitchen_sleep_window', 'on') %}00:02:00{% else %}
            {%- set m = states('input_number.kitchen_screensaver_minutes') | float(30) | int %}
            {%- set m = [5, [m, 120] | min] | max %}
            {{- '%02d:%02d:00' % (m // 60, m % 60) }}{% endif %}
```

Check: `grep -c "00:02:00" homeassistant/packages/screensaver.yaml` → `2`, and
`grep -c "kitchen_screensaver_minutes') | float(30)" homeassistant/packages/screensaver.yaml` → `3`.

- [ ] **Step 3: Stage `sleep.yaml` in the dev rig**

In `deploy/homeassistant/dev-setup.sh`, the `find … -delete` at `:63-64` keeps an allowlist of
packages. Add `sleep.yaml` to it, and update the comment above it (`:59-61`) to say sleep.yaml is
now included (remove the "add sleep.yaml … in Phase B" reminder):

```bash
  ! -name 'grocy_recipes.yaml' ! -name 'photos.yaml' ! -name 'screensaver.yaml' \
  ! -name 'theme.yaml' ! -name 'time_of_day.yaml' ! -name 'sleep.yaml' -delete
```

- [ ] **Step 4: Create `deploy/homeassistant/dev-token.py`**

```python
#!/usr/bin/env python3
"""Print an access token for the dev-HA rig (http://localhost:8124, user dev/devdev123).

Dev rig ONLY — these credentials exist nowhere else. Uses HA's login flow, so no
long-lived token has to be clicked together in the UI. If the rig was never
onboarded (fresh .storage), onboard it first: POST /api/onboarding/users with
{client_id, name, username, password, language} — see the cold-open §2.

  TOKEN=$(python3 deploy/homeassistant/dev-token.py)
"""
import json
import os
import urllib.parse
import urllib.request

BASE = os.environ.get("HA_URL", "http://localhost:8124")
CLIENT = BASE + "/"


def post(path, data, form=False):
    body = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
    ctype = "application/x-www-form-urlencoded" if form else "application/json"
    req = urllib.request.Request(BASE + path, body, {"Content-Type": ctype})
    return json.load(urllib.request.urlopen(req))


flow = post("/auth/login_flow", {"client_id": CLIENT, "handler": ["homeassistant", None], "redirect_uri": CLIENT})
step = post("/auth/login_flow/" + flow["flow_id"], {"client_id": CLIENT, "username": "dev", "password": "devdev123"})
if "result" not in step:
    raise SystemExit(f"login failed: {step.get('errors')} — is the rig onboarded with dev/devdev123?")
token = post("/auth/token", {"grant_type": "authorization_code", "code": step["result"], "client_id": CLIENT}, form=True)
print(token["access_token"])
```

- [ ] **Step 5: Create `deploy/homeassistant/check-sleep-window.py`**

```python
#!/usr/bin/env python3
"""Check binary_sensor.kitchen_sleep_window and the night-wake duration on the dev-HA rig.

Builds windows around the rig's CURRENT local time, sets the sleep helpers, and
compares the sensor with the expected answer. DEV RIG ONLY — it rewrites the sleep
helpers, so never point it at the Pi.

  TOKEN=$(python3 deploy/homeassistant/dev-token.py) python3 deploy/homeassistant/check-sleep-window.py
"""
import datetime
import json
import os
import time
import urllib.request
import zoneinfo

BASE = os.environ.get("HA_URL", "http://localhost:8124")
HEAD = {"Authorization": "Bearer " + os.environ["TOKEN"], "Content-Type": "application/json"}
SENSOR = "binary_sensor.kitchen_sleep_window"


def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(BASE + path, headers=HEAD)))


def call(domain, service, data):
    req = urllib.request.Request(f"{BASE}/api/services/{domain}/{service}", json.dumps(data).encode(), HEAD)
    urllib.request.urlopen(req).read()


def hhmm(minutes):
    m = minutes % 1440
    return f"{m // 60:02d}:{m % 60:02d}:00"


def set_window(start, end, enabled=True):
    call("input_boolean", "turn_on" if enabled else "turn_off", {"entity_id": "input_boolean.kitchen_sleep_enabled"})
    call("input_datetime", "set_datetime", {"entity_id": "input_datetime.kitchen_sleep_start", "time": start})
    call("input_datetime", "set_datetime", {"entity_id": "input_datetime.kitchen_sleep_end", "time": end})
    time.sleep(2)  # plain template sensor re-renders on helper change; give it a beat
    return get(f"/api/states/{SENSOR}")["state"]


tz = zoneinfo.ZoneInfo(get("/api/config")["time_zone"])
now = datetime.datetime.now(tz)
n = now.hour * 60 + now.minute
print(f"rig local time {now:%H:%M} ({tz})")

cases = [
    ("normal window containing now", hhmm(n - 60), hhmm(n + 60), True, "on"),
    ("normal window after now", hhmm(n + 60), hhmm(n + 120), True, "off"),
    ("wrapping window containing now", hhmm(n - 60), hhmm(n - 120), True, "on"),
    ("wrapping window not containing now", hhmm(n + 30), hhmm(n - 30), True, "off"),
    ("start == end (empty)", hhmm(n), hhmm(n), True, "off"),
    ("00:00 -> 00:00 (empty, no fallback)", "00:00:00", "00:00:00", True, "off"),
    ("disabled, window containing now", hhmm(n - 60), hhmm(n + 60), False, "off"),
]
failed = 0
for label, start, end, enabled, want in cases:
    got = set_window(start, end, enabled)
    ok = got == want
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  {label}: {start}->{end} enabled={enabled} -> {got} (want {want})")


def wake_duration():
    call("input_button", "press", {"entity_id": "input_button.kitchen_activity"})
    time.sleep(2)
    return get("/api/states/timer.kitchen_inactivity")["attributes"].get("duration")


set_window(hhmm(n - 60), hhmm(n + 60), True)
got = wake_duration()
failed += got != "0:02:00"
print(f"{'PASS' if got == '0:02:00' else 'FAIL'}  night wake inside window -> {got} (want 0:02:00)")

set_window(hhmm(n - 60), hhmm(n + 60), False)
minutes = int(float(get("/api/states/input_number.kitchen_screensaver_minutes")["state"]))
want = f"{minutes // 60}:{minutes % 60:02d}:00"
got = wake_duration()
failed += got != want
print(f"{'PASS' if got == want else 'FAIL'}  wake outside window -> {got} (want {want})")

raise SystemExit(1 if failed else 0)
```

- [ ] **Step 6: Create `deploy/tools/ha-recorder-state.py`**

```python
"""Print the latest RECORDED state of each entity given, with timer attributes.

Runs INSIDE the HA container, fed on stdin, so no API token is needed:

  ssh kitchencom 'sudo docker exec -i homeassistant python3 - timer.kitchen_inactivity' \
    < deploy/tools/ha-recorder-state.py

The recorder DB, not the entity registry, is the live-state record (memory
entity-registry-is-not-live-state.md).
"""
import json
import sqlite3
import sys

db = sqlite3.connect("/config/home-assistant_v2.db")
for eid in sys.argv[1:]:
    row = db.execute(
        """select s.state, a.shared_attrs, datetime(s.last_updated_ts, 'unixepoch')
           from states s join states_meta m on s.metadata_id = m.metadata_id
           left join state_attributes a on s.attributes_id = a.attributes_id
           where m.entity_id = ? order by s.last_updated_ts desc limit 1""",
        (eid,),
    ).fetchone()
    if row is None:
        print(f"{eid}: NOT RECORDED")
        continue
    attrs = json.loads(row[1]) if row[1] else {}
    keep = {k: attrs[k] for k in ("duration", "remaining", "finishes_at") if k in attrs}
    print(f"{eid}: {row[0]}  (updated {row[2]} UTC)  {json.dumps(keep) if keep else ''}")
```

- [ ] **Step 7: Validate YAML**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM && npm run validate:yaml`
Expected: the only errors are the two known `missing starting space in comment` false positives
in `kitchen.yaml` (cold-open §2). Nothing in `sleep.yaml` or `screensaver.yaml`.

- [ ] **Step 8: Run the dev-rig checks** (needs Docker Desktop running)

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
GROCY_API_KEY=unused deploy/homeassistant/dev-setup.sh
docker compose -f deploy/homeassistant/docker-compose.ha-dev.yml up -d --force-recreate
# HA answers ~20 s after start, but new YAML entities take ~60-90 s (memory ha-yaml-entities-appear-late.md)
until curl -s -o /dev/null -w '%{http_code}' http://localhost:8124/ | grep -q 200; do sleep 3; done
export TOKEN=$(python3 deploy/homeassistant/dev-token.py)
until curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8124/api/states/binary_sensor.kitchen_sleep_window | grep -q '"state"'; do sleep 5; done
python3 deploy/homeassistant/check-sleep-window.py
```

Expected: 9 `PASS` lines, exit 0. If `dev-token.py` reports `login failed`, the rig lost its
`.storage`: onboard it (cold-open §2) and rerun.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # expect feat/time-of-day-layouts
git add homeassistant/packages/sleep.yaml homeassistant/packages/screensaver.yaml \
  deploy/homeassistant/dev-setup.sh deploy/homeassistant/dev-token.py \
  deploy/homeassistant/check-sleep-window.py deploy/tools/ha-recorder-state.py
git commit -m "feat(sleep): sleep window sensor and 2-minute night wake

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: screensaver-card — the sleeping state (TDD)

**Files:**
- Modify: `custom_cards/screensaver-card/src/screensaver-card.ts`
- Create: `custom_cards/screensaver-card/test/display-state.test.ts`
- Create: `custom_cards/screensaver-card/test/sleep-lifecycle.test.ts`
- Modify: `custom_cards/screensaver-card/test/resolve-config.test.ts`

Background: tests run in vitest's **`node` environment** (no DOM). Element tests build the card
with `Object.create(ScreensaverCard.prototype)` and define fields as **own properties**, because
assigning a Lit reactive property on a bare instance hits Lit's setter, which needs internals the
instance doesn't have (see `test/activity-bridge-wiring.test.ts:40-60`). `render()` returns a Lit
`TemplateResult`; the tests flatten its `strings`/`values` to text and look for `<img`.

- [ ] **Step 1: Write the failing pure-function test** — `test/display-state.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { displayState, SLEEP_ENTITY } from "../src/screensaver-card";

const hass = (idle?: string, sleep?: string) => {
  const states: Record<string, { state: string }> = {};
  if (idle !== undefined) states["input_boolean.kitchen_idle"] = { state: idle };
  if (sleep !== undefined) states[SLEEP_ENTITY] = { state: sleep };
  return { states } as any;
};

describe("displayState", () => {
  it("defaults the sleep entity to binary_sensor.kitchen_sleep_window", () => {
    expect(SLEEP_ENTITY).toBe("binary_sensor.kitchen_sleep_window");
  });
  it("is off when not idle, whatever the sleep window says", () => {
    expect(displayState(hass("off", "on"))).toBe("off");
    expect(displayState(hass("off", "off"))).toBe("off");
  });
  it("is off when hass or the idle entity is missing", () => {
    expect(displayState(undefined)).toBe("off");
    expect(displayState(hass(undefined, "on"))).toBe("off");
  });
  it("is sleeping when idle and the window is on", () => {
    expect(displayState(hass("on", "on"))).toBe("sleeping");
  });
  it("shows photos when idle and the window is off", () => {
    expect(displayState(hass("on", "off"))).toBe("photos");
  });
  it.each([["missing", undefined], ["unavailable", "unavailable"], ["unknown", "unknown"]])(
    "fails ON: a %s sleep entity shows photos, never black",
    (_label, sleep) => {
      expect(displayState(hass("on", sleep))).toBe("photos");
    },
  );
  it("honours custom idle and sleep entities", () => {
    const h = { states: { "input_boolean.den_idle": { state: "on" }, "binary_sensor.den_sleep": { state: "on" } } } as any;
    expect(displayState(h, "input_boolean.den_idle", "binary_sensor.den_sleep")).toBe("sleeping");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card && npx vitest run test/display-state.test.ts`
Expected: FAIL — `displayState` / `SLEEP_ENTITY` are not exported.

- [ ] **Step 3: Add `displayState` and `SLEEP_ENTITY`**

In `src/screensaver-card.ts`, directly after `isScreensaverActive` (`:24-26`), add:

```ts
// Sleep Mode (spec §3, "black, not off"): during the sleep window the idle
// screensaver shows plain black instead of photos. The display itself stays on —
// wlopm output-off doesn't stick on the ViewSonic (spec §7 Result).
export const SLEEP_ENTITY = "binary_sensor.kitchen_sleep_window";

export type DisplayState = "off" | "photos" | "sleeping";

/** What the overlay should show. Fail ON: a missing / unavailable / unknown sleep
 *  entity is NOT sleeping, so the panel shows photos rather than going black. */
export function displayState(
  hass?: HassLike,
  idleEntity: string = IDLE_ENTITY,
  sleepEntity: string = SLEEP_ENTITY,
): DisplayState {
  if (!isScreensaverActive(hass, idleEntity)) return "off";
  return hass?.states?.[sleepEntity]?.state === "on" ? "sleeping" : "photos";
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run test/display-state.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Add the `sleep_entity` config test** — append to `test/resolve-config.test.ts`

Read the file's existing import line first and add `SLEEP_ENTITY` to it if it isn't imported.
Then append:

```ts
describe("resolveConfig sleep_entity", () => {
  it("defaults to the kitchen sleep window", () => {
    expect(resolveConfig({}).sleepEntity).toBe(SLEEP_ENTITY);
  });
  it("accepts an override", () => {
    expect(resolveConfig({ sleep_entity: "binary_sensor.den_sleep" }).sleepEntity).toBe("binary_sensor.den_sleep");
  });
  it("ignores an empty or non-string value", () => {
    expect(resolveConfig({ sleep_entity: "" }).sleepEntity).toBe(SLEEP_ENTITY);
    expect(resolveConfig({ sleep_entity: 3 }).sleepEntity).toBe(SLEEP_ENTITY);
  });
});
```

Run: `npx vitest run test/resolve-config.test.ts` → FAIL (`sleepEntity` undefined).

- [ ] **Step 6: Add `sleepEntity` to the config**

In `ScreensaverConfig` (`:162`) add `sleepEntity: string;` after `activityBridge`. In
`resolveConfig`'s returned object, after `activityBridge`, add:

```ts
    sleepEntity:
      typeof raw.sleep_entity === "string" && raw.sleep_entity ? raw.sleep_entity : SLEEP_ENTITY,
```

Run: `npx vitest run test/resolve-config.test.ts` → PASS.

- [ ] **Step 7: Write the failing lifecycle tests** — `test/sleep-lifecycle.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { nothing } from "lit";
import { ScreensaverCard, SLEEP_ENTITY } from "../src/screensaver-card";

// Node environment, no DOM: build the card without Lit's lifecycle. Reactive
// fields are defined as OWN properties so assignments skip Lit's setter (which
// needs internals a bare Object.create instance lacks).
function own(obj: object, key: string, value: unknown): void {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true });
}

function states(idle: string, sleep: string) {
  return { "input_boolean.kitchen_idle": { state: idle }, [SLEEP_ENTITY]: { state: sleep } };
}

function makeCard(idle: string, sleep: string, callWS: (msg: any) => Promise<any>) {
  const card = Object.create(ScreensaverCard.prototype) as any;
  for (const [k, v] of Object.entries({
    _display: "off", _mode: "fallback", _currentUrl: "", _currentKind: "image", _now: "",
  })) own(card, k, v);
  Object.assign(card, {
    _items: [], _index: 0, _currentUrls: [], _pairedShown: new Set(), _currentFit: "cover",
    _gen: 0, _loopRunning: false, _timer: undefined, _clock: undefined,
  });
  card.setConfig({});
  own(card, "hass", { states: states(idle, sleep), callWS });
  return card;
}

function setStates(card: any, idle: string, sleep: string): void {
  own(card, "hass", { ...card.hass, states: states(idle, sleep) });
  card.updated(new Map([["hass", undefined]]));
}

/** Flatten a Lit TemplateResult (and nested results/arrays) to its static text. */
function text(v: unknown): string {
  if (Array.isArray(v)) return v.map(text).join("");
  if (v && typeof v === "object" && "strings" in v) {
    const t = v as { strings: readonly string[]; values: unknown[] };
    return t.strings.join("") + t.values.map(text).join("");
  }
  return "";
}

afterEach(() => {
  vi.useRealTimers();
});

describe("screensaver-card sleeping state", () => {
  it("the sleep sensor flipping while NOT idle changes nothing", () => {
    const callWS = vi.fn(async () => ({ children: [] }));
    const card = makeCard("off", "off", callWS);
    card.updated(new Map([["hass", undefined]]));
    setStates(card, "off", "on");
    setStates(card, "off", "off");
    expect(card._display).toBe("off");
    expect(card.render()).toBe(nothing);
    expect(callWS).not.toHaveBeenCalled();
  });

  it("idle turning on inside the window goes straight to sleeping and never browses media", () => {
    const callWS = vi.fn(async () => ({ children: [] }));
    const card = makeCard("off", "on", callWS);
    card.updated(new Map([["hass", undefined]]));
    setStates(card, "on", "on");
    expect(card._display).toBe("sleeping");
    expect(callWS).not.toHaveBeenCalled();
  });

  it("renders plain black while sleeping: no <img>, no fallback gradient, no clock", () => {
    const card = makeCard("on", "on", vi.fn(async () => ({})));
    // Leftover media state must be ignored, not drawn.
    Object.assign(card, { _mode: "media", _currentUrls: ["/media/x.jpg"], _currentKind: "image" });
    card._display = "sleeping";
    const out = text(card.render());
    expect(out).toContain("overlay");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("fallback");
    expect(out).not.toContain("clock");
  });

  it("a resolve already in flight when sleep begins lands afterwards without drawing an <img>", async () => {
    let finish!: (v: unknown) => void;
    const callWS = vi.fn(() => new Promise((r) => { finish = r; }));
    const card = makeCard("on", "off", callWS);
    Object.assign(card, { _items: [{ contentId: "media-source://media_source/local/photos/a.jpg" }], _index: 0 });
    card._display = "photos";
    const advancing = card._advance();                 // starts resolve_media, now pending
    expect(callWS).toHaveBeenCalledTimes(1);
    setStates(card, "on", "on");                       // the window opens mid-resolve
    expect(card._display).toBe("sleeping");
    finish({ url: "/media/local/photos/a.jpg?authSig=x" });
    await advancing;
    expect(card._currentUrls).toEqual([]);
    expect(card._timer).toBeUndefined();
    expect(text(card.render())).not.toContain("<img");
  });

  it("the window closing while sleeping resumes photos (starts the media browse)", async () => {
    vi.useFakeTimers();
    const callWS = vi.fn(async () => ({ children: [] }));
    const card = makeCard("on", "on", callWS);
    card.updated(new Map([["hass", undefined]]));
    expect(card._display).toBe("sleeping");
    setStates(card, "on", "off");
    expect(card._display).toBe("photos");
    // vi.waitFor advances fake timers itself while it polls.
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenCalledWith(expect.objectContaining({ type: "media_source/browse_media" })));
    card._stopLoop();
  });
});
```

- [ ] **Step 8: Run them — expect failure**

Run: `npx vitest run test/sleep-lifecycle.test.ts`
Expected: FAIL — `_display` is never set (the card still uses `_active`), and the sleeping render
still draws media.

- [ ] **Step 9: Switch the card to the three-state value**

In `src/screensaver-card.ts`:

1. `static properties` (`:325`): replace `_active: { state: true },` with `_display: { state: true },`.
2. Field (`:335`): replace `private _active = false;` with `private _display: DisplayState = "off";`.
3. `updated()` (`:404-412`): replace the body with:

```ts
  updated(changed: PropertyValues): void {
    if (changed.has("hass")) {
      const next = displayState(this.hass, this._cfg.idleEntity, this._cfg.sleepEntity);
      if (next !== this._display) {
        this._display = next;
        // Only "photos" runs the slideshow. Going to "sleeping" ALWAYS goes through
        // _stopLoop(): its _gen++ is what makes an in-flight browse/resolve discard
        // its result instead of drawing an image on the black screen.
        next === "photos" ? this._startLoop() : this._stopLoop();
      }
    }
  }
```

4. `_advance()` first line (`:456`): replace `if (!this._active || this._items.length === 0) return;`
   with `if (this._display !== "photos" || this._items.length === 0) return;`
5. `_skip()` (`:610`): replace `if (this._active)` with `if (this._display === "photos")`.
6. `render()` (`:644`): replace `if (!this._active) return nothing;` with:

```ts
    if (this._display === "off") return nothing;
    // Sleeping (spec §3): the same fixed black overlay, and nothing in it — no
    // media, no fallback gradient, no clock. The activity bridge is window-level,
    // so a tap still wakes the panel.
    if (this._display === "sleeping") return html`<div class="overlay"></div>`;
```

Then confirm nothing still reads the old field:
`grep -n "_active" src/screensaver-card.ts` → no output.

- [ ] **Step 10: Run the whole suite, typecheck and build**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card
npm run typecheck && npm run build && npm test
```

Expected: typecheck clean; build clean; **130 passed** (113 before + 9 display-state + 3
resolve-config + 5 lifecycle). If the count differs, recount the `it` blocks you added before
assuming a problem. The dist guard test must still pass (bundled, no bare imports).

- [ ] **Step 11: Commit**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM && git branch --show-current
git add custom_cards/screensaver-card/src/screensaver-card.ts custom_cards/screensaver-card/test/display-state.test.ts \
  custom_cards/screensaver-card/test/sleep-lifecycle.test.ts custom_cards/screensaver-card/test/resolve-config.test.ts \
  custom_cards/screensaver-card/dist
git commit -m "feat(screensaver): sleeping state — plain black during the sleep window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Check `git status` first: if `dist/` is gitignored, drop it from the `git add`.)

---

### Task 16: panel-tools-card — the drawer's Sleep section

**Files:**
- Modify: `custom_cards/panel-tools-card/src/logic.ts:107-115`
- Modify: `custom_cards/panel-tools-card/test/logic.test.ts`
- Modify: `custom_cards/panel-tools-card/src/panel-tools-card.ts:155-158`, `:351-358` (remove the wake-layer hook) and the styles block

- [ ] **Step 1: Write the failing test** — append to `test/logic.test.ts`, and add `showSleepHint`
  and `ENTITIES` to the import on line 2

```ts
describe("showSleepHint", () => {
  it("is shown when the screensaver switch is off — sleep can't work without idle", () => {
    expect(showSleepHint("off")).toBe(true);
  });
  it("is shown when the switch is missing or unavailable", () => {
    expect(showSleepHint(undefined)).toBe(true);
    expect(showSleepHint("unavailable")).toBe(true);
  });
  it("is hidden when the screensaver switch is on", () => {
    expect(showSleepHint("on")).toBe(false);
  });
});

describe("sleep entity ids", () => {
  it("match the HA sleep package and the screensaver safety switch", () => {
    expect(ENTITIES.sleepEnabled).toBe("input_boolean.kitchen_sleep_enabled");
    expect(ENTITIES.sleepStart).toBe("input_datetime.kitchen_sleep_start");
    expect(ENTITIES.sleepEnd).toBe("input_datetime.kitchen_sleep_end");
    expect(ENTITIES.screensaverEnabled).toBe("input_boolean.kitchen_screensaver_enabled");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/panel-tools-card && npx vitest run test/logic.test.ts`
Expected: FAIL — `showSleepHint` not exported; `ENTITIES.sleepEnabled` undefined.

- [ ] **Step 3: Implement** — in `src/logic.ts`

Extend `ENTITIES` (`:107-115`) to:

```ts
export const ENTITIES = {
  idle: "input_boolean.kitchen_idle",
  activity: "input_button.kitchen_activity",
  morningStart: "input_datetime.kitchen_morning_start",
  afternoonStart: "input_datetime.kitchen_afternoon_start",
  eveningStart: "input_datetime.kitchen_evening_start",
  theme: "input_select.kitchen_theme",
  screensaverMinutes: "input_number.kitchen_screensaver_minutes",
  screensaverEnabled: "input_boolean.kitchen_screensaver_enabled",
  sleepEnabled: "input_boolean.kitchen_sleep_enabled",
  sleepStart: "input_datetime.kitchen_sleep_start",
  sleepEnd: "input_datetime.kitchen_sleep_end",
} as const;
```

and after it add:

```ts
/** Sleep only works once the panel goes idle, and go-idle is gated on the
 *  screensaver safety switch (screensaver.yaml). Anything but "on" means a sleep
 *  setting would silently do nothing — so say so in the drawer (spec §3/§4). */
export function showSleepHint(screensaverEnabled: string | undefined): boolean {
  return screensaverEnabled !== "on";
}
```

Run: `npx vitest run test/logic.test.ts` → PASS.

- [ ] **Step 4: Fill in the Sleep section** — in `src/panel-tools-card.ts`

Add `showSleepHint` to the import from `./logic`. Replace the placeholder hook (`:155-158`):

```ts
  // Phase B (Task 16) adds the Sleep section here.
  protected _renderSleepSection(): TemplateResult | typeof nothing {
    return nothing;
  }
```

with:

```ts
  // Sleep (spec §3): during the window, once idle, the screensaver shows black.
  private _renderSleepSection(): TemplateResult {
    const on = this._state(ENTITIES.sleepEnabled) === "on";
    const set = (value: boolean) =>
      this._call("input_boolean", value ? "turn_on" : "turn_off", {}, ENTITIES.sleepEnabled);
    return html`
      <section>
        <h3>Sleep</h3>
        <div class="seg">
          <button class=${on ? "" : "on"} @click=${() => set(false)}>Off</button>
          <button class=${on ? "on" : ""} @click=${() => set(true)}>On</button>
        </div>
        ${this._timeRow("From", ENTITIES.sleepStart)}
        ${this._timeRow("To", ENTITIES.sleepEnd)}
        ${showSleepHint(this._state(ENTITIES.screensaverEnabled))
          ? html`<p class="hint">Sleep needs the screensaver switched on.</p>`
          : nothing}
      </section>`;
  }
```

In the `static styles` block, after the `.seg button.on { … }` line, add:

```css
    .hint { margin: 8px 0 0; font-size: 15px; color: var(--secondary-text-color, #9aa4b2); }
```

`_renderDrawer()` already calls `${this._renderSleepSection()}` above "Views switch at" — no
change there.

**Remove the orphaned wake-layer hook** (the revised design has no wake layer). Delete this
method (`:351-354`):

```ts
  // Phase B (Task 16) adds the wake layer here.
  protected _renderWakeLayer(): TemplateResult | typeof nothing {
    return nothing;
  }
```

and its call, the line `      ${this._renderWakeLayer()}` at the top of `render()` (`:358`).
Check: `grep -n "WakeLayer\|wake layer" src/panel-tools-card.ts` → no output.

- [ ] **Step 5: Typecheck, test, build**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/panel-tools-card
npm run typecheck && npm run build && npx vitest run
```

Expected: clean; **37 passed** (33 + 3 `showSleepHint` + 1 entity-ids). If it differs, recount
the `it` blocks before assuming a problem.

- [ ] **Step 6: Smoke-test on the dev rig** (Docker running; rig from Task 14)

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
cp custom_cards/panel-tools-card/dist/panel-tools-card.js custom_cards/screensaver-card/dist/screensaver-card.js \
  deploy/homeassistant/dev-config/www/
```

In the dev UI (http://localhost:8124, `dev`/`devdev123`) bump the resources to
`/local/panel-tools-card.js?v=2` and add `/local/screensaver-card.js?v=1` (module) if absent. On
the `ptc-test` dashboard (create it if the rig was rebuilt: one view with
`custom:panel-tools-card` `pin: "1234"` and `custom:screensaver-card` `media_path: photos`), check:
- ⚙ → 1234 → a **Sleep** section with Off/On, From, To sits above "Views switch at".
- With `input_boolean.kitchen_screensaver_enabled` off, the hint shows; turn it on → the hint goes.
- On/Off and From/To write `input_boolean.kitchen_sleep_enabled` and the two `input_datetime`s
  (check `/api/states/...`).
- Set a window containing now, turn `input_boolean.kitchen_idle` on → the screensaver is **plain
  black**. Turn the window off → photos appear.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add custom_cards/panel-tools-card/src/logic.ts custom_cards/panel-tools-card/src/panel-tools-card.ts \
  custom_cards/panel-tools-card/test/logic.test.ts
git commit -m "feat(panel-tools): Sleep section in the settings drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Deploy Phase B and verify at the panel — NEEDS HOME NETWORK + GARRETT AT THE PANEL

- [ ] **Step 1: Network gate**

Ask Garrett to disconnect the GSU VPN (memory `vpn-hides-the-whole-lan.md`), then:
`nc -z -G 6 192.168.1.234 22 && echo "PI UP" || echo "PI DOWN"`. If down, stop.

- [ ] **Step 2: Drift check**

The Pi's `screensaver.yaml` should be exactly Phase A's (`6017ef3`):

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
ssh kitchencom 'cat /home/garrettdehart/homeassistant/packages/screensaver.yaml' \
  | diff - <(git show 6017ef3:homeassistant/packages/screensaver.yaml) && echo "no drift"
```

On drift, stop and reconcile before copying anything.

- [ ] **Step 3: Deploy, in one HA stop window**

`.storage/lovelace_resources` may only be edited with HA stopped. Check the current versions
first: `ssh kitchencom 'sudo grep -o "[a-z-]*card.js?v=[0-9]*" /home/garrettdehart/homeassistant/.storage/lovelace_resources'`
— expect `screensaver-card.js?v=12` and `panel-tools-card.js?v=1`; bump each by one below.

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
scp -q custom_cards/screensaver-card/dist/screensaver-card.js custom_cards/panel-tools-card/dist/panel-tools-card.js kitchencom:/tmp/
scp -q homeassistant/packages/sleep.yaml homeassistant/packages/screensaver.yaml kitchencom:/tmp/
ST=$(date +%Y%m%d-%H%M)
ssh kitchencom "set -e; R=/home/garrettdehart/homeassistant
cp -p \$R/packages/screensaver.yaml \$R/packages/screensaver.yaml.bak-presleep-$ST
sudo cp -p \$R/www/screensaver-card.js \$R/www/screensaver-card.js.bak-presleep-$ST
sudo cp -p \$R/www/panel-tools-card.js \$R/www/panel-tools-card.js.bak-presleep-$ST
cp /tmp/sleep.yaml /tmp/screensaver.yaml \$R/packages/
sudo docker exec homeassistant python -m homeassistant --script check_config -c /config | tail -5"
```

**Read the `check_config` output before going on.** Expected: only `Testing configuration at
/config`. If it reports an error, **do not stop HA**: remove `packages/sleep.yaml`, restore
`screensaver.yaml` from its `.bak-presleep` copy, and fix in the repo first. Otherwise, the stop
window (a fresh `ST` stamp is fine — it only names the resources backup):

```bash
ST=$(date +%Y%m%d-%H%M)
ssh kitchencom "set -e; R=/home/garrettdehart/homeassistant
sudo docker stop homeassistant >/dev/null
sudo cp -p \$R/.storage/lovelace_resources \$R/.storage/lovelace_resources.bak-presleep-$ST
sudo cp /tmp/screensaver-card.js /tmp/panel-tools-card.js \$R/www/
sudo sed -i -e 's|screensaver-card.js?v=12|screensaver-card.js?v=13|' -e 's|panel-tools-card.js?v=1\"|panel-tools-card.js?v=2\"|' \$R/.storage/lovelace_resources
sudo grep -o '[a-z-]*card.js?v=[0-9]*' \$R/.storage/lovelace_resources
sudo docker start homeassistant >/dev/null && echo started"
```

Expected: `screensaver-card.js?v=13`, `panel-tools-card.js?v=2`, then `started`.

Then md5 the deployed cards against the local builds, wait ~90 s, and check the new entities:

```bash
ssh kitchencom 'md5sum /home/garrettdehart/homeassistant/www/{screensaver,panel-tools}-card.js'
md5 -q custom_cards/screensaver-card/dist/screensaver-card.js custom_cards/panel-tools-card/dist/panel-tools-card.js
ssh kitchencom 'sudo docker exec -i homeassistant python3 - binary_sensor.kitchen_sleep_window input_boolean.kitchen_sleep_enabled input_datetime.kitchen_sleep_start' \
  < deploy/tools/ha-recorder-state.py
```

Expected: md5s match; all three entities recorded; the window sensor `off` (sleep starts disabled).

- [ ] **Step 4: Clear the kiosk's Service Worker** (memory `kiosk-service-worker-serves-stale-js.md`)

```bash
ssh kitchencom 'pkill chromium; sleep 3
P=/home/garrettdehart/.config/chromium/Default
sudo -u garrettdehart rm -rf "$P/Service Worker" "$P/Cache" "$P/Code Cache" /home/garrettdehart/.cache/chromium
sleep 15; echo "chromium procs: $(pgrep -c chromium)"'
```

- [ ] **Step 5: Panel check, with Garrett**

1. ⚙ → 0510: the Sleep section is there, no hint (the screensaver switch is on). Photos/theme/
   delay still work (Phase A regression).
2. Garrett sets the screensaver delay to **5** and a sleep window **From = now + 8 min,
   To = now + 68 min**, Sleep **On**, closes the drawer and leaves the panel alone.
3. ~5 min: photos appear. At the window start: **photos → plain black** (no clock).
4. Garrett taps once: the dashboard shows. Read the timer:
   `ssh kitchencom 'sudo docker exec -i homeassistant python3 - timer.kitchen_inactivity' < deploy/tools/ha-recorder-state.py`
   → `"duration": "0:02:00"`. About 2 min later: **black again**, with no photos in between.
5. **Night-restart race (spec §3 failure modes).** With the window still on:
   `ssh kitchencom 'sudo docker restart homeassistant'`, wait ~90 s, read the timer again.
   - `0:02:00` → no race; done.
   - `0:05:00` (the configured delay) → the race is real. Fix in the repo: in the
     `"Kitchen — start inactivity timer on HA startup"` automation, insert this step **between**
     the `input_boolean.turn_off` and the `timer.start`:

     ```yaml
      # Template entities can render after homeassistant:start fires; without this the
      # night wake below reads the sleep window as unknown and uses the full delay.
      - wait_template: "{{ states('binary_sensor.kitchen_sleep_window') in ['on', 'off'] }}"
        timeout: "00:01:00"
        continue_on_timeout: true
     ```

     Redeploy `screensaver.yaml` (backup, copy, `check_config`, restart), repeat this step, and
     expect `0:02:00`. Commit as `fix(sleep): wait for the window sensor before the startup timer`.
6. Restore real settings with Garrett: screensaver delay **30**; the sleep window he actually
   wants (e.g. 22:00 → 06:00), Sleep On.

- [ ] **Step 6: Record and commit**

Record in the cold-open (§4e) and spec §3: what was verified, the restart-race outcome, the
resource versions (`?v=13`, `?v=2`) and the window Garrett chose. Commit on
`feat/time-of-day-layouts` (`git branch --show-current` first).
