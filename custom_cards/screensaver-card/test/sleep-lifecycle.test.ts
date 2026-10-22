import { describe, it, expect, vi, afterEach } from "vitest";
import { nothing } from "lit";
import { ScreensaverCard, SLEEP_ENTITY } from "../src/screensaver-card";

// Node environment, no DOM: build the card without Lit's lifecycle. Reactive
// fields are defined as OWN properties so assignments skip Lit's setter (which
// needs internals a bare Object.create instance lacks).
function own(obj: object, key: string, value: unknown): void {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true });
}

function states(idle: string, sleep: string) {
  return { "input_boolean.kitchen_idle": { state: idle }, [SLEEP_ENTITY]: { state: sleep } };
}

function makeCard(idle: string, sleep: string, callWS: (msg: any) => Promise<any>) {
  const card = Object.create(ScreensaverCard.prototype) as any;
  for (const [k, v] of Object.entries({
    _display: "off", _mode: "fallback", _currentUrl: "", _currentKind: "image", _now: "",
  })) own(card, k, v);
  Object.assign(card, {
    _items: [], _index: 0, _currentUrls: [], _pairedShown: new Set(), _currentFit: "cover",
    _gen: 0, _loopRunning: false, _timer: undefined, _clock: undefined,
  });
  card.setConfig({});
  own(card, "hass", { states: states(idle, sleep), callWS });
  return card;
}

function setStates(card: any, idle: string, sleep: string): void {
  own(card, "hass", { ...card.hass, states: states(idle, sleep) });
  card.updated(new Map([["hass", undefined]]));
}

/** Flatten a Lit TemplateResult (and nested results/arrays) to its static text. */
function text(v: unknown): string {
  if (Array.isArray(v)) return v.map(text).join("");
  if (v && typeof v === "object" && "strings" in v) {
    const t = v as { strings: readonly string[]; values: unknown[] };
    return t.strings.join("") + t.values.map(text).join("");
  }
  return "";
}

afterEach(() => {
  vi.useRealTimers();
});

describe("screensaver-card sleeping state", () => {
  it("the sleep sensor flipping while NOT idle changes nothing", () => {
    const callWS = vi.fn(async () => ({ children: [] }));
    const card = makeCard("off", "off", callWS);
    card.updated(new Map([["hass", undefined]]));
    setStates(card, "off", "on");
    setStates(card, "off", "off");
    expect(card._display).toBe("off");
    expect(card.render()).toBe(nothing);
    expect(callWS).not.toHaveBeenCalled();
  });

  it("idle turning on inside the window goes straight to sleeping and never browses media", () => {
    const callWS = vi.fn(async () => ({ children: [] }));
    const card = makeCard("off", "on", callWS);
    card.updated(new Map([["hass", undefined]]));
    setStates(card, "on", "on");
    expect(card._display).toBe("sleeping");
    expect(callWS).not.toHaveBeenCalled();
  });

  it("renders plain black while sleeping: no <img>, no fallback gradient, no clock", () => {
    const card = makeCard("on", "on", vi.fn(async () => ({})));
    // Leftover media state must be ignored, not drawn.
    Object.assign(card, { _mode: "media", _currentUrls: ["/media/x.jpg"], _currentKind: "image" });
    card._display = "sleeping";
    const out = text(card.render());
    expect(out).toContain("overlay");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("fallback");
    expect(out).not.toContain("clock");
  });

  it("a resolve already in flight when sleep begins lands afterwards without drawing an <img>", async () => {
    let finish!: (v: unknown) => void;
    const callWS = vi.fn(() => new Promise((r) => { finish = r; }));
    const card = makeCard("on", "off", callWS);
    Object.assign(card, { _items: [{ contentId: "media-source://media_source/local/photos/a.jpg" }], _index: 0 });
    card._display = "photos";
    const advancing = card._advance();                 // starts resolve_media, now pending
    expect(callWS).toHaveBeenCalledTimes(1);
    setStates(card, "on", "on");                       // the window opens mid-resolve
    expect(card._display).toBe("sleeping");
    finish({ url: "/media/local/photos/a.jpg?authSig=x" });
    await advancing;
    expect(card._currentUrls).toEqual([]);
    expect(card._timer).toBeUndefined();
    expect(text(card.render())).not.toContain("<img");
  });

  it("the window closing while sleeping resumes photos (starts the media browse)", async () => {
    vi.useFakeTimers();
    const callWS = vi.fn(async () => ({ children: [] }));
    const card = makeCard("on", "on", callWS);
    card.updated(new Map([["hass", undefined]]));
    expect(card._display).toBe("sleeping");
    setStates(card, "on", "off");
    expect(card._display).toBe("photos");
    // vi.waitFor advances fake timers itself while it polls.
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenCalledWith(expect.objectContaining({ type: "media_source/browse_media" })));
    card._stopLoop();
  });
});
