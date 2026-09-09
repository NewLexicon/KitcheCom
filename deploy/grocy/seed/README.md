# Grocy library seed

Built 2026-09-09 in a local sandbox (Grocy 4.6.0, port 9284) so the family food
library could be developed without touching the Pi's REAL household data.

## Files
- `grocy-library-export.json` — 24 recipes, 208 ingredient rows, 113 products,
  15 units, 14 per-product unit conversions, 6 groups, 1 location. NO meal_plan
  or shopping_list (those are live data, deliberately excluded).
- `import-grocy-library.py` — replays the export onto any Grocy 4.6.0. Idempotent:
  matches by NAME, reuses existing objects, skips recipes already present.
- `docker-compose.sandbox.yml` — rebuilds the local sandbox on port 9284 (NOT the
  Pi's 9283). `restart: "no"`.

## Rebuild the sandbox (if the scratchpad copy is gone)
    docker compose -f docker-compose.sandbox.yml up -d   # needs its own grocy-config dir
    # then mint an API key by inserting into api_keys (Grocy has no API to mint one),
    # or log in admin/admin at localhost:9284 and create products via import below.

## Import onto the Pi (do this AT HOME, on the home LAN)
    GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<grocy_api_key from secrets.yaml> \
      python3 import-grocy-library.py --dry-run    # preview: everything should be "create"
    GROCY_URL=http://192.168.1.234:9283 GROCY_KEY=<...> python3 import-grocy-library.py

## Before importing to the Pi
- The Pi already has 8 real recipes (4 date-named artifacts). This import ADDS
  the 24 library recipes; it does not delete anything. Name collisions are skipped.
- Confirm the Pi is Grocy 4.6.0 (`/api/system/info`) before running.
