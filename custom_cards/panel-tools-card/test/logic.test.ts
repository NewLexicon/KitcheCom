import { describe, it, expect } from "vitest";
import { topLevelFilename, hexEncodeUtf8, isSupportedName, isVideoName } from "../src/logic";

const ROOT = "media-source://media_source/local/photos";

describe("topLevelFilename", () => {
  it("returns the raw name for a top-level file", () => {
    expect(topLevelFilename(`${ROOT}/Rowan's birthday.jpg`, "photos")).toBe("Rowan's birthday.jpg");
  });
  it("does NOT percent-decode — HA ids are raw paths (local_source.py:250)", () => {
    expect(topLevelFilename(`${ROOT}/50%off.jpg`, "photos")).toBe("50%off.jpg");
    expect(topLevelFilename(`${ROOT}/a%20b.jpg`, "photos")).toBe("a%20b.jpg");
  });
  it("returns null for a file in a subfolder (hide is top-level only)", () => {
    expect(topLevelFilename(`${ROOT}/trip/a.jpg`, "photos")).toBeNull();
  });
  it("does not mistake the sibling hidden folder for the photos folder", () => {
    expect(topLevelFilename("media-source://media_source/local/photos-hidden/a.jpg", "photos")).toBeNull();
  });
  it("returns null for the folder itself", () => {
    expect(topLevelFilename(ROOT, "photos")).toBeNull();
    expect(topLevelFilename(`${ROOT}/`, "photos")).toBeNull();
  });
});

describe("hexEncodeUtf8", () => {
  it("encodes ASCII", () => {
    expect(hexEncodeUtf8("a b")).toBe("612062");
  });
  it("encodes UTF-8 bytes, not UTF-16 code units", () => {
    expect(hexEncodeUtf8("é")).toBe("c3a9");
  });
  it("encodes an emoji as its four UTF-8 bytes", () => {
    expect(hexEncodeUtf8("🐟")).toBe("f09f909f");
  });
  it("emits only lowercase hex, whatever the name contains", () => {
    expect(hexEncodeUtf8(`Rowan's "best" day.jpg`)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("isSupportedName / isVideoName", () => {
  it("accepts the screensaver's extensions, case-insensitively", () => {
    expect(isSupportedName("a.JPG")).toBe(true);
    expect(isSupportedName("clip.webm")).toBe(true);
  });
  it("rejects HEIC", () => {
    expect(isSupportedName("IMG_3702.HEIC")).toBe(false);
  });
  it("judges a name containing # or ? by its real extension", () => {
    expect(isSupportedName("Party #2.jpg")).toBe(true);
    expect(isSupportedName("what?.png")).toBe(true);
  });
  it("identifies videos", () => {
    expect(isVideoName("clip.MP4")).toBe(true);
    expect(isVideoName("a.jpg")).toBe(false);
  });
});
