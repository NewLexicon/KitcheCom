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

// Expects bare filenames / basenames (e.g. "photo.jpg"), NOT URLs with query strings.
// When HA media_source URLs are wired in later, strip any "?query"/"#fragment" before
// matching, or endsWith(ext) will silently drop e.g. "photo.jpg?token=…". (Deferred.)
export function selectDisplayMode(files: string[] | undefined | null): "media" | "fallback" {
  if (!files || files.length === 0) return "fallback";
  const usable = files.filter((f) =>
    SUPPORTED.some((ext) => f.toLowerCase().endsWith(ext))
  );
  return usable.length > 0 ? "media" : "fallback";
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
