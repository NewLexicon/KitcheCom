# Tier-2 findings — S2 recipe card probed against a live Grocy

**Date:** 2026-08-07
**Branch:** `feat/grocy-chores` (worktree `.worktrees/grocy-chores`)
**Scope:** S2 Task 9 (partial) — the four S2 open questions only. **S1 Task 10 NOT run** (needs a dev-HA container; deliberately deferred, see §7).
**Outcome:** all four S2 OQs resolved. **Two design-level changes are now required** (§5). No code committed this session — the worktree is clean at 43 ahead.

---

## 1. What was stood up

| Thing | Value |
|---|---|
| Grocy version | **4.6.0** (release 2026-03-06), PHP 8.5.6, SQLite 3.51.2 |
| Image | `lscr.io/linuxserver/grocy:latest` → `v4.6.0-ls329` |
| Compose file | `deploy/grocy/docker-compose.grocy.yml` — **used as written, unmodified** |
| URL | `http://localhost:9283`, admin/admin |
| API key | created via `GET /manageapikeys/new` (see §6 gotcha) |

**Two Task-9 claims verified empirically rather than by inspection:**
- The bind mount creates `deploy/grocy/grocy-config/` at runtime with Grocy's `data/`, `keys/`, `nginx/`, `php/`, `www/`.
- `.gitignore:29` correctly excludes it — `git status` stayed clean with a live container writing into the tree.

**Pre-existing container collision (resolved).** A hand-made `grocy` container from 2026-06-08 (bind `~/grocy-eval`, exited 255) blocked `compose up` on the container name. Removed with `docker rm` on user instruction; **`~/grocy-eval/` survives on disk (1.0M)** — removing a container never deletes a bind mount.

### Test data authored
4 recipes / 10 ingredient rows / 8 products / 6 quantity units, covering the handoff's required cases: prose instructions, **numbered-list (`<ol><li>`) instructions**, fractional amounts, and a plain-text description. Entered via REST rather than the UI (identical result; the REST layer is what the card reads).

---

## 2. OQ-S2-2 — recipe field shapes: **NO DRIFT**

`GET /api/objects/recipes` returns exactly the fields the provisional fixtures guessed:

```
id, name, description, picture_file_name, base_servings, desired_servings,
row_created_timestamp, not_check_shoppinglist, type, product_id
```

`base_servings` / `desired_servings` are **ints**; `picture_file_name` is **`null`** when absent (not `""`).

**`parseRecipes` ran against the live payload unmodified and produced correct output for all 4 recipes.** This was the outcome I expected least — the handoff warned fixtures were "documented guesses" and predicted drift. There is none.

### Sub-finding: `desired_servings` is write-ignored on POST, settable on PUT
Creating a recipe with `desired_servings: 6` silently stores `base_servings`' value instead. A follow-up `PUT {"desired_servings": 6}` works (HTTP 204) and persists. **Only affects test-data authoring, not the card** — but any future seeding script must PUT after POST.

Live scaling matrix, all correct:

| id | name | base | desired | factor |
|---|---|---|---|---|
| 1 | Weeknight Tacos | 4 | 6 | 1.5 |
| 2 | Simple Pancakes | 2 | 2 | 1.0 |
| 3 | Shortbread | 8 | 12 | 1.5 |
| 4 | Boiled Eggs | 1 | 3 | 3.0 |

---

## 3. OQ-S2-4 — is `description` really HTML? **Yes, inconsistently — and that's already handled**

| Recipe | Tags returned |
|---|---|
| Weeknight Tacos | `<p>` |
| Simple Pancakes | `<ol>`, `<li>` |
| Shortbread | `<p>` |
| Boiled Eggs | **none — bare plain text** |

So the field is *sometimes* HTML. `stripTags` handled all four correctly, including the `<ol><li>` path against real editor output.

**Two findings inside this:**

1. **Grocy decodes entities on write.** Posted `&amp;` / `&deg;` / `&mdash;` came back as `&` / `°` / `—`. The card's `decodeEntities` fixed map is therefore *less* load-bearing than assumed — it defends against editor output that may still encode, but the API itself hands back decoded text. **v1 limitation #3 in the old handoff (unmapped entities pass through literally) is largely moot in practice.**

2. **The `stripTags` bare-angle-bracket fix is confirmed against real data.** Shortbread's `Cool if temp <200 and time >5 min` survived intact. Under the pre-fix regex this prose would have been silently deleted. That fix — caught by review, not by tests — earned itself here.

---

## 4. OQ-S2-3 — where does the join happen? **`recipes_pos_resolved` — an endpoint the spec never found**

**Raw `recipes_pos` carries NO names.** Keys are `id, recipe_id, product_id, amount, note, qu_id, only_check_single_unit_in_stock, ingredient_group, not_check_stock_fulfillment, row_created_timestamp, variable_amount, price_factor, round_up`. `product_id` and `qu_id` are bare ints. The spec's prediction was correct: a join is unavoidable.

**But Grocy ships a resolved view.** `GET /api/objects/recipes_pos_resolved` returns per-ingredient rows carrying:

- **`product_name`** — already joined ✅
- **`recipe_amount`** — **already scaled server-side** ✅ (Tacos: 1.5 → **2.25**, 12 → **18**, 0.25 → **0.375**, i.e. Grocy applied the 4→6 factor itself)
- `qu_id` — **still a bare int; NO unit name** ❌

`GET /api/recipes/{id}/fulfillment` was also checked and is **not** a substitute: it returns a flat `product_names_comma_separated` string, useless for per-ingredient rows.

**Unit names must still come from `/api/objects/quantity_units`** — 6 rows, ~944 bytes, carrying `id, name, name_plural`. Small, static, cacheable.

### Float precision confirmed against real data
Shortbread butter (0.333 lb, factor 1.5) came back from Grocy as **`0.49950000000000006`**. The card's 2dp rounding is load-bearing against live data, not just synthetic tests.

---

## 5. OQ-S2-1 — Option A vs B: **Option A does not scale**

Measured, then extrapolated per-recipe / per-ingredient:

| Library | `recipes` | `recipes_pos_resolved` | total |
|---|---|---|---|
| 4 recipes / 10 ingredients (measured) | 1,334 B | 5,084 B | 6.4 KB |
| 25 recipes / 150 ingredients | ~8 KB | ~76 KB | **~85 KB** |
| 50 / 300 | ~17 KB | ~153 KB | **~169 KB** |
| 100 / 600 | ~33 KB | ~305 KB | **~338 KB** |

A single HA sensor's attributes realistically top out around **16 KB**. **Even a 25-recipe library is ~5× over.** The Option-A rest sensor shipped in Task 8 works for a toy dataset and degrades quietly as the library grows — the failure mode is a truncated/dropped attribute, not a loud error.

### Mitigation available: Grocy honors server-side filtering
Both verified against the live instance:

| Request | Bytes |
|---|---|
| `recipes_pos_resolved` (all) | 5,084 |
| `?limit=2` | 1,019 |
| `?query[]=recipe_id=1` | 1,526 |

**`query[]=recipe_id=N` works.** That makes a per-recipe on-demand fetch viable and is the basis of the plan in §8.

---

## 6. Live defect: `parseIngredients` returns `"(unknown)"` for every row

Running the **live** `recipes_pos` payload through the shipped `parseIngredients(rows, 1)`:

```json
[ { "id": 1, "name": "(unknown)", "amount": 1.5,  "unit": "" },
  { "id": 2, "name": "(unknown)", "amount": 12,   "unit": "" },
  { "id": 3, "name": "(unknown)", "amount": 0.25, "unit": "" } ]
```

It reads `r.name` / `r.unit`, which **do not exist on any Grocy payload**. This is old-handoff v1 limitation #4 ("ingredients render empty until OQ-S2-3 is settled") now confirmed concrete: the card renders a nameless, unitless ingredient list.

The function's own comment anticipated exactly this and named the fallback. `recipes_pos_resolved` is a better answer than either branch it contemplated, because it also removes the need for client-side scaling.

### Gotcha: creating an API key
The `Add` button on `/manageapikeys` is `href="#"` and JS-driven; it did **not** fire under browser automation (clicked cleanly, no row created, no error). The working route is **`GET /manageapikeys/new`** — creates the key and redirects. Found in `/app/www/routes.php:125` inside the container. Useful for any future scripted setup.

### Gotcha: unit-conversion integrity is enforced on `recipes_pos`
POSTing an ingredient whose `qu_id` is neither the product's stock unit nor a defined conversion fails with:
`SQLSTATE[23000] ... Provided qu_id doesn't have a related conversion for that product`.
Four of ten seed rows hit this. Real Grocy behavior, not a fixture problem — seeding scripts must use each product's `qu_id_stock` or define conversions first.

---

## 7. What was NOT done

- **S1 Task 10 / OQ-1, OQ-2, OQ-3 — untouched.** They need a throwaway dev-HA with HACS + the grocy integration; OQ-2 (does check-off want `id` or `product_id`?) can only be proven by pressing ✓ and watching the item vanish in Grocy's UI. Deferred by agreement to keep this session's scope to the architectural questions.
- **No code committed.** All findings are observational. The worktree is clean at 43 ahead.
- **`picture_file_name` was `null` on all 4 test recipes** — no image was uploaded, so the **picture-present branch of the LIST view is still unexercised against live data**. `parseRecipes` builds the URL from the filename, which is straightforward, but the `<img src=/api/files/recipepictures/...>` fetch itself is unproven.

---

## 8. Consequences for the design

Two changes follow from the above. **Neither is a bug fix — both change decisions the S2 spec locked in**, so they need a spec amendment, not a patch.

1. **Switch the ingredient source to `recipes_pos_resolved`.** Kills the `"(unknown)"` defect, and lets client-side scaling be dropped (Grocy pre-scales `recipe_amount`). Still needs a `quantity_units` lookup for unit names.
2. **Rework the transport.** Option A's all-recipes-in-one-sensor shape is not viable past a toy library. `query[]=recipe_id=N` makes an on-demand per-recipe fetch practical.

These interact — there is no point fixing the join if the transport changes underneath it.

> **⚠️ CORRECTION (2026-08-10).** This line originally pointed at `docs/superpowers/plans/2026-08-07-grocy-s2-resolved-switch.md`. **That file was never written** — the path was named here in anticipation and no plan existed behind it. It was written on **2026-08-10** at the corrected date:
>
> **`docs/superpowers/plans/2026-08-10-grocy-s2-resolved-switch.md`**
>
> The spec amendments it implements are in `docs/superpowers/specs/2026-07-02-grocy-recipe-card-design.md` §2.1 and §4.2 (both amended 2026-08-10). **Transport decision made 2026-08-10: hybrid** — thin list sensor for LIST, per-recipe `rest_command` for DETAIL. This findings file established that Option A *fails*; it did not choose the replacement.

---

## 9. Reproducing this environment

> **⚠️ CORRECTION (2026-08-10): the container is NOT running.** It was left up at 2026-08-07 close, but **Docker Desktop is down** as of 2026-08-10 (`docker info` → `Cannot connect to the Docker daemon`), so the container is gone with it. **The test data survives** — it lives on disk in the gitignored bind dir `deploy/grocy/grocy-config/`, so `compose up -d` restores the 4 recipes / 10 ingredient rows rather than rebuilding them. **Docker Desktop must be started by hand first** (a GUI app; it cannot be launched from this session).

The container was left **running** with all test data. To get back to it:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
docker compose -f deploy/grocy/docker-compose.grocy.yml up -d
# http://localhost:9283 — admin/admin
# API key: GET /manageapikeys/new  (the Add button does not work under automation)
```

To probe as this session did:
```bash
curl -s -H "GROCY-API-KEY: <key>" http://localhost:9283/api/objects/recipes | python3 -m json.tool
curl -s -H "GROCY-API-KEY: <key>" "http://localhost:9283/api/objects/recipes_pos_resolved?query%5B%5D=recipe_id%3D1" | python3 -m json.tool
```

**Teardown when done:** `docker compose -f deploy/grocy/docker-compose.grocy.yml down`. The bind dir `deploy/grocy/grocy-config/` persists (gitignored) and holds the test data; delete it for a truly clean slate.
