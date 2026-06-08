// Pure idle-decision logic — the card's one piece of real, testable logic.
// Reads input_boolean.kitchen_idle from hass (spec §5 reactive-card model, M-9).
// Fail-safe: any missing/unknown state => inactive, so the screensaver can never
// trap the screen if the entity is absent.

export const IDLE_ENTITY = "input_boolean.kitchen_idle";

type HassLike = { states?: Record<string, { state?: string } | undefined> };

export function isScreensaverActive(hass?: HassLike): boolean {
  return hass?.states?.[IDLE_ENTITY]?.state === "on";
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
