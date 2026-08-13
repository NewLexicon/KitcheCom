import { describe, it, expect, vi } from "vitest";
import { fetchIngredients, fetchUnitMap } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

function fakeHass(response: unknown, spy = vi.fn()) {
  return {
    callService: spy.mockResolvedValue({ response: { content: response } }),
  } as any;
}

describe("fetchIngredients", () => {
  it("calls the rest_command with the recipe id and returnResponse", async () => {
    const spy = vi.fn().mockResolvedValue({ response: { content: [] } });
    await fetchIngredients(fakeHass([], spy), 7);
    expect(spy).toHaveBeenCalledWith(
      "rest_command", "grocy_recipe_ingredients", { recipe_id: 7 }, undefined, false, true);
  });

  it("returns the raw rows for parseIngredients to shape", async () => {
    const rows = fixture.recipes_pos_resolved;
    const out = await fetchIngredients(fakeHass(rows), 1);
    expect(out).toEqual(rows);
  });

  it("returns [] when the service throws — DETAIL must degrade, not crash", async () => {
    const hass = { callService: vi.fn().mockRejectedValue(new Error("503")) } as any;
    await expect(fetchIngredients(hass, 1)).resolves.toEqual([]);
  });

  it("returns [] when the response shape is unexpected", async () => {
    const hass = { callService: vi.fn().mockResolvedValue({}) } as any;
    await expect(fetchIngredients(hass, 1)).resolves.toEqual([]);
  });

  it("returns [] when hass is absent", async () => {
    await expect(fetchIngredients(undefined, 1)).resolves.toEqual([]);
  });
});

describe("fetchUnitMap", () => {
  it("returns a built map from the service response", async () => {
    const map = await fetchUnitMap(fakeHass(units.quantity_units));
    expect(map[4]).toBe("Pound");
  });

  it("returns {} when the service fails — units blank, amounts still render", async () => {
    const hass = { callService: vi.fn().mockRejectedValue(new Error("nope")) } as any;
    await expect(fetchUnitMap(hass)).resolves.toEqual({});
  });
});
