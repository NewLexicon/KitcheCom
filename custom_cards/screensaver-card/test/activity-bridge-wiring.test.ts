import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ScreensaverCard, ACTIVITY_EVENTS, ACTIVITY_THROTTLE_MS } from "../src/screensaver-card";

// The pure throttle logic is covered in activity-bridge.test.ts. This file covers the
// WIRING: that the card actually attaches window listeners, that an observed event
// reaches hass.callService with the right payload, and that it detaches on teardown.
//
// The suite runs in the `node` environment (vitest.config.ts), so there is no DOM.
// Rather than pull in happy-dom for one file, we install a minimal fake `window` that
// records listeners and lets the test dispatch to them directly. That keeps the test
// honest about the contract we depend on — addEventListener/removeEventListener with
// capture — without simulating a whole browser.

type Listener = (ev: unknown) => void;

let listeners: Map<string, Set<Listener>>;
let originalWindow: unknown;

beforeEach(() => {
  listeners = new Map();
  originalWindow = (globalThis as any).window;
  (globalThis as any).window = {
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
  };
});

afterEach(() => {
  (globalThis as any).window = originalWindow;
  vi.restoreAllMocks();
});

/** Set `hass` without tripping LitElement's reactive property setter. */
function setHass(card: unknown, hass: unknown): void {
  Object.defineProperty(card, "hass", {
    value: hass, writable: true, configurable: true, enumerable: true,
  });
}

/** Build a card with hass stubbed, bypassing LitElement's real lifecycle. */
function makeCard(config: Record<string, unknown> = {}) {
  const card = Object.create(ScreensaverCard.prototype) as any;
  // Fields normally set by class initialisers; assign what the bridge touches.
  card._lastActivityPing = undefined;
  card._activityHandler = undefined;
  card.setConfig(config);
  const calls: Array<{ domain: string; service: string; data: unknown }> = [];
  // Define `hass` as a plain own property: assigning it normally would hit
  // LitElement's reactive setter, which needs internals a bare Object.create
  // instance does not have. The bridge only ever reads this.hass.
  setHass(card, {
    callService: (domain: string, service: string, data: unknown) => {
      calls.push({ domain, service, data });
    },
  });
  return { card, calls };
}

const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn({ type }));
const countAll = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);

describe("activity bridge wiring", () => {
  it("registers a listener for every activity event type", () => {
    const { card } = makeCard();
    card._startActivityBridge();
    for (const ev of ACTIVITY_EVENTS) {
      expect(listeners.get(ev)?.size, `no listener for ${ev}`).toBe(1);
    }
  });

  it("presses the activity button when input is observed", () => {
    const { card, calls } = makeCard();
    card._startActivityBridge();
    fire("pointerdown");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      domain: "input_button",
      service: "press",
      data: { entity_id: "input_button.kitchen_activity" },
    });
  });

  it("wakes on keyboard too, so the panel is testable without touch hardware", () => {
    const { card, calls } = makeCard();
    card._startActivityBridge();
    fire("keydown");
    expect(calls).toHaveLength(1);
  });

  it("collapses a burst of events into a single service call", () => {
    const { card, calls } = makeCard();
    card._startActivityBridge();
    // A swipe: many pointermove events in the same instant.
    vi.spyOn(Date, "now").mockReturnValue(1000);
    for (let i = 0; i < 50; i++) fire("pointermove");
    expect(calls).toHaveLength(1);
  });

  it("pings again once the throttle window passes", () => {
    const { card, calls } = makeCard();
    card._startActivityBridge();
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    fire("pointerdown");
    now.mockReturnValue(1000 + ACTIVITY_THROTTLE_MS);
    fire("pointerdown");
    expect(calls).toHaveLength(2);
  });

  it("removes every listener on teardown", () => {
    const { card } = makeCard();
    card._startActivityBridge();
    expect(countAll()).toBe(ACTIVITY_EVENTS.length);
    card._stopActivityBridge();
    expect(countAll(), "listeners leaked past teardown").toBe(0);
  });

  it("does not double-register if started twice", () => {
    const { card } = makeCard();
    card._startActivityBridge();
    card._startActivityBridge();
    expect(countAll()).toBe(ACTIVITY_EVENTS.length);
  });

  it("registers nothing when the bridge is disabled", () => {
    const { card } = makeCard({ activity_bridge: false });
    card._startActivityBridge();
    expect(countAll()).toBe(0);
  });

  it("honours a custom activity entity", () => {
    const { card, calls } = makeCard({ activity_entity: "input_button.den_activity" });
    card._startActivityBridge();
    fire("pointerdown");
    expect(calls[0].data).toEqual({ entity_id: "input_button.den_activity" });
  });

  it("refuses a non-input_button entity rather than calling the wrong service", () => {
    const { card, calls } = makeCard({ activity_entity: "light.kitchen" });
    card._startActivityBridge();
    fire("pointerdown");
    expect(calls).toHaveLength(0);
  });

  it("survives hass being absent", () => {
    const { card } = makeCard();
    setHass(card, undefined);
    card._startActivityBridge();
    expect(() => fire("pointerdown")).not.toThrow();
  });

  it("survives callService throwing", () => {
    const { card } = makeCard();
    setHass(card, { callService: () => { throw new Error("ws down"); } });
    card._startActivityBridge();
    expect(() => fire("pointerdown")).not.toThrow();
  });
});
