# The HA gate — CLOSED. The card's transport is verified inside real Home Assistant.

**Date:** 2026-08-11
**Branch:** `feat/grocy-chores` (worktree `.worktrees/grocy-chores`)
**Scope:** the one gate the 2026-08-11 Tier-2 session left owed — verify the `rest_command` transport inside a real HA, not by source-reading.
**HA:** `ghcr.io/home-assistant/home-assistant:2025.7`, host port **8124**, talking to the Grocy 4.6.0 container from that session (unchanged test data).

**Outcome: both source-read assumptions are CONFIRMED.** Nothing had to change in the card or the package.

---

## 1. What was owed

The Tier-2 doc (§7) listed two links in the chain that curl and the demo harness could not reach:

1. **HA templating `{{ recipe_id }}`** from the card's service-call data into the `!secret` URL.
2. **`returnResponse` delivery** — whether `res.response.content` is really where the payload lands.

Both are now exercised against a running HA.

## 2. A blocker found before the container would even boot

`homeassistant/configuration.yaml` has **no `default_config:`** — it is a *merge fragment*, meant to merge into an HA OS config that already supplies one (`homeassistant/README.md:24-26`). Mounted alone as `/config`, HA comes up with **no `rest_command` service at all**, and the gate fails for a reason unrelated to the card.

**Fix:** the dev container mounts an assembled `deploy/homeassistant/dev-config/`, built by `dev-setup.sh` from `dev-configuration.yaml` (the fragment's wiring **plus** `default_config:`) with `packages/` copied in verbatim. **The committed fragment is untouched** — this is dev scaffolding, not a change to the Pi's config.

Confirmed loaded, all three services registered from our package:

```
rest_command services: ['grocy_quantity_units', 'grocy_recipe_ingredients',
                        'grocy_recipe_list', 'reload']
```

## 3. ✅ Assumption 1 — `{{ recipe_id }}` templating WORKS

Called `rest_command.grocy_recipe_ingredients` twice with different `recipe_id`:

| Call | rows | distinct `recipe_id` in rows |
|---|---|---|
| `{"recipe_id": 1}` | 3 | `[1]` |
| `{"recipe_id": 2}` | 3 | `[2]` |

**This is the decisive result.** Had the template not substituted, Grocy's filter would have matched nothing and **both calls would have returned all 10 rows**. Each call returned only its own recipe's rows, so HA rendered `{{ recipe_id }}` into the secret URL and Grocy's server-side filter applied.

The URL-encoded `query%5B%5D=recipe_id%3D{{ recipe_id }}` form survives HA's URL handling intact — the concern recorded at `INSTALL.md:101` is settled.

## 4. ✅ Assumption 2 — the `returnResponse` shape is as coded

```
top-level keys:        ['changed_states', 'service_response']
service_response keys: ['content', 'status']
content:               list, len 4   (first: "Weeknight Tacos")
```

`shared.ts` reads `res?.response?.content` on the WebSocket path; the REST API names the same envelope `service_response`. **The `content` key and its array payload are confirmed** — which is what the card actually depends on.

Worth keeping in mind: `status` (200 here) rides alongside `content`. Per Tier-2 §5 a 401 still arrives looking like a successful call with an empty body, and `status` remains the only signal distinguishing "no ingredients" from "bad API key." The card does not read it; that stays a known, accepted limitation.

## 5. ✅ End-to-end render, through HA

`grocy_quantity_units` returned 6 units, `{2:Piece, 3:Pack, 4:Pound, 5:Tablespoon, 6:Cup, 7:Gram}` — matching Tier-2 exactly. Recipe 1's rows resolved through that map:

```
2.25 Pound Ground beef
18 Piece Tortillas
0.375 Tablespoon Salt
```

**Identical to the Tier-2 curl output, now via HA's service layer.** The `"(unknown)"` defect stays fixed across the real transport.

## 6. What this does NOT cover

- **The card rendering inside an HA dashboard — ATTEMPTED, BLOCKED BY TOOLING.** See §6a. The transport is verified; the in-HA *render* is not. Rendering is separately covered by the demo harness (2026-08-10, 0 console errors).
- **The WebSocket `callService` path specifically.** Verified over the REST API. Both funnel into the same service layer and the same `service_response`, but the card's exact `hass.callService(..., returnResponse=true)` call was not driven from a browser.
- **S1's OQ-1/2/3** — untouched; they need HACS + the grocy integration, neither installed here.

## 6a. The in-HA render attempt — server side DONE, browser side blocked

**Everything server-side is in place and persisted.** A future session does not need to redo any of it:

- **Resource registered:** `/local/recipe-card.js`, type `module`, id `fe537002b11e4a178671914b898cca10` (in `.storage/lovelace_resources`).
- **Dashboard written:** the default storage-mode dashboard holds one view `Recipes` with a single `custom:grocy-recipe-card` (in `.storage/lovelace`). The card takes **no `entity`**.
- **Onboarding fully complete** — all four steps (`user`, `core_config`, `analytics`, `integration`). *Creating the user alone is not enough*: HA redirects to `onboarding.html` until all four are done, which looks exactly like a broken dashboard.
- **The module is served and fetched:** `/local/recipe-card.js` returns **200**, and the browser was observed requesting it twice while loading the dashboard.

**Why the render could not be confirmed:** the automation browser (patchright, a stealth Playwright fork) **nulls `customElements`** as an anti-detection measure. Probed directly:

```
customElements:        "NULLED"
hasHomeAssistantTag:   true      <home-assistant> is in the DOM
homeAssistantHasShadow: true     with a shadow root
bodyLen:               0         ...rendering nothing
```

HA's entire frontend is custom elements, so with the registry nulled **no HA dashboard can render in this browser** — ours or anyone's. Zero console errors and zero failed requests throughout: nothing suggests a card defect. Two red herrings on the way, both harness-side, both fixed: Chrome's Local Network Access policy blocking `ws://localhost` (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` — needs `--disable-features=LocalNetworkAccessChecks`), and evaluates throwing `Cannot read properties of null (reading 'get')` whenever they touched `customElements`.

**To finish this in ~2 minutes: open `http://localhost:8124/lovelace/recipes` in a normal browser** (login `dev` / `devdevdev`). The dashboard is already built. Expect 4 recipe tiles; click one for pre-scaled ingredients. A real browser has no stealth patching, so this is purely a "look at it" step.

Do not re-attempt with the `browser-automation` skill — it resolves the same patchright driver and will fail identically.

## 7. Reproducing

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/.worktrees/grocy-chores
export GROCY_API_KEY=$(sqlite3 deploy/grocy/grocy-config/data/grocy.db \
  "select api_key from api_keys limit 1;")
./deploy/homeassistant/dev-setup.sh
docker compose -f deploy/homeassistant/docker-compose.ha-dev.yml up -d
```

Then create a user (UI at `http://localhost:8124`, or `POST /api/onboarding/users`) and call the services with `?return_response`.

**Teardown:** `docker compose -f deploy/homeassistant/docker-compose.ha-dev.yml down`. `dev-config/` is gitignored and holds the HA database plus `secrets.yaml` — delete it to reset onboarding.

**Dev credentials** (throwaway, this container only): `dev` / `devdevdev`.

## 8. Hygiene

- `deploy/homeassistant/dev-config/` is gitignored — verified with `git check-ignore`; the API key in `secrets.yaml` cannot be committed.
- Port **8124**, chosen so it never collides with the Pi's 8123.
- `restart: "no"` — the dev container never resurrects itself after a teardown.
- Grocy's data was **not** modified: this session only issued GETs.
