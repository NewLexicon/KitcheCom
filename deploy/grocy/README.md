# Grocy deployment

**Lives on the Pi 5** (`kitchencom`, `192.168.1.234`), alongside Home Assistant.
Reachable at **`http://192.168.1.234:9283`**. Login `admin`.

Deployed 2026-08-18, migrated from the Mac dev rig. One always-on backend that the kitchen
panel, a laptop, and any phone on the LAN all share — **so there is no sync layer and there
should never be one.** (A laptop-backend + Pi-queue design was considered and rejected: it
buys conflict handling, duplicate detection and ordering bugs to work around a backend in
the wrong place.)

## Layout on the Pi

```
~/grocy/
  docker-compose.yml     ← this repo's docker-compose.grocy.yml, bind path adjusted
  data/                  ← grocy.db (SQLite) + uploads. THE REAL DATA.
  keys/
```

The compose file here binds `./grocy-config:/config`; on the Pi that is rewritten to `./:/config`
because the data sits directly in `~/grocy/`.

## ⚠️ The image is PINNED and must stay pinned

`lscr.io/linuxserver/grocy:v4.6.0-ls329`

Every Grocy behaviour this project relies on was verified against that build:
`StockApiController.php:745`'s `intval()` truncation, the exact `recipes_pos_resolved` key set,
negative-id meal-plan scaffolding rows, and the `done` / free-text-add / add-to-shoppinglist REST
endpoints. `:latest` would silently move off it.

## Backup

The whole state is `~/grocy/data/`. To snapshot:

```bash
ssh kitchencom 'cd ~ && tar czf grocy-backup-$(date +%F).tgz grocy/data'
scp kitchencom:~/grocy-backup-*.tgz .
```

Stop the container first if you want a guaranteed-clean SQLite snapshot.

## Migration provenance

Copied from the Mac dev rig 2026-08-18 with the container stopped.
**`grocy.db` md5 `49130f035787b8726cd185b1fab65647` matched on both sides**, and the API was then
queried over the network to confirm 4 real recipes, 18 products, 21 ingredient rows, 2 meal-plan
entries and the `paper towels` shopping row.

⚠️ The Mac copy at `.worktrees/main-merge/deploy/grocy/grocy-config/` is now a **stale fork**.
The Pi is authoritative. Do not start the Mac container against the old data and expect them to agree.

## Gotcha hit during deployment

`docker compose up` failed twice with `lookup ghcr.io on 192.168.1.254:53: i/o timeout` mid-pull.
Both resolvers were in fact healthy — a `nslookup`-based comparison "proving" otherwise was bogus
because **`nslookup` is not installed on the Pi**, so every probe returned a false timeout.
`sudo docker pull` on its own succeeded first try. **If a compose pull times out here, pre-pull the
image rather than diagnosing DNS.**

`/etc/docker/daemon.json` was set to `{"dns": ["192.168.1.113", "1.1.1.1"]}` during that
investigation. It is harmless and gives containers a filtered resolver, but note it affects
**containers**, not the daemon's own registry lookups — it was not what fixed the pull.
