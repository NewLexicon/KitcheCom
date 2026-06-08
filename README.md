# KitchenCOM

A Raspberry Pi 5 kitchen touchscreen hub built **on Home Assistant** (Pi OS + HA Container).

- **Design spec:** `docs/superpowers/specs/2026-06-07-kitchencom-ha-hub-design.md`
- **Cold-open briefing:** `docs/session-state/2026-06-07-ha-pivot-architecture-locked.md`

## Layout
- `homeassistant/` — HA `/config` tree (keystone `configuration.yaml`, packages, theme, dashboard snapshot)
- `custom_cards/screensaver-card/` — the one custom card (Lit/TS, idle-reactive)
- `deploy/` — Pi OS kiosk systemd unit + `INSTALL.md` runbook
- `reference/` — upstream HA source, read-only (gitignored)

## Prereqs
- `npm run validate:yaml` requires [`yamllint`](https://github.com/adrienverge/yamllint): `pip install --user yamllint`.
  On macOS the pip user-scripts dir may not be on `PATH` — add it (e.g. `$HOME/Library/Python/3.x/bin`)
  or invoke directly via `python3 -m yamllint -c .yamllint homeassistant/`.

## Develop on a Mac (no Pi needed)
- Validate config: `npm run validate:yaml`
- Test the card: `cd custom_cards/screensaver-card && npm install && npm test` (9 tests — 4 idle + 5 media)

## Deploy
See `deploy/INSTALL.md`.
