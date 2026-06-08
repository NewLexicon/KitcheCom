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

export type ScreensaverConfig = {
  mediaPath: string;
  photoDuration: number;
  transitionDuration: number;
  idleEntity: string;
  showClock: boolean;
  shuffle: boolean;
  kenBurnsIntensity: number;
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
    shuffle: raw.shuffle === true,
    kenBurnsIntensity: Math.min(1, Math.max(0,
      typeof raw.ken_burns_intensity === "number" ? raw.ken_burns_intensity : 0.5)),
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

type HassWS = HassLike & { callWS?: (msg: Record<string, unknown>) => Promise<any> };

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
  private _currentKind: "image" | "video" = "image";
  private _now = "";
  private _timer?: ReturnType<typeof setTimeout>;
  private _clock?: ReturnType<typeof setInterval>;
  private _loopRunning = false;
  private _gen = 0;

  setConfig(config: Record<string, unknown>): void {
    this._rawConfig = config ?? {};
    this._cfg = resolveConfig(this._rawConfig);
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
    this._gen++;
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
      <div class="overlay" style=${styleMap({ "--kb-intensity": String(this._cfg.kenBurnsIntensity) })}>
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
    @keyframes kb { from { transform: scale(1) translate(0,0) } to { transform: scale(calc(1 + 0.18 * var(--kb-intensity, 0.5))) translate(calc(-4% * var(--kb-intensity, 0.5)), calc(-3% * var(--kb-intensity, 0.5))) } }
    @keyframes grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  `;
}

if (!customElements.get("screensaver-card")) {
  customElements.define("screensaver-card", ScreensaverCard);
}
