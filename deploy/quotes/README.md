# deploy/quotes

Feeds the **Perspective** card on the KitchenCOM wall panel with a rotating quote.

| File | What it is |
|---|---|
| `pick_quote.py` | Picks one quote, prints `{"text","author"}` on one line |
| `quotes.json` | 5,421-quote local dataset, UTF-8 (converted from cp1252) |
| `convert_dataset.py` | One-shot cp1252 → UTF-8 converter for the raw upstream file |
| `test_pick_quote.py` | 30 tests |

Spec: `docs/superpowers/specs/2026-08-18-daily-quotes-design.md`
Plan: `docs/superpowers/plans/2026-08-18-daily-quotes.md`

## Sources

| Source | Weight | Transport | Author? |
|---|---|---|---|
| local `quotes.json` | ~65% | none | mostly (349 of 5,421 have none) |
| ZenQuotes `/api/random` | ~35% | HTTPS | yes |

**Affirmations.dev was dropped** (2026-08-18) after measurement: 25 consecutive fetches returned
only 17 unique results, several repeating. At uniform selection that put a third of the wall's
content on a pool that repeats within days.

**Quotable is excluded.** Its TLS certificate expired **2024-09-10** and has not been renewed, so
it works only over plain HTTP — a service nobody is maintaining.

**Quoteverse (RapidAPI) is a candidate for later** — 28,000+ quotes across 21 categories. It needs
an account and an API key, so it would introduce secret handling this design does not have: the key
must live in `secrets.yaml` on the Pi and reach the script via the environment, never in this repo.

## Why it cannot visibly fail

The panel is a permanent kitchen fixture, so an error message sitting on it reads as "the whole
system is broken." Every failure therefore degrades silently:

| Situation | What the wall shows |
|---|---|
| API succeeds | that quote |
| API fails, times out, or there is no internet | a local quote — indistinguishable |
| Local file missing or corrupt | `LAST_RESORT`, a single hardcoded line |
| Anything at all raises | `LAST_RESORT` |

`pick()` wraps everything in a bare `except` for this reason. It is deliberate, not sloppy.

## Content filtering

`BLOCKED_WORDS` is applied to **every** source, matched **whole-word** (`\b(...)\b`) so "goddess"
is not blocked by "god". It currently rejects **0.83%** of the local dataset (45 of 5,421).

**The list is single words only.** A multi-word phrase would silently never match.

Re-check the rate after editing the list:

```bash
cd deploy/quotes && python3 -c "
import json, pick_quote
d = json.load(open('quotes.json', encoding='utf-8'))
b = [q for q in d if pick_quote.is_blocked(q['quoteText'])]
print('blocked: %d of %d (%.2f%%)' % (len(b), len(d), 100*len(b)/len(d)))
"
```
Over ~5% means the list is too aggressive — find the word doing unintended work.

## Testing

```bash
cd deploy/quotes
python3 -m pytest test_pick_quote.py -v     # 30 tests
python3 pick_quote.py                        # one line of JSON
```

**Local Python is 3.9.6; the Pi's container is 3.14.5.** The script must stay 3.9-compatible —
no `match`, no `X | Y` unions — or the tests cannot run locally. A local pass does not prove it
works on the Pi; test there too:

```bash
ssh kitchencom 'sudo docker exec homeassistant python3 /config/quotes/pick_quote.py'
```

## Deploying to the Pi

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
ssh kitchencom 'sudo mkdir -p /home/garrettdehart/homeassistant/quotes'
scp deploy/quotes/pick_quote.py deploy/quotes/quotes.json kitchencom:/tmp/
ssh kitchencom 'sudo cp /tmp/pick_quote.py /tmp/quotes.json /home/garrettdehart/homeassistant/quotes/ && \
  sudo chown -R garrettdehart:garrettdehart /home/garrettdehart/homeassistant/quotes'
```

Then restart HA. The sensor lives in `homeassistant/packages/quotes.yaml`; the card is in
`homeassistant/dashboards/kitchen.yaml`.

### Gotchas that cost time

- **`scan_interval: 3600` is load-bearing.** `command_line` defaults to **60 seconds** — omitting
  it means ~1,440 ZenQuotes calls a day.
- **`unique_id` is not in `command_line`'s schema** (HA 2026.6.3) and fails `check_config`.
  Consequently these sensors **never appear in `core.entity_registry`**, and they are not
  restore-backed either — so neither file can tell you whether the sensor is working. Look at the
  panel, or query HA's API with a token.
- **When HA runs the command, cwd is `/`**, not the script's directory. `DATASET` is built from
  `os.path.dirname(os.path.abspath(__file__))` for that reason; a relative path breaks.
- **Each `docker exec` is a separate shell.** An `mv` in one call does not persist into the next,
  which can make a failure-path test appear to pass while proving nothing.

## Adding a source

1. Add a `normalise_*` function returning `{"text","author"}` or `None`
2. Add it to `SOURCES`
3. Add its name to `SOURCE_NAMES` and a weight to `SOURCE_WEIGHTS` (weights are relative — no
   need to make them sum to anything)
4. Add tests for the new shape, including an empty payload
