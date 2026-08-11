# KitchenCOM Install Runbook (Pi 5 — Pi OS + HA Container)

## Phase A — OS + HA
1. Flash Raspberry Pi OS (64-bit) to NVMe SSD; keep SD/USB for media.
   - **Kiosk prerequisite:** use the **Desktop** image (not Lite). The kiosk systemd unit
     uses `graphical.target` + `DISPLAY=:0`, so the Pi must boot to the DESKTOP with autologin
     enabled (`raspi-config` → System Options → Boot / Auto Login → Desktop Autologin). On a
     Lite/console-boot Pi the kiosk will silently never start.
2. Install Docker; run the Home Assistant Container image; complete onboarding.

## Phase B — Integrations (HA UI, mostly clicks)
- Add **Google Gemini** integration (paste API key); enable the Assist LLM API on it.
- Add **Google Calendar / Tasks / Photos** (OAuth, family account).
- Build the **Assist voice pipeline**: USB mic → Gemini STT → conversation → Gemini TTS → speaker.

## Phase B2 — Grocy backend (food domain: meal plan + shopping list)

Grocy runs as a headless Docker service alongside HA; its HACS integration surfaces the
meal plan and shopping list as sensors that the `grocy-food-card` elements render. The
native Grocy UI is never shown on the kitchen screen.

1. **Run the container.** From `deploy/grocy/`:
   ```bash
   docker compose -f docker-compose.grocy.yml up -d
   ```
   Browse `http://<pi-host>:9283` — default login is `admin` / `admin`. **Change it.**
   Then Grocy → Manage API keys → create a key and copy it.

2. **Install HACS** (if not already present), then HACS → ⋮ → Custom repositories →
   add `https://github.com/custom-components/grocy` with type **Integration** → download →
   **restart HA**.

3. **Add the integration.** Settings → Devices & Services → Add Integration → Grocy.
   - **URL:** `http://<pi-host>` — hostname only, **no port and no path**.
   - **Port:** `9283` — the published host port. **Do not leave the `9192` default**; that
     is the container-internal port and the config flow will fail to connect.
   - **API key:** the one created in step 1.

4. **Enable the sensors.** The integration's entities are **disabled by default**. Enable
   at least `sensor.grocy_meal_plan` and `sensor.grocy_shopping_list`, or the cards render
   their empty states.

5. **Deploy the card resources.** Build first (`dist/` is gitignored, so it must be produced
   on the machine doing the install):
   ```bash
   cd custom_cards/grocy-food-card && npm install && npm run build
   ```
   Copy `dist/*.js` into `/config/www/`. Register the card modules as resources
   (Settings → Dashboards → Resources), type **module**:
   - `/local/mealplan-card.js`
   - `/local/shopping-card.js`

   > **Each card is a self-contained bundle** — `lit` and the shared helpers are inlined,
   > so there is **no `shared.js`** to copy (there was, before 2026-08-11). Every `dist/*.js`
   > file is a resource in its own right.
   >
   > ⚠️ **Build with `npm run build` (vite), never plain `tsc`.** `tsc` emits
   > `import ... from "lit"` verbatim; browsers cannot resolve a bare specifier, so the
   > module never evaluates and the card never registers. HA reports only a generic
   > **"Configuration error"** on the card with no hint at the cause. `npm test` guards
   > this (`test/dist-browser-loadable.test.ts`).

6. **Add the cards** to a dashboard:
   ```yaml
   - type: custom:grocy-mealplan-card
     entity: sensor.grocy_meal_plan
   - type: custom:grocy-shopping-card
     entity: sensor.grocy_shopping_list
     shopping_list_id: "1"   # Grocy's default list; see note below
   ```
   > **`shopping_list_id` is required for check-off.** Without it the shopping card renders
   > **read-only** (no ✓ buttons) by design, rather than firing a service call that would
   > fail. `"1"` is Grocy's default list id and is **unconfirmed against a live instance**
   > (slice-1 open question OQ-3) — verify in Grocy's UI if check-off does not work.

7. **Recipe proxy (Slice 2).** The recipe card needs a server-side proxy, because the
   grocy integration exposes **no recipe sensor** — recipe content lives only in Grocy's
   REST API. Deploy `homeassistant/packages/grocy_recipes.yaml` (it lands automatically
   with the Phase C copy of `homeassistant/*`), then add three entries to
   `/config/secrets.yaml`:
   ```yaml
   # Recipe list — LIST view, fetched when the card mounts (1,334 B for 4 recipes)
   grocy_recipes_url: "http://<pi-host>:9283/api/objects/recipes"

   # One recipe's resolved ingredients — DETAIL view, fetched on open.
   # The query[] filter is Grocy's server-side filtering (1,526 B vs 5,084 B
   # unfiltered). {{ recipe_id }} is templated by the card's service call.
   grocy_recipe_ingredients_url: >-
     http://<pi-host>:9283/api/objects/recipes_pos_resolved?query%5B%5D=recipe_id%3D{{ recipe_id }}

   # Unit names for qu_id — fetched once per card load, 861 B, static.
   grocy_quantity_units_url: "http://<pi-host>:9283/api/objects/quantity_units"

   # API key (shared by all three)
   grocy_api_key: <the API key from step 1>
   ```
   > `secrets.yaml` is gitignored — enter these on the target machine, never commit them.
   >
   > **Why three `rest_command`s and NO sensor** (verified twice, 2026-08-11): a `rest`
   > sensor **cannot** carry this data. Grocy's `/objects/recipes` returns a **bare JSON
   > array**, and HA parses `json_attributes` from the raw body *before* `value_template`
   > runs, then takes `[0]` of a list and pulls named keys off it — so a bare array yields
   > the first recipe, which has no `recipes` key, and the sensor stays permanently empty.
   > No jsonpath expression fixes it. All three views therefore fetch on demand. See spec §2.1.
   >
   > **The `%5B%5D` and `%3D` are required** — they are URL-encoded `[]` and `=`. Grocy's
   > filter syntax is `query[]=recipe_id=N`, and an unencoded `[` will not survive the
   > request. (Verified that HA/yarl does **not** double-encode these under the default
   > `skip_url_encoding: false`.)

   Restart HA, then confirm in Developer Tools → Actions that the three
   `rest_command.grocy_*` actions exist. **There is no `sensor.grocy_recipes` to look for —
   it was removed deliberately.** Register `/local/recipe-card.js` (module) alongside the
   step-5 resources, and add the card:
   ```yaml
   - type: custom:grocy-recipe-card
   ```
   > **No `entity:` option** — the card takes no configuration. It fetches the recipe list
   > when it mounts, then ingredients and units on demand when a recipe opens.
   >
   > **Trade-off to expect:** LIST shows a brief "Loading recipes…" on first paint, and if
   > Grocy is unreachable it shows "No recipes" rather than stale tiles — nothing is cached
   > in HA state any more.

## Phase C — Deploy these files
1. Copy `homeassistant/*` into HA's `/config`.
2. Build with `cd custom_cards/screensaver-card && npm install && npm run build`, then copy
   the output into `/config/www/`; **register the resource** (Settings → Dashboards →
   Resources → `/local/screensaver-card.js`, module).
   > ⚠️ **Rebuild required if this card was deployed before 2026-08-11.** It was previously
   > built with plain `tsc`, which left unresolvable bare `lit` imports in the output — the
   > card cannot load in a browser and HA shows "Configuration error". The build now uses
   > vite and inlines its dependencies.
3. Restart HA; check Config validity.

## Phase D — Kiosk
1. Copy repo to `/home/pi/kitchencom`; `chmod +x deploy/kiosk/start-kiosk.sh`.
2. `sudo cp deploy/kiosk/kitchencom-kiosk.service /etc/systemd/system/`
3. `sudo systemctl enable --now kitchencom-kiosk`

> **Bookworm browser binary:** on current Pi OS (Bookworm) the browser is `chromium`, not
> `chromium-browser` (the older Buster/Bullseye name) that `start-kiosk.sh` calls. If
> `chromium-browser` is missing the service crash-loops every 5s — either install/symlink it
> (`sudo apt install chromium-browser`, or `ln -s $(which chromium) /usr/bin/chromium-browser`)
> or change the script's `ExecStart` to call `chromium`.

## Phase E — Mobile
- Family installs HA Companion app, signs in on the home network.

## HARDWARE-PHASE TODOs (carry-forwards from design)
- [ ] **Kiosk dashboard target:** the kiosk's default `HA_URL` points at `/kitchen-snapshot` — the committed YAML SNAPSHOT dashboard (recovery/review copy), which does NOT reflect phone-side live edits to the storage-mode dashboard. Once the live dashboard exists, repoint `HA_URL` to the live dashboard's `url_path`.
- [ ] **M-12 kiosk auth:** choose long-lived access token vs `trusted_networks` for the kiosk; wire it.
- [ ] **M-10 activity bridge:** wire kiosk touch → `input_button.kitchen_activity` press (e.g. via a tap-action on the dashboard or a small JS ping) so the HA idle timer resets on touch.
- [ ] **M-8 codec validation:** test screensaver video formats on the actual Pi 5 (HEVC/H.265 hw decode limited).
- [ ] **C-4 calendar-by-voice:** add a custom `intent_script` for calendar event creation (calendar has no built-in add intent; only `CREATE_EVENT_SERVICE`). Separate plan.
- [ ] **Placeholders:** replace `weather.home`, `todo.groceries`, `todo.chores`, `calendar.family` with real entity ids.
- [ ] **M-2 canonical list:** confirm `local_todo` canonical + Google Tasks mirror.
