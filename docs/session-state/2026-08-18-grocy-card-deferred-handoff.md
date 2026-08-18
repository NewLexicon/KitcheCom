# Shopping card — built, deployed, and DEFERRED on a file conflict

**Date:** 2026-08-18. **Branch:** `feat/grocy-kitchen`.
**Status: the card is finished and on the Pi. The dashboard swap is NOT applied, deliberately.**

## What is done

- **Grocy runs on the Pi 5** — `http://192.168.1.234:9283`, image pinned `v4.6.0-ls329`,
  `restart: unless-stopped`, auth disabled (`DISABLE_AUTH`, backup `config.php.bak-preauth-*`).
- **grocy HACS integration v1.15.0 installed and working on HA 2026.6.3** — see
  `2026-08-18-grocy-v115-findings.md`. Sensors + todo entities enabled.
- **Shopping card rewritten** — done-toggle instead of delete, free-text rows named properly,
  optimistic tap. **126 tests pass**, typecheck clean, builds clean.
- **`shopping-card.js` deployed** to `~/homeassistant/www/` and **registered as a Lovelace
  resource** (`/local/shopping-card.js?v=…`). Harmless while unreferenced.

## 🔴 Why the dashboard swap is not applied

**A concurrent session owns `dashboards/kitchen.yaml` and reverted the swap.**

| Time | Event |
|---|---|
| 13:41 | this session backed up `kitchen.yaml`, applied the card swap |
| **14:09** | **another session saved `kitchen.yaml.bak-prequote-1409` — which contains THIS session's card — then overwrote the file, reverting the swap** |
| 15:08 | that session edited again (`bak-prenav-1508`) |
| 20:33 | and again (`bak-prephotos-2033`) |

The live file now has `todo.groceries` back at line 37 and **zero** occurrences of
`grocy-shopping-card`. The "Configuration error" seen on the panel was this card being
half-present during that window; a later diagnostic probe went into a file that no longer
contained the card at all.

**Garrett's decision: wait until the other session is done.** Do not re-apply over live work.
Nothing of this session's remains in the dashboard — the revert removed the probe too.

⚠️ **This is the documented `concurrent-sessions-branch-hazard` in its file form.** The
hazard note covers branches; **the same applies to files edited directly on the Pi.** Before
editing `~/homeassistant/dashboards/kitchen.yaml`, check
`ls -la --time-style=+%H:%M ~/homeassistant/dashboards/kitchen.yaml*` — a backup newer than
yours means another session is active in it.

## To apply the swap later (when the file is quiet)

Take the **live** file (never the repo copy — it has been behind all day), and replace:

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

⚠️ Indentation in that file is **10 spaces** for the `- type:` line. Then
`sudo docker restart homeassistant` and **hard-refresh** the browser — the resource is cached
aggressively and a stale page shows a grey box.

**The dashboard the kiosk actually loads is `kitchen-snapshot`
(`filename: dashboards/kitchen.yaml`, `mode: yaml`), reachable at
`/kitchen-snapshot`.** The "Home" page with the old Groceries list is HA's **auto-generated
default** and is a different thing entirely — a swap in `kitchen.yaml` will never change it.
Time was lost to that confusion; check the URL before diagnosing a card.

## Zero-code fallback that works today

**Sidebar → To-do lists → Grocy Shopping list.** Confirmed working end-to-end 2026-08-18:
items render, check-off writes `done=1` to Grocy, and it is reversible. Free-text rows render
as `1.00x Unknown product` with the real text demoted to a subtitle — ugly, but functional,
and it needs no custom card. **The custom card's remaining job is presentation only.**
