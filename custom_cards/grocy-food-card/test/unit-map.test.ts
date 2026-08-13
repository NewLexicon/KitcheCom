import { describe, it, expect } from "vitest";
import { buildUnitMap } from "../src/shared";
import units from "./fixtures/quantity-units.json";

describe("buildUnitMap", () => {
  it("maps quantity-unit ids to their names", () => {
    const map = buildUnitMap(units.quantity_units as any);
    expect(map[4]).toBe("Pound");
    expect(map[2]).toBe("Piece");
    expect(map[7]).toBe("Gram");
  });

  it("returns an empty map for nullish or malformed input (never throws)", () => {
    expect(buildUnitMap(undefined)).toEqual({});
    expect(buildUnitMap(null)).toEqual({});
    expect(buildUnitMap("not an array" as any)).toEqual({});
  });

  it("skips rows missing an id or a name rather than emitting junk keys", () => {
    const map = buildUnitMap([
      { id: 1, name: "Good" },
      { name: "NoId" },
      { id: 2 },
      null,
    ] as any);
    expect(map).toEqual({ 1: "Good" });
  });

  it("prefers the singular name — plural forms are not v1 behavior", () => {
    const map = buildUnitMap([{ id: 9, name: "Cup", name_plural: "Cups" }] as any);
    expect(map[9]).toBe("Cup");
  });
});
