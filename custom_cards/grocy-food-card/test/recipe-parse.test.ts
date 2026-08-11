import { describe, it, expect } from "vitest";
import { parseRecipes } from "../src/shared";
import fixture from "./fixtures/recipes.json";

describe("parseRecipes", () => {
  it("maps each recipe to a row", () => {
    expect(parseRecipes(fixture.recipes as any).length).toBe(3);
  });
  it("never builds a picture URL — the picture path is disabled in v1", () => {
    // Two live-verified blockers (2026-08-11): Grocy's files API needs the
    // filename BASE64-encoded (raw name -> 404), and the fetch requires the API
    // key (-> 401), which an <img src> cannot send as a header. A query-param key
    // works but would expose a full read+write key in the DOM — rejected, same
    // reasoning as spec §2's proxy decision. Tiles use the placeholder instead.
    const rows = parseRecipes([
      { id: 1, name: "Tacos", picture_file_name: "tacos.jpg", base_servings: 4 },
      { id: 2, name: "Pancakes", picture_file_name: null, base_servings: 2 },
    ] as any);
    expect(rows[0].pictureUrl).toBeNull();
    expect(rows[1].pictureUrl).toBeNull();
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
