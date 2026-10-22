import { describe, it, expect } from "vitest";
import { displayState, SLEEP_ENTITY } from "../src/screensaver-card";

const hass = (idle?: string, sleep?: string) => {
  const states: Record<string, { state: string }> = {};
  if (idle !== undefined) states["input_boolean.kitchen_idle"] = { state: idle };
  if (sleep !== undefined) states[SLEEP_ENTITY] = { state: sleep };
  return { states } as any;
};

describe("displayState", () => {
  it("defaults the sleep entity to binary_sensor.kitchen_sleep_window", () => {
    expect(SLEEP_ENTITY).toBe("binary_sensor.kitchen_sleep_window");
  });
  it("is off when not idle, whatever the sleep window says", () => {
    expect(displayState(hass("off", "on"))).toBe("off");
    expect(displayState(hass("off", "off"))).toBe("off");
  });
  it("is off when hass or the idle entity is missing", () => {
    expect(displayState(undefined)).toBe("off");
    expect(displayState(hass(undefined, "on"))).toBe("off");
  });
  it("is sleeping when idle and the window is on", () => {
    expect(displayState(hass("on", "on"))).toBe("sleeping");
  });
  it("shows photos when idle and the window is off", () => {
    expect(displayState(hass("on", "off"))).toBe("photos");
  });
  it.each([["missing", undefined], ["unavailable", "unavailable"], ["unknown", "unknown"]])(
    "fails ON: a %s sleep entity shows photos, never black",
    (_label, sleep) => {
      expect(displayState(hass("on", sleep))).toBe("photos");
    },
  );
  it("honours custom idle and sleep entities", () => {
    const h = { states: { "input_boolean.den_idle": { state: "on" }, "binary_sensor.den_sleep": { state: "on" } } } as any;
    expect(displayState(h, "input_boolean.den_idle", "binary_sensor.den_sleep")).toBe("sleeping");
  });
});
