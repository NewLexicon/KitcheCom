import { describe, it, expect } from "vitest";
import { shouldReResolve } from "../src/screensaver-card";

const DAY = 3600 * 24;

describe("shouldReResolve", () => {
  it("re-resolves when never resolved (undefined)", () => {
    expect(shouldReResolve(undefined, 1000)).toBe(true);
  });
  it("does not re-resolve a freshly resolved url", () => {
    expect(shouldReResolve(1000, 1000 + 60)).toBe(false); // 60s old, well within ttl
  });
  it("re-resolves once within the safety margin of expiry", () => {
    expect(shouldReResolve(0, DAY - 299)).toBe(true);
    expect(shouldReResolve(0, DAY - 301)).toBe(false);
  });
  it("re-resolves promptly when ttl is shorter than the safety margin (safe default)", () => {
    // ttl 200 < margin 300 => threshold clamps to 0 => any elapsed time re-resolves.
    expect(shouldReResolve(0, 100, 200)).toBe(true);
  });
  it("re-resolves at exactly the threshold (>= boundary)", () => {
    // threshold = DAY - 300; at exactly that elapsed time, >= returns true (safe direction).
    expect(shouldReResolve(0, DAY - 300)).toBe(true);
  });
});
