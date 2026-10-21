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
