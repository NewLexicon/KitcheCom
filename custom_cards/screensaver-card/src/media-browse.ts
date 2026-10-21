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
