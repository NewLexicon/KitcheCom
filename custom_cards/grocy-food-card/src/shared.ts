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

// canCheckOff gates whether the ✓ button renders. If the shopping-list id (OQ-3)
// isn't resolvable, we render rows read-only rather than firing a call that 500s
// (chores done_by precedent — spec §4.2).
export function canCheckOff(shoppingListId?: string): boolean {
  return typeof shoppingListId === "string" && shoppingListId.length > 0;
}

// buildRemovePayload — INPUT→OUTPUT MAPPING ONLY (spec §3.3 boundary). The field
// names/shape here are the provisional best-guess for grocy.remove_product_in_shopping_list;
// Tier-2 confirms them (OQ-2 product_id-vs-entry-id; OQ-3 list-id key). NOT proof
// the service accepts this shape.
export function buildRemovePayload(shoppingListId: string, productId: number) {
  return { shopping_list_id: shoppingListId, product_id: productId };
}

// ---- Slice 2: recipes ----------------------------------------------------
// Field names are PROVISIONAL (spec §4, OQ-S2-2) — weaker evidence than S1's.

export type IngredientRow = { id: number; name: string; amount: number | string; unit: string };

// scaleIngredients OWNS the rounding. Do NOT move it into formatAmount — that
// helper is shared with S1's shopping card and changing it would silently alter
// that card's rendering (spec §4.3).
//
// A non-numeric amount passes through AS-IS so it never becomes NaN. Note the
// documented consequence: formatAmount then renders it as "" (spec §4.3).
export function scaleIngredients(
  rows?: IngredientRow[] | null,
  baseServings?: number,
  desiredServings?: number,
): IngredientRow[] {
  if (!Array.isArray(rows)) return [];
  // A zero/negative/NaN/missing base is a divisor hazard — treat as 1.
  const base =
    typeof baseServings === "number" && Number.isFinite(baseServings) && baseServings > 0
      ? baseServings
      : 1;
  // A missing/invalid desired falls back to base (factor 1.0), NOT to 1 — that
  // keeps "no desiredServings given" a no-op scale rather than always normalizing
  // to a single serving. Don't "simplify" this to `: 1`; see the factor-1.0 test.
  const desired =
    typeof desiredServings === "number" && Number.isFinite(desiredServings) && desiredServings > 0
      ? desiredServings
      : base;
  const factor = desired / base;
  return rows.map((r) => {
    if (!r) return r; // null/undefined row: pass through as-is, never fabricate {}
    if (typeof r.amount !== "number" || !Number.isFinite(r.amount)) return { ...r };
    // Round to <=2dp BEFORE formatAmount ever sees it: 0.1*3 is 0.30000000000000004.
    const scaled = Math.round(r.amount * factor * 100) / 100;
    // A finite amount can still overflow when scaled — never emit Infinity to the screen.
    return Number.isFinite(scaled) ? { ...r, amount: scaled } : { ...r };
  });
}

// Grocy's recipe `description` is WYSIWYG-authored HTML. We render it as PLAIN
// TEXT (spec §5.4) — unsafeHTML on user-authored content is an injection surface
// and a sanitizer dependency is disproportionate for one field.
//
// The separator rule is load-bearing: deleting tags without inserting newlines
// turns <ol><li>Preheat</li><li>Mix</li></ol> into "PreheatMix". The DETAIL view
// must render the result with `white-space: pre-line` or step 1 is wasted.
export function stripTags(html?: string | null): string {
  if (typeof html !== "string" || html.length === 0) return "";
  return html
    // 1. block-level closers + line breaks become newlines
    .replace(/<\/(li|p|div|h[1-6]|tr)\s*>|<br\s*\/?>/gi, "\n")
    // 2. remove every remaining tag
    .replace(/<[^>]*>/g, "")
    // 3. collapse runs of newlines (incl. surrounding spaces), then trim
    .replace(/[ \t]*\n[ \t]*(\n[ \t]*)+/g, "\n")
    .trim();
}
