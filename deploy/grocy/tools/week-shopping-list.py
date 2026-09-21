#!/usr/bin/env python3
"""Summarize the week's planned meals into a correctly-summed shopping list.

Why this exists: Grocy's own
`POST /api/recipes/{id}/add-not-fulfilled-products-to-shoppinglist` does NOT sum a
product that appears in more than one planned recipe -- it writes the first recipe's
amount and silently skips the rest. Garlic is in 12 of the 24 library recipes and is
bought as discrete fresh heads, so a normal week comes out under-ordered.

This READS the meal plan and PRINTS a summed list. It writes nothing by default --
the household's shopping_list is live data (a past probe added 4 real rows by
accident), so writing is opt-in behind --write.

Usage:
  GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<key> ./week-shopping-list.py
  ... --start 2026-09-22 --days 7
"""
import argparse, collections, datetime as dt, json, os, sys, urllib.request

def api(path):
    url = os.environ["GROCY_URL"].rstrip("/") + path
    req = urllib.request.Request(url, headers={"GROCY-API-KEY": os.environ["GROCY_KEY"]})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", help="YYYY-MM-DD (default: today)")
    ap.add_argument("--days", type=int, default=7)
    a = ap.parse_args()

    for var in ("GROCY_URL", "GROCY_KEY"):
        if not os.environ.get(var):
            sys.exit(f"error: {var} is not set")

    start = dt.date.fromisoformat(a.start) if a.start else dt.date.today()
    end = start + dt.timedelta(days=a.days - 1)

    products = {p["id"]: p for p in api("/api/objects/products")}
    units = {u["id"]: u for u in api("/api/objects/quantity_units")}
    recipes = {r["id"]: r for r in api("/api/objects/recipes")}
    pos = collections.defaultdict(list)
    for row in api("/api/objects/recipes_pos"):
        pos[row["recipe_id"]].append(row)

    planned = []
    for m in api("/api/objects/meal_plan"):
        if m.get("type") != "recipe" or not m.get("recipe_id"):
            continue
        try:
            day = dt.date.fromisoformat((m.get("day") or "")[:10])
        except ValueError:
            continue
        if start <= day <= end:
            planned.append((day, m))

    if not planned:
        print(f"No recipe meals planned {start} .. {end}.")
        print("Add meals in Grocy's Meal Plan, then re-run.")
        return

    # product_id -> unit_id -> summed amount. Keep units separate rather than
    # silently converting; a wrong conversion is worse than two lines.
    totals = collections.defaultdict(lambda: collections.defaultdict(float))
    sources = collections.defaultdict(set)

    print(f"Planned meals {start} .. {end}:")
    for day, m in sorted(planned, key=lambda x: x[0]):
        rec = recipes.get(m["recipe_id"])
        if not rec:
            continue
        base = float(rec.get("base_servings") or 1) or 1.0
        want = float(m.get("recipe_servings") or base)
        scale = want / base
        name = rec["name"].strip()
        note = "" if abs(scale - 1.0) < 1e-9 else f"  (scaled x{scale:g} -> {want:g} servings)"
        print(f"  {day}  {name}{note}")
        for row in pos[rec["id"]]:
            pidv = row.get("product_id")
            if not pidv or pidv not in products:
                continue
            amt = float(row.get("amount") or 0) * scale
            totals[pidv][row.get("qu_id")] += amt
            sources[pidv].add(name)

    print(f"\nShopping list ({len(totals)} products, summed across recipes):")
    rows = sorted(totals.items(), key=lambda kv: products[kv[0]]["name"].strip().lower())
    for pidv, by_unit in rows:
        pname = products[pidv]["name"].strip()
        for uid, amt in by_unit.items():
            unit = (units.get(uid) or {}).get("name", "")
            shared = len(sources[pidv])
            flag = f"   <- shared by {shared} recipes" if shared > 1 else ""
            print(f"  {amt:>8.2f} {unit:<12} {pname}{flag}")

    multi = {products[p]["name"].strip() for p, s in sources.items() if len(s) > 1}
    if multi:
        print(f"\n{len(multi)} shared ingredient(s) summed here that Grocy's own"
              f" endpoint would under-order:")
        print("  " + ", ".join(sorted(multi)))

if __name__ == "__main__":
    main()
