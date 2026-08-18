import { describe, it, expect } from "vitest";
import { classifyOrientation, planSlot, PARTNER_SEEK_LIMIT, type Oriented } from "../src/screensaver-card";

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
    expect(slot).toMatchObject({ items: ["a"], fit: "cover", nextIndex: 1 });
  });

  it("pairs two consecutive portraits side by side", () => {
    const slot = planSlot([P("a"), P("b"), L("c")], 0);
    expect(slot.items).toEqual(["a", "b"]);
    expect(slot.fit).toBe("cover");
  });

  it("shows a lone trailing portrait contained, with a blurred backdrop", () => {
    // Odd count: "c" has no partner. It must not crop and must not pair with
    // the landscape that follows in the next pass.
    const slot = planSlot([L("a"), P("b"), P("c"), P("d")], 3);
    expect(slot).toMatchObject({ items: ["d"], fit: "contain-blur", nextIndex: 0 });
  });

  it("does not pair a portrait with a following landscape", () => {
    const slot = planSlot([P("a"), L("b")], 0);
    expect(slot).toMatchObject({ items: ["a"], fit: "contain-blur", nextIndex: 1 });
  });

  it("wraps nextIndex to 0 at the end of the list", () => {
    expect(planSlot([L("a"), L("b")], 1).nextIndex).toBe(0);
  });

  it("wraps correctly when a pair ends the list", () => {
    // "b" seeks ahead and pairs with "c"; the cursor still advances by one.
    expect(planSlot([L("a"), P("b"), P("c")], 1).nextIndex).toBe(2);
  });

  it("treats unknown orientation as a safe solo cover — never pairs it", () => {
    // Pairing an undecodable image would leave half the screen empty.
    expect(planSlot([U("a"), P("b")], 0)).toMatchObject({
      items: ["a"], fit: "cover", nextIndex: 1,
    });
  });

  it("does not pair a portrait with an unknown", () => {
    expect(planSlot([P("a"), U("b")], 0)).toMatchObject({
      items: ["a"], fit: "contain-blur", nextIndex: 1,
    });
  });

  it("returns an empty slot for an empty list rather than throwing", () => {
    expect(planSlot([], 0)).toMatchObject({ items: [], fit: "cover", nextIndex: 0 });
  });

  it("recovers from an out-of-range index instead of freezing the loop", () => {
    const slot = planSlot([L("a")], 99);
    expect(slot.items).toEqual(["a"]);
    expect(slot.nextIndex).toBe(0);
  });

  it("pairs three portraits as (2 then 1), not (1 then 2)", () => {
    const items = [P("a"), P("b"), P("c")];
    const first = planSlot(items, 0);
    expect(first.items).toEqual(["a", "b"]);
    // "b" was consumed as the partner, so the cursor must skip it and land on "c".
    const second = planSlot(items, first.nextIndex, new Set(first.consumed));
    expect(second.items).toEqual(["c"]);
    expect(second.fit).toBe("contain-blur");
  });
});

describe("planSlot — seeking a partner ahead (2026-08-18)", () => {
  it("pairs a portrait with the next portrait even when landscapes sit between", () => {
    // The real library is ~20 portraits scattered among ~122 photos, so adjacent
    // portraits are rare. Pairing must SEEK rather than depend on list order.
    const slot = planSlot([P("a"), L("x"), L("y"), P("b"), L("z")], 0);
    expect(slot.items).toEqual(["a", "b"]);
    expect(slot.fit).toBe("cover");
  });

  it("does not re-show the partner it already consumed", () => {
    // "b" was shown alongside "a"; the next tick must not display it again.
    const items = [P("a"), L("x"), P("b"), L("y")];
    const first = planSlot(items, 0);
    expect(first.items).toEqual(["a", "b"]);
    const second = planSlot(items, first.nextIndex);
    expect(second.items).not.toContain("b");
  });

  it("advances to the item after the first portrait, not after the partner", () => {
    // Landscapes between the pair must still get their turn.
    const slot = planSlot([P("a"), L("x"), P("b")], 0);
    expect(slot.nextIndex).toBe(1);
    expect(slot.consumed).toEqual(["b"]);
  });

  it("falls back to contain-blur when no partner exists anywhere ahead", () => {
    const slot = planSlot([L("x"), P("a"), L("y"), L("z")], 1);
    expect(slot.items).toEqual(["a"]);
    expect(slot.fit).toBe("contain-blur");
  });

  it("does not wrap around to pair with an earlier portrait", () => {
    // Wrapping would pair the last portrait with the first, which then shows
    // again immediately at the top of the next cycle.
    const slot = planSlot([P("a"), L("x"), P("b")], 2);
    expect(slot.items).toEqual(["b"]);
    expect(slot.fit).toBe("contain-blur");
  });

  it("skips a portrait that was already consumed as a partner", () => {
    const items = [P("a"), P("b"), P("c")];
    const first = planSlot(items, 0);
    expect(first.items).toEqual(["a", "b"]);
    // index 1 is "b", already shown as a partner — it must be skipped, not
    // re-shown, and "c" displayed instead.
    const second = planSlot(items, first.nextIndex, new Set(first.consumed));
    expect(second.items).toEqual(["c"]);
  });

  it("never pairs with an unknown even when seeking", () => {
    const slot = planSlot([P("a"), U("x"), L("y")], 0);
    expect(slot.items).toEqual(["a"]);
    expect(slot.fit).toBe("contain-blur");
  });
});

describe("PARTNER_SEEK_LIMIT", () => {
  it("is large enough that a partner is usually found in a real library", () => {
    // ~34 portraits among 122 photos means a partner is typically within a few
    // places. A limit of 1 was the original bug: everything past item+1 stayed
    // unprobed, read as "unknown", and pairing could never fire.
    expect(PARTNER_SEEK_LIMIT).toBeGreaterThanOrEqual(20);
  });

  it("is bounded so one tick cannot decode an entire album", () => {
    // Each probe is a real image fetch. A lone portrait must not trigger 122 of
    // them while the viewer waits.
    expect(PARTNER_SEEK_LIMIT).toBeLessThanOrEqual(60);
  });
});
