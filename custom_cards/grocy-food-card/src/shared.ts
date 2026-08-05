// Pure parse/format helpers shared by both grocy-food cards. All fail-safe:
// missing/malformed data => safe empty, never throw (screensaver-card discipline).
// Field names are PROVISIONAL (spec §5 OQ-1) — confirm at Tier-2.

export type ShoppingRow = { id: number; name: string; amountLabel: string; note: string };

// Grocy amount is a float (ShoppingListProduct.amount). "2.0 eggs" reads wrong on a
// kitchen screen: integer-valued floats drop the decimal; non-integers render as-is.
// No unit suffix in slice 1 (unit-aware deferred — spec §3.1 YAGNI).
export function formatAmount(amount: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  // String(2.0) === "2" and String(1.5) === "1.5" in JS, so a single String()
  // already drops the trailing .0 for integer-valued floats. No unit suffix (S1).
  return String(amount);
}

export function parseShoppingItems(products?: any[] | null): ShoppingRow[] {
  if (!Array.isArray(products)) return [];
  return products.map((p) => ({
    id: p?.id,
    name: p?.product?.name ?? "(unnamed)",   // name is nested; fail-safe if unhydrated
    amountLabel: formatAmount(p?.amount),
    note: p?.note ?? "",
  }));
}

// day is opaque passthrough (spec §3.2): the serialized form of Grocy's date is
// unconfirmed (OQ-1), so parseMeals does NOT coerce it. Card layer decides date use.
export type MealRow = { id: number; day: unknown; label: string; kind: string };

// type is an OPEN set (spec §3.2): Grocy meal plans have section rows beyond
// RECIPE/PRODUCT/NOTE. The switch has a `default` branch and never throws — an
// unknown/section type renders generically rather than being dropped.
export function parseMeals(meals?: any[] | null): MealRow[] {
  if (!Array.isArray(meals)) return [];
  return meals.map((m) => {
    const kind = String(m?.type ?? "unknown");
    let label: string;
    switch (kind) {
      case "recipe":  label = m?.recipe?.name ?? "(recipe)"; break;
      case "note":    label = m?.note ?? "(note)"; break;
      case "product": label = m?.product?.name ?? "(product)"; break;
      case "section": label = m?.section?.name ?? "(section)"; break;
      default:        label = m?.note ?? m?.recipe?.name ?? "(meal)"; break;
    }
    return { id: m?.id, day: m?.day, label, kind };
  });
}
