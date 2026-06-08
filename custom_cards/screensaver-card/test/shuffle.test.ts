import { describe, it, expect } from "vitest";
import { shuffleOrder } from "../src/screensaver-card";

// Deterministic rand stub: returns a fixed sequence in [0,1).
const seqRand = (values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("shuffleOrder", () => {
  it("returns a new array, does not mutate input", () => {
    const input = [1, 2, 3];
    const out = shuffleOrder(input, seqRand([0, 0, 0]));
    expect(input).toEqual([1, 2, 3]);
    expect(out).not.toBe(input);
  });
  it("contains exactly the same elements (a permutation)", () => {
    const out = shuffleOrder([1, 2, 3, 4], seqRand([0.9, 0.1, 0.5, 0.2]));
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
  });
  it("is deterministic for a given rand", () => {
    const a = shuffleOrder([1, 2, 3, 4, 5], seqRand([0.1, 0.7, 0.3, 0.9]));
    const b = shuffleOrder([1, 2, 3, 4, 5], seqRand([0.1, 0.7, 0.3, 0.9]));
    expect(a).toEqual(b);
  });
  it("handles empty and single-element arrays", () => {
    expect(shuffleOrder([], seqRand([0]))).toEqual([]);
    expect(shuffleOrder([7], seqRand([0]))).toEqual([7]);
  });
});
