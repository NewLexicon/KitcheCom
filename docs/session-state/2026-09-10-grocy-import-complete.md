# COLD OPEN — Grocy library is LIVE on the Pi (2026-09-10 morning)

**Supersedes `2026-09-09-grocy-library-handoff.md`.** That doc's headline task —
"import the library onto the Pi tonight" — is **DONE**. Read this one instead; the
older handoff is kept only for the decision rationale in its sections 3 and 4.

> Grocy-work handoff. The panel branch's own cold-open
> (`COLD-OPEN-time-of-day-layouts.md`) is unchanged and still governs the
> time-of-day / light-mode work. Unrelated; don't cross them.

---

## 0. The one thing that matters

**The 24-recipe family food library is imported and verified on the Pi's REAL Grocy.**
No seeding work remains. The next Grocy work is *using* it (meal planning in the real
UI) or *building on* it (panel-side auto-shopping-list, roadmap S4).

Do NOT re-run the importer as a "let's make sure." It is idempotent so it's harmless,
but if it ever reports `recipes created: 24` against the Pi again, that means something
**wiped the library** — investigate before importing.

---

## 1. Where is HEAD?

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
git branch --show-current   # feat/time-of-day-layouts
git log --oneline -1        # authoritative tip — deliberately NOT frozen here
git rev-list --left-right --count origin/feat/time-of-day-layouts...HEAD   # expect 0  0
```

**Stable prefix (immutable, verifiable):** `8e93b68` seeded the library →
`a4a91bd` wrote the 09-09 handoff. This session added **no code commits** — the
import writes to the Pi, not the repo — only this doc. Tip is delegated to `git log`
per the anti-stamping rule.

---

## 2. Empirical state — verified 2026-09-10 ~08:35 IN THE DATABASE, not from script output

Pi Grocy: `http://192.168.1.234:9283`, container `grocy`, **v4.6.0** (matches the
sandbox the library was built in). Home LAN gateway is **192.168.1.254** (the 09-09
handoff guessed `.1` — harmless, but `.254` is the real value).

| Table | Before | After | Note |
|---|---|---|---|
| recipes | 10 | **34** | +24 imported; the 6 date-named rows are pre-existing junk |
| products | 18 | **117** | +99 — 14 of the library's 113 REUSED existing rows |
| recipes_pos | 10 | **218** | +208 ingredient rows |
| quantity_units | — | 17 | |
| quantity_unit_conversions | — | 14 | |
| **shopping_list** | **2** | **2** | **UNTOUCHED — live household data** |
| **meal_plan** | **2** | **2** | **UNTOUCHED — live household data** |

Integrity checks all clean: **0** NULL `product_id`/`qu_id`, **0** orphaned product or
unit refs, **0** duplicate product or recipe names. Ingredient spot-checks resolved to
real names/units, and Big Batch scaling is correct (Taco Night 8 tortillas → Big Batch
13.333). `Garlic` in the ramen recipe resolved to the Pi's **pre-existing** Garlic row,
proving name-match reuse worked instead of duplicating.

**Pre-import backup (restore point):**
`/home/garrettdehart/grocy-backups/grocy-20260910-083421.db` — integrity-checked `ok`,
captured with the live shopping_list/meal_plan rows intact.
Grocy's live DB: `/home/garrettdehart/grocy/data/grocy.db`
(bind mount `/home/garrettdehart/grocy -> /config`). **Copy that file before ANY bulk write.**

---

## 3. Carry-forward: the shared-ingredient shortfall, now quantified

Grocy does **not sum** an ingredient shared across recipes — it writes the first
recipe's amount and skips the rest, so shared items come out **short, quietly**.
With the full library loaded, the exposure is measurable:

| Recipes using it | Product | Risk |
|---|---|---|
| **14** | **Garlic** | **HIGH — fresh, per-clove, genuinely under-buys** |
| 13 | Salt | low (pantry, whole package) |
| 8 | Soy sauce / Olive Oil | low (pantry) |
| 5 | Butter | medium (perishable, per stick) |

**Garlic is the one to eyeball on every generated list.** This is the #1 design input
for the S4 auto-shopping-list feature. → memory `grocy-shopping-list-no-aggregation`.

Other limitations carried forward unchanged (see 09-09 handoff §4): scaled amounts get
fiddly (round up at the store), no stock tracking **by decision** so "not fulfilled"
returns every ingredient, Kroger/Amazon are not in Grocy.

---

## 4. Locked household decisions — do not re-litigate

1. **Servings = batch YIELD, not diners.** Family cooks for leftovers. Mains = **6**;
   use the **(Big Batch)** twin for a 10-serving cook. → `grocy-servings-house-default`.
2. **Sides are recipes only if they carry ingredients you'd forget to buy.**
   Grab-and-go sides stay plain products.
3. **Big-batch = duplicate recipe**, not a per-meal servings bump, because Grocy's
   add-to-shopping-list reads the recipe's BASE servings and would silently under-buy.

---

## 5. The next move

Nothing is blocked or half-built. Pick one:

- **Use it:** plan a week in the Pi's Grocy UI (`http://192.168.1.234:9283`), generate a
  shopping list, sanity-check Garlic. This is the natural next step and needs no code.
- **Build S4:** panel-side auto-shopping-list that sums `recipes_pos` per product across
  the planned week, fixing the shortfall above. Real feature work — brainstorm first.
- **Housekeeping (optional, no rush):** `deploy/grocy/seed/` currently lives on
  `feat/time-of-day-layouts`. It's additive and touches no panel code; move it to main
  whenever convenient.
- **Unrelated:** the time-of-day / light-mode panel work — see `COLD-OPEN-time-of-day-layouts.md`.

---

## 6. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:
- `grocy-library-imported-to-pi.md` — **NEW**: import is done; DB path, backup, re-run semantics
- `grocy-shopping-list-no-aggregation.md` — updated with the Pi-quantified table above
- `grocy-servings-house-default.md` — the leftovers/servings=6 rule + trailing-space trap
- `grocy-local-sandbox.md` — port-9284 practice sandbox, schema facts, data-hygiene traps
- `grocy-api-write-endpoints.md` — verified write endpoints; never probe the REAL list; no-stock decision
- `pi-unreachable-from-office.md` — check your network before suspecting the Pi
