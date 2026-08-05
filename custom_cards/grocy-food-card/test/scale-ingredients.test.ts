import { describe, it, expect } from "vitest";
import { scaleIngredients, formatAmount, type IngredientRow } from "../src/shared";

const rows = (amount: any): IngredientRow[] => [{ id: 1, name: "Flour", amount, unit: "cup" }];

describe("scaleIngredients", () => {
  it("scales by desired/base", () => {
    expect(scaleIngredients(rows(2), 4, 8)[0].amount).toBe(4);
  });
  it("scale factor 1 when base equals desired", () => {
    expect(scaleIngredients(rows(2), 4, 4)[0].amount).toBe(2);
  });
  it("rounds to at most 2dp — no float noise", () => {
    // 0.1 * 3 === 0.30000000000000004 in IEEE754
    expect(scaleIngredients(rows(0.1), 1, 3)[0].amount).toBe(0.3);
  });
  it("treats baseServings 0 as 1 (never divides by zero)", () => {
    const out = scaleIngredients(rows(2), 0, 3)[0].amount as number;
    expect(Number.isFinite(out)).toBe(true);
    expect(out).toBe(6);
  });
  it("treats negative/NaN/missing baseServings as 1", () => {
    expect(scaleIngredients(rows(2), -4, 2)[0].amount).toBe(4);
    expect(scaleIngredients(rows(2), NaN, 2)[0].amount).toBe(4);
    expect(scaleIngredients(rows(2), undefined as any, 2)[0].amount).toBe(4);
  });
  it("missing desiredServings means factor 1.0", () => {
    expect(scaleIngredients(rows(2), 4, undefined as any)[0].amount).toBe(2);
  });
  it("passes a non-numeric amount through AS-IS (never NaN)", () => {
    expect(scaleIngredients(rows("a pinch"), 4, 8)[0].amount).toBe("a pinch");
  });
  it("DOCUMENTED v1 LIMITATION: a passed-through string renders blank via formatAmount", () => {
    // spec §4.3 — pass-through wins at the scale layer, formatAmount blanks it at render.
    // This test exists to keep the collision visible, not to bless it.
    const scaled = scaleIngredients(rows("a pinch"), 4, 8)[0].amount;
    expect(formatAmount(scaled as any)).toBe("");
  });
  it("returns [] for nullish input (never throws)", () => {
    expect(scaleIngredients(undefined as any, 4, 8)).toEqual([]);
    expect(scaleIngredients([], 4, 8)).toEqual([]);
  });
});
