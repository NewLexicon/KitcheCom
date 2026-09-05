import { describe, it, expect } from "vitest";
import { planResumeOrder, type MediaItem } from "../src/screensaver-card";

const mk = (ids: string[]): MediaItem[] =>
  ids.map((contentId) => ({ contentId, kind: "image" as const }));

const idsOf = (items: MediaItem[]) => items.map((i) => i.contentId);

describe("planResumeOrder", () => {
  it("shuffles and starts fresh when there is no previous order", () => {
    const fresh = mk(["a", "b", "c", "d"]);
    const r = planResumeOrder(fresh, [], -1, true, Math.random);
    expect(idsOf(r.items).sort()).toEqual(["a", "b", "c", "d"]);
    expect(r.index).toBe(-1);
    expect(r.reshuffled).toBe(true);
  });

  // The point of the change: a second activation continues the SAME deck.
  it("resumes the previous order and cursor when the collection is unchanged", () => {
    const prev = mk(["c", "a", "d", "b"]);   // an already-shuffled order
    const fetched = mk(["a", "b", "c", "d"]); // HA returns them in its own order
    const r = planResumeOrder(fetched, prev, 1, true, Math.random);
    expect(idsOf(r.items)).toEqual(["c", "a", "d", "b"]); // order preserved
    expect(r.index).toBe(1);                              // cursor preserved
    expect(r.reshuffled).toBe(false);
  });

  it("keeps going from the cursor rather than restarting at 0", () => {
    const prev = mk(["p", "q", "r", "s", "t"]);
    const r = planResumeOrder(mk(["t", "s", "r", "q", "p"]), prev, 3, true, Math.random);
    expect(r.index).toBe(3);
    expect(idsOf(r.items)).toEqual(["p", "q", "r", "s", "t"]);
  });

  it("reshuffles when a photo is ADDED", () => {
    const prev = mk(["a", "b", "c"]);
    const r = planResumeOrder(mk(["a", "b", "c", "d"]), prev, 1, true, Math.random);
    expect(r.reshuffled).toBe(true);
    expect(r.index).toBe(-1);
    expect(idsOf(r.items).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("reshuffles when a photo is REMOVED", () => {
    const prev = mk(["a", "b", "c", "d"]);
    const r = planResumeOrder(mk(["a", "c", "d"]), prev, 2, true, Math.random);
    expect(r.reshuffled).toBe(true);
    expect(r.index).toBe(-1);
    expect(idsOf(r.items).sort()).toEqual(["a", "c", "d"]);
  });

  it("reshuffles when a photo is SWAPPED (same count, different content)", () => {
    const prev = mk(["a", "b", "c"]);
    const r = planResumeOrder(mk(["a", "b", "z"]), prev, 1, true, Math.random);
    expect(r.reshuffled).toBe(true);
    expect(idsOf(r.items).sort()).toEqual(["a", "b", "z"]);
  });

  it("carries resolved urls across a resume so the cache survives", () => {
    const prev: MediaItem[] = [
      { contentId: "a", kind: "image", url: "u-a", resolvedAt: 111 },
      { contentId: "b", kind: "image", url: "u-b", resolvedAt: 222 },
    ];
    const r = planResumeOrder(mk(["a", "b"]), prev, 0, true, Math.random);
    expect(r.reshuffled).toBe(false);
    expect(r.items[0].url).toBe("u-a");
    expect(r.items[0].resolvedAt).toBe(111);
    expect(r.items[1].url).toBe("u-b");
  });

  it("does not shuffle at all when shuffle is disabled", () => {
    const fetched = mk(["a", "b", "c"]);
    const r = planResumeOrder(fetched, [], -1, false, Math.random);
    expect(idsOf(r.items)).toEqual(["a", "b", "c"]);  // HA's own order, untouched
    expect(r.reshuffled).toBe(true);
    expect(r.index).toBe(-1);
  });

  it("resumes with shuffle disabled too (cursor still preserved)", () => {
    const prev = mk(["a", "b", "c"]);
    const r = planResumeOrder(mk(["a", "b", "c"]), prev, 1, false, Math.random);
    expect(r.index).toBe(1);
    expect(r.reshuffled).toBe(false);
  });

  it("handles an empty collection", () => {
    const r = planResumeOrder([], mk(["a"]), 0, true, Math.random);
    expect(r.items).toEqual([]);
    expect(r.index).toBe(-1);
  });

  it("clamps an out-of-range stored cursor", () => {
    const prev = mk(["a", "b", "c"]);
    const r = planResumeOrder(mk(["a", "b", "c"]), prev, 99, true, Math.random);
    expect(r.index).toBeLessThan(3);
  });

  // Coverage property: resuming means a full cycle completes across activations.
  it("covers every photo across short sessions without repeats", () => {
    const N = 20;
    const all = mk([...Array(N).keys()].map(String));
    let items: MediaItem[] = [];
    let index = -1;
    const shown: string[] = [];
    // 5 activations of 4 photos each = exactly one full cycle of 20.
    for (let session = 0; session < 5; session++) {
      const r = planResumeOrder(all, items, index, true, Math.random);
      items = r.items; index = r.index;
      for (let k = 0; k < 4; k++) {
        index = index < 0 ? 0 : (index + 1) % items.length;
        shown.push(items[index].contentId);
      }
    }
    expect(shown).toHaveLength(N);
    expect(new Set(shown).size).toBe(N);   // no repeats within the cycle
  });
});
