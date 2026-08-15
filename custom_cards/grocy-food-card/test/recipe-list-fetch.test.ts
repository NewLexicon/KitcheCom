import { describe, it, expect, vi } from "vitest";
import { fetchRecipes } from "../src/shared";

describe("fetchRecipes", () => {
  it("calls the rest_command with returnResponse and no data", async () => {
    const spy = vi.fn().mockResolvedValue({ response: { content: [] } });
    await fetchRecipes({ callService: spy } as any);
    expect(spy).toHaveBeenCalledWith(
      "rest_command", "grocy_recipe_list", {}, undefined, false, true);
  });

  it("returns the raw rows for parseRecipes to shape", async () => {
    const rows = [{ id: 1, name: "Tacos", base_servings: 4, desired_servings: 6 }];
    const hass = { callService: vi.fn().mockResolvedValue({ response: { content: rows } }) } as any;
    await expect(fetchRecipes(hass)).resolves.toEqual(rows);
  });

  it("returns [] when the service throws — LIST degrades, never crashes", async () => {
    const hass = { callService: vi.fn().mockRejectedValue(new Error("503")) } as any;
    await expect(fetchRecipes(hass)).resolves.toEqual([]);
  });

  it("returns [] for a non-array body, e.g. a Grocy 401 error object", async () => {
    // HA's rest_command does NOT raise on >=400; it parses and returns the body,
    // so a 401 arrives looking like success with an error object inside.
    const hass = { callService: vi.fn().mockResolvedValue({
      response: { content: { error_message: "Invalid API key" }, status: 401 } }) } as any;
    await expect(fetchRecipes(hass)).resolves.toEqual([]);
  });

  it("returns [] when hass is absent", async () => {
    await expect(fetchRecipes(undefined)).resolves.toEqual([]);
  });
});
