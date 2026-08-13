# S1 Task 10 — Tier-2 in progress: OQ-1 findings + HACS steps (2026-08-13, evening)

**Status:** PARTIAL. OQ-1 investigated against live Grocy 4.6.0 REST API; **not yet resolved**
— the authority is the HACS integration's sensor attributes, which requires Step 2 (below).
OQ-2/OQ-3 untouched (blocked on the same step).

Plan: `docs/superpowers/plans/2026-07-02-grocy-food-slice1.md` → Task 10.

---

## 1. Environment as left

| Piece | State |
|---|---|
| Grocy | **4.6.0**, `http://localhost:9283`, container `grocy` |
| Grocy compose | `deploy/grocy/docker-compose.grocy.yml` (from `main-merge`) |
| API key | in `deploy/grocy/grocy-config/data/grocy.db` → `select api_key from api_keys limit 1;` |
| dev-HA | `http://localhost:8124`, container `kitchencom-ha-dev`, **up, 0 errors** |
| dev-HA config mount | ⚠️ `.worktrees/grocy-chores/deploy/homeassistant/dev-config` (NOT `main-merge`) |
| HACS / grocy integration | ❌ **NOT installed** — no `custom_components/` |

**Seeded in Grocy:** 3 products (Eggs/Milk/Tortillas), recipe *Tacos* (id 1), 3 shopping-list
items (incl. one with `product_id: null` — the fail-safe case), 2 meal-plan entries
(recipe + note), 1 meal-plan section.

### Two things fixed this session

1. **Stale API key → 401s.** dev-HA's `secrets.yaml` held a key from a previous Grocy volume;
   recreating the container invalidated it. Every `rest_command` 401'd, which is why the
   Recipes dashboard read "No recipes". Replaced in place (backup: `secrets.yaml.bak`),
   HA restarted, all three endpoints now 200 from inside the container.
   **Editing `secrets.yaml` in place is deliberate** — re-running `dev-setup.sh` from
   `main-merge` would build an *empty* dev-config and destroy the HA login/onboarding/DB.
2. **Card bundles were NOT stale** (an earlier claim in-session was wrong). All three
   `www/*.js` are **byte-identical (sha256)** to `main`'s fresh build, 0 bare imports.
   The Aug 11 mtime misled; card code did not change in the merge. No re-stage needed.

---

## 2. OQ-1 — what the live REST API returns

Raw Grocy 4.6.0 `/api/objects/shopping_list` and `/api/objects/meal_plan`:

```jsonc
// shopping_list
{ "id": 1, "product_id": 1, "note": null, "amount": 2, "shopping_list_id": 1,
  "done": 0, "qu_id": 2, "row_created_timestamp": "..." }
{ "id": 3, "product_id": null, "note": "paper towels", "amount": 1, "qu_id": null, ... }

// meal_plan
{ "id": 1, "day": "2026-08-14", "type": "recipe", "recipe_id": 1, "recipe_servings": 4,
  "note": null, "product_id": null, "done": 0, "section_id": -1, ... }
{ "id": 2, "day": "2026-08-15", "type": "note", "note": "Leftovers night", ... }
```

### Finding 1 — nested objects absent from the REST API (⚠️ decides whether cards work)

| Fixture assumes | Live REST |
|---|---|
| `products[].product.name` | **absent** — only `product_id` |
| `meals[].recipe.name` | **absent** — only `recipe_id` |
| `meals[].section.name` | **absent** — only `section_id: -1` |

`shared.ts` reads exactly those paths:
- `parseShoppingItems`: `p?.product?.name ?? "(unnamed)"`
- `parseMeals`: `m?.recipe?.name ?? "(recipe)"`

Against **raw REST** shapes every row renders a placeholder — no crash (fail-safes hold),
but a list of `(unnamed)` / `(recipe)`.

### Finding 2 — real fields the fixtures omit

`done`, `qu_id`, `shopping_list_id`, `row_created_timestamp` (shopping);
`product_amount`, `product_qu_id`, `done`, `section_id` (meals).

**`done` is load-bearing:** a checked-off item stays in the payload as `done: 1`. Neither
card filters on it → **checked-off items would keep rendering**. This is real regardless of
how Finding 1 resolves, though *where* it's filtered may be the integration's job.

### Finding 3 — fixtures confirmed correct

`day` is a plain `"YYYY-MM-DD"` string (fixture treated it as opaque — safe).
The no-`product_id` case is real (`product_id: null`).
`note` returns **`null`**, not `""` — `?? ""` already handles it.

### Finding 4 — `section_id: -1` vs a `type: "section"` row

Fixtures model a separate section-typed entry; live Grocy puts `section_id: -1` on ordinary
rows. `parseMeals`' `default` branch keeps this safe, but the modeled shape is wrong.

---

## 3. ⚠️ Why OQ-1 is NOT resolved

Everything above is **Grocy's REST API**. The cards read **HA sensor attributes**, and
**pygrocy sits in between** — it builds `ShoppingListProduct` / `MealPlanItem` objects and
may fetch products/recipes separately and attach them. That hydration is the likely origin
of the fixtures' nesting.

Two readings, opposite fixes:

- **pygrocy hydrates** → fixtures right, cards fine; only the `done` filter is a real bug.
- **pygrocy passes through flat** → cards broken; `shared.ts` needs `product_id` → name
  resolution (a second fetch or a lookup map).

pygrocy is not vendored locally and the integration is not installed, so this **cannot be
settled offline**. Do not change parse code until Step 2 answers it.

---

## 4. Exact next steps (Step 2 — browser, ~10–15 min)

1. **HACS** → https://hacs.xyz/docs/use/download/download/ (container method):
   ```bash
   docker exec kitchencom-ha-dev bash -c "wget -O - https://get.hacs.xyz | bash -"
   docker restart kitchencom-ha-dev
   ```
2. In HA (`localhost:8124`): **Settings → Devices & Services → + Add Integration → HACS**,
   complete the GitHub device-code flow.
3. **HACS → Integrations → ⋮ Custom repositories** → add `custom-components/grocy`
   (category *Integration*) if not in the default list → **Download** → **restart HA**.
4. **Settings → Devices & Services → + Add Integration → Grocy**:
   - URL `http://host.docker.internal` · Port `9283` · API key from the sqlite command above
   - **Verify SSL: off**
5. **Enable the two sensors** (they ship disabled): integration → *entities* →
   `sensor.grocy_shopping_list`, `sensor.grocy_meal_plan` → enable → restart HA.
6. **Read the truth** — Developer Tools → States → each sensor → *Attributes*.
   **This resolves OQ-1**: does `products[]` carry a nested `product` object, or a bare
   `product_id`? Same for `meals[]` / `recipe`. Record verbatim.
7. Only then: correct fixtures + `shared.ts` if needed, re-run `npx vitest run`, rebuild,
   copy `dist/*.js` into the dev-config `www/`, **bump `?v=N`** on the Lovelace resource
   (see `dev-setup.sh:84-89`), and hard-refresh.
8. **OQ-2/OQ-3 round-trip** (needs a human — trap §6.4): add the shopping card with
   `shopping_list_id: 1`, press ✓, then confirm in **Grocy's own UI** that the item is gone.
   If it 500s, inspect the service's real fields and correct `buildRemovePayload` / the
   Task 5 test.

---

## 5. Carry-forwards

- **dev-HA is mounted from the `grocy-chores` worktree.** Either leave it (harmless — the
  only package it keeps, `grocy_recipes.yaml`, is byte-identical to `main`'s) or migrate the
  whole `dev-config/` dir and repoint the compose file. **Do not** naively re-run
  `dev-setup.sh` from `main-merge`: it stages an empty config and you lose the HA login.
- `secrets.yaml.bak` holds the old (now invalid) key; delete when convenient.
- Grocy `recipes` returns **5 rows** — the volume predates tonight; only *Tacos* (id 1) was
  seeded here. `recipes_pos_resolved?recipe_id=1` returns **0 rows** (Tacos has no
  ingredients), so the recipe card's ingredient view will be empty for it. Add ingredients
  in Grocy's UI if the recipe card is to be exercised.
- The `done` filtering gap (Finding 2) is worth a test **regardless** of how OQ-1 resolves.
