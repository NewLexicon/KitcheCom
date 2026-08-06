import { describe, it, expect } from "vitest";
import { parseIngredients } from "../src/shared";
import fixture from "./fixtures/recipes-pos.json";

describe("parseIngredients", () => {
  it("filters rows to the requested recipe", () => {
    expect(parseIngredients(fixture.recipes_pos as any, 1).length).toBe(3);
    expect(parseIngredients(fixture.recipes_pos as any, 2).length).toBe(1);
  });
  it("maps a pre-joined row to name/amount/unit", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 1);
    expect(rows[0]).toEqual({ id: 10, name: "Ground beef", amount: 1.5, unit: "lb" });
  });
  it("name fail-safes to (unknown) when the join is unresolved", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 2);
    expect(rows[0].name).toBe("(unknown)");
  });
  it("unit fail-safes to empty string", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 2);
    expect(rows[0].unit).toBe("");
  });
  it("preserves a non-numeric amount for scaleIngredients to pass through", () => {
    const rows = parseIngredients(fixture.recipes_pos as any, 1);
    expect(rows[2].amount).toBe("a pinch");
  });
  it("returns [] for nullish input or an unmatched recipe id (never throws)", () => {
    expect(parseIngredients(undefined, 1)).toEqual([]);
    expect(parseIngredients(fixture.recipes_pos as any, 999)).toEqual([]);
  });
});
