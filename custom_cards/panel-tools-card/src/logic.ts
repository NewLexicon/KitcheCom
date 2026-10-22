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
  screensaverEnabled: "input_boolean.kitchen_screensaver_enabled",
  sleepEnabled: "input_boolean.kitchen_sleep_enabled",
  sleepStart: "input_datetime.kitchen_sleep_start",
  sleepEnd: "input_datetime.kitchen_sleep_end",
} as const;

/** Sleep only works once the panel goes idle, and go-idle is gated on the
 *  screensaver safety switch (screensaver.yaml). Anything but "on" means a sleep
 *  setting would silently do nothing — so say so in the drawer (spec §3/§4). */
export function showSleepHint(screensaverEnabled: string | undefined): boolean {
  return screensaverEnabled !== "on";
}
