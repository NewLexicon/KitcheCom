import { describe, it, expect } from "vitest";
import { parseMeals } from "../src/shared";
import fixture from "./fixtures/mealplan-sensor.json";

describe("parseMeals", () => {
  it("maps each meal to a row with id, day, label, kind", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows.length).toBe(2);
  });
  it("RECIPE label from nested recipe name", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[0]).toMatchObject({ id: 1, label: "Tacos", kind: "recipe" });
  });
  it("NOTE label from note text", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[1]).toMatchObject({ label: "Leftovers night", kind: "note" });
  });
  // Tier-2 (2026-08-13) corrected this: live Grocy does NOT emit a `type: "section"`
  // ROW. Every row carries section_id: -1 plus a hydrated `section` object whose
  // name is null. The `section` case of parseMeals' switch is therefore currently
  // unreachable from real data — the synthetic open-set test below is what guards
  // the default branch.
  it("a hydrated section object on an ordinary row does not change its kind", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(fixture.attributes.meals[0].section).not.toBeNull(); // guards the fixture
    expect(fixture.attributes.meals[0].section_id).toBe(-1);
    expect(rows[0].kind).toBe("recipe"); // NOT "section"
  });
  it("day is passed through opaque (live sends a full ISO datetime, not a date)", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    // Live shape is "2026-08-14T00:00:00" — parseMeals must not coerce it.
    expect(fixture.attributes.meals[0].day).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(rows[0].day).toBe(fixture.attributes.meals[0].day);
  });
  it("truly-unknown type still yields a row (open set)", () => {
    const rows = parseMeals([{ id: 9, day: "x", type: "future_type_grocy_adds" }] as any);
    expect(rows.length).toBe(1);
    expect(typeof rows[0].label).toBe("string");
  });
  it("returns [] for nullish/empty input (never throws)", () => {
    expect(parseMeals(undefined)).toEqual([]);
    expect(parseMeals([])).toEqual([]);
  });
});
