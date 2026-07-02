# KitchenCOM × Grocy — Household Food-Ops Roadmap (umbrella)

**Date:** 2026-07-02
**Status:** Roadmap ratified (brainstorming). Slice 1 proceeds to its own spec next.
**Supersedes:** `2026-06-08-grocy-chores-slice-design.md` — chores moved to the ChoreOps HACS integration; Grocy's role narrows to the **food domain**. See §6 (Supersession).

---

## 1. The vision

A kitchen system, built on the KitchenCOM Pi 5 touchscreen, where the user can:

1. Keep a **recipe repository** with itemized ingredients, drawn from multiple sources (NYT, recipe websites, personal recipes).
2. **Schedule meals** on a calendar (which recipe on which day).
3. Have the calendar **auto-generate a shopping list** from the scheduled recipes' ingredients.
4. **Add extras by voice** on the kitchen screen ("add milk to the list").
5. Say **"send to Kroger"** and have the list's items land in the user's real Kroger cart, mapped through predetermined ingredient→product choices.
6. **Review and place the order** with a final manual tap in the Kroger app.

Grocy is the **food-ops backend** (recipes, meal plan, shopping list, stock). **ChoreOps** owns chores separately (different HACS integration; not part of this roadmap). This document is the umbrella that sequences the vision into buildable slices; each slice gets its own spec → plan → build → verify cycle.

---

## 2. The two hard walls (source-verified, 2026-07-02)

These are load-bearing constraints established by reading official retailer API docs and integration source before designing — not assumptions. They define the achievable end-state.

### Wall 1 — No retailer permits programmatic order *submission*.
Kroger's **official public API can BUILD a cart** (`PUT /v1/cart/add`, scope `cart.basic:write`) but **cannot place/submit the order**. Order placement is Partner-tier (a signed commercial agreement), not available to a general third-party app. **The design's endpoint is a populated cart that the user reviews and checks out manually.** This is treated as a feature (review before money moves), not a gap to close. The vision's "say 'order groceries' and it auto-submits" is therefore **out of scope permanently** — the last tap is always the user's.

### Wall 2 — Amazon is out.
There is **no official Amazon API** to add items to a consumer's Amazon/Fresh cart:
- PA-API 5.0's cart operations were removed years ago; **PA-API 5.0 itself was retired May 2026**, replaced by the Creators API (search/get only).
- **No public Amazon Fresh / Whole Foods API exists** (per AWS re:Post, official).
- The only official path is a pre-filled "Add to Cart" URL the user clicks — and it needs an Amazon Associates affiliate account (sales-gated) merely to resolve ASINs.
- Amazon's **AI Agent Policy (2026)** actively blocks shopping bots; browser automation violates Conditions of Use and risks account bans.

**Decision: Kroger is the only retailer.** Amazon is dropped from the automation roadmap. (A far-future, low-priority "generate a pre-filled Amazon cart URL you click" convenience is the ceiling, and is not planned here.)

---

## 3. The Grocy integration data contract (source-verified)

The `custom-components/grocy` HACS integration was read at source (`const.py`, `sensor.py`, `services.yaml`) on 2026-07-02. Load-bearing findings that shape every card slice:

- **`PLATFORMS` is only `sensor` + `binary_sensor` — there is NO `todo` platform.** The tempting "native `todo.grocy_shopping_list` → built-in todo-list card for free" path **does not exist**. Shopping list is custom-card work, exactly as chores was.
- **Shopping list and meal plan are both attribute-blob sensors** (identical shape to the chores sensor):
  - `sensor.grocy_shopping_list`: state = item count; `attributes.products[]` = array of `as_dict()` objects.
  - `sensor.grocy_meal_plan`: state = count; `attributes.meals[]` = array of `as_dict()` objects.
  - A stock HA card cannot bind per-item rows from a single attribute-blob sensor — each surface needs a **custom Lit card** that reads the sensor's array and renders the list itself (mirrors the proven `screensaver-card` pattern).
- **Round-trip services are asymmetric:**
  - Shopping list: `remove_product_in_shopping_list` (check-off — real, supported) and `add_missing_products_to_shopping_list` (bulk from stock). **No dedicated service to add a single arbitrary item by name** — arbitrary add is only via the generic `add_generic`/`update_generic` (needs product IDs; clunkier).
  - Meal plan: no dedicated service; add/edit only via `add_generic`/`update_generic`. **Meal plan is realistically a read/display surface** on the kitchen screen; planning happens in Grocy's own UI or a later slice.
  - Recipes: `consume_recipe`. Stock: `add_product_to_stock`, `consume_product_from_stock`, `open_product`.

---

## 4. Architecture (whole-suite)

```
┌─ Pi 5 (Pi OS + Docker) ───────────────────────────────┐
│  homeassistant  (HA Container)                         │
│       │  HACS → grocy custom_component (Python)        │
│       │  config-flow: URL + Port(9283) + API key       │
│       ▼                                                │
│  grocy  (lscr.io/linuxserver/grocy, arm64)             │  ← headless; native UI never shown on kitchen screen
│       host 9283 → container 80, volume ./grocy:/config │
└────────────────────────────────────────────────────────┘
        ▲                              ▲
        │ HA Lovelace + custom cards   │  (S5) Kroger cart integration
        │ (kitchencom theme)           │  ingredient→UPC→PUT /v1/cart/add
   Kitchen touchscreen: meal-plan +    │  user opens Kroger app → reviews → places order
   shopping cards (S1), later recipes  │
```

- **Grocy** runs as a headless Docker service (native UI never shown on the kitchen screen — CSS rejected for an always-on display).
- **HACS grocy integration** surfaces food domains as attribute-blob sensors (§3).
- **Custom Lit cards** (sibling to `screensaver-card/`, `kitchencom` theme) render each surface.
- **Kroger integration** (S5) is a *separate* concern from Grocy: OAuth to Kroger, ingredient→UPC resolution, cart-add. It reads the shopping list (from S1/S4) and pushes to Kroger; the user completes checkout.

---

## 5. Slice roadmap

Each slice is its own spec → plan → build → verify cycle. Dependencies flow left-to-right.

| Slice | Name | Delivers | Confidence | Depends on |
|-------|------|----------|-----------|-----------|
| **S1** | **Meal plan + shopping display** | Grocy on the kitchen screen: read-only meal-plan card + shopping check-off card. Proves the Docker→HACS→sensor→card→screen pipeline end-to-end. | ✅ High — pattern proven by chores/screensaver | — |
| **S2** | Recipe repository | Recipes with itemized ingredients in Grocy; a recipe-view card | ✅ High — Grocy core | S1 (card pattern) |
| **S3** | Recipe web-import | Scraper to pull NYT / recipe-site / personal recipes into Grocy | ⚠️ Medium — custom scraper, per-site fragility, paywalls | S2 |
| **S4** | Meal-plan → auto shopping list | Scheduled meal → Grocy's native "add recipe's missing products to shopping list" | ✅ High — Grocy native feature | S1, S2 |
| **S5** | Kroger cart integration | OAuth to Kroger; ingredient→UPC mapping with user's saved product choices; "send to Kroger" → `cart/add`; user reviews & orders manually | ⚠️ Medium — novel, but official API path is verified/clear | S1/S4 (a list to send) |
| **S6** | Voice | HA Assist: "add milk to list" → Grocy; "send groceries to Kroger" → S5. (NOT auto-order — Wall 1 stands.) | ✅ High — HA intents + earlier slices | S1, S5 |

### Slice 1 scope (the first build — detailed spec to follow)
- **Meal-plan card:** read-only display of `sensor.grocy_meal_plan` → `attributes.meals[]` ("what's for dinner" this week). No mutation.
- **Shopping-list card:** display `sensor.grocy_shopping_list` → `attributes.products[]`; per-item check-off via `remove_product_in_shopping_list`. **No free-text add in S1** (no clean service; deferred). Replaces the `todo.groceries` dashboard placeholder.
- Both are custom Lit cards mirroring the `screensaver-card`/chores pattern; the card scaffold already present in this worktree is inherited (see §6).
- Three verification tiers (per the chores-slice precedent): Tier-1 pure-function TDD on captured fixtures; Tier-2 live round-trip in a dev-HA against a local Grocy container; Tier-3 on-kitchen-screen (Pi-blocked, deferred).

---

## 6. Supersession of the chores slice & inheritance

**`2026-06-08-grocy-chores-slice-design.md` is superseded.** Chores moved to the **ChoreOps** HACS integration (deployed separately). The grocy-chores card is **never built**.

**What is inherited (no work orphaned):**
- The Docker/Grocy backend design, the HACS wiring/config-flow notes (URL + Port 9283 + API key), and the arm64 image choice — all reused by S1.
- The **card scaffold already committed in this worktree** (`custom_cards/grocy-chores-card/` — package.json, tsconfig, tsconfig.test, vitest.config, mirroring `screensaver-card`). S1's cards reuse this scaffold pattern. (Naming: S1's spec decides whether to rename the scaffold to `grocy-food-card` / split into `grocy-mealplan-card` + `grocy-shopping-card`, or repurpose it — a Slice-1 decision, not a roadmap one.)
- The three-tier testing posture and the source-verification discipline (which just caught the "no todo platform" surprise for shopping — §3).

**Action for S1's plan:** add a supersession banner to the top of `2026-06-08-grocy-chores-slice-design.md` pointing here, and reconcile the parent spec's boundary amendment (the zero-custom-Python crossing is still real — via the Grocy HACS integration — but now for food, not chores).

---

## 7. Carry-forwards

- **Grocy backend not yet stood up.** Docker daemon was not running on the Mac at roadmap time (2026-07-02); the old `grocy-eval` container state is unknown. Treat Grocy stand-up as fresh for S1's Tier-2 (dev-HA + local Grocy container).
- **Kroger API (S5) carry-forwards:** OAuth2 authorization-code flow (user authorizes the app once; refresh token stored); `GET /v1/products?filter.term=` for ingredient→UPC; `PUT /v1/cart/add` for cart push; **no order submission** (Wall 1); Kroger developer ToS should be read directly before S5 ships (the research subagent could not load the full ToS text). Rate limits: Products 10k/day, Cart 5k/day.
- **Ingredient→product mapping (S5):** the "predetermined product links / user's saved choices" is a custom mapping layer (ingredient → chosen Kroger UPC) that S5 must design and persist. Not a Grocy feature.
- **Amazon:** dropped. Do not build retailer automation against Amazon (Wall 2).
- **Pi-blocked:** Tier-3 on-screen verification for every card slice waits on the Pi hardware phase.
