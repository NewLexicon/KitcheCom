import { describe, it, expect } from "vitest";
import { shouldNavigate, type HassLike } from "../src/tod-autonav-card";

/** Build a minimal hass stub: current period + defer-timer state. */
function hass(period: string, deferState = "idle"): HassLike {
  return {
    states: {
      "sensor.kitchen_time_of_day": { state: period },
      "timer.kitchen_nav_defer": { state: deferState },
    },
  };
}

describe("shouldNavigate", () => {
  it("navigates when the period no longer matches this view", () => {
    expect(shouldNavigate(hass("afternoon"), "morning")).toBe(true);
  });

  it("does not navigate when already on the correct view", () => {
    expect(shouldNavigate(hass("morning"), "morning")).toBe(false);
  });

  it("does not navigate while the defer timer is active", () => {
    expect(shouldNavigate(hass("afternoon", "active"), "morning")).toBe(false);
  });

  it("navigates once the defer timer has finished", () => {
    // A timer that has run and finished reports "idle" again.
    expect(shouldNavigate(hass("afternoon", "idle"), "morning")).toBe(true);
  });

  it("navigates when the defer timer is paused", () => {
    // Paused is not 'someone is actively touching the panel'.
    expect(shouldNavigate(hass("afternoon", "paused"), "morning")).toBe(true);
  });

  it("does nothing when the sensor is unavailable", () => {
    expect(shouldNavigate(hass("unavailable"), "morning")).toBe(false);
  });

  it("does nothing when the sensor is unknown", () => {
    expect(shouldNavigate(hass("unknown"), "morning")).toBe(false);
  });

  it("does nothing when the sensor is missing entirely", () => {
    expect(shouldNavigate({ states: {} }, "morning")).toBe(false);
  });

  it("does nothing when hass is undefined", () => {
    expect(shouldNavigate(undefined, "morning")).toBe(false);
  });

  it("navigates when the defer timer entity does not exist", () => {
    // A missing timer must fail TOWARD working nav, not away from it — the old
    // design's failure mode was a wedged timer silently disabling auto-nav.
    const h: HassLike = {
      states: { "sensor.kitchen_time_of_day": { state: "evening" } },
    };
    expect(shouldNavigate(h, "morning")).toBe(true);
  });

  it("ignores a period that is not one of the three known views", () => {
    expect(shouldNavigate(hass("teatime"), "morning")).toBe(false);
  });

  it("handles the evening view across the midnight wrap", () => {
    // 00:30 is 'evening' per the sensor; a card on the evening view stays put.
    expect(shouldNavigate(hass("evening"), "evening")).toBe(false);
  });
});
