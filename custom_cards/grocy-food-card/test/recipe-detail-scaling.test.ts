import { describe, it, expect } from "vitest";
import { parseIngredients, buildUnitMap, scaleIngredients } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

const ROWS = fixture.recipes_pos_resolved as any;
const UNITS = buildUnitMap(units.quantity_units as any);

describe("DETAIL ingredient amounts are not scaled twice", () => {
  it("parsed amounts are already final for a 4->6 recipe", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    expect(rows[1].amount).toBe(18);   // not 12 (unscaled) and not 27 (double)
  });

  it("re-scaling would corrupt them — this is what the card must NOT do", () => {
    const rows = parseIngredients(ROWS, 1, UNITS);
    const doubled = scaleIngredients(rows, 4, 6);
    expect(doubled[1].amount).toBe(27);
  });
});
