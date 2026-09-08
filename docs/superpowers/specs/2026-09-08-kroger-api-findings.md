# Kroger APIs — what the four specs actually provide

**Status:** 2026-09-08. Spec analysis only — **nothing tested against live Kroger** (no
credentials yet). Everything here is read off the OpenAPI documents the user downloaded; treat it
as provisional until an OAuth flow actually runs.

## The four specs

| File (in `~/Downloads`) | API | Version | Auth flow | Key limit |
|---|---|---|---|---|
| `openapi.json` | **Cart API (Partner)** | 1.2.3 | OAuth2 **authorizationCode** | Needs partner access |
| `openapi (1).json` | **Cart API (Public)** | 1.2.3 | OAuth2 **authorizationCode** | **Add-only, 1 endpoint** |
| `openapi (2).json` | **Catalog API V2** | 1.5.5 | OAuth2 **clientCredentials** | **No free-text search** |
| `openapi (3).json` | **Products API** | 1.3.0 | OAuth2 **clientCredentials** | — |

## The working chain

```
Grocy shopping list item ("chicken")
  → Products API   GET /v1/products?filter.term=chicken&filter.locationId=<store>
        returns: upc, description, brand, size, price, inventory, aisleLocations
  → pick a UPC
  → Cart API       add {upc, quantity, modality}
  → human reviews and checks out in the Kroger app
```

**`filter.term` is the piece that makes this possible** (Products API). Documented example: `milk`.
Combine with `filter.locationId` to return only what the chosen store carries.

## Findings that change the design

### 1. Catalog V2 is NOT the search API — Products is
Catalog V2's only filters are `filter.upc.in`, `filter.locations.id.eq`,
`filter.locations.fulfillment.eq`, `filter.postalCode.eq`, `filter.updatedAt.range`. **There is no
term/query/name parameter.** It resolves UPC → details, not name → UPC. Use the **Products API**
(`/v1/products`, `filter.term`) for search. Catalog is not needed for this project at all.

### 2. The two Cart APIs are very different
- **Public** (`openapi (1).json`): a single `PUT /v1/cart/add` returning **204 No Content**.
  Write-only — cannot list the cart, change a quantity, or delete an item.
- **Partner** (`openapi.json`): 7 endpoints — create cart, get carts, get cart by id, add items,
  `PUT .../items/{upc}` (quantity), `DELETE .../items/{upc}`.

⚠️ **This decides whether the user's "cancel the chicken" case works via API.** With the public
API it does not — removal happens in the Kroger app. With Partner it does.
**Open question: which access tier does the user's developer account have?**

### 3. Two different auth flows — one is much easier
- **Products / Catalog** use **clientCredentials**: server-to-server, client id + secret, no user
  login. Easy; works unattended from HA.
- **Cart (both)** uses **authorizationCode**: a human logs into their Kroger account in a browser
  and consents. Needs token storage and refresh.

⚠️ **Neither cart spec declares a `refreshUrl`.** If refresh tokens are short-lived or absent,
re-authorisation could be frequent — that is the single biggest unknown and should be proven
before any code is written.

### 4. No checkout endpoint anywhere
None of the four specs can place an order. **Kroger enforces "fill the cart, human checks out"** —
the boundary agreed in the grocery-ordering notes is structural, not a matter of our discipline.

## Useful fields the Products API returns

`upc` / `productId`, `description` (the product NAME, confusingly), `brand`, `size`, `soldBy`,
`price` and `nationalPrice`, `inventory`, `fulfillment`, `aisleLocations`, `images`, `categories`,
plus allergen and nutrition data.

`inventory` and `price` are genuinely useful: the list can show cost before ordering, and
`aisleLocations` would support an in-store shopping view later.

## The real remaining problem: which UPC?

`filter.term=chicken` returns many products. Nothing can decide *which* one is meant.

**Solution: scan the barcode when groceries are unpacked** (user's approach, 2026-09-08).
`POST /objects/product_barcodes {product_id, barcode}` records the mapping and — **verified live**
— causes **no stock movement whatsoever** (stock stayed at 0 products; the probe row was deleted).

Each product is scanned **once, ever**; after that the mapping is permanent. Grocy's web UI has a
camera scanner and is bound to `0.0.0.0:9283`, so a phone on the LAN can do it with no extra
hardware.

`product_barcodes` also carries **`shopping_location_id`**, so a barcode can record which store the
item is bought at — relevant to the deferred Costco routing, and it needs no inventory data.

⚠️ **NO PANTRY INVENTORY IS BEING KEPT — this is a deliberate decision (2026-09-08).** The
household assumes it needs everything, and deletes what it already has at ordering time. Therefore:
- Do **not** propose `add` / `consume` / `inventory` scanning workflows. Only the barcode↔product
  mapping is wanted.
- Do **not** rely on Grocy's "not fulfilled" stock check meaning anything — with 0 stock it always
  returns every ingredient, which is the intended behaviour here.
- The deferred Costco routing **cannot** be driven by stock data. Any future design must assume
  the human decides what is already on hand.

⚠️ **Kroger store-brand UPCs are not in Open Food Facts.** `GET /stock/barcodes/external-lookup/`
resolved a national brand (Coca-Cola) with name, units and image, but returned `null` for a Kroger
store-brand UPC. Store brands need the product name entered once by hand.

⚠️ **Unverified:** that a barcode scanned from a package matches the UPC Kroger's API expects.
Should match for national brands; confirm early once credentials exist rather than assuming.

## Order of work (unchanged by these findings)

1. Register a Kroger developer app; determine the access tier (public vs partner cart).
2. **Prove the OAuth flows** — especially cart token refresh. Make-or-break; do this first.
3. Seed UPCs onto Grocy products (search by term to find them once).
4. Wire Grocy list → cart.

## Not in scope
Amazon and Costco have no comparable public API — those remain Playwright browser automation,
running from the Mac, with the maintenance and bot-detection caveats already recorded.
