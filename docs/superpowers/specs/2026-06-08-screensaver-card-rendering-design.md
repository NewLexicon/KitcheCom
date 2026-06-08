# Screensaver Card Rendering — Design Spec

**Date:** 2026-06-08
**Status:** Approved (3 sections through section-by-section reviewer-pass; folds applied)
**Builds on:** `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md` (§5 reactive-card model)
**Extends:** the merged foundation card `custom_cards/screensaver-card/` (currently pure logic only: `isScreensaverActive` + `selectDisplayMode`, 9 tests)

All HA-API claims verified against `reference/core-dev` source, not memory.

---

## 1. Summary & architecture

Turn the screensaver card from pure logic into a real Lit custom element (`custom:screensaver-card`): a full-screen idle overlay that fades in on `input_boolean.kitchen_idle`, loops local photos/videos with a cinematic Ken-Burns + crossfade feel, and shows an ambient gradient+clock fallback when there's no media.

**Boundary (unchanged isolation):** the card depends only on **Lit** + the **`hass` object** (idle state + `hass.callWS` for media browsing). It emits nothing and mutates nothing — a pure visual overlay. Media *arrives* via the **HA Companion app upload** (HA's built-in `media_source` upload: `local_source.py:112` `async_upload_media`, exposed by the `UploadMediaView` HTTP view at `local_source.py:335`) into the folder the card browses — there is **no upload code in the card**.

> **Config-key note:** the parent design §5 sketched card inputs as `idle_timeout_seconds` / `transition_style` / `show_clock_overlay`. This slice narrows/renames them to `transition_duration` / `idle_entity` / `show_clock` (idle *timeout* lives in the HA automation, not the card — see `packages/screensaver.yaml`). Intentional, recorded here so it isn't flagged as drift later.

**Testing approach (decision A):** every *decision* is a tested pure function; the Lit component is a thin glue shell over them, verified once manually in a browser with a mocked `hass`. Consistent with the 9 pure-logic tests already merged.

### Locked decisions (Q&A arc)
1. **Media source** → card queries HA `media_source` directly via `hass.callWS` (browse → resolve). "Drop photos in the folder, they appear."
2. **Photo upload over wifi** → **HA Companion app** upload into the media folder (HA's built-in `UploadMediaView`). Zero custom backend. Card just reads the folder.
3. **Transition feel** → **Ken-Burns pan/zoom + crossfade** on photos (cinematic photo-frame). Videos play natively.
4. **Fallback (no media)** → **ambient drifting gradient + clock** (looks intentional, never blank/error).
5. **Testing** → pure-functions-tested + thin Lit glue + one manual browser check (decision A).
6. **Config knobs** → sensible defaults + a few overrides: `media_path`, `photo_duration`, `transition_duration`, `idle_entity`, `show_clock`.

## 2. Components & pure-function decomposition

**Pure functions (unit-tested, no DOM/HA) — in `src/`:**

| Function | Job |
|---|---|
| `isScreensaverActive(hass, idleEntity?)` | *(existing, extended)* idle decision; configurable entity, undefined-guard (M-15: undefined → not idle, never throw) |
| `selectDisplayMode(files)` | *(existing)* media vs. fallback |
| `selectPlayableChildren(browseTree)` | *(new, M-13)* filter `browse_media` tree → ordered array of playable leaves. **Predicate (source-grounded, `browse_media.py:106-120`):** keep children where `can_expand === false && can_play === true`; skip directories (`can_expand === true`). **v1 flat, no recursion** (nested albums deferred — YAGNI). **Returns `MediaItem[]` — see Data Contracts below.** |
| `buildBrowseContentId(mediaPath)` | *(new)* construct `media-source://media_source/local/<dir>` from config |
| `nextMediaIndex(current, count)` | *(new)* next loop index, wrap-around (shuffle deferred — YAGNI) |
| `resolveConfig(rawConfig)` | *(new)* apply defaults (see Defaults table); **clamp `photo_duration` to a sane floor (≥2s)** so a 0/negative value can't spin the loop |
| `shouldReResolve(resolvedAt, now, ttlSeconds?)` | *(new, I-7 policy)* true if a resolved URL is stale/expiring. `ttlSeconds` defaults to `CONTENT_AUTH_EXPIRY_TIME` (= `3600*24`, 24h, `media_player/const.py:8`); re-resolves once `now - resolvedAt` passes `ttl - SAFETY_MARGIN` (`SAFETY_MARGIN = 300s`, a named constant), and on `resolvedAt == null` (never resolved). Pure/deterministic on plain epoch-second numbers. The expiry **decision** is tested; only the WS resolve call stays in glue |

### Data Contracts (close I-1 / I-2 — the implementer must not guess these)

**`MediaItem`** — the unit `selectPlayableChildren` returns and the loop carries:
```ts
type MediaItem = {
  contentId: string;        // BrowseMedia child media_content_id (input to resolve_media)
  kind: "image" | "video";  // derived from media_class (image→image, video→video)
  // mutable cache, stamped by the glue loop (NOT by the pure function):
  url?: string;             // last resolved playable URL
  resolvedAt?: number;      // epoch seconds when url was resolved (undefined = never)
};
```
- `selectPlayableChildren` produces `MediaItem[]` with `contentId` + `kind` only (`url`/`resolvedAt` undefined). It does NOT resolve or stamp — pure.
- The Lit loop owns the `url`/`resolvedAt` cache: before displaying `items[i]`, if `shouldReResolve(items[i].resolvedAt, now)` → `callWS(resolve_media, {media_content_id: items[i].contentId})`, then mutate `items[i].url`/`.resolvedAt` in place. This is the resolve-cache's defined home (closes I-2).
- **Empty-check (closes M-2):** fallback is decided by `items.length === 0` directly. `selectDisplayMode` (the existing filename-based function) is NOT in this hot path — it stays as-is for its existing tests but is not re-used here (its `string[]`-of-basenames contract doesn't fit `MediaItem[]`).

### Config defaults (`resolveConfig`) — closes M-3

| Key | Default |
|---|---|
| `media_path` | `"media"` (→ `media-source://media_source/local/media`) |
| `photo_duration` | `10` (seconds; clamped to floor `2`) |
| `transition_duration` | `1.5` (seconds, crossfade) |
| `idle_entity` | `"input_boolean.kitchen_idle"` (the existing `IDLE_ENTITY`) |
| `show_clock` | `true` |

**Thin Lit glue (manual browser check) — `screensaver-card.ts` component:**
- `set hass()` → recompute active state, trigger fade in/out
- browse-on-activate + re-resolve-before-display loop (I-7)
- render overlay + current `<img>` (Ken-Burns)/`<video>`, or fallback gradient+clock
- `<video>`/`<img>` error → skip to next item (M-14 / 4c)

## 3. Media loop & rendering flow

```
hass updates → set hass(): active = isScreensaverActive(hass, cfg.idleEntity)
   active false → fade overlay OUT, stop loop, release <video>
   active true  → fade overlay IN, start loop (if not running)

LOOP (per displayed item):
  1. (once on activate) callWS(media_source/browse_media, buildBrowseContentId(cfg.mediaPath))
  2. items = selectPlayableChildren(tree)  → MediaItem[]     [pure, M-13]
  3. if items.length === 0 → FALLBACK (gradient + clock)     [plain check; M-2]
  4. i = nextMediaIndex(i, items.length)                     [pure, wrap]
  5. if shouldReResolve(items[i].resolvedAt, now)            [pure, I-7]
        → callWS(media_source/resolve_media, {media_content_id: items[i].contentId})
          then mutate items[i].url / items[i].resolvedAt in place   [glue side-effect, I-2]
  6. render:
        photo → <img src=url> + Ken-Burns + crossfade, hold cfg.photoDuration
        video → <video src=url autoplay muted>; on 'error' → step 4   [M-14/4c]
        photo natural-load error → step 4                            [4c]
  7. advance after duration (photo) or 'ended' (video) → step 4
```

**Verified HA contracts (source):**
- `media_source/browse_media` WS: optional `media_content_id` (default "" = root), returns a `BrowseMedia` tree with `children`/`media_class`/`can_expand` (`http.py:30-32`, `models.py`).
- `media_source/resolve_media` WS: requires `media_content_id`, returns `{url, mime_type}`; **`expires` defaults to `CONTENT_AUTH_EXPIRY_TIME`** — resolved URLs are signed + time-limited (`http.py:51-75`). This is why the loop re-resolves per-display rather than caching (I-7).
- Resolved URL runs through `async_process_play_media_url(..., allow_relative_url=True)` → directly usable in `<img>`/`<video>`.

**Key properties:**
- **Browse once per activation; resolve lazily, re-resolve only when `shouldReResolve` fires** (I-7) — steady WS trickle, never a 404 on long idle.
- **Errors never freeze the loop** — any media failure advances (4c/M-14); corrupt files + undecodable codecs (Pi-5 HEVC, M-8) self-heal.
- **Inactive tears down cleanly** — stop timers, release `<video>`.
- All branch decisions are tested pure functions; the loop is glue.

## 4. Carry-forwards into the plan
- **Task-0 prerequisite:** add `lib: ["ES2021","DOM","DOM.Iterable"]` to the card's tsconfig (deferred Task-5 Minor comes due — DOM rendering + `<img>`/`<video>` + `callWS` need it).
- **M-8:** real video-codec validation still happens at hardware-test time (the card degrades gracefully meanwhile).
- **Manual browser check:** one-time visual verification on the Mac with a mocked `hass` (decision A).
- Resource registration in HA (`/local/screensaver-card.js`) remains a hardware-phase INSTALL.md step (already documented).

## 5. Scope boundary (YAGNI)
NOT in this slice: shuffle/randomization, nested-album recursion, per-media-type durations, configurable Ken-Burns intensity, cloud (`google_photos`) source, in-card upload UI. Each is a clean later addition; v1 is one flat folder, sequential loop, the 6 config knobs above.
