import { describe, it, expect } from "vitest";
import { nextMediaIndex } from "../src/screensaver-card";

describe("nextMediaIndex", () => {
  it("advances by one", () => { expect(nextMediaIndex(0, 3)).toBe(1); });
  it("wraps around at the end", () => { expect(nextMediaIndex(2, 3)).toBe(0); });
  it("returns 0 for a single item", () => { expect(nextMediaIndex(0, 1)).toBe(0); });
  it("returns 0 when count is 0 (no items, safe)", () => { expect(nextMediaIndex(0, 0)).toBe(0); });
  it("handles an out-of-range current index defensively", () => { expect(nextMediaIndex(99, 3)).toBe(0); });
});
