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
    // invented 11/12/13 of the provisional fixture. productId/amount were added
    // for the check-off payload (the service keys on product id, not entry id).
    expect(rows[0]).toEqual({
      id: 1,
      productId: 1,
      name: "Eggs",
      amountLabel: "2",
      amount: 2,
      note: "",
      // grocy v1.15.0 carries `done`; absent in this pre-v1.15 fixture, so the
      // parse defaults it to false rather than leaving it undefined.
      done: false,
    });
  });
  it("names from nested product, then the free-text note, then a placeholder", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows[0].name).toBe("Eggs");            // product-linked
    // CHANGED 2026-08-18. This row (product_id: null, note "paper towels") used
    // to render "(unnamed)" with its real text unused -- the same defect that
    // makes HA's built-in card show "1.00x Unknown product". The note is now the
    // fallback. A placeholder is only used when there is genuinely no text, which
    // shopping-display-name.test.ts covers.
    expect(rows[2].name).toBe("paper towels");    // free-text
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
