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
