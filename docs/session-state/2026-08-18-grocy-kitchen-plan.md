# Grocy → KitchenCOM: the plan

**Written:** 2026-08-18. **Branch:** `fort-knox` (Grocy work itself belongs on a Grocy branch;
this is the plan doc only).

Covers, in Garrett's requested order:
1. What the kitchen panel should show
2. How adding items works
3. How recipes get in
4. The store / phone case

---

## 0. What changed today — three limitations turned out not to exist

**All three "can't do that" beliefs came from `pygrocy`, the HACS integration's library — not
from Grocy.** Verified live against Grocy 4.6.0 on 2026-08-18, every claim by round-trip:

| Believed | Reality | Evidence |
|---|---|---|
| ✓ can only DELETE, never mark done | **`done` toggles both ways** | `PUT {"done":1}` → 204, re-read `done=1`; `PUT {"done":0}` → re-read `done=0` |
| No clean way to add a free-text item | **works** | `POST /objects/shopping_list {"note":"…","amount":1}` → `{"created_object_id":"17"}` |
| S4 (meal → list) is unbuilt work | **native, one call** | `POST /recipes/1/add-not-fulfilled-products-to-shoppinglist` added Tortillas 8, Ground Beef 1, Cheddar 2, Onion 1 — and correctly skipped Salt (amount 0) |

⚠️ **That endpoint 400s without a `Content-Type: application/json` header** (`Bad Content-Type`,
thrown from `RecipesApiController.php:17`). Send a body — `{}` is enough.

**Consequence: the 2026-08-14 "stop investing in the food card" decision was made on a false
premise.** The parity gap was a transport artifact. All test rows were deleted; the list is back
to its single real row (`paper towels`).

## 1. What Grocy is, and what we use

Grocy is a household ERP with 14+ subsystems. **This household uses five:**

| Subsystem | Rows | Used |
|---|---|---|
| `products` | 18 | ✅ |
| `quantity_units` | 10 | ✅ |
| `recipes` + `recipes_pos` | 4 + 21 | ✅ |
| `meal_plan` | 2 | ✅ |
| `shopping_list` | 1 | ✅ |
| stock · chores · batteries · equipment · tasks · userentities | 0 | ❌ |

**Keep the data model, replace the UI.** Ingredients are *relational*, not text:
`recipes_pos` rows are (recipe → product → amount → unit) foreign keys, so `Eggs` in Tacos is the
same record as `Eggs` in Fried Rice. That is precisely what makes "schedule 3 meals → one merged
shopping list" possible, and what a notes-app or a string-based recipe store cannot do.
Grocy's *UI* is the part that is overkill — batteries, equipment, price history, stock.

## 2. Transport: use REST, not pygrocy

Two paths into Grocy from HA. **They are not equivalent.**

| | HACS integration (`pygrocy`) | `rest_command` → Grocy REST |
|---|---|---|
| Fidelity | **lossy** — drops `done` | **full** |
| Freshness | 30s poll (`SCAN_INTERVAL`) | on demand |
| Recipes | **none** | full |
| Add free-text item | no clean service | ✅ |
| Already proven here | S1 cards | **S2 recipe cards** |

**Decision: REST for everything the cards touch.** This is not new architecture — it is the
pattern `homeassistant/packages/grocy_recipes.yaml` already uses and which was live-verified twice.
The API key stays in HA secrets; the browser never talks to Grocy and never sees the key.

Keep the pygrocy integration installed only if something still needs its sensors; nothing in this
plan does.

## 3. Topology — one always-on backend, no sync

🔴 **Grocy must move to the Pi 5.** It currently runs on the Mac only because that is where
development happened.

Garrett proposed a laptop-backend + Pi-queue design that reconciles when the laptop appears.
**That solves a problem we can delete instead.** Queue-and-reconcile means conflict handling,
duplicate detection, and ordering — a whole bug class — to work around a backend in the wrong place.

| | Grocy on laptop | **Grocy on Pi 5** |
|---|---|---|
| Kitchen panel | dies when the laptop sleeps | **always up** |
| Phone in the store | needs the laptop awake | **always up** |
| Sync logic | **required** | **none — one copy** |

Grocy is a PHP app on a SQLite file. The Pi 5 has ~6.5 GB RAM free and 102 GB disk and already runs
HA. **Three clients, one server:** kitchen panel · laptop browser · phone.

## 4. Task 1 — what the kitchen panel shows

**Design first, code second.** The panel is glanceable and touch-first; it is not for data entry.

Four surfaces, all already existing as cards (`custom_cards/grocy-food-card/`, 114 tests passing):

| Surface | Shows | Interaction |
|---|---|---|
| **Shopping list** | item · amount · unit | **tap = toggle done** (not delete) |
| **This week** | day → recipe name | read-only |
| **Recipe list** | tiles | tap → detail |
| **Recipe detail** | ingredients scaled to servings | back |

**Open design questions for Garrett — answer before building:**
- Do done items **grey out in place**, or **disappear**? (Grocy keeps them; both are now possible.)
- One combined food view, or separate panel tabs?
- Does the panel need **add-item** at all, or is adding a phone/laptop job?
- Meal plan: **today only**, or the week?

⚠️ **Known defect to fix here, not later:** with pygrocy the ✓ appeared dead for up to 30s and users
pressed twice, deleting two rows. **REST + optimistic local state removes the cause**; do not
port the 30s-poll design forward.

⚠️ **Cosmetic:** `day` arrives as a full ISO datetime (`2026-08-14T00:00:00`) and currently renders
raw. Format at the card layer; `parseMeals` keeps `day` opaque deliberately.

## 5. Task 2 — adding items

**Verified working.** `POST /api/objects/shopping_list`:

```json
{"shopping_list_id": 1, "note": "paper towels", "amount": 1}
```

Two kinds of row, and the UI must handle both — they already exist in live data:
- **product rows** — `product_id` set, joins to a real product, unit-aware
- **free-text rows** — `product_id: null`, just a note (the existing `paper towels` row)

**Design questions:**
- Free text only (simplest), or autocomplete against the 18 known products?
- Where does adding live — kitchen panel with an on-screen keyboard, phone, or both?
- Typing on a wall panel is unpleasant; **voice is the natural fit** and HA Assist already exists
  (roadmap S6). Worth considering before building a touch keyboard.

## 6. Task 3 — how recipes get in

Three routes, cheapest first:

1. **By hand in Grocy's UI** — works today, no build. Fine on a laptop; this is management, not
   kitchen work. Accepts that Garrett dislikes the UI, but it is a laptop-only cost.
2. **A KitchenCOM entry form** — custom UI writing via `POST /objects/recipes` +
   `/objects/recipes_pos`. Removes Grocy's UI from the flow entirely. Medium build.
3. **Web import (roadmap S3)** — the original ask. **Scope it to schema.org `Recipe` JSON-LD**,
   which most recipe sites publish and which is far more stable than per-site scraping.
   ⚠️ Honest limits: **NYT Cooking is paywalled** — a licensing question, not a technical one; and
   ingredient strings must be **resolved to `products` rows** or the relational model (and therefore
   S4) breaks. That mapping step is the real work, not the fetching.

**Recommendation: do 3 only after 1 or 2 proves the shape.** The import's hard part is
ingredient→product resolution, which is easier to reason about once recipes are being entered.

## 7. Task 4 — the store / phone case

**Nothing to build if Grocy is on the Pi.** A phone browser reaches either:
- **Home Assistant** → the same custom cards, already touch-sized, or
- **Grocy directly** at `pi:9283` for full management.

Both work in the aisle over home Wi-Fi. **Away from home needs remote access to HA** — out of
scope here, and a separate security decision.

⚠️ **Do not build an offline-capable phone app.** That reintroduces exactly the sync problem §3
deletes.

## 8. Sequence

| # | Task | Depends on | Size |
|---|---|---|---|
| 0 | **Move Grocy to the Pi 5** — container + copy the SQLite db | — | ~15 min |
| 1 | **Swap shopping transport to REST**; ✓ = done-toggle, optimistic UI | 0 | small — one `rest_command` + card edit |
| 2 | **Design pass on the panel** (§4 questions) | 1 | discussion |
| 3 | **Add-item** (§5) | 1, 2 | small |
| 4 | **S4 meal-plan → list** — native, one call | 0 | **tiny** |
| 5 | **Recipe entry** (§6 route 1 or 2) | 0 | medium |
| 6 | **Web import** (§6 route 3) | 5 | large |

**Task 4 is nearly free and delivers the headline feature** ("scheduled meals fill my shopping
list"). Consider pulling it forward for morale.

## 9. Carry-forwards that constrain this

- 🔴 **The Pi runs HA 2026.6.3**, far newer than the **2025.7.4** the grocy HACS integration was
  verified against. Newer HA pulls grocy **v1.15.0** → the `grocy-py` library instead of `pygrocy2`,
  and hydration there is **unverified**. **§2's REST decision sidesteps this entirely** — one more
  reason to prefer it. Do not install the HACS integration on the Pi without re-verifying.
- **Recipe pictures are disabled** (`pictureUrl` always `null`). Two blockers: the filename must be
  **base64-encoded**, and the fetch needs the `GROCY-API-KEY` header, which `<img src>` cannot send.
  Needs an HA-side image proxy. Relevant if the redesign wants photos — and a photo-led recipe
  list is a likely want.
- **A Grocy 401 looks like success** — `rest_command` only logs at ≥400 then returns the parsed
  body, so a bad key degrades to `[]`, indistinguishable from "no items". Check `response.status`.
- **`scaleIngredients` is parameterized for a servings +/− control** with 12 tests. **Not dead code
  — do not delete.**
- **Negative-id rows in `recipes` are meal-plan scaffolding**, not recipes (`-16 | 2026-32`).
  Already filtered (commit `7de6e16`); any new recipe surface must filter them too.
- **Two test files mirror card logic** rather than driving the Lit element (vitest runs in node,
  no DOM). If `_open` or the DETAIL `<li>` changes, update the mirrors or they silently stop
  testing reality.
- **Grocy is pinned to `:latest`** in `deploy/grocy/docker-compose.grocy.yml` but everything was
  verified against **4.6.0** (`v4.6.0-ls329`). **Pin it before deploying to the Pi** — the AdGuard
  work this week established that discipline, and version-specific behaviour is already load-bearing
  here (`intval` truncation, `recipes_pos_resolved` shape, negative-id rows).
- **Grocy login is `admin`**; password unknown, bcrypt (`$2y$12$…`). Default is `admin`/`admin`.
  Resettable by writing a new hash into `users.password`.
