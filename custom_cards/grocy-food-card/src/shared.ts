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

// Decode the entities a WYSIWYG editor actually emits. Deliberately a small
// fixed map, not a general HTML entity decoder — this is a readability pass
// for one field, not a parser. &amp; is decoded LAST so "&amp;lt;" yields
// "&lt;" rather than "<".
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&deg;/g, "°")
    .replace(/&amp;/g, "&");
}

// Grocy's recipe `description` is WYSIWYG-authored HTML. We render it as PLAIN
// TEXT (spec §5.4) — unsafeHTML on user-authored content is an injection surface
// and a sanitizer dependency is disproportionate for one field.
//
// The separator rule is load-bearing: deleting tags without inserting newlines
// turns <ol><li>Preheat</li><li>Mix</li></ol> into "PreheatMix". The DETAIL view
// must render the result with `white-space: pre-line` or step 1 is wasted.
//
// Two fixed defects, both deliberate (not luck): (1) the tag-removal regex
// requires a tag-like start (letter, /, or !) so a literal "<200 ... >5" in
// recipe prose is not mistaken for a tag and silently deleted; (2) common HTML
// entities (&amp;, &nbsp;, &deg;, etc.) are decoded after tag removal so they
// don't render literally on the kitchen screen.
export function stripTags(html?: string | null): string {
  if (typeof html !== "string" || html.length === 0) return "";
  return html
    // 1. block-level closers + line breaks become newlines
    .replace(/<\/(li|p|div|h[1-6]|tr)\s*>|<br\s*\/?>/gi, "\n")
    // 2. remove every remaining tag. Require a tag-like start (letter, /, or !)
    // so a literal "<200 ... >5" in prose is not mistaken for a tag and
    // silently deleted.
    .replace(/<\/?[a-zA-Z!][^>]*>/g, "")
    // 3. decode entities AFTER tag removal, BEFORE newline-collapse so a
    // decoded &nbsp; participates in whitespace collapsing.
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => decodeEntities(m))
    // 4. collapse runs of newlines (incl. surrounding spaces), then trim
    .replace(/[ \t]*\n[ \t]*(\n[ \t]*)+/g, "\n")
    .trim();
}

export type RecipeRow = {
  id: number;
  name: string;
  pictureUrl: string | null;
  baseServings: number;
  desiredServings: number;
  instructions: string;
};

// Grocy serves recipe pictures from this path. Loaded via <img src> — image
// loads are NOT CORS-gated, unlike a fetch (spec §2.1).
const PICTURE_BASE = "/api/files/recipepictures/";

export function parseRecipes(recipes?: any[] | null): RecipeRow[] {
  if (!Array.isArray(recipes)) return [];
  return recipes.map((r) => {
    // base is a DIVISOR in scaleIngredients — 0/negative/missing must become 1.
    const rawBase = r?.base_servings;
    const baseServings =
      typeof rawBase === "number" && Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 1;
    const rawDesired = r?.desired_servings;
    const desiredServings =
      typeof rawDesired === "number" && Number.isFinite(rawDesired) && rawDesired > 0
        ? rawDesired
        : baseServings;
    return {
      id: r?.id,
      name: r?.name ?? "(untitled recipe)",
      pictureUrl: r?.picture_file_name ? PICTURE_BASE + r.picture_file_name : null,
      baseServings,
      desiredServings,
      instructions: stripTags(r?.description),
    };
  });
}

/** Unit name for a qu_id, or "" when unresolvable.
 *
 * Guards the prototype chain: `unitsById[qu_id]` alone would return an inherited
 * Object.prototype member (a function) for a qu_id of "constructor"/"toString",
 * and `?? ""` does not catch that because a function is not nullish. */
function resolveUnit(unitsById: Record<number, string>, quId: unknown): string {
  if (quId === null || quId === undefined) return "";
  const key = quId as PropertyKey;
  if (!Object.prototype.hasOwnProperty.call(unitsById, key)) return "";
  const name = (unitsById as Record<PropertyKey, unknown>)[key];
  return typeof name === "string" ? name : "";
}

/** 2dp rounding that passes non-numeric amounts through untouched (spec §4.3).
 *
 * ⚠️ The return type is `number | string`, NOT `unknown`. `IngredientRow.amount`
 * is `number | string` (shared.ts:68) and the project runs `strict: true`, so an
 * `unknown` return fails the build with:
 *   TS2322: Type '{ …; amount: unknown; … }[]' is not assignable to 'IngredientRow[]'
 * The `as` cast is doing real work: the non-numeric branch genuinely widens an
 * `unknown` input, and the row contract is what constrains it to a string. */
function roundAmount(amount: unknown): number | string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return amount as number | string;
  return Math.round(amount * 100) / 100;
}

/** Rows from /objects/recipes_pos_resolved -> IngredientRow[] for one recipe.
 *
 * AMENDED 2026-08-10 (spec §4.2). Previously read `r.name` / `r.unit`, which
 * exist on NO Grocy payload — every live ingredient rendered "(unknown)" with a
 * blank unit. The resolved endpoint supplies `product_name` (joined) and
 * `recipe_amount` (ALREADY SCALED server-side); units come from `unitsById`.
 *
 * The IngredientRow contract is deliberately unchanged so downstream consumers
 * — scaleIngredients and the DETAIL render — need no edit.
 *
 * `??` (not `||`) on product_name: an empty-string name passes through as empty,
 * matching parseShoppingItems' posture. Only null/undefined become "(unknown)".
 */
export function parseIngredients(
  rows?: any[] | null,
  recipeId?: number,
  unitsById: Record<number, string> = {},
): IngredientRow[] {
  if (!Array.isArray(rows)) return [];
  // An unresolved recipeId must yield [], not "every row whose recipe_id is also
  // missing". Without this, `undefined === undefined` matches — and null entries
  // (null?.recipe_id is undefined) become phantom rows.
  if (recipeId === undefined || recipeId === null) return [];
  return rows
    .filter((r) => r != null && r.recipe_id === recipeId)
    .map((r) => ({
      id: r?.id,
      name: r?.product_name ?? "(unknown)",
      // Grocy pre-scales, but it also emits float noise doing so
      // (0.333 lb x 1.5 came back as 0.49950000000000006). Round here for the
      // same reason scaleIngredients does — formatAmount would print every digit.
      amount: roundAmount(r?.recipe_amount),
      // Own-property + string check, NOT just `?? ""`: a qu_id of "constructor"
      // or "toString" would otherwise resolve to an inherited Object.prototype
      // FUNCTION, which Lit renders as "[native code]" on the kitchen screen.
      unit: resolveUnit(unitsById, r?.qu_id),
    }));
}

/** qu_id → unit name. Built once per card lifetime from /objects/quantity_units.
 *
 * WHY THIS EXISTS: recipes_pos_resolved pre-joins product_name but carries NO
 * unit name — qu_id stays a bare int (spec §4.2). An earlier probe reported a
 * unit name on the resolved row; that was a substring false-positive on
 * `only_check_single_unit_in_stock`. A full key dump confirmed otherwise.
 *
 * v1 uses the singular `name` for every amount. Pluralizing on amount !== 1 is
 * a deliberate non-goal (YAGNI) — "2 Pound Ground beef" reads acceptably on a
 * kitchen screen and `name_plural` can be wired later without a shape change.
 */
export function buildUnitMap(rows?: any[] | null): Record<number, string> {
  if (!Array.isArray(rows)) return {};
  const map: Record<number, string> = {};
  for (const r of rows) {
    if (r == null) continue;
    if (typeof r.id !== "number" || typeof r.name !== "string") continue;
    map[r.id] = r.name;
  }
  return map;
}
