import { describe, it, expect } from "vitest";
import { parseRecipes } from "../src/shared";
import fixture from "./fixtures/recipes.json";

describe("parseRecipes", () => {
  it("maps each recipe to a row", () => {
    expect(parseRecipes(fixture.recipes as any).length).toBe(3);
  });
  it("builds pictureUrl from picture_file_name", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[0].pictureUrl).toContain("tacos.jpg");
  });
  it("pictureUrl is null when picture_file_name is absent (LIST branches on this)", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[1].pictureUrl).toBeNull();
  });
  it("name fail-safes to (untitled recipe)", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[2].name).toBe("(untitled recipe)");
  });
  it("baseServings fail-safes to 1 — it is a divisor", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[2].baseServings).toBe(1);   // fixture has base_servings: 0
  });
  it("instructions come through stripped of markup", () => {
    const rows = parseRecipes(fixture.recipes as any);
    expect(rows[0].instructions).toBe("Brown the beef\nWarm tortillas");
  });
  it("returns [] for nullish/malformed input (never throws)", () => {
    expect(parseRecipes(undefined)).toEqual([]);
    expect(parseRecipes([])).toEqual([]);
  });
});
