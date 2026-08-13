import { describe, it, expect } from "vitest";
import { parseShoppingItems, formatAmount } from "../src/shared";
import fixture from "./fixtures/shopping-sensor.json";

describe("formatAmount", () => {
  it("strips trailing .0 for integer-valued floats", () => {
    expect(formatAmount(2.0)).toBe("2");
  });
  it("keeps non-integer floats as-is", () => {
    expect(formatAmount(1.5)).toBe("1.5");
  });
  it("fail-safe for missing/NaN amount", () => {
    expect(formatAmount(undefined as any)).toBe("");
    expect(formatAmount(NaN)).toBe("");
  });
});

describe("parseShoppingItems", () => {
  it("maps each product to a row with id, name, amountLabel, note", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows.length).toBe(3);
    // ids are the LIVE shopping_list entry ids (Tier-2-captured), not the
    // invented 11/12/13 of the provisional fixture.
    expect(rows[0]).toEqual({ id: 1, name: "Eggs", amountLabel: "2", note: "" });
  });
  it("names from nested product; falls back to (unnamed) when product absent", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows[2].name).toBe("(unnamed)");
  });
  it("normalizes a null note to empty string (live sends null, not \"\")", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(fixture.attributes.products[0].note).toBeNull(); // guards the fixture itself
    expect(rows[0].note).toBe("");
  });
  it("returns [] for nullish/empty input (never throws)", () => {
    expect(parseShoppingItems(undefined)).toEqual([]);
    expect(parseShoppingItems([])).toEqual([]);
  });
});
