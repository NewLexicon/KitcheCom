import { describe, it, expect } from "vitest";
import { selectSubdirectories } from "../src/screensaver-card";

const tree = (children: any[]) => ({ children }) as any;

describe("selectSubdirectories", () => {
  it("returns content-ids of expandable directories", () => {
    const out = selectSubdirectories(tree([
      { media_content_id: "x/sub1", can_expand: true },
      { media_content_id: "x/sub2", can_expand: true },
    ]));
    expect(out).toEqual(["x/sub1", "x/sub2"]);
  });
  it("skips leaves (can_expand false)", () => {
    const out = selectSubdirectories(tree([
      { media_content_id: "x/a.jpg", can_expand: false },
      { media_content_id: "x/sub", can_expand: true },
    ]));
    expect(out).toEqual(["x/sub"]);
  });
  it("skips a directory missing media_content_id", () => {
    const out = selectSubdirectories(tree([
      { can_expand: true },
      { media_content_id: "x/sub", can_expand: true },
    ]));
    expect(out).toEqual(["x/sub"]);
  });
  it("returns [] for empty or childless tree", () => {
    expect(selectSubdirectories(tree([]))).toEqual([]);
    expect(selectSubdirectories({} as any)).toEqual([]);
  });
});
