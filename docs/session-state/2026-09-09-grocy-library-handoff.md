# COLD OPEN — Grocy food library (2026-09-09 evening → tonight at home)

**What this session did:** built the family's Grocy recipe/meal-planning library
from scratch, in a **local sandbox on the Mac**, because the Pi was unreachable
from the office AND the Pi holds the family's REAL food data. The library is now
**saved in the repo and pushed**, ready to import onto the Pi tonight.

> This is a Grocy-work handoff. The panel branch's own cold-open
> (`COLD-OPEN-time-of-day-layouts.md`) is unchanged and still governs the
> time-of-day / light-mode work. These two are unrelated; don't cross them.

---

## 0. Read this first — the two things that matter tonight

**① The sandbox is DISPOSABLE; the library is SAFE.** All the recipe-building
happened in a Grocy container whose database lives in this session's scratchpad
(`/private/tmp/claude-503/.../scratchpad/grocy-sandbox/`). **A fresh session's
scratchpad is different — that DB may be gone, even though the container was
running at close.** That is why the library was exported to the repo. **Do not
rely on the sandbox surviving. Rely on the repo export.**

**② Tonight's job = import the library onto the Pi, at home, on the home LAN.**
The Pi's Grocy is `http://192.168.1.234:9283`; the API key is `grocy_api_key` in
`homeassistant/secrets.yaml` (ON THE PI — not in the repo). One command does it:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/deploy/grocy/seed
# 1) preview — everything should say "create" against the Pi's (near-empty) Grocy:
GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<grocy_api_key> python3 import-grocy-library.py --dry-run
# 2) for real:
GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<grocy_api_key> python3 import-grocy-library.py
```

The importer is **idempotent and additive** — it matches by NAME, reuses/skips
anything already on the Pi, and NEVER imports meal_plan or shopping_list (those
are live household data). The Pi's 8 existing recipes (4 are date-named
artifacts) are left alone.

---

## 1. Where is HEAD?

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current     # feat/time-of-day-layouts (Grocy work rode along here)
git log --oneline -1          # authoritative tip — NOT frozen here
git rev-list --left-right --count origin/feat/time-of-day-layouts...HEAD  # expect 0  0
```

The Grocy library was committed on `feat/time-of-day-layouts` as an additive
`deploy/grocy/seed/` directory (it touches no panel code, so it's harmless here;
it can move to main whenever convenient). Close-out commit this session:
`8e93b68 feat(grocy): seed the family food library`. Pushed. Tip is delegated to
`git log` per the anti-stamping rule.

---

## 2. Empirical state (verified 2026-09-09 ~15:30, at the office)

**In the repo, pushed:**
```
deploy/grocy/seed/grocy-library-export.json   # 24 recipes, 208 pos rows, 113 products, 15 units, 14 conversions, 6 groups
deploy/grocy/seed/import-grocy-library.py      # idempotent importer; dry-run VERIFIED against sandbox
deploy/grocy/seed/docker-compose.sandbox.yml   # rebuilds the port-9284 sandbox
deploy/grocy/seed/README.md                    # how to import / rebuild
```

**Importer proven:** dry-run against the live sandbox returned "recipes created:
0, skipped: 24" — correct (all 24 already exist there). Against the empty Pi it
will create everything.

**The sandbox (may or may not exist tonight):** container `grocy-sandbox`, port
**9284** (NOT the Pi's 9283), Grocy **4.6.0** (= the Pi's version), login
`admin`/`admin`, API key in the scratchpad's `api-key.txt`. If it's gone, you do
NOT need it — the repo export is the source of truth. Rebuild only if you want to
keep practicing offline (see the seed README).

---

## 3. What the library contains (and the decisions behind it)

**24 recipes:**
- **6 mains @ 6 servings** (house default): Taco Night, Spaghetti Marinara,
  Chicken Stir-Fry, Beef Stir Fry, Korean Popcorn Chicken, Korean Short Rib Ramen.
- **6 "(Big Batch)" twins @ 10 servings** — scaled ×1.67 copies of each main.
- **9 sides:** Cole Slaw, Fruit Salad, Garlic Green Beans, Jasmine Rice, Mexican
  Street Corn, Roasted Potatoes, Roasted Sweet Potatoes, Chile Relleno Dip,
  Japanese Pickled Cucumber.
- **3 other:** Rustic Italian Pizza Dough, Steak Marinade, Weekend Pancakes.

**113 products**, including **21 plain-produce staples** (Bananas, Apples,
Baby carrots, Bagged salad, Russet potatoes, Frozen veg, …) as standalone products
— one-tap shopping-list adds, NOT recipes.

**Locked household decisions (do not re-litigate):**
1. **Servings = batch YIELD, not diners. Family cooks for leftovers; 4 is too small.**
   Mains default to **6**; use the **(Big Batch)** twin for a 10-serving cook.
   Non-dinners keep their own honest yield. → memory `grocy-servings-house-default`.
2. **Sides go on the plan as recipes ONLY when they carry ingredients you'd forget
   to buy** (slaw, rice, roasted potatoes). Grab-and-go sides (bagged salad, frozen
   veg) are plain products / hand-added list items, not recipes.
3. **Big-batch = duplicate recipe**, chosen over a per-meal servings bump, BECAUSE
   Grocy's "add missing products to shopping list" does NOT re-scale to a meal's
   per-night servings — it reads the recipe's base. The twin carries real 10-serving
   amounts; the toggle would silently under-buy.

---

## 4. Carry-forwards / known limitations (all verified live this session)

- **Shopping list does NOT sum a shared ingredient across recipes** — it adds it
  ONCE (first recipe's amount), so the list is SHORT on shared items. Bites fresh
  per-unit produce (garlic came out 10 cloves when a week needed ~18). Harmless for
  pantry staples you buy a whole package of. → memory `grocy-shopping-list-no-aggregation`.
  This is the #1 design input for the future panel auto-shopping-list feature.
- **Scaled amounts get fiddly** — Big Batch tacos want "13.33 tortillas",
  "1.67 packs seasoning". Correct math, round up at the store. Not a data bug.
- **Hand-typed products need auditing before/after any UI entry** — this session
  found "Apple" vs "Apples" duplicates and a "Purple Cabbage" that was unit *Can*
  in no group. Both fixed. → memory `grocy-local-sandbox` (data-hygiene traps) and
  the trailing-space trap in `grocy-servings-house-default`.
- **NO stock/inventory, by decision** — "the human is the stock sensor", so
  "not fulfilled" returns EVERY ingredient (intended). Never turn on stock tracking.
  → memory `grocy-api-write-endpoints`.
- **Kroger/Amazon are NOT in Grocy** — future custom layer (roadmap S5). Amazon
  dropped (no API). Barcodes exist per-product but are a stock feature, mostly unused.

---

## 5. The next move (tonight, at home)

1. Confirm you're on the home LAN: `route -n get default | grep gateway` should show
   `192.168.1.1`, and `ssh kitchencom` should answer. (If a corporate `10.x` gateway,
   you're not home yet — memory `pi-unreachable-from-office`.)
2. Get the Pi's Grocy key: it's `grocy_api_key` in the Pi's `homeassistant/secrets.yaml`
   (`ssh kitchencom 'grep grocy_api_key /config/secrets.yaml'` or wherever secrets live).
3. Confirm the Pi is Grocy 4.6.0: `curl -s -H "GROCY-API-KEY: <key>" http://192.168.1.234:9283/api/system/info`.
4. Run the importer **--dry-run first**, eyeball the "create" counts, then for real.
5. Then plan a week in the Pi's Grocy UI and generate a shopping list to confirm it
   all works on the real instance — same workflow demonstrated in the sandbox.

**Optional / deferred:** move `deploy/grocy/seed/` from `feat/time-of-day-layouts`
to main (it's additive, no rush). Build the panel-side auto-shopping-list feature
that fixes the shared-ingredient shortfall (roadmap S4) — that's real feature work,
not a tonight task.

---

## 6. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:
- `grocy-local-sandbox.md` — the port-9284 sandbox, schema facts, data-hygiene traps
- `grocy-servings-house-default.md` — the leftovers/servings=6 rule + trailing-space trap
- `grocy-shopping-list-no-aggregation.md` — shared ingredients are NOT summed (the #1 gotcha)
- `grocy-api-write-endpoints.md` — verified write endpoints; probes must never hit the REAL list; no-stock decision
- `pi-unreachable-from-office.md` — check your network before suspecting the Pi
- `kitchencom-github-remote.md` — remote is `NewLexicon/KitcheCom` (repo name typo'd)
