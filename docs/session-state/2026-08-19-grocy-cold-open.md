# Grocy / KitchenCOM — cold-open (branch `feat/grocy-kitchen`)

**Written 2026-08-18 evening, for the next session.** Every claim has the command that
verifies it. Read this first if you are on `feat/grocy-kitchen`.

⚠️ **Multiple sessions share this repo AND the Pi's files.** Run `git branch --show-current`
before every commit, and see §6 before touching `kitchen.yaml`.

---

## 1. Where is HEAD

- **Worktree:** `/Users/jdehart1/___Code_DEV/KitchenCOM-grocy` · branch **`feat/grocy-kitchen`**
- **Last substantive commit:** `5ab0a9d` — the shopping-card rewrite. Anything after it is
  documentation. Cited this way deliberately: a commit cannot name its own SHA.
- **8 commits ahead of `origin/main`**, all pushed, working tree clean.
  (Deliberately not frozen further: a count that counts the commits it lives inside
  cannot be stamped correctly. Trust the command, not this number.)

```bash
git branch --show-current && git log --oneline -1 && git rev-list --count origin/feat/grocy-kitchen..HEAD
```
Expect the last number to be **0**.

## 2. 🟢 State in one paragraph

**Grocy runs on the Pi and the shopping card is finished — but the card is not on the kitchen
dashboard, on purpose.** A concurrent session reverted the dashboard swap mid-session; Garrett
chose to wait rather than fight over the file. **The one remaining action is a four-line edit
to `kitchen.yaml` once that session is done (§4).** Everything else is built, tested,
deployed and verified.

## 3. What is live on the Pi

| | |
|---|---|
| **Grocy** | `http://192.168.1.234:9283` · image **pinned** `v4.6.0-ls329` · `restart: unless-stopped` |
| **Auth** | **DISABLED** (`DISABLE_AUTH`) — no login. Backup: `~/grocy/data/config.php.bak-preauth-*` |
| **Data** | 4 recipes · 18 products · 2 shopping rows · 2 meal-plan rows |
| **HA** | `http://192.168.1.234:8123` · **2026.6.3** |
| **grocy integration** | **v1.15.0**, working — `sensor.grocy_shopping_list`, `sensor.grocy_meal_plan`, `todo.grocy_shopping_list`, `todo.grocy_meal_plan`, `calendar.grocy_calendar` |
| **Card file** | `~/homeassistant/www/shopping-card.js`, registered as a Lovelace resource |
| **Card in dashboard** | ❌ **not applied** — see §4 |

```bash
ssh kitchencom 'sudo docker ps --format "{{.Names}} {{.Image}} {{.Status}}"'
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.234:9283/shoppinglist   # expect 200
```

**Card gates** (`custom_cards/grocy-food-card/`): **126 tests pass**, typecheck clean, build
clean. ⚠️ **Build BEFORE test on a fresh checkout** — `dist-browser-loadable.test.ts` reads
`dist/`, which is gitignored.

## 4. 🎯 The literal next move

**Only when `kitchen.yaml` is quiet (§6).** Take the **LIVE** file — never the repo copy,
which has been behind all day — and replace:

```yaml
            - type: todo-list
              title: Groceries
              entity: todo.groceries  # local_todo (wired 2026-06-15, spec M-2)
```

with:

```yaml
            - type: custom:grocy-shopping-card
              entity: sensor.grocy_shopping_list
              todo_entity: todo.grocy_shopping_list
              shopping_list_id: 1
```

⚠️ Indentation is **10 spaces** for the `- type:` line.
Then `ssh kitchencom 'sudo docker restart homeassistant'` and **hard-refresh**.

⚠️ **The kiosk loads `/kitchen-snapshot`** (`filename: dashboards/kitchen.yaml`, `mode: yaml`).
The **"Home"** page — old Groceries card with an "Add item" box — is HA's **auto-generated
default** and editing `kitchen.yaml` will never change it. **Check the URL before diagnosing
a missing card.** Time was lost to exactly this.

⚠️ **A grey box is usually a stale asset, not a broken card.** See memory
`kiosk-service-worker-serves-stale-js` — clear the **Service Worker**, not just the cache.

Afterwards, pull the live file back into the repo:
```bash
ssh kitchencom 'sudo cat ~/homeassistant/dashboards/kitchen.yaml' > homeassistant/dashboards/kitchen.yaml
```

## 5. Zero-code fallback that works RIGHT NOW

**HA sidebar → To-do lists → *Grocy Shopping list*.** Verified end-to-end 2026-08-18: items
render, checking one writes `done=1` to Grocy, and it is reversible. Free-text rows render as
`1.00x Unknown product` with the real text demoted to a subtitle — ugly, but working.

**This is why the custom card exists: presentation, not capability.** If tomorrow goes badly,
the household still has a working shared shopping list today.

## 6. 🔴 `kitchen.yaml` is a contested file

**A concurrent session reverted this session's dashboard swap.** Timeline from the backups:

| Time (08-18) | Event |
|---|---|
| 13:41 | this session backed up `kitchen.yaml` and applied the card swap |
| **14:09** | another session saved `kitchen.yaml.bak-prequote-1409` — **a backup containing this session's card** — then overwrote the file, reverting it |

The live file has had `todo.groceries` back since 14:09 and **0** occurrences of
`grocy-shopping-card`. (`bak-prenav-1508` and `bak-prephotos-2033` are from **08-17**, not
part of this.)

**Before editing it:**
```bash
ssh kitchencom 'ls -la --time-style=+%m-%d_%H:%M ~/homeassistant/dashboards/kitchen.yaml*'
```
A backup **newer than yours** means another session is in it. Memory:
`kitchen-yaml-contested-file`.

**The live file is routinely AHEAD of the repo** (screensaver, ChoreOps, photo work). **Never
`scp` the repo version over it.**

## 7. What changed today — three documented "facts" were wrong

All three blocked this work and **all three were properties of the OLD library, not of Grocy.**
Detail: `2026-08-18-grocy-v115-findings.md`.

| Docs said | Reality (grocy v1.15.0) |
|---|---|
| "v1.3.0 is the only version that works" | **HA-2025.7.4 fact only.** On 2026.6.3, v1.3.0's `pygrocy2==2.4.1` would *downgrade* pydantic 2.13.4. **v1.15.0 uses `grocy-py`, no pin, loads clean.** |
| "pygrocy drops `done`; the card can only DELETE" | **`done` is carried through.** Verified in the sensor attributes and by round-trip. |
| "There is NO `todo` platform" | **There is.** `todo.grocy_shopping_list`, `supported_features: 6` = UPDATE + DELETE (**no CREATE**). |

**Consequence: the 2026-08-14 "stop investing in the food card" decision rested on a false
premise**, and plan Task 1 (rewrite shopping onto REST for a done-toggle) is **unnecessary**.

Also verified live by round-trip this session:
- **Free-text add works** — `POST /objects/shopping_list {"note":"…","amount":1}`
- **`done` toggles both ways** — `PUT {"done":1}` / `{"done":0}`
- **S4 is native and works** — `POST /recipes/1/add-not-fulfilled-products-to-shoppinglist`
  added Tacos' 4 ingredients and correctly skipped the zero-amount Salt.
  ⚠️ **400s without `Content-Type: application/json`** — the error text does not say so.

## 8. After the swap — in plan order

`2026-08-18-grocy-kitchen-plan.md` holds the full reasoning. Task 1 is now moot.

| # | Task | Size |
|---|---|---|
| **4** | **Meal plan → shopping list** — native, one API call, **already proven** | **tiny** |
| 2 | Panel design pass — §4 of the plan has the open questions for Garrett | discussion |
| 3 | Add-item (REST `POST`; the todo entity cannot CREATE) | small |
| 5 | Recipe entry — by hand in Grocy, or a KitchenCOM form | medium |
| 6 | Web import (schema.org JSON-LD; NYT is paywalled) | large |

**Task 4 is nearly free and is the headline feature Garrett asked for.** Do it first.

## 9. Carry-forwards

- ⚠️ **`sensor.grocy_meal_plan` reads `0`** while the database holds 2 rows. Possibly both are
  past-dated (`2026-08-14`, `2026-08-15`) and the sensor counts only upcoming meals.
  **Unverified — do not build on it before checking.**
- **Recipe pictures are disabled** (`pictureUrl` always `null`). Filename must be
  base64-encoded **and** the fetch needs the `GROCY-API-KEY` header, which `<img src>` cannot
  send. Needs an HA-side proxy. Relevant if the redesign wants photos.
- **A Grocy 401 looks like success** — `rest_command` only logs at ≥400 then returns the parsed
  body, so a bad key degrades to `[]`, indistinguishable from "no items".
- **`scaleIngredients` is parameterized for a servings +/− control**, 12 tests. **Not dead code.**
- **Negative-id `recipes` rows are meal-plan scaffolding**, not recipes. Already filtered
  (`7de6e16`); any new recipe surface must filter them too.
- **Two test files mirror card logic** rather than driving the Lit element (vitest runs in
  node). If `_open` or the DETAIL `<li>` changes, update the mirrors or they silently stop
  testing reality.
- **Grocy auth is OFF.** Fine on a LAN for a grocery list; revisit if the Pi is ever exposed.
- **The Mac dev rig is now a stale fork** — its own Grocy container and copy of the data at
  `.worktrees/main-merge/deploy/grocy/grocy-config/`. **The Pi is authoritative.**
- **`fort-knox` is a different branch** (parental controls, 35 commits). Three Grocy commits
  landed there by mistake and were cherry-picked here; don't re-merge them.

## 10. Artifacts

1. `docs/session-state/2026-08-18-grocy-card-deferred-handoff.md` — **why the swap is deferred**
2. `docs/session-state/2026-08-18-grocy-v115-findings.md` — the three overturned facts
3. `docs/session-state/2026-08-18-grocy-kitchen-plan.md` — the plan and its open questions
4. `deploy/grocy/README.md` — deployment, pinning rationale, backup procedure
5. `custom_cards/grocy-food-card/` — the three cards, 126 tests
6. `homeassistant/packages/grocy_recipes.yaml` — the REST recipe proxy (no recipe sensor exists)

## 11. Memory entries that apply

In `/Users/jdehart1/.claude/projects/-Users-jdehart1----Code-DEV-KitchenCOM/memory/`:

- **`kitchen-yaml-contested-file.md`** — §6; read before editing the dashboard
- **`kiosk-service-worker-serves-stale-js.md`** — a grey box is usually a stale asset
- `concurrent-sessions-branch-hazard.md` — verify the branch before committing
- `pi-ssh-access-from-claude.md` — `ssh kitchencom`, the Pi at `.234`
- `adguard-pi-built-and-scheduled.md` — the *other* Pi (`.113`, DNS); unrelated to Grocy

## 12. Verification commands

```bash
# branch
git branch --show-current && git log --oneline -1 && git rev-list --count origin/feat/grocy-kitchen..HEAD

# Pi services + Grocy reachable
ssh kitchencom 'sudo docker ps --format "{{.Names}} {{.Status}}"'
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.234:9283/shoppinglist

# card gates — BUILD FIRST
cd custom_cards/grocy-food-card && npm run build && npm test && npm run typecheck

# is kitchen.yaml quiet?
ssh kitchencom 'ls -la --time-style=+%m-%d_%H:%M ~/homeassistant/dashboards/kitchen.yaml*'
```

⚠️ **Verify by effect, not by response.** This project's signature failure is *stored
successfully, reported success, did nothing* — check a domain resolves, an item's `done`
flips, a count changes. Not an HTTP 200.
