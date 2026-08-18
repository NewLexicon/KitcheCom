# AdGuard config backup — restore path for an SD card swap

`AdGuardHome.yaml.2026-08-17` is a full copy of the live config from the Pi
(`/opt/adguard/conf/AdGuardHome.yaml`), taken 2026-08-17 after the YouTube schedule
and all 8 client entries were in place.

**The admin password hash is REDACTED.** Everything else is verbatim.

## What it contains

- 8 clients: 6 kid devices + 2 parent devices, with per-client protections
- The YouTube allowance schedule (Sun–Thu 12:00–20:00, Fri–Sat 12:00–23:59,
  `America/New_York`)
- Global SafeSearch, enabled with all engines
- Upstream DNS, filter lists, and the `:3000` admin port correction

It does **not** contain the Roku Live TV rule — that lives in `user_rules` and is
added/removed by cron (`/etc/cron.d/kc-roku-live` + `adguard-rule-schedule.py`), so
whichever state it was in at backup time is not meaningful.

## Restoring onto a fresh card

1. Flash and set up the new card per the flashing runbook (§1–§4), install Docker,
   and copy `deploy/adguard/docker-compose.yml` to `/opt/adguard/`.
2. Start the container once so it creates its directory structure, then stop it:
   ```bash
   cd /opt/adguard && sudo docker compose up -d && sudo docker compose stop
   ```
3. Copy this file over the generated config:
   ```bash
   sudo cp AdGuardHome.yaml.2026-08-17 /opt/adguard/conf/AdGuardHome.yaml
   sudo chown root:root /opt/adguard/conf/AdGuardHome.yaml
   sudo chmod 600 /opt/adguard/conf/AdGuardHome.yaml
   ```
4. **Put a real password hash back** at the `password:` line under `users:` — the
   backup has a placeholder. Generate one with:
   ```bash
   sudo docker run --rm -it httpd:alpine htpasswd -nB <username>
   ```
5. Start it and **verify by resolving, not by reading status**:
   ```bash
   cd /opt/adguard && sudo docker compose up -d
   dig @<pi-ip> example.com            # must resolve
   ```
6. Re-verify the things this project has learned to distrust:
   - `curl .../control/safesearch/status` → `"enabled": true` (the master switch, not
     just the engines)
   - read a client back and confirm `filtering_enabled` / `safebrowsing_enabled` /
     `safe_search.enabled` survived
   - `blocked_services/get` → `time_zone` is `America/New_York`, **not** `UTC`
7. Reinstall the Roku cron: `deploy/adguard/kc-roku-live.cron` → `/etc/cron.d/`, plus
   `/root/.adguard-env` (0600) with `ADGUARD_URL` / `ADGUARD_USER` / `ADGUARD_PASS`.

## Refreshing this backup

```bash
ssh adguard 'sudo cat /opt/adguard/conf/AdGuardHome.yaml' > AdGuardHome.yaml.$(date +%F)
# then redact the password line before committing
```
