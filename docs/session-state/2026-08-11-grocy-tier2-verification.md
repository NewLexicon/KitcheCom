# Tier-2 verification — the resolved-endpoint switch against live Grocy

**Date:** 2026-08-11
**Branch:** `feat/grocy-chores` (worktree `.worktrees/grocy-chores`)
**Scope:** plan Task 9 — verify the 2026-08-10 implementation (Tasks 1–8) against a live Grocy 4.6.0.
**Container:** restored from the gitignored bind dir `deploy/grocy/grocy-config/`; the 4 recipes / 10 ingredient rows / 6 units / API key from 2026-08-07 all survived. Nothing was rebuilt.

**Outcome:** the `"(unknown)"` defect is **VERIFIED FIXED** against real data. The §4.0 LIST-sensor defect is **CONFIRMED** end-to-end. One **new** finding overturns a design assumption (§4).

---

## 1. The `"(unknown)"` defect is fixed — verified against live data

The real `recipes_pos_resolved` payload for Weeknight Tacos, piped through the shipped `parseIngredients` + `buildUnitMap` + `formatAmount`, renders:

```
2.25 Pound Ground beef
18 Piece Tortillas
0.375 Tablespoon Salt
```

Previously every one of these rendered `"(unknown)"` with a blank unit. **This is the fix confirmed against Grocy itself, not a fixture.**

## 2. §4.0 CONFIRMED — the LIST sensor can never populate

`GET /api/objects/recipes` returns a **bare JSON array** (`top-level type: list`, 4 recipes).

HA's `parse_json_attributes` (`components/rest/util.py:28-31`) takes `json_dict[0]` of a list, then extracts named keys only if that is a dict. `[0]` here is a single recipe object with no `recipes` key → `{}`. Combined with the source reading from 2026-08-10 (attributes parsed from the raw body **before** `value_template`, and `jsonpath(array, "$")` returning `False` under HA's pinned `jsonpath==0.82.2`), **no `rest`-platform configuration can deliver this array into an attribute.**

**Decision (2026-08-11): migrate LIST to the `rest_command` + `returnResponse` pattern**, the same transport DETAIL uses and which just proved itself live. Spec §2.1 amended accordingly.

## 3. The resolved endpoint — re-confirmed, with the full key list

`recipes_pos_resolved` carries **25 keys**. The complete list, so no future probe has to guess:

```
amount_on_shopping_list, calories, child_recipe_id, costs, due_score, id,
ingredient_group, is_nested_recipe_pos, missing_amount, need_fulfilled,
need_fulfilled_with_shopping_list, note, only_check_single_unit_in_stock,
product_active, product_group, product_id, product_id_effective, product_name,
qu_id, recipe_amount, recipe_id, recipe_pos_id, recipe_type,
recipe_variable_amount, stock_amount
```

- **`product_name`** — pre-joined ✅
- **`recipe_amount`** — pre-scaled ✅ (Tacos at 4→6: `1.5 → 2.25`, `12 → 18`, `0.25 → 0.375`)
- **NO unit-name key** ❌ — the only match for "unit" is `only_check_single_unit_in_stock`, which is the exact substring that produced a false positive on 2026-08-07. **The `quantity_units` lookup is required.** Re-confirmed by full key dump.
- **`recipe_id` is an `int`** — important, because `parseIngredients` filters with strict `===`. A string id would have silently returned zero ingredients.

**Server-side filter re-measured:** 5,084 B unfiltered → **1,526 B** for one recipe. Matches 2026-08-07 exactly.

**`quantity_units`: 861 B**, 6 rows, `{2:Piece, 3:Pack, 4:Pound, 5:Tablespoon, 6:Cup, 7:Gram}`. This settles the 861-vs-944 discrepancy between the previous two docs: **861 B is correct.**

## 4. ⚠️ NEW — text amounts do NOT live in `amount`; the fixtures were wrong

**This overturns an assumption in the spec (§4.3) and in both fixture files.**

Probed directly:

| POST body | Stored / returned |
|---|---|
| `{"amount": "a pinch"}` | **coerced to `0`** — the text is lost entirely |
| `{"amount": 0, "variable_amount": "a pinch"}` | `recipe_amount: 0`, `recipe_variable_amount: "a pinch"` |

So **`recipe_amount` is never a non-numeric value.** Grocy has a dedicated `variable_amount` field for text amounts, surfaced on the resolved endpoint as **`recipe_variable_amount`**.

**Consequences:**
1. The card's non-numeric-passthrough path (spec §4.3, `formatAmount` blanking a string) is **unreachable via `recipe_amount`** — it can only ever be a number.
2. A real text-amount row currently renders **`0 Pound Ground beef`** — a *wrong quantity*, not the documented blank. Worse than the limitation the spec describes.
3. The fixtures encode `recipe_amount: "a pinch"`, **a shape Grocy cannot produce.** Same class of error as the original `name`/`unit` fiction: a test passing against impossible data.

**Live Salt is stored as `0.25`** (numeric), scaling to `0.375` — so `0.375 Tablespoon Salt` above is correct, and no current household row is affected. **The defect is latent, not visible today** — all 10 live rows are numeric.

**Decision (2026-08-11): fix now** — read `recipe_variable_amount` and prefer it when present.

## 5. Non-2xx confirmed: a 401 does not look like an error

`GET /objects/recipes` with a bad key returns **HTTP 401 with an empty body**. Combined with the 2026-08-10 source reading (`rest_command/__init__.py:187-196` only *logs* on ≥400, then parses and returns the body), a failed fetch reaches the card looking like a successful call.

**Our code already degrades safely** — `Array.isArray` guard in `fetchIngredients`, `buildUnitMap` returning `{}` for non-arrays; both verified against a 401 body and an HTML 500 page on 2026-08-10. **No fix needed, but `response.status` is the only signal** that distinguishes "no ingredients" from "bad API key."

## 6. The picture path — PROBED, and it CANNOT work as designed

Uploaded a 1×1 PNG, attached it to recipe 1, and probed the fetch. **Two independent blockers:**

| Request | Result |
|---|---|
| `/api/files/recipepictures/test.png` (raw filename, **what our code built**) | **404** |
| `/api/files/recipepictures/dGVzdC5wbmc=` (base64, **with** key header) | **200**, `image/png` |
| same base64 URL, **no** key | **401** |
| same base64 URL + `?GROCY-API-KEY=<key>` | **200** |
| same base64 URL + `?api_key=<key>` | 401 (wrong param name) |

1. **The filename must be base64-encoded.** `parseRecipes` concatenated the raw name — every picture would have 404'd.
2. **The fetch requires the API key, and `<img src>` cannot send a header.** The query-param form works, but it would put a **full-scope read+write key** into the DOM, browser history, and Grocy's access logs — exactly the exposure spec §2 rejected when it chose to proxy through HA rather than let the browser talk to Grocy.

**DECISION (2026-08-11): pictures are DISABLED in v1.** `pictureUrl` is now always `null`, so every tile uses the already-tested placeholder branch. No key exposure, no broken images. `RecipeRow.pictureUrl` keeps its `string | null` type, so re-enabling needs no contract change.

**To re-enable, one of:**
- an **HA-side image proxy** that adds the key server-side (no built-in exists for streaming binary to a card — real work), or
- a **scoped read-only Grocy API key**, if Grocy supports one (unverified), which would make the query-param form acceptable.

**Test data restored:** the picture was detached and `recipes.picture_file_name` is `null` on all 4 again.

## 7. What this session did NOT verify

- **The card inside real Home Assistant.** No dev-HA was stood up. The `rest_command` → Grocy round-trip is confirmed at the Grocy end (curl reproduces exactly what the service would fetch), but HA's templating of `{{ recipe_id }}` into the secret URL, and `returnResponse` delivery, are still source-read only.
- **S1's OQ-1/2/3** — untouched, still need a dev-HA with HACS + the grocy integration.
- **Attribute-size behavior at scale** — moot for LIST once it moves off the sensor.

## 8. Reproducing

Container was left **UP**. Re-probe script: `scratchpad/tier2.sh` (regenerate if the scratchpad is gone; every command in it is in this document).

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
docker compose -f deploy/grocy/docker-compose.grocy.yml up -d   # no-op if up
KEY=$(sqlite3 deploy/grocy/grocy-config/data/grocy.db "select api_key from api_keys limit 1;")
curl -s -H "GROCY-API-KEY: $KEY" "http://localhost:9283/api/objects/recipes_pos_resolved?query%5B%5D=recipe_id%3D1" | python3 -m json.tool
```

**Teardown:** `docker compose -f deploy/grocy/docker-compose.grocy.yml down`. The bind dir persists and holds the test data.

**Note on probe hygiene:** two throwaway rows (ids 11, 12) were created to test text-amount storage and were **deleted**; `recipes_pos` is back to exactly 10 rows.
