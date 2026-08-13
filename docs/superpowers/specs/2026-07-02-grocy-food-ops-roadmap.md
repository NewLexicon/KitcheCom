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
| **S2** | Recipe repository | Recipes with itemized ingredients in Grocy; a recipe-view card | ⚠️ Medium — **no recipe sensor in the HA integration**; recipes come from Grocy REST via an HA proxy (see §8) | S1 (card pattern) |
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

---

## 8. S2 (Recipe repository) pre-brainstorm groundwork — source-verified 2026-07-02

Added during S1's execution-wait. This is **pre-brainstorm** research, not a ratified S2 design — the S2 spec brainstorm (recipe-card UX, fields, layout) still needs the user in the loop. What's locked here is the *architecture constraint*, verified against source.

### The load-bearing finding: no recipe sensor
The `custom-components/grocy` HACS integration exposes **NO recipe sensor** (verified against `const.py` — recipes/`recipes_pos` are absent from the attribute/entity definitions). Recipe *content* (name, ingredients via `recipes_pos`, picture, instructions) lives **only in Grocy's own REST API** (`GET /api/objects/recipes`, `/api/objects/recipes_pos`). The only recipe touchpoints in HA are the `consume_recipe(recipe_id)` service and generic `add_generic`/`update_generic`/`delete_generic` with entity types `recipes` / `recipes_pos`. **So S2 is NOT "mirror the S1 card against a new sensor" — the recipe data has to reach HA another way.**

### Reachability research (verified)
- **Grocy ships permissive CORS by default** — `CorsMiddleware` hardcodes `Access-Control-Allow-Origin: *` (verified in grocy source + a real packet capture, issue #1996). So a browser fetch is not blocked by Grocy itself.
- **BUT direct browser fetch is NOT the chosen path**, for three reasons: (1) the `GROCY-API-KEY` header triggers a CORS preflight whose end-to-end success **through the linuxserver image's nginx** is unverifiable from docs (needs a live `curl -D-`); (2) it exposes a **full-scope Grocy API key** (read+write everything) in the browser; (3) browser/version-dependent wildcard-header behavior.
- **Decision: proxy through HA** (server-side fetch; key stays in HA secrets; zero browser-CORS surface). Two CORS-free, key-safe options — **A vs. B is an OQ resolved at S2 implementation** (both are safe; the choice depends on the real recipe payload size measured against HA limits, which needs Docker + a live Grocy — deferred, same as S1's OQs):
  - **Option A — `rest` sensor + `json_attributes`.** HA polls `/objects/recipes`, exposes `sensor.grocy_recipes` with recipes in attributes; the card reads `hass.states[...]` **exactly like S1's cards** (novelty is a bit of `packages/` YAML, not new card logic). Constraints: HA **state** is capped at 255 chars (put JSON in *attributes*, dummy state); large attributes bloat the recorder DB (**exclude the sensor from recorder**); **pictures loaded as `<img src>` URLs, NOT base64 in attributes** (`<img>` loads aren't CORS-gated). Best when recipes change rarely (they do). **This collapses S2 back to the proven S1 shape** — lower risk than a card-owns-HTTP design.
  - **Option B — response-returning `rest_command` + `hass.callService(domain, service, data, target, false, true)`.** The card calls an HA service on-demand and receives the recipe JSON in the response (`returnResponse: true` is a verified `hass.callService` param). No 255 limit, no recorder storage, always fresh, key server-side. Best if the recipe list is large, or you want on-open freshness / per-recipe fetch by id. Slightly more moving parts.

### S2 carry-forwards (for the eventual S2 brainstorm/plan)
- **OQ-S2-1 — Option A vs. B.** Resolved at S2 impl by measuring the real `/objects/recipes` payload size vs. HA attribute/recorder limits against a live Grocy. Both are CORS-free/key-safe.
- **OQ-S2-2 — the recipes / `recipes_pos` JSON field shape** (ingredient rows link to products + amounts + quantity units). Source-derive from Grocy's API docs, confirm against the live instance at impl (same OQ-1 discipline as S1).
- **Recipe pictures:** `GET /api/files/recipepictures/...` — load via `<img src>` URL in the card regardless of A/B (not CORS-gated).
- **Recipe *authoring*** (create/edit recipes + ingredients) is out of S2's read-first scope — it needs the clunky `add_generic`/`update_generic` path; authoring happens in Grocy's own UI. S2 is a **read/browse** surface, mirroring S1's read-first posture.
- **Next step when the user is back:** run the S2 spec brainstorm (recipe-card UX: list vs. detail, which fields on the kitchen screen, ingredient display) with this architecture as the settled substrate; then writing-plans.
