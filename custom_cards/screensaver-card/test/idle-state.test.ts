import { describe, it, expect } from "vitest";
import { isScreensaverActive } from "../src/screensaver-card";

const hassWith = (state: string) => ({
  states: { "input_boolean.kitchen_idle": { state } },
}) as any;

describe("isScreensaverActive", () => {
  it("is active when kitchen_idle is on", () => {
    expect(isScreensaverActive(hassWith("on"))).toBe(true);
  });
  it("is inactive when kitchen_idle is off", () => {
    expect(isScreensaverActive(hassWith("off"))).toBe(false);
  });
  it("is inactive when the entity is missing (fail-safe: never trap the screen)", () => {
    expect(isScreensaverActive({ states: {} } as any)).toBe(false);
  });
  it("is inactive when hass is undefined", () => {
    expect(isScreensaverActive(undefined)).toBe(false);
  });
  it("uses a custom idle entity when provided", () => {
    const hass = { states: { "input_boolean.den_idle": { state: "on" } } } as any;
    expect(isScreensaverActive(hass, "input_boolean.den_idle")).toBe(true);
  });
  it("defaults to input_boolean.kitchen_idle when no entity given", () => {
    const hass = { states: { "input_boolean.kitchen_idle": { state: "on" } } } as any;
    expect(isScreensaverActive(hass)).toBe(true);
  });
});
