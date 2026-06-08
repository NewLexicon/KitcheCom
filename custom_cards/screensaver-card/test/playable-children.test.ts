import { describe, it, expect } from "vitest";
import { selectPlayableChildren } from "../src/screensaver-card";

const tree = (children: any[]) => ({ children }) as any;

describe("selectPlayableChildren", () => {
  it("keeps playable image and video leaves with contentId + kind", () => {
    const out = selectPlayableChildren(tree([
      { media_content_id: "x/a.jpg", media_class: "image", can_play: true, can_expand: false },
      { media_content_id: "x/b.mp4", media_class: "video", can_play: true, can_expand: false },
    ]));
    expect(out).toEqual([
      { contentId: "x/a.jpg", kind: "image" },
      { contentId: "x/b.mp4", kind: "video" },
    ]);
  });
  it("skips directories (can_expand true)", () => {
    const out = selectPlayableChildren(tree([
      { media_content_id: "x/sub", media_class: "directory", can_play: false, can_expand: true },
      { media_content_id: "x/a.jpg", media_class: "image", can_play: true, can_expand: false },
    ]));
    expect(out).toEqual([{ contentId: "x/a.jpg", kind: "image" }]);
  });
  it("skips non-image/video media classes", () => {
    const out = selectPlayableChildren(tree([
      { media_content_id: "x/song.mp3", media_class: "music", can_play: true, can_expand: false },
    ]));
    expect(out).toEqual([]);
  });
  it("returns [] for an empty or childless tree", () => {
    expect(selectPlayableChildren(tree([]))).toEqual([]);
    expect(selectPlayableChildren({} as any)).toEqual([]);
  });
});
