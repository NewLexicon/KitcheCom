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

## 6. ✅ The card renders in a real HA dashboard — CONFIRMED

**Confirmed visually by Garrett on 2026-08-11**, at `http://localhost:8124/lovelace/recipes` in a normal browser. Corroborated server-side: the newest `frontend.js.modern` error in `home-assistant.log` is **11:24:37**, from *before* the cache-bust — the successful render logged nothing.

Getting there took two real fixes, both now in the repo:

1. **Every card was unloadable in any browser** (§6b). `tsc` emitted bare `import ... from "lit"`; HA showed only "Configuration error". Fixed by bundling — commit `b008280`.
2. **The browser cached the broken module** (§6c) and kept throwing the old error six minutes after the fixed file was deployed. Fixed by versioning the resource URL.

**What is still not covered:** the card's WebSocket `callService` path was verified over the REST API rather than driven from a browser — both share the same service layer and envelope. The DETAIL view (clicking a recipe) was rendered but not separately instrumented.
- **The WebSocket `callService` path specifically.** Verified over the REST API. Both funnel into the same service layer and the same `service_response`, but the card's exact `hass.callService(..., returnResponse=true)` call was not driven from a browser.
- **S1's OQ-1/2/3** — untouched; they need HACS + the grocy integration, neither installed here.

## 6b. ⚠️ THE BIG ONE — every card was unloadable in any browser

**The in-HA render is what caught this. Nothing else could have.**

`tsc` emits import specifiers verbatim, so `import { LitElement } from "lit"` survived into `dist/`. A browser cannot resolve a **bare specifier**:

```
TypeError: Failed to resolve module specifier "lit".
Relative references must start with either "/", "./", or "../".
```

The module never evaluates → the custom element never registers → HA renders a bare **"Configuration error"** with no hint at the cause.

**Scope: all four cards** — recipe, mealplan, shopping, and the screensaver (which had two bad specifiers). S1's cards had it too.

### ✅ CONFIRMED BROKEN ON THE PI — the screensaver has never once worked

Garrett photographed the kitchen display on 2026-08-11: the hero grid shows the clock (13:08), the weather placeholder, "Hold to talk" — and a **"Configuration error"** tile exactly where `custom:screensaver-card` sits in `homeassistant/dashboards/kitchen.yaml:19`. It is the only custom card on that dashboard, so the failing tile is unambiguously the screensaver.

**"I've never seen the screensaver come up."** That is this defect, not an idle-automation problem: the module was deployed from a `tsc` build, so it never loaded and the element never registered. It could never have rendered, idle or not. **Do not debug `input_boolean.kitchen_idle` or `packages/screensaver.yaml` over this** — they were never reached.

**The fix is committed** (`b008280` — vite build, 52 tests green). It needs **deploying**: rebuild, copy `dist/screensaver-card.js` to the Pi's `/config/www/`, and **bump the resource URL version** (`/local/screensaver-card.js?v=2`) or the Pi's browser will serve the cached broken module exactly as the dev box did (§6c).

Not yet verified on the Pi — it was unreachable at `192.168.1.234` (ssh timeout) when this was written.

**Why every prior check passed.** Both supplied a resolution HA does not:
- **Vitest** resolves through `node_modules`.
- **`demo/index.html`** declared an `importmap` pointing `"lit"` at a CDN.

The card was "browser-verified" on 2026-08-10 in that demo and still could not load in HA. **Same class of error as the fixture bug: passing against conditions the real environment cannot produce.**

**Fix (`b008280`):** a vite lib build per card, inlining lit + `shared.ts`. Each `dist/*.js` is self-contained — **there is no `shared.js` any more.** The Grocy package builds *one card per vite invocation* deliberately: with three entries, rollup hoisted shared code into a hashed sibling chunk (`shared-DNWEGC0a.js`), which would mean a second file to deploy under a name that changes every build.

**Guard:** `test/dist-browser-loadable.test.ts` in both packages asserts `dist/` contains **no imports at all** — bare *or* relative. Both were confirmed RED against the old output first. The demo's importmap is removed, so the harness now represents HA instead of masking it.

## 6c. The browser cache masks a fixed card as broken

After the fix was deployed, the dashboard still showed "Configuration error" — the served file had zero imports, but the browser was running a cached copy and threw the *old* error six minutes later. A hard refresh (Cmd+Shift+R) does **not** reliably re-fetch a Lovelace module.

**Fix:** version the resource URL (`/local/recipe-card.js?v=2`) and bump on every redeploy.

**The debugging lever that resolved it:** HA logs the browser's real error under `frontend.js.modern` in `/config/home-assistant.log`. That converts a useless "Configuration error" into an actual stack trace:

```bash
docker exec kitchencom-ha-dev grep frontend.js /config/home-assistant.log | tail
```

**When a card misbehaves right after a redeploy, suspect the cache before the code.**

## 6a. Server-side setup (all persisted — no need to redo)

**Everything server-side is in place and persisted.** A future session does not need to redo any of it:

- **Resource registered:** `/local/recipe-card.js?v=2`, type `module`, id `fe537002b11e4a178671914b898cca10` (in `.storage/lovelace_resources`). **Bump `?v=` on every redeploy** — see §6c.
- **Dashboard written:** the default storage-mode dashboard holds one view `Recipes` with a single `custom:grocy-recipe-card` (in `.storage/lovelace`). The card takes **no `entity`**.
- **Onboarding fully complete** — all four steps (`user`, `core_config`, `analytics`, `integration`). *Creating the user alone is not enough*: HA redirects to `onboarding.html` until all four are done, which looks exactly like a broken dashboard.
- **Dev login:** `dev` / `devdevdev`. A long-lived token was minted for API work.

### ⚠️ Do not try to verify a render with the `browser-automation` skill

It resolves **patchright**, a stealth Playwright fork that **nulls `customElements`**. HA's frontend is entirely custom elements, so no HA dashboard renders in it — ours or anyone's:

```
customElements:        "NULLED"
hasHomeAssistantTag:   true      <home-assistant> is in the DOM
homeAssistantHasShadow: true     with a shadow root
bodyLen:               0         ...rendering nothing
```

It reports **zero console errors and zero failed requests** while showing nothing, so it reads as "clean" when it has actually verified nothing. **A human with a normal browser is the only way to confirm an HA render** — and it was a human doing exactly that which caught the bare-specifier defect in §6b after the automated pass called it clean.

One further harness gotcha if driving HA's *API* (not rendering): Chrome's Local Network Access policy blocks `ws://localhost`, needing `--disable-features=LocalNetworkAccessChecks`.

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
