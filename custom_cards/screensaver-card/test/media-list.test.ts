import { describe, it, expect } from "vitest";
import { selectDisplayMode } from "../src/screensaver-card";

describe("selectDisplayMode", () => {
  it("shows media when the list has supported files", () => {
    expect(selectDisplayMode(["a.jpg", "b.mp4"])).toBe("media");
  });
  it("shows fallback when the list is empty", () => {
    expect(selectDisplayMode([])).toBe("fallback");
  });
  it("shows fallback when the list is null/undefined (missing dir)", () => {
    expect(selectDisplayMode(undefined)).toBe("fallback");
  });
  it("ignores unsupported file types, shows fallback if none remain", () => {
    expect(selectDisplayMode(["notes.txt", "thumbs.db"])).toBe("fallback");
  });
  it("shows media when supported and unsupported files are mixed", () => {
    expect(selectDisplayMode(["notes.txt", "photo.JPG"])).toBe("media");
  });
});
