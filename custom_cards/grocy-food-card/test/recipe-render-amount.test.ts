import { describe, it, expect } from "vitest";
import { parseIngredients, buildUnitMap, formatAmount } from "../src/shared";

const UNITS = buildUnitMap([{ id: 4, name: "Pound" }, { id: 6, name: "Cup" }] as any);

// Mirrors the DETAIL <li> in recipe-card.ts. Kept in sync by hand because the
// project's vitest environment is "node" with no DOM library, so the Lit
// element cannot be instantiated here. If the <li> changes, change this too.
function renderLine(i: { amount: number | string; unit: string; name: string }) {
  const amt = typeof i.amount === "string" ? i.amount : formatAmount(i.amount);
  const unit = typeof i.amount === "string" ? "" : i.unit;
  return [amt, unit, i.name].filter((s) => s !== "").join(" ");
}

describe("DETAIL renders text amounts", () => {
  it("shows the prose amount instead of blanking it", () => {
    const row = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Salt", recipe_amount: 0,
         recipe_variable_amount: "a pinch", qu_id: 4 }] as any, 1, UNITS)[0];
    expect(renderLine(row)).toBe("a pinch Salt");
  });

  it("drops the unit for a prose amount — 'a pinch Pound Salt' reads as nonsense", () => {
    const row = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Salt", recipe_amount: 0,
         recipe_variable_amount: "a pinch", qu_id: 4 }] as any, 1, UNITS)[0];
    expect(renderLine(row)).not.toContain("Pound");
  });

  it("still renders numeric amounts with their unit", () => {
    const row = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Beef", recipe_amount: 2.25, qu_id: 4 }] as any,
      1, UNITS)[0];
    expect(renderLine(row)).toBe("2.25 Pound Beef");
  });

  it("renders a unit-less numeric row without a stray double space", () => {
    const row = parseIngredients(
      [{ id: 1, recipe_id: 1, product_name: "Eggs", recipe_amount: 3, qu_id: 999 }] as any,
      1, UNITS)[0];
    expect(renderLine(row)).toBe("3 Eggs");
  });
});
