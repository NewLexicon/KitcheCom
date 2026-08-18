import { describe, it, expect } from "vitest";
import { classifyOrientation, planSlot, type Oriented } from "../src/screensaver-card";

const P = (id: string): Oriented => ({ contentId: id, orientation: "portrait" });
const L = (id: string): Oriented => ({ contentId: id, orientation: "landscape" });
const U = (id: string): Oriented => ({ contentId: id, orientation: "unknown" });

describe("classifyOrientation", () => {
  it("calls a taller-than-wide image portrait", () => {
    expect(classifyOrientation(1080, 1920)).toBe("portrait");
  });

  it("calls a wider-than-tall image landscape", () => {
    expect(classifyOrientation(1920, 1080)).toBe("landscape");
  });

  it("treats a square image as landscape — it fills the frame without cropping", () => {
    expect(classifyOrientation(1000, 1000)).toBe("landscape");
  });

  it("returns unknown when dimensions are missing or nonsensical", () => {
    // A failed decode reports 0x0. Guessing portrait there would pair two
    // broken images into one slot and blank half the screen.
    expect(classifyOrientation(0, 0)).toBe("unknown");
    expect(classifyOrientation(-5, 100)).toBe("unknown");
    expect(classifyOrientation(NaN, 100)).toBe("unknown");
  });
});

describe("planSlot", () => {
  it("shows a landscape image alone, full frame", () => {
    const slot = planSlot([L("a"), P("b"), P("c")], 0);
    expect(slot).toEqual({ items: ["a"], fit: "cover", nextIndex: 1 });
  });

  it("pairs two consecutive portraits side by side", () => {
    const slot = planSlot([P("a"), P("b"), L("c")], 0);
    expect(slot).toEqual({ items: ["a", "b"], fit: "cover", nextIndex: 2 });
  });

  it("shows a lone trailing portrait contained, with a blurred backdrop", () => {
    // Odd count: "c" has no partner. It must not crop and must not pair with
    // the landscape that follows in the next pass.
    const slot = planSlot([L("a"), P("b"), P("c"), P("d")], 3);
    expect(slot).toEqual({ items: ["d"], fit: "contain-blur", nextIndex: 0 });
  });

  it("does not pair a portrait with a following landscape", () => {
    const slot = planSlot([P("a"), L("b")], 0);
    expect(slot).toEqual({ items: ["a"], fit: "contain-blur", nextIndex: 1 });
  });

  it("wraps nextIndex to 0 at the end of the list", () => {
    expect(planSlot([L("a"), L("b")], 1).nextIndex).toBe(0);
  });

  it("wraps correctly when a pair ends the list", () => {
    expect(planSlot([L("a"), P("b"), P("c")], 1).nextIndex).toBe(0);
  });

  it("treats unknown orientation as a safe solo cover — never pairs it", () => {
    // Pairing an undecodable image would leave half the screen empty.
    expect(planSlot([U("a"), P("b")], 0)).toEqual({
      items: ["a"], fit: "cover", nextIndex: 1,
    });
  });

  it("does not pair a portrait with an unknown", () => {
    expect(planSlot([P("a"), U("b")], 0)).toEqual({
      items: ["a"], fit: "contain-blur", nextIndex: 1,
    });
  });

  it("returns an empty slot for an empty list rather than throwing", () => {
    expect(planSlot([], 0)).toEqual({ items: [], fit: "cover", nextIndex: 0 });
  });

  it("recovers from an out-of-range index instead of freezing the loop", () => {
    const slot = planSlot([L("a")], 99);
    expect(slot.items).toEqual(["a"]);
    expect(slot.nextIndex).toBe(0);
  });

  it("pairs three portraits as (2 then 1), not (1 then 2)", () => {
    const first = planSlot([P("a"), P("b"), P("c")], 0);
    expect(first.items).toEqual(["a", "b"]);
    const second = planSlot([P("a"), P("b"), P("c")], first.nextIndex);
    expect(second.items).toEqual(["c"]);
    expect(second.fit).toBe("contain-blur");
    expect(second.nextIndex).toBe(0);
  });
});
