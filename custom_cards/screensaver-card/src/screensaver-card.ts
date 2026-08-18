import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { styleMap } from "lit/directives/style-map.js";

// Pure idle-decision logic — the card's one piece of real, testable logic.
// Reads input_boolean.kitchen_idle from hass (spec §5 reactive-card model, M-9).
// Fail-safe: any missing/unknown state => inactive, so the screensaver can never
// trap the screen if the entity is absent.

export const IDLE_ENTITY = "input_boolean.kitchen_idle";

type HassLike = { states?: Record<string, { state?: string } | undefined> };

export function isScreensaverActive(hass?: HassLike, idleEntity: string = IDLE_ENTITY): boolean {
  return hass?.states?.[idleEntity]?.state === "on";
}

// Supported media extensions. Pi-5 codec note (M-8): HEVC/H.265 hardware decode is
// limited on Pi 5 — validate video formats on real hardware. Conservative default set.
const SUPPORTED = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"];

// Accepts bare filenames / basenames (e.g. "photo.jpg") or resolved media_source URLs
// with a "?query"/"#fragment" suffix. Resolved: stripMediaUrlQuery strips query/fragment
// before matching, so endsWith(ext) no longer silently drops e.g. "photo.jpg?token=…".
export function selectDisplayMode(files: string[] | undefined | null): "media" | "fallback" {
  if (!files || files.length === 0) return "fallback";
  const usable = files.filter((f) =>
    SUPPORTED.some((ext) => stripMediaUrlQuery(f).toLowerCase().endsWith(ext))
  );
  return usable.length > 0 ? "media" : "fallback";
}

// Strip ?query and #fragment from a media URL/path so extension-matching works
// on resolved media_source URLs (e.g. "photo.jpg?token=…"). Pure. (Closes the
// deferral noted on selectDisplayMode below.)
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

// A playable media leaf the loop cycles. contentId feeds resolve_media; url/resolvedAt
// are the lazy-resolve cache, stamped by the Lit glue loop (NOT here). See spec §2.
export type MediaItem = {
  contentId: string;
  kind: "image" | "video";
  url?: string;
  resolvedAt?: number;
  /** Set lazily the first time the image decodes; undefined until then.
   *  Videos are never paired, so this stays undefined for them. */
  orientation?: Orientation;
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

// Next loop index with wrap-around. count 0 => 0 (caller shows fallback instead).
// Out-of-range current resets to 0 (defensive: items list may have shrunk).
export function nextMediaIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  if (current < 0 || current >= count) return 0;
  return (current + 1) % count;
}

// ── Portrait pairing (2026-08-17) ────────────────────────────────────────────
// WHY: the frame is a 1920x1080 LANDSCAPE panel. `object-fit: cover` fills it by
// clipping the overflow, which on a portrait photo means the top and bottom --
// usually where the subject is. Two portraits side by side fill the same frame
// with no cropping at all, so pairing is preferred over letterboxing whenever a
// partner is available.

export type Orientation = "portrait" | "landscape" | "unknown";

/** How a slot's images should be fitted to the frame.
 *  `cover` fills and may crop (safe for landscape, which matches the frame).
 *  `contain-blur` shows the whole image with a blurred copy of itself behind it,
 *  used for a portrait with no partner so it is never cut. */
export type SlotFit = "cover" | "contain-blur";

export type Oriented = { contentId: string; orientation: Orientation };

export type Slot = {
  /** One contentId (solo) or two (a portrait pair). */
  items: string[];
  fit: SlotFit;
  /** Index to plan from on the next tick; wraps to 0 at the end. */
  nextIndex: number;
  /** Partner contentIds pulled forward out of sequence. The caller records these
   *  so they are not shown again when the cursor later reaches them. */
  consumed: string[];
};

/** Classify by aspect ratio. Square counts as landscape: it fills the frame
 *  without meaningful loss, and pairing squares would waste half the screen.
 *  Non-finite or non-positive dimensions mean the image never decoded, which is
 *  reported as `unknown` and never paired. Pure. */
export function classifyOrientation(width: number, height: number): Orientation {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "unknown";
  if (width <= 0 || height <= 0) return "unknown";
  return height > width ? "portrait" : "landscape";
}

/** Decide what occupies the screen for one display tick.
 *
 *  A portrait pairs ONLY with an immediately-following portrait. It is never
 *  paired with a landscape (wildly mismatched scale) nor with an `unknown`
 *  (an undecodable image would leave half the frame blank). A portrait with no
 *  partner falls back to `contain-blur` so it is shown whole.
 *
 *  Pure: no DOM, no clock, no network -- the whole policy is testable. */
/** Decide what occupies the screen for one display tick.
 *
 *  A portrait SEEKS the next portrait ahead of it, skipping over landscapes, so
 *  pairing does not depend on two portraits happening to be adjacent -- in a real
 *  library (~20 portraits among ~122 photos) that almost never happens. The
 *  partner is reported in `consumed` so the caller can skip it when the cursor
 *  reaches it later, rather than showing it twice.
 *
 *  It never pairs with a landscape (mismatched scale) nor an `unknown` (an
 *  undecodable image would blank half the frame), and never wraps around to an
 *  earlier portrait (which would re-show it immediately next cycle). A portrait
 *  with no partner ahead falls back to `contain-blur` so it is shown whole.
 *
 *  `shown` holds contentIds already consumed as partners. Pure. */
export function planSlot(
  items: Oriented[],
  index: number,
  shown: ReadonlySet<string> = new Set(),
): Slot {
  const n = items.length;
  if (n === 0) return { items: [], fit: "cover", nextIndex: 0, consumed: [] };
  let i = index >= 0 && index < n ? index : 0;
  const wrap = (k: number) => (k >= n ? 0 : k);

  // Walk forward past anything already shown as someone else's partner. Doing
  // this HERE rather than returning an empty slot means the caller always gets
  // something displayable: a run of consumed items would otherwise produce a
  // burst of empty ticks and the slideshow would visibly stall.
  let cursor = i;
  for (let step = 0; step < n && shown.has(items[cursor].contentId); step++) {
    cursor = wrap(cursor + 1);
  }
  // Every item has been consumed (all portraits paired): show from the cursor
  // anyway rather than returning nothing.
  const here = items[cursor];
  i = cursor;

  if (here.orientation === "portrait") {
    // Seek forward only -- wrapping would pair with a portrait that is about to
    // be shown again at the top of the next cycle.
    for (let j = i + 1; j < n; j++) {
      const cand = items[j];
      if (shown.has(cand.contentId)) continue;
      if (cand.orientation === "portrait") {
        return {
          items: [here.contentId, cand.contentId],
          fit: "cover",
          nextIndex: wrap(i + 1),
          consumed: [cand.contentId],
        };
      }
    }
    return { items: [here.contentId], fit: "contain-blur", nextIndex: wrap(i + 1), consumed: [] };
  }

  // Landscape and unknown display solo, filling the frame.
  return { items: [here.contentId], fit: "cover", nextIndex: wrap(i + 1), consumed: [] };
}

export type ScreensaverConfig = {
  mediaPath: string;
  photoDuration: number;
  transitionDuration: number;
  idleEntity: string;
  showClock: boolean;
  shuffle: boolean;
  kenBurnsIntensity: number;
  activityEntity: string;
  activityBridge: boolean;
};

const PHOTO_DURATION_FLOOR = 2;

// How far ahead to decode looking for a portrait partner. Each probe is a real
// image fetch, so this bounds the work one tick can do: with no portrait within
// this many places the image is shown solo (contained, never cropped) instead.
export const PARTNER_SEEK_LIMIT = 40;

// ── Activity bridge (M-10) ───────────────────────────────────────────────────
// The button the screensaver package watches to clear idle and restart the
// inactivity timer. Nothing was pressing it: the wake automation existed but its
// trigger was only ever going to fire from a touch handler that was never built.
// On hardware with no touch wired that made idle a ONE-WAY DOOR — the panel went
// black and could not be recovered from the kitchen at all.
export const ACTIVITY_ENTITY = "input_button.kitchen_activity";

// A single swipe emits dozens of pointermove events. Ping at most this often so a
// burst of real input becomes one service call, not dozens.
export const ACTIVITY_THROTTLE_MS = 5000;

/** Whether an observed user interaction should ping HA now.
 *  `last` is the timestamp of the previous ping (undefined = never). Pure so the
 *  throttle is testable without faking timers or the DOM. */
export function shouldSendActivityPing(last: number | undefined, now: number): boolean {
  if (last === undefined) return true;
  // now < last means the clock moved backwards; send rather than stay wedged
  // until real time catches up to a stale future timestamp.
  if (now < last) return true;
  return now - last >= ACTIVITY_THROTTLE_MS;
}

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
    shuffle: raw.shuffle === true,
    kenBurnsIntensity: Math.min(1, Math.max(0,
      typeof raw.ken_burns_intensity === "number" ? raw.ken_burns_intensity : 0.5)),
    activityEntity:
      typeof raw.activity_entity === "string" && raw.activity_entity
        ? raw.activity_entity
        : ACTIVITY_ENTITY,
    // On by default: a panel that cannot be woken is worse than one that pings
    // HA occasionally. Opt out only if a second display should observe nothing.
    activityBridge: raw.activity_bridge === undefined ? true : Boolean(raw.activity_bridge),
  };
}

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

type HassWS = HassLike & {
  callWS?: (msg: Record<string, unknown>) => Promise<any>;
  callService?: (domain: string, service: string, data?: unknown) => Promise<unknown> | void;
};

// Events that count as "a human is using this panel". pointerdown covers touch,
// pen and mouse-click in one event; pointermove catches a mouse being moved
// without clicking. keydown means a keyboard is in use. All are listened for on
// `window` in the CAPTURE phase so they are observed even when another element
// stops propagation — the card must see input aimed at any part of the dashboard,
// not only at itself.
export const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;

// Bounded recursive browse limits (I-1). HA browse_media is lazy/one-level, so the
// glue walks subdirectories itself. Cap depth + total folder calls per activation so
// a deep/wide media tree can't issue an unbounded number of WS calls.
export const MAX_RECURSION_DEPTH = 3;     // root + 3 subfolder levels
export const MAX_BROWSE_FOLDERS = 50;     // hard cap on browse_media calls per activation

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
  // One url for a solo image/video, two for a portrait pair.
  private _currentUrls: string[] = [];
  /** contentIds already displayed as another portrait's partner. Prevents
   *  showing the same photo twice in one pass. Cleared when the list reloads. */
  private _pairedShown = new Set<string>();
  private _currentFit: SlotFit = "cover";
  private _currentKind: "image" | "video" = "image";
  private _now = "";
  private _timer?: ReturnType<typeof setTimeout>;
  private _clock?: ReturnType<typeof setInterval>;
  private _loopRunning = false;
  private _gen = 0;
  private _lastActivityPing?: number;
  private _activityHandler?: (ev: Event) => void;

  setConfig(config: Record<string, unknown>): void {
    this._rawConfig = config ?? {};
    this._cfg = resolveConfig(this._rawConfig);
  }

  // ── Activity bridge (M-10) ─────────────────────────────────────────────────
  // Observe real user input and press input_button.kitchen_activity, which the
  // screensaver package's wake automation watches (it clears kitchen_idle and
  // restarts the inactivity timer). Without this the wake path had no producer:
  // the automation was waiting on a button nothing ever pressed.
  //
  // Listening for pointer AND key events (not just touch) is deliberate — it
  // means a mouse or keyboard wakes the panel too, so the wake path is testable
  // before touch hardware exists.
  private _startActivityBridge(): void {
    if (!this._cfg.activityBridge || this._activityHandler) return;
    this._activityHandler = () => this._onUserActivity();
    for (const ev of ACTIVITY_EVENTS) {
      // capture:true — see input even if a handler below stops propagation.
      // passive:true — never delay scrolling/touch; this only observes.
      window.addEventListener(ev, this._activityHandler, { capture: true, passive: true });
    }
  }

  private _stopActivityBridge(): void {
    if (!this._activityHandler) return;
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, this._activityHandler, { capture: true });
    }
    this._activityHandler = undefined;
  }

  private _onUserActivity(): void {
    const now = Date.now();
    if (!shouldSendActivityPing(this._lastActivityPing, now)) return;
    this._lastActivityPing = now;

    const [domain, object_id] = this._cfg.activityEntity.split(".");
    if (domain !== "input_button" || !object_id) return;
    try {
      // Fire-and-forget: a failed ping must never surface on a kitchen screen or
      // break rendering. The next interaction retries anyway.
      void this.hass?.callService?.("input_button", "press", {
        entity_id: this._cfg.activityEntity,
      });
    } catch {
      /* ignore — see above */
    }
  }

  updated(changed: PropertyValues): void {
    if (changed.has("hass")) {
      const active = isScreensaverActive(this.hass, this._cfg.idleEntity);
      if (active !== this._active) {
        this._active = active;
        active ? this._startLoop() : this._stopLoop();
      }
    }
  }

  // Bounded BFS over the media tree (I-1). Generation-token-safe: takes the captured
  // gen and re-checks after every await — if a stop/restart happened mid-walk, bail
  // out returning whatever was collected so far (the authoritative guard in _startLoop
  // discards it). Per-folder errors skip that folder rather than aborting the walk.
  private async _collectMedia(rootContentId: string, gen: number): Promise<MediaItem[]> {
    const queue: { contentId: string; depth: number }[] = [{ contentId: rootContentId, depth: 0 }];
    let foldersBrowsed = 0;
    const items: MediaItem[] = [];
    while (queue.length > 0 && foldersBrowsed < MAX_BROWSE_FOLDERS) {
      const { contentId, depth } = queue.shift()!;
      let tree: { children?: BrowseChild[] } | undefined;
      try {
        tree = await this.hass?.callWS?.({
          type: "media_source/browse_media",
          media_content_id: contentId,
        });
      } catch {
        continue; // skip this folder on error, keep walking
      }
      foldersBrowsed++;
      if (gen !== this._gen) return items;   // stale: stopped/restarted during browse
      items.push(...selectPlayableChildren(tree));
      if (depth < MAX_RECURSION_DEPTH) {
        for (const id of selectSubdirectories(tree)) {
          queue.push({ contentId: id, depth: depth + 1 });
        }
      }
    }
    return items;
  }

  private async _startLoop(): Promise<void> {
    if (this._loopRunning) return;
    this._loopRunning = true;
    const gen = this._gen;
    this._tickClock();
    this._clock = setInterval(() => this._tickClock(), 1000);
    const items = await this._collectMedia(buildBrowseContentId(this._cfg.mediaPath), gen);
    // Authoritative guard BEFORE mutating display state: if a stop happened during
    // collection, discard everything and bail.
    if (gen !== this._gen) { this._loopRunning = false; return; }
    this._items = this._cfg.shuffle ? shuffleOrder(items, Math.random) : items;
    this._pairedShown.clear();
    this._mode = this._items.length === 0 ? "fallback" : "media";
    this._index = -1;
    if (this._mode === "media") this._advance();
  }

  private async _advance(): Promise<void> {
    if (!this._active || this._items.length === 0) return;
    const gen = this._gen;
    const next = nextMediaIndex(this._index < 0 ? this._items.length - 1 : this._index, this._items.length);
    // I-2 wrap-detect: on a full pass (wrapped to 0) reshuffle the same MediaItem refs
    // so the per-item resolve cache survives. // TODO defer: no-immediate-repeat on reshuffle
    if (this._cfg.shuffle && next === 0 && this._index >= 0 && this._items.length > 1) {
      this._items = shuffleOrder(this._items, Math.random);
      // New order means new pairings; old partner bookkeeping no longer applies.
      this._pairedShown.clear();
    }
    this._index = next;
    const item = this._items[this._index];
    const now = Math.floor(Date.now() / 1000);
    if (shouldReResolve(item.resolvedAt, now)) {
      try {
        const res = await this.hass?.callWS?.({
          type: "media_source/resolve_media",
          media_content_id: item.contentId,
        });
        if (gen !== this._gen) return;   // stale: stopped/restarted during resolve
        item.url = res?.url;
        item.resolvedAt = now;
      } catch {
        if (gen !== this._gen) return;
        return this._skip(); // resolve failed → skip
      }
    }
    if (gen !== this._gen) return;
    // M-2: if resolve succeeded but returned no url, item.resolvedAt is now stamped,
    // so this item stays permanently skipped on future passes (shouldReResolve→false,
    // url still undefined). Intentional — a broken item must not freeze the loop (spec 4c).
    if (!item.url) return this._skip();

    // Videos never pair: show solo, advance on 'ended'.
    if (item.kind !== "image") {
      this._currentUrls = [item.url];
      this._currentFit = "cover";
      this._currentKind = item.kind;
      this._currentUrl = item.url;
      return;
    }

    // Orientation is only knowable by decoding, and planSlot treats an unprobed
    // item as "unknown" -- which it refuses to pair. Seeking a partner therefore
    // requires probing AHEAD, not just the next item: with ~34 portraits among
    // 122 photos a partner is typically several places away, and probing only
    // item+1 left everything between unknown so pairing could never fire.
    await this._ensureOrientation(item, gen);
    if (gen !== this._gen) return;
    if (item.orientation === "portrait") {
      // Look ahead until a portrait partner is found. Bounded so a library with
      // one lone portrait cannot decode the entire album on a single tick.
      for (let j = this._index + 1; j < this._items.length && j <= this._index + PARTNER_SEEK_LIMIT; j++) {
        const cand = this._items[j];
        if (cand.kind !== "image") continue;
        if (this._pairedShown.has(cand.contentId)) continue;
        await this._ensureOrientation(cand, gen);
        if (gen !== this._gen) return;
        if (cand.orientation === "portrait") break;   // partner found
      }
    }

    const oriented: Oriented[] = this._items.map((it) => ({
      contentId: it.contentId,
      orientation: it.kind === "image" ? (it.orientation ?? "unknown") : "landscape",
    }));
    const slot = planSlot(oriented, this._index, this._pairedShown);

    // Map planned contentIds back to urls, RESOLVING the partner if needed.
    // The partner was found by seeking ahead, so _advance() has never resolved
    // it and its url is still undefined. Dropping it here silently collapsed
    // every pair back to a single cover-fitted image -- i.e. the exact centre-
    // crop this feature exists to prevent.
    const urls: string[] = [];
    for (const cid of slot.items) {
      const found = this._items.find((it) => it.contentId === cid);
      if (!found) continue;
      if (!found.url) {
        await this._resolveItem(found, gen);
        if (gen !== this._gen) return;
      }
      if (found.url) urls.push(found.url);
    }
    if (urls.length === 0) return this._skip();

    // A pair that lost its partner to a resolve failure must fall back to the
    // uncropped presentation, not inherit the pair's "cover".
    const solo = urls.length === 1;
    this._currentUrls = urls;
    this._currentFit = solo
      ? (oriented[this._index]?.orientation === "portrait" ? "contain-blur" : slot.fit)
      : "cover";
    this._currentKind = "image";
    this._currentUrl = urls[0];
    // Remember any partner pulled forward out of sequence so the cursor skips it
    // instead of showing the same photo again later in this pass.
    for (const cid of slot.consumed) this._pairedShown.add(cid);
    // _advance() increments at the top of the next tick, so store one BEFORE
    // where planSlot wants the cursor to land. A pair does NOT skip the items
    // between the two portraits -- they still get their own turn.
    this._index = slot.nextIndex > 0 ? slot.nextIndex - 1 : this._items.length - 1;
    this._timer = setTimeout(() => this._advance(), this._cfg.photoDuration * 1000);
  }

  /** Resolve a media item's playable url via HA, caching it on the item.
   *  Extracted so a PARTNER found by seeking ahead can be resolved too -- the
   *  main loop only ever resolved the item at the cursor. */
  private async _resolveItem(item: MediaItem, gen: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    if (!shouldReResolve(item.resolvedAt, now)) return;
    try {
      const res = await this.hass?.callWS?.({
        type: "media_source/resolve_media",
        media_content_id: item.contentId,
      });
      if (gen !== this._gen) return;
      item.url = res?.url;
      item.resolvedAt = now;
    } catch {
      // Leave url undefined; the caller drops this item rather than failing.
    }
  }

  /** Decode just enough of an image to learn its aspect ratio, then cache it on
   *  the item. Never throws: a decode failure records "unknown", which the slot
   *  planner shows solo rather than pairing. */
  private async _ensureOrientation(item: MediaItem, gen: number): Promise<void> {
    if (item.orientation !== undefined) return;
    // A candidate found by seeking ahead has never been through the main loop,
    // so it has no url yet. Resolving here is what makes look-ahead possible at
    // all: without it every candidate stamped "unknown" -- permanently, since the
    // value is cached -- and planSlot refuses to pair with unknown, so every
    // portrait fell back to contain-blur no matter how many partners existed.
    if (!item.url) {
      await this._resolveItem(item, gen);
      if (gen !== this._gen) return;
    }
    // Leave orientation UNSET on a resolve failure rather than caching "unknown":
    // a transient failure would otherwise blacklist the photo for the session.
    if (!item.url) return;
    const url = item.url;
    const o = await new Promise<Orientation>((resolve) => {
      const probe = new Image();
      // Do not let one unreachable file stall the slideshow forever.
      const to = setTimeout(() => resolve("unknown"), 5000);
      probe.onload = () => { clearTimeout(to); resolve(classifyOrientation(probe.naturalWidth, probe.naturalHeight)); };
      probe.onerror = () => { clearTimeout(to); resolve("unknown"); };
      probe.src = url;
    });
    if (gen !== this._gen) return;
    item.orientation = o;
  }

  private _skip(): void {
    if (this._active) this._timer = setTimeout(() => this._advance(), 0);
  }

  private _stopLoop(): void {
    this._gen++;
    this._loopRunning = false;
    if (this._timer) clearTimeout(this._timer);
    if (this._clock) clearInterval(this._clock);
    this._timer = this._clock = undefined;
    this._currentUrl = "";
    this._currentUrls = [];
  }

  private _tickClock(): void {
    const d = new Date();
    this._now = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Bridge runs whenever the card is on the page, NOT only while the screensaver
    // is showing: input during normal dashboard use must keep restarting the
    // inactivity timer, or the panel would blank while someone is actively using it.
    this._startActivityBridge();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopLoop();
    // Window listeners outlive the element unless removed explicitly.
    this._stopActivityBridge();
  }

  render() {
    if (!this._active) return nothing;
    return html`
      <div class="overlay" style=${styleMap({ "--kb-intensity": String(this._cfg.kenBurnsIntensity) })}>
        ${this._mode === "media" && this._currentUrls.length
          ? this._currentKind === "image"
            ? this._currentUrls.length > 1
              // Two portraits share the frame: each takes half, cover-fitted.
              // No Ken Burns here -- panning two images at once reads as jitter.
              ? html`<div class="pair">
                  ${this._currentUrls.map(
                    (u) => html`<img class="half" src=${u} @error=${this._skip} />`,
                  )}
                </div>`
              : this._currentFit === "contain-blur"
                // A portrait with no partner: shown whole, with a blurred zoomed
                // copy of itself filling the bars so the frame is never empty.
                ? html`<div class="solo">
                    <img class="backdrop" src=${this._currentUrls[0]} aria-hidden="true" />
                    <img class="contained" src=${this._currentUrls[0]} @error=${this._skip} />
                  </div>`
                : html`<img class="media kenburns" src=${this._currentUrls[0]} @error=${this._skip} />`
            : html`<video class="media" src=${this._currentUrls[0]} autoplay muted
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
    /* Two portraits side by side. A hairline gap keeps them from reading as one
       mis-stitched panorama. */
    .pair { display: flex; width: 100%; height: 100%; gap: 2px; }
    .pair .half { flex: 1 1 0; min-width: 0; height: 100%; object-fit: cover; }
    /* Lone portrait: whole image over a blurred, zoomed copy of itself. */
    .solo { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .solo .backdrop { position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; filter: blur(28px) brightness(0.55); transform: scale(1.15); }
    .solo .contained { position: relative; width: 100%; height: 100%;
      object-fit: contain; }
    .kenburns { animation: kb 14s ease-in-out infinite alternate; }
    .fallback { width: 100%; height: 100%;
      background: linear-gradient(120deg,#0f1115,#1b2130,#243657,#1b2130);
      background-size: 300% 300%; animation: grad 18s ease infinite; }
    .clock { position: absolute; bottom: 28px; left: 32px; color: #e8edf6;
      font: 800 56px/1 -apple-system, system-ui, sans-serif; letter-spacing: -1px;
      text-shadow: 0 2px 12px rgba(0,0,0,.6); }
    @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
    @keyframes kb { from { transform: scale(1) translate(0,0) } to { transform: scale(calc(1 + 0.18 * var(--kb-intensity, 0.5))) translate(calc(-4% * var(--kb-intensity, 0.5)), calc(-3% * var(--kb-intensity, 0.5))) } }
    @keyframes grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  `;
}

if (!customElements.get("screensaver-card")) {
  customElements.define("screensaver-card", ScreensaverCard);
}
