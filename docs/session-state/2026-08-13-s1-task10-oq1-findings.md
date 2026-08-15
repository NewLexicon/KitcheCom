# S1 Task 10 — Tier-2/Tier-3 COMPLETE (2026-08-13, evening)

**Status:** ✅ **DONE.** OQ-1, OQ-2 and OQ-3 all resolved; the check-off round-trip was
confirmed by a human in a real browser. Suite **110 passing**, typecheck clean. Read §0 first.

Plan: `docs/superpowers/plans/2026-07-02-grocy-food-slice1.md` → Task 10.

> **⚠️ §2 below is superseded by §2-RESOLVED.** It records the raw-REST investigation that
> preceded the sensor read, and its "Finding 1" (nested objects absent) was a **FALSE ALARM**
> at the sensor layer. Kept because the reasoning — *don't patch parse code on raw-API
> inference* — is why no damage was done.

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

## 0. ✅ TASK 10 COMPLETE — all three OQs resolved, round-trip confirmed by a human

**2026-08-13 evening.** Every open question in the slice-1 plan is closed, and the final
check-off was **seen working in a real browser** (the one thing trap §6.4 says Claude cannot
self-certify).

| Question | Answer |
|---|---|
| **OQ-1** sensor field names | pygrocy **HYDRATES** nested `product` / `recipe`; fixtures were right (§2-RESOLVED) |
| **OQ-2** product id vs entry id | keys on **PRODUCT id** — the card was sending the entry id |
| **OQ-3** list-id key name | **`list_id`**, not `shopping_list_id` |
| Tier-3 visual | ✅ 3 rows, real names, ✓ correctly hidden on the product-less row, press → row gone from Grocy |

**Verified on screen:** the shopping card rendered `(unnamed)` / `Eggs` / `Milk` with ✓ on
Eggs and Milk only; pressing both removed them from Grocy (row count 3 → 1). The meal-plan
card rendered **Tacos** and **Leftovers night** — nested `recipe.name` hydration confirmed
visually, not just via API.

### ⚠️ NEW UX DEFECT — the 30-second poll makes ✓ look broken

`custom_components/grocy/const.py:14` → `SCAN_INTERVAL = timedelta(seconds=30)`.

The service call removes the Grocy row **instantly**, but the card does not re-render until
the coordinator's next poll — **up to 30s later**. On screen this is indistinguishable from a
dead button.

**This bit us during verification, and it will bite a real user harder:** the natural response
to "nothing happened" is to press again, and the second press fires a **second removal**. That
is how two items disappeared while testing one button this session.

Options (a design decision — deliberately NOT improvised at session end):
1. **Optimistic local hide** — drop the row from the card's own state immediately, let the
   poll confirm. Best perceived latency; needs a re-appear path if the call fails.
2. **Call `homeassistant.update_entity`** right after the service call — forces an immediate
   refresh. Simple, one extra call, still a round-trip of lag.
3. **Disable the button** for a beat after a press — cheapest guard against double-fire, does
   not fix the perceived lag.

Leaning (1) + (3) for a wall panel where taps are cheap and feedback must be instant.

---

## 4-DONE. Step 2 is COMPLETE. What remains is OQ-2/OQ-3. *(historical — now also done)*

HACS **2.0.5** + grocy **v1.3.0** are installed and configured; both sensors are **enabled**
and reporting. **The steps below are historical** — kept for the version-compatibility wall,
which is the reusable part.

**Remaining work (needs a human at the browser — trap §6.4):**
1. Register the card resources in dev-HA and add the shopping card with `shopping_list_id: 1`.
2. Press ✓ on a row → confirm in **Grocy's own UI** (`localhost:9283`) that the item is gone.
3. If it 500s, read the real service contract and correct `buildRemovePayload` / `canCheckOff`
   + the Task 5 test. That resolves **OQ-2** (product_id vs entry id) and **OQ-3** (list-id key).

### ⚠️ Version-compatibility wall (cost ~40min; do not rediscover)

The dev-HA is pinned to **HA 2025.7**, and that gates the integration hard:

| grocy release | needs HA | pygrocy2 | needs pydantic | works on 2025.7.4? |
|---|---|---|---|---|
| v1.15.0 → v1.5.0 | 2026.1.3+ | grocy-py / — | — | ❌ HA too old |
| v1.4.0, v1.3.3 | 2025.11.2 | — | — | ❌ HA too old |
| v1.3.2, v1.3.1 | 2025.6.1 | 2.5.0 / 2.5.1 | **≥2.12.2** | ❌ **pydantic conflict** |
| **v1.3.0** | **2025.6.1** | **2.4.1** | **~=2.11.3** | ✅ **the one that works** |

HA 2025.7.4 pins **pydantic 2.11.7**. v1.3.2 clears the HA-version gate but fails at
`RequirementsNotFound`, which surfaces in the UI as **"Config flow could not be loaded:
500 Internal Server Error"** — not as a dependency message. Check `requirements` in the
integration's `manifest.json` against the container's pydantic, not just `hacs.json`.

**Other traps hit:** HACS 2.x has **no Integrations tab** (one unified list, search at top);
a **leading space** in the pasted API key produced `Invalid leading whitespace ... in header
value` and a generic *"Something went wrong"*; and both sensors ship **disabled** — they were
enabled by editing `disabled_by` → `null` in `.storage/core.entity_registry` + restart
(backup: `core.entity_registry.bak`).

**dev-HA login:** `dev` / `devdev123` (password was reset in place this session; the old
bcrypt hash is in `.storage/auth_provider.homeassistant.bak`).

---

## 4. Historical: original Step-2 instructions (superseded by §4-DONE)

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

## 2-RESOLVED. OQ-1 — the authoritative answer (live sensors, 2026-08-13 ~17:30)

**Stack:** Grocy **4.6.0** → grocy integration **v1.3.0** (`pygrocy2==2.4.1`) → HA **2025.7.4**.

### ✅ pygrocy HYDRATES. The provisional fixtures were RIGHT.

```jsonc
// sensor.grocy_shopping_list → attributes.products[]
{ "id": 1, "product_id": 1, "amount": 2.0, "note": null,
  "product": { "name": "Eggs", "id": 1, /* +12 more fields */ } }

// sensor.grocy_meal_plan → attributes.meals[]
{ "id": 1, "day": "2026-08-14T00:00:00", "type": "recipe", "recipe_id": 1,
  "recipe": { "id": 1, "name": "Tacos", "base_servings": 4, ... },
  "section_id": -1, "section": { "id": -1, "name": null, ... }, "picture_url": null }
```

**§2 Finding 1 was a FALSE ALARM.** The raw REST API returns flat foreign keys, but pygrocy
fetches products/recipes separately and attaches them before the sensor is built. Verified by
running the **real** `parseShoppingItems` / `parseMeals` from `shared.ts` against the live
payloads:

| id | name | amountLabel | note |   | id | day | label | kind |
|---|---|---|---|---|---|---|---|---|
| 1 | **Eggs** | 2 | `""` |   | 1 | `2026-08-14T00:00:00` | **Tacos** | recipe |
| 2 | **Milk** | 1.5 | organic |   | 2 | `2026-08-15T00:00:00` | **Leftovers night** | note |
| 3 | (unnamed) | 1 | paper towels |   | | | | |

Real names, not placeholders. Row 3's `(unnamed)` is the intended no-`product_id` fail-safe.

**Had the parse code been "fixed" on the raw-REST inference, working code would have broken.**
This is the concrete payoff of the don't-patch-on-inference call made earlier in the session.

### Drifts found (fixtures corrected accordingly)

1. **`day` is a full ISO DATETIME** — `"2026-08-14T00:00:00"`, not `"2026-08-14"`.
   `parseMeals` passes it through opaque, so **the card renders the raw datetime on screen**.
   Cosmetic, not broken. → **carry-forward: format the day for display.**
2. **No `type: "section"` ROW exists.** Every row carries `section_id: -1` **plus a hydrated
   `section` object** whose `name` is `null`. The `case "section"` arm of `parseMeals` is
   therefore **unreachable from real data**; the synthetic open-set test guards the `default`
   branch instead.
3. **`note` is `null`**, never `""`. `?? ""` already normalizes it (now asserted explicitly).
4. **`picture_url`** exists on meal rows — previously unmodelled.
5. **Live entry ids are 1/2/3**, not the invented 11/12/13.

### ✅ Finding 2 (`done`) — RESOLVED, and it is NOT our bug

`done` **is not present** on sensor rows at all — pygrocy drops it. Proven empirically:
set `done: 1` on Milk via the Grocy API, forced `homeassistant.update_entity`, and the
sensor **still listed all 3 items** with `count: 3`; row keys remained
`id, product_id, amount, note, product`.

**The card cannot filter checked-off items because the field never reaches it.** The defect is
upstream in pygrocy2 2.4.1, not in `shared.ts`. Do **not** add a `done` filter to the card —
there is nothing to filter on. (Test data was restored to `done: 0` afterwards.)

### Fixtures + tests corrected

Both fixture files now carry **verbatim live payloads** with provenance in `_note`.
Suite: **101 passing / 14 files** (was 100 — net +1), typecheck clean.

- `shopping-parse.test.ts` — ids 11→1; **new** explicit null-note normalization test.
- `mealplan-parse.test.ts` — count 3→2; the fixture-coupled `kind === "section"` assertion
  replaced by one asserting the **real** shape (hydrated `section` + `section_id: -1` on an
  ordinary row does **not** change `kind`); the `day` test now pins the ISO-datetime format.

---

## 4b. Recipe test data seeded (2026-08-13 evening)

Grocy now holds **4 real recipes / 21 ingredients**, seeded via API for Tier-2 exercise:

| id | Recipe | Servings | Ingredients |
|---|---|---|---|
| 1 | Tacos | 4 | 5 (incl. Salt `"a pinch"`) |
| 2 | Chicken Fried Rice | 4 | 6 (incl. Black Pepper `"to taste"`) |
| 3 | Pasta Pomodoro | 2 | 5 (incl. Parmesan `0.333` — float-noise case) |
| 4 | Cheesy Beef Skillet | 6 | 5 |

Plus 18 products and 11 quantity units. Edge cases deliberately covered: **text amounts**
(`recipe_variable_amount`), **fractional amounts** (0.333, 0.5, 0.25), varied units, and
differing `base_servings` for the scaling path.

### ⚠️ NEW DEFECT — negative-id rows render as recipes

`GET /objects/recipes` returns Grocy's **internal meal-plan scaffolding** alongside real
recipes — rows with **negative ids** whose names are dates:

```
id=-16  "2026-32"        <- ISO week row
id=-15  "2026-08-15"     <- per-day rows
id=-8   "2026-08-14#1"
id=-6   "2026-08-14"
id=1    "Tacos"          <- the only real recipe before tonight
```

These appear **because meal-plan entries exist** (seeded earlier this session), so this is
reproducible, not a stale-data artifact.

`recipe-card.ts:_loadList()` renders whatever `/objects/recipes` returns — **grep confirms no
`id > 0` filter anywhere in `recipe-card.ts` or `shared.ts`.** So the kitchen screen would
list "2026-08-14" as a recipe. Fix is a one-line filter, but it is **not applied yet**:
whether the *sensor* path (S2's `rest` sensor / the HACS integration) also carries these
rows is unverified, and the fix belongs wherever the boundary actually is. Same reasoning as
OQ-1 — do not patch on inference.

**This is a third instance of the §6.6 pattern:** the fixtures only ever contained
hand-written positive-id recipes, so 100 green tests never saw a negative id.

### ✅ Confirmed working: text amounts

`pickAmount` (`shared.ts`) prefers `recipe_variable_amount` over the numeric `recipe_amount`,
so `"a pinch"` renders as text rather than the `0` Grocy coerces it to. The earlier
text-amount fix holds against live 4.6.0 data.

### Gotcha for future seeding: unit conversions

`POST /objects/recipes_pos` **fails** with
`"Provided qu_id doesn't have a related conversion for that product"` when the recipe's
`qu_id` differs from the product's `qu_id_stock` and no conversion row exists. Three
ingredients vanished silently this way (the bulk insert discarded the error). Either use the
product's stock unit or create `quantity_unit_conversions` rows first.

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
- ~~The `done` filtering gap (Finding 2) is worth a test regardless~~ — **RESOLVED**: `done`
  never reaches the card (see §2-RESOLVED). No card-side fix is possible or wanted.
- **NEW — format `day` for display.** Live sends `"2026-08-14T00:00:00"`; the meal-plan card
  renders it raw. Cosmetic but visible on the kitchen screen. Decide where it belongs (card
  render layer, not `parseMeals` — that deliberately stays opaque).
- **NEW — the Pi's HA version gates which integration it can run.** This rig is pinned to HA
  2025.7 → grocy **v1.3.0** (`pygrocy2`). A newer HA on the Pi could run v1.15.0, which uses
  **`grocy-py` instead** — a different library whose hydration behavior is **unverified**.
  Tonight's OQ-1 answer is authoritative *for `pygrocy2`*. **Check the Pi's HA version before
  treating it as final there.**
- The `case "section"` arm of `parseMeals` is **dead code against real data** (§2-RESOLVED
  drift 2). Harmless; left in place because `type` is an open set per spec §3.2.
