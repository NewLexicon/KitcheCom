import { describe, it, expect } from "vitest";
import {
  ACTIVITY_ENTITY,
  ACTIVITY_THROTTLE_MS,
  shouldSendActivityPing,
  resolveConfig,
} from "../src/screensaver-card";

// The activity bridge is the missing half of the wake path (M-10). The screensaver
// turns ON via the inactivity timer, but the ONLY thing that turns it off is a press
// of input_button.kitchen_activity — and nothing was pressing it. On hardware with no
// touch wired that made idle a one-way door: the panel went black and could not be
// recovered from the kitchen at all.
//
// The card is the right place for this: it is already loaded on every dashboard page
// and already holds `hass`, so it can observe real user input and ping HA directly.
// Listening for pointer/key events (not just touch) means a mouse or keyboard wakes
// the panel too, which is what makes it testable before touch hardware exists.

describe("shouldSendActivityPing", () => {
  it("sends the first ping when nothing has been sent yet", () => {
    expect(shouldSendActivityPing(undefined, 1000)).toBe(true);
  });

  it("suppresses a second ping inside the throttle window", () => {
    // A single swipe emits dozens of pointermove events; un-throttled that would be
    // dozens of WS service calls per second.
    expect(shouldSendActivityPing(1000, 1000 + ACTIVITY_THROTTLE_MS - 1)).toBe(false);
  });

  it("allows the next ping once the throttle window has elapsed", () => {
    expect(shouldSendActivityPing(1000, 1000 + ACTIVITY_THROTTLE_MS)).toBe(true);
  });

  it("allows a ping long after the window", () => {
    expect(shouldSendActivityPing(1000, 1000 + ACTIVITY_THROTTLE_MS * 10)).toBe(true);
  });

  it("does not wedge if the clock jumps backwards", () => {
    // now < last can happen across a clock adjustment; treat it as "send" rather than
    // leaving the bridge permanently throttled until the clock catches up.
    expect(shouldSendActivityPing(10_000, 1000)).toBe(true);
  });
});

describe("activity entity config", () => {
  it("defaults to the entity the screensaver package defines", () => {
    expect(ACTIVITY_ENTITY).toBe("input_button.kitchen_activity");
    expect(resolveConfig({}).activityEntity).toBe(ACTIVITY_ENTITY);
  });

  it("accepts an override so a second panel can use its own button", () => {
    expect(resolveConfig({ activity_entity: "input_button.den_activity" }).activityEntity)
      .toBe("input_button.den_activity");
  });

  it("ignores a blank or non-string override", () => {
    expect(resolveConfig({ activity_entity: "" }).activityEntity).toBe(ACTIVITY_ENTITY);
    expect(resolveConfig({ activity_entity: 42 }).activityEntity).toBe(ACTIVITY_ENTITY);
  });

  it("can be disabled entirely", () => {
    // Escape hatch: if a future panel wants the card to observe nothing, it should be
    // possible to turn the bridge off without removing the card.
    expect(resolveConfig({ activity_bridge: false }).activityBridge).toBe(false);
    expect(resolveConfig({}).activityBridge).toBe(true);
  });
});
