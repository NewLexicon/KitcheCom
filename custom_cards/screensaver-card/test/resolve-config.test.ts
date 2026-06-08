import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/screensaver-card";

describe("resolveConfig", () => {
  it("applies all defaults for empty config", () => {
    expect(resolveConfig({})).toEqual({
      mediaPath: "media",
      photoDuration: 10,
      transitionDuration: 1.5,
      idleEntity: "input_boolean.kitchen_idle",
      showClock: true,
    });
  });
  it("honors provided overrides", () => {
    const c = resolveConfig({ media_path: "photos", photo_duration: 20, show_clock: false });
    expect(c.mediaPath).toBe("photos");
    expect(c.photoDuration).toBe(20);
    expect(c.showClock).toBe(false);
  });
  it("clamps photo_duration to a 2s floor", () => {
    expect(resolveConfig({ photo_duration: 0 }).photoDuration).toBe(2);
    expect(resolveConfig({ photo_duration: -5 }).photoDuration).toBe(2);
  });
});
