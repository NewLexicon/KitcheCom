import { describe, it, expect } from "vitest";
import { parseShoppingItems, canToggleDone, type ShoppingRow } from "../src/shared";

// 2026-08-18. Two changes, both driven by what grocy v1.15.0 exposes.
//
// 1) DISPLAY NAME. A free-text row (product_id: null) carries its text in `note`,
//    not in product.name. The old parse returned "(unnamed)" and left the real
//    text unused, which is how HA's own built-in card renders it as
//    "1.00x Unknown product" -- unusable on a kitchen wall. Prefer the product
//    name, fall back to the note, and only then to a placeholder.
//
// 2) DONE IS TOGGLEABLE ON EVERY ROW. canCheckOff hid the control on free-text
//    rows because the old `remove_product_in_shopping_list` service keys on
//    PRODUCT id and could not touch them. The todo entity's UPDATE path keys on
//    the ENTRY id, which every row has -- verified live 2026-08-18: checking
//    "paper towels" (product_id: null) wrote done=1 to Grocy.

describe("parseShoppingItems display name", () => {
  it("uses the product name when the row is product-linked", () => {
    const rows = parseShoppingItems([
      { id: 22, product_id: 2, amount: 2, note: null, product: { name: "Milk" } },
    ]);
    expect(rows[0].name).toBe("Milk");
  });

  it("falls back to the note for a free-text row", () => {
    // The live row that exposed this: id 3, no product, text in `note`.
    const rows = parseShoppingItems([
      { id: 3, product_id: null, amount: 1, note: "paper towels", product: null },
    ]);
    expect(rows[0].name).toBe("paper towels");
  });

  it("prefers the product name over a note when both exist", () => {
    const rows = parseShoppingItems([
      { id: 9, product_id: 5, amount: 1, note: "get the big one", product: { name: "Onion" } },
    ]);
    expect(rows[0].name).toBe("Onion");
  });

  it("keeps the note available even when the product name wins", () => {
    const rows = parseShoppingItems([
      { id: 9, product_id: 5, amount: 1, note: "get the big one", product: { name: "Onion" } },
    ]);
    expect(rows[0].note).toBe("get the big one");
  });

  it("falls back to a placeholder only when there is neither", () => {
    const rows = parseShoppingItems([
      { id: 7, product_id: null, amount: 1, note: null, product: null },
    ]);
    expect(rows[0].name).toBe("(unnamed)");
  });

  it("treats a whitespace-only note as absent", () => {
    const rows = parseShoppingItems([
      { id: 8, product_id: null, amount: 1, note: "   ", product: null },
    ]);
    expect(rows[0].name).toBe("(unnamed)");
  });

  it("carries the done flag through", () => {
    const rows = parseShoppingItems([
      { id: 3, product_id: null, amount: 1, note: "paper towels", product: null, done: true },
      { id: 4, product_id: 2, amount: 1, note: null, product: { name: "Milk" }, done: false },
    ]);
    expect(rows[0].done).toBe(true);
    expect(rows[1].done).toBe(false);
  });

  it("defaults done to false when the attribute is absent", () => {
    const rows = parseShoppingItems([{ id: 5, product_id: 2, amount: 1 }]);
    expect(rows[0].done).toBe(false);
  });

  it("coerces Grocy's integer done (0/1) to a boolean", () => {
    // The REST API returns 0/1; the sensor attribute surfaced it as false/true.
    // Accept both rather than trusting one shape.
    const rows = parseShoppingItems([
      { id: 6, product_id: 2, amount: 1, done: 1 },
      { id: 7, product_id: 2, amount: 1, done: 0 },
    ]);
    expect(rows[0].done).toBe(true);
    expect(rows[1].done).toBe(false);
  });
});

describe("canToggleDone", () => {
  const row = (over: Partial<ShoppingRow> = {}): ShoppingRow => ({
    id: 3, productId: null, name: "paper towels", amountLabel: "1",
    amount: 1, note: "paper towels", done: false, ...over,
  });

  it("allows toggling a FREE-TEXT row — the whole point of the change", () => {
    expect(canToggleDone(row({ productId: null }))).toBe(true);
  });

  it("allows toggling a product-linked row", () => {
    expect(canToggleDone(row({ productId: 2, name: "Milk" }))).toBe(true);
  });

  it("refuses a row with no usable entry id", () => {
    // The update keys on the ENTRY id; without one there is nothing to address.
    expect(canToggleDone(row({ id: undefined as any }))).toBe(false);
  });
});
