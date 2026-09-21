# Grocy tools

## `week-shopping-list.py`

Reads the Grocy meal plan for a date range and prints a shopping list with
shared ingredients **summed correctly**.

### Why it exists

Grocy's own `POST /api/recipes/{id}/add-not-fulfilled-products-to-shoppinglist`
does not aggregate a product used by more than one planned recipe — it writes the
first recipe's amount and silently skips the rest. Garlic appears in 12 of the 24
library recipes and is bought as discrete fresh heads, so a normal week is
systematically under-ordered. Salt and the oils share the bug but are harmless
(a whole package is bought regardless).

### Usage

```bash
# from the home network (or Tailscale), key from the Pi's secrets.yaml
GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<grocy_api_key> \
  python3 deploy/grocy/tools/week-shopping-list.py --start 2026-09-22 --days 7
```

Defaults to today + 7 days. `--start` takes `YYYY-MM-DD`.

### Behaviour notes

- **Read-only.** It prints; it never writes to `shopping_list`. The household's
  list is live data — a past probe accidentally added 4 real rows to it.
- **Respects per-meal servings.** A meal planned above its recipe's
  `base_servings` scales every ingredient and is marked `(scaled xN)`.
- **Units are kept separate, never converted.** If a product is used in both
  Tablespoon and Cup it prints two lines. A wrong auto-conversion is worse than
  two lines.
- **No pantry check, by design.** No stock is kept — the human is the stock
  sensor — so this lists every ingredient of every planned meal, not just what
  is missing. Prune it by eye.

### Verified

Summing and scaling were exercised against a fixture built from
`../seed/grocy-library-export.json` (the Pi was unreachable):
Spaghetti Marinara (3 cloves) + Chicken Stir-Fry (2 cloves) → **5.00 Clove**,
where Grocy's endpoint would write 3.00. Doubling the first recipe's servings →
**8.00 Clove**, spaghetti 1→2 lb.
