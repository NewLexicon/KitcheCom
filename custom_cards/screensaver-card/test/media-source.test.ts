import { describe, it, expect } from "vitest";
import { buildBrowseContentId } from "../src/screensaver-card";

describe("buildBrowseContentId", () => {
  it("builds the local media-source id from a folder name", () => {
    expect(buildBrowseContentId("media")).toBe("media-source://media_source/local/media");
  });
  it("trims leading/trailing slashes from the path", () => {
    expect(buildBrowseContentId("/photos/")).toBe("media-source://media_source/local/photos");
  });
  it("defaults to 'media' when path is empty", () => {
    expect(buildBrowseContentId("")).toBe("media-source://media_source/local/media");
  });
});
