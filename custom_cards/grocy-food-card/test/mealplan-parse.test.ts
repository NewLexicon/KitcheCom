import { describe, it, expect } from "vitest";
import { parseMeals } from "../src/shared";
import fixture from "./fixtures/mealplan-sensor.json";

describe("parseMeals", () => {
  it("maps each meal to a row with id, day, label, kind", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows.length).toBe(3);
  });
  it("RECIPE label from nested recipe name", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[0]).toMatchObject({ id: 1, label: "Tacos", kind: "recipe" });
  });
  it("NOTE label from note text", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[1]).toMatchObject({ label: "Leftovers night", kind: "note" });
  });
  it("UNKNOWN/section type falls through the default branch, never throws", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
    expect(rows[2].kind).toBe("section");
    expect(typeof rows[2].label).toBe("string"); // safe generic fallback, some string
  });
  it("day is passed through opaque (no Date coercion — stays the raw fixture value)", () => {
    const rows = parseMeals(fixture.attributes.meals as any);
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
