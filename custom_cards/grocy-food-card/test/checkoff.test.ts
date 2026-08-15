import { describe, it, expect } from "vitest";
import { canCheckOff, buildRemovePayload, parseShoppingItems } from "../src/shared";
import fixture from "./fixtures/shopping-sensor.json";

describe("canCheckOff", () => {
  it("false when the shopping-list id is absent (OQ-3 => read-only)", () => {
    expect(canCheckOff(undefined, 1)).toBe(false);
    expect(canCheckOff("", 1)).toBe(false);
  });
  it("true when a shopping-list id and a product id are both available", () => {
    expect(canCheckOff("1", 1)).toBe(true);
  });
  // Tier-2 (2026-08-13): grocy.remove_product_in_shopping_list keys on PRODUCT id.
  // A shopping-list entry with no product (Grocy allows a free-text row — the
  // "paper towels" fixture case) can never be removed through it. Rendering a ✓
  // there gives a button that silently does nothing, so the card hides it.
  it("false when the row has no product id — the ✓ would be a dead button", () => {
    expect(canCheckOff("1", null)).toBe(false);
    expect(canCheckOff("1", undefined)).toBe(false);
  });
});

describe("buildRemovePayload", () => {
  // Tier-2-CONFIRMED against the live service (2026-08-13). The registered
  // signature is (list_id, product_id, amount) — verified by calling it through
  // HA and watching the row change in Grocy:
  //   {shopping_list_id:"1", product_id:1}      -> HTTP 400 (the old guessed shape)
  //   {list_id:1, product_id:1, amount:2}       -> HTTP 200, row removed
  it("uses list_id (NOT shopping_list_id) — the guessed key 400s", () => {
    const p = buildRemovePayload("1", 3, 2);
    expect(p).toHaveProperty("list_id");
    expect(p).not.toHaveProperty("shopping_list_id");
  });
  it("maps (listId, productId, amount) into the confirmed service shape", () => {
    expect(buildRemovePayload("1", 3, 2)).toEqual({
      list_id: 1,
      product_id: 3,
      amount: 2,
    });
  });
  it("coerces a string list id to a number (config may supply either)", () => {
    expect(buildRemovePayload("1", 3, 2).list_id).toBe(1);
  });
  // Reaching zero deletes the row (Tier-2-verified), so sending the row's FULL
  // amount is how ✓ removes an item outright.
  it("passes a whole row amount through unchanged", () => {
    expect(buildRemovePayload("1", 3, 2).amount).toBe(2);
  });

  // ⚠️ GROCY TRUNCATES THE REMOVAL AMOUNT — Tier-2-verified 2026-08-13 by reading
  // Grocy 4.6.0's own source and reproducing against its REST API directly:
  //
  //   StockApiController.php:745   $amount = intval($requestBody['product_amount']);
  //
  // intval(1.5) === 1, so a 1.5 row decrements to 0.5 and SURVIVES. Observed
  // end-to-end (start -> send -> result):
  //   1.5 -> 1.5 (intval 1)  -> 0.5   row survives  <- the defect
  //   1.5 -> 2   (intval 2)  -> DELETED
  //   0.5 -> 1   (intval 1)  -> DELETED
  //
  // The service layer itself handles floats fine (StockService.php:1169); only the
  // REST controller truncates. Removing MORE than the row holds is safe — Grocy
  // deletes at "< 0.1"-ish rather than clamping at zero — so rounding UP is the
  // correct fix. Do not "simplify" this to pass the raw amount.
  it("rounds a fractional amount UP so the row actually deletes", () => {
    expect(buildRemovePayload("1", 3, 1.5).amount).toBe(2);
  });
  it("rounds a sub-1 fractional amount up to 1", () => {
    expect(buildRemovePayload("1", 3, 0.5).amount).toBe(1);
  });
  it("leaves a whole amount alone rather than inflating it", () => {
    expect(buildRemovePayload("1", 3, 3).amount).toBe(3);
  });
  // A non-finite amount would serialise as null/NaN and 400 the service. Grocy's
  // own controller defaults to 1 (StockApiController.php:736), so match it.
  it("falls back to 1 when the amount is not a finite number", () => {
    expect(buildRemovePayload("1", 3, NaN).amount).toBe(1);
    expect(buildRemovePayload("1", 3, Infinity).amount).toBe(1);
    expect(buildRemovePayload("1", 3, undefined as unknown as number).amount).toBe(1);
  });
});

describe("parseShoppingItems — productId/amount for check-off", () => {
  // The service needs the PRODUCT id, but rows are keyed by ENTRY id, and they
  // differ in live data. The row must carry both.
  it("exposes productId separately from the entry id", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows[0].id).toBe(1); // entry id
    expect(rows[0].productId).toBe(1); // product id
  });
  it("productId is null on a product-less row (drives the hidden ✓)", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows[2].productId).toBeNull();
  });
  it("carries the numeric amount for the remove payload", () => {
    const rows = parseShoppingItems(fixture.attributes.products as any);
    expect(rows[0].amount).toBe(2);
    expect(rows[1].amount).toBe(1.5);
  });
});
