import { describe, it, expect } from "vitest";
import { canCheckOff, buildRemovePayload } from "../src/shared";

describe("canCheckOff", () => {
  it("false when the shopping-list id is absent (OQ-3 unresolved => read-only)", () => {
    expect(canCheckOff(undefined)).toBe(false);
    expect(canCheckOff("")).toBe(false);
  });
  it("true when a shopping-list id is available", () => {
    expect(canCheckOff("1")).toBe(true);
  });
});

describe("buildRemovePayload", () => {
  // Tier-1: asserts input->output MAPPING only. Whether these are the exact fields
  // the service accepts (product_id vs entry id; list-id key name) is OQ-2/OQ-3,
  // confirmed at Tier-2. Do not read this test as "check-off works".
  it("maps (listId, productId) into the service-data shape", () => {
    expect(buildRemovePayload("1", 3)).toEqual({
      shopping_list_id: "1",
      product_id: 3,
    });
  });
});
