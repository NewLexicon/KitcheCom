import { describe, it, expect } from "vitest";
import { parseIngredients, buildUnitMap } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

const ROWS = fixture.recipes_pos_resolved as any;
const UNITS = buildUnitMap(units.quantity_units as any);

describe("parseIngredients (recipes_pos_resolved)", () => {
  it("filters rows to the requested recipe", () => {
    expect(parseIngredients(ROWS, 1, UNITS).length).toBe(3);
    expect(parseIngredients(ROWS, 3, UNITS).length).toBe(2);
  });

  it("maps product_name -> name and resolves the unit via qu_id", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[0]).toEqual({ id: 10, name: "Ground beef", amount: 2.25, unit: "Pound" });
  });

  it("takes recipe_amount as-is — Grocy already scaled it server-side", () => {
    // Live Tacos at its 4->6 factor: base 1.5 arrives as 2.25, base 12 as 18.
    // The card must NOT scale again or a 6-serving recipe renders as 9.
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[0].amount).toBe(2.25);
    expect(rows[1].amount).toBe(18);
  });

  it("rounds server-side float noise to 2dp", () => {
    // Real value Grocy returned for Shortbread butter (0.333 lb x 1.5).
    // Scaling moving server-side did NOT remove the need to round.
    const rows = parseIngredients(ROWS, 3, UNITS);
    expect(rows[0].amount).toBe(0.5);
  });

  it("name fail-safes to (unknown) when product_name is absent", () => {
    const rows = parseIngredients(ROWS, 3, UNITS);
    expect(rows[1].name).toBe("(unknown)");
  });

  it("unit fail-safes to empty string for an unmapped qu_id", () => {
    const rows = parseIngredients(ROWS, 3, UNITS);
    expect(rows[1].unit).toBe("");
  });

  it("unit fail-safes to empty string when the unit map has not loaded yet", () => {
    // DETAIL can render before the quantity_units fetch resolves. That must
    // show a bare amount, not crash and not print "undefined".
    const rows = parseIngredients(ROWS, 1, {});
    expect(rows[0].unit).toBe("");
    expect(rows[0].name).toBe("Ground beef");
  });

  it("renders a text amount from variable_amount rather than a bogus 0", () => {
    // Grocy coerces a text amount posted to recipe_amount into 0; the string
    // here comes from recipe_variable_amount, not from a non-numeric recipe_amount.
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[2].amount).toBe("a pinch");
  });

  it("returns [] for nullish input or an unmatched recipe id (never throws)", () => {
    expect(parseIngredients(undefined, 1, UNITS)).toEqual([]);
    expect(parseIngredients(ROWS, 999, UNITS)).toEqual([]);
  });

  it("returns [] when recipeId is unresolved (no phantom matches)", () => {
    expect(parseIngredients([{ id: 1, product_name: "Mystery" }] as any, undefined, UNITS))
      .toEqual([]);
  });

  it("drops null row entries instead of making phantom rows", () => {
    const out = parseIngredients(
      [null, undefined, { id: 2, recipe_id: 1, product_name: "OK", recipe_amount: 2, qu_id: 6 }] as any,
      1, UNITS);
    expect(out).toEqual([{ id: 2, name: "OK", amount: 2, unit: "Cup" }]);
  });

  it("tolerates a missing unit map argument entirely", () => {
    const rows = parseIngredients(ROWS, 1);
    expect(rows[0].unit).toBe("");
  });

  it("never renders an inherited prototype member as a unit", () => {
    // A string qu_id matching Object.prototype would otherwise resolve to a
    // FUNCTION, which Lit interpolates as "[native code]" on the screen.
    for (const quId of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const out = parseIngredients(
        [{ id: 1, recipe_id: 1, product_name: "X", recipe_amount: 1, qu_id: quId }] as any,
        1, UNITS);
      expect(out[0].unit).toBe("");
    }
  });

  it("resolves a unit given as a numeric string, since object keys are strings", () => {
    const out = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "X", recipe_amount: 1, qu_id: "4" }] as any,
      1, UNITS);
    expect(out[0].unit).toBe("Pound");
  });

  it("passes an empty-string product_name through as empty, not (unknown)", () => {
    // Documented behavior of `??` vs `||` — pinned so a future change is deliberate.
    const out = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "", recipe_amount: 1, qu_id: 4 }] as any,
      1, UNITS);
    expect(out[0].name).toBe("");
  });

  it("prefers recipe_variable_amount when Grocy stored a text amount", () => {
    // Live Grocy 4.6.0: posting amount:"a pinch" COERCES it to 0 and the text is
    // lost; text amounts live in variable_amount instead. Without this branch the
    // row renders "0 Pound Salt" — a wrong quantity on a cooking screen.
    const out = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Salt", recipe_amount: 0,
         recipe_variable_amount: "a pinch", qu_id: 5 }] as any,
      1, UNITS);
    expect(out[0].amount).toBe("a pinch");
    expect(out[0].name).toBe("Salt");
  });

  it("ignores an empty or whitespace-only variable amount", () => {
    for (const v of ["", "   ", null, undefined]) {
      const out = parseIngredients(
        [{ id: 1, recipe_id: 1, product_name: "Flour", recipe_amount: 2,
           recipe_variable_amount: v, qu_id: 6 }] as any,
        1, UNITS);
      expect(out[0].amount).toBe(2);
    }
  });

  it("uses the variable amount even when recipe_amount is a real number", () => {
    // Grocy keeps both fields; when a variable amount is set it is what the
    // recipe author actually wrote, so it wins.
    const out = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Pepper", recipe_amount: 3,
         recipe_variable_amount: "to taste", qu_id: 5 }] as any,
      1, UNITS);
    expect(out[0].amount).toBe("to taste");
  });

  it("trims a variable amount rather than rendering stray whitespace", () => {
    const out = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Salt", recipe_amount: 0,
         recipe_variable_amount: "  a pinch  ", qu_id: 5 }] as any,
      1, UNITS);
    expect(out[0].amount).toBe("a pinch");
  });

  it("ignores a non-string variable amount", () => {
    const out = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Flour", recipe_amount: 2,
         recipe_variable_amount: 42, qu_id: 6 }] as any,
      1, UNITS);
    expect(out[0].amount).toBe(2);
  });
});
