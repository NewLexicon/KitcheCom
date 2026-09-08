# Grocery ordering — scoped down, with the deferred design captured

**Status:** 2026-09-08. **Only the recipe→list piece is in scope now** (user's call).
Everything below the line is deliberately deferred, recorded so it is not re-derived.

## In scope now

**Populate the Grocy shopping list from a recipe**, so a planned meal produces the things to buy.
Verified working — see §"Verified" below. Ordering is manual: read the list, order at Kroger /
Amazon / Costco yourself.

## Verified against the live Grocy (2026-09-08)

| Fact | Detail |
|---|---|
| Add-recipe-to-list endpoint | `POST /api/recipes/{id}/add-not-fulfilled-products-to-shoppinglist` → **204** |
| What it adds | Only ingredients **not already in stock** ("not fulfilled") |
| Proven | Adding recipe 1 (Tacos) created 4 shopping-list rows; all 4 deleted afterwards |
| Multiple lists | Supported (`/objects/shopping_lists`) — **currently only 1**, "Shopping list" |
| Per-product store | Products carry **`shopping_location_id`** — Grocy's native "buy this at X" |
| Stores defined | **0** |
| Stock tracked | **0 products** |

⚠️ **The last two rows are the blocker for everything deferred.** With no stock data,
"not-fulfilled" currently means "everything", and no rule can know whether we already have chicken.

---

## DEFERRED — the store-routing idea (user's, 2026-09-08)

The real problem, in the user's words: Costco is a **2-hour round trip**. Some staples — chicken,
frozen pizza, ground beef, coffee — are Costco purchases when there is time to make the run. But if
they are out of chicken and want to cook chicken this week, it also has to go on the Kroger or
Amazon order. Then, if the Costco run happens first, the Kroger chicken should be cancelled.

**Why this is not just a preference table:** it needs to know *what is actually in stock*, and
that is exactly what is missing today.

**The pieces Grocy already provides** (so do not build these by hand):
- `shopping_location_id` per product = the preferred store.
- Multiple shopping lists = one list per store (Kroger / Costco / Amazon).
- `/api/stock` = what is on hand, once stock is actually tracked.

**Prerequisites before this is worth attempting:**
1. Define shopping locations (Kroger, Costco, Amazon) — currently 0.
2. Set `shopping_location_id` on the staples.
3. **Actually track stock** for those staples — the hard part, and a habit change, not a config change.

**Explicitly NOT decided:** whether the fallback duplicate ("also add chicken to Kroger") should be
automatic or offered. Do not assume; ask.

## DEFERRED — automated ordering

- **Kroger has a public API** — a real integration, no browser automation. Strongly preferred.
- **Amazon / Costco have no usable public API** — these mean Playwright browser automation, which
  runs from the Mac (not the Pi), breaks when retailer DOMs change, and fights bot detection.
- **Agreed boundary: fill the cart, stop at checkout.** A human reviews and submits. Never place a
  real order against a stored payment method unattended — a mis-parsed quantity is a real charge.
