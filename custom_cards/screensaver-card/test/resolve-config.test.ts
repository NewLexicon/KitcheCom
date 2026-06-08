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
      shuffle: false,
      kenBurnsIntensity: 0.5,
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
  it("falls back to 'media' when media_path is an empty string", () => {
    expect(resolveConfig({ media_path: "" }).mediaPath).toBe("media");
  });
  it("defaults shuffle to false and kenBurnsIntensity to 0.5", () => {
    const c = resolveConfig({});
    expect(c.shuffle).toBe(false);
    expect(c.kenBurnsIntensity).toBe(0.5);
  });
  it("honors shuffle: true", () => {
    expect(resolveConfig({ shuffle: true }).shuffle).toBe(true);
  });
  it("treats non-true shuffle values as false (strict boolean)", () => {
    expect(resolveConfig({ shuffle: "true" as unknown as boolean }).shuffle).toBe(false);
    expect(resolveConfig({ shuffle: 1 as unknown as boolean }).shuffle).toBe(false);
  });
  it("clamps ken_burns_intensity to [0,1] (both ends) and reads snake_case", () => {
    expect(resolveConfig({ ken_burns_intensity: -0.5 }).kenBurnsIntensity).toBe(0);
    expect(resolveConfig({ ken_burns_intensity: 2 }).kenBurnsIntensity).toBe(1);
    expect(resolveConfig({ ken_burns_intensity: 0.3 }).kenBurnsIntensity).toBe(0.3);
  });
});
