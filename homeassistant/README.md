# KitchenCOM HA config

Deployed to the Pi's Home Assistant `/config` directory (Pi OS + HA Container).

## Prereqs (dev tooling)
- `npm run validate:yaml` requires **yamllint**. Install it with `pip install --user yamllint`
  (or `pip3 install yamllint`).
- On macOS, the pip user-scripts dir (e.g. `~/Library/Python/3.x/bin`) may need to be on your
  PATH for the `yamllint` command to be found. Otherwise invoke it via `python3 -m yamllint`.

## Dashboard mode (Balanced decision — spec §2)
- The LIVE kitchen dashboard runs in **storage mode** → drag-and-drop editable from the
  phone/Companion app. It is NOT this file tree (storage mode lives in HA's `.storage/`).
- `dashboards/kitchen.yaml` is a committed **YAML-mode SNAPSHOT** registered as a separate
  dashboard ("Kitchen (snapshot)") for version-control, review, and disaster recovery.
- To update the snapshot: export the live dashboard's YAML and paste it into kitchen.yaml.
- Note: `dashboards/kitchen.yaml` does not exist yet in this foundation slice (it is created/
  populated in a later task); until it exists, the "Kitchen (snapshot)" dashboard will log an
  error / appear empty in HA — this is expected at this stage.

## Layout (keystone)
`configuration.yaml` wires `packages/` (helpers+automations), `themes/` (look),
and registers the snapshot dashboard. Nothing in `packages/`/`themes/` loads without it.
- This `configuration.yaml` only wires packages/themes/lovelace and is meant to be MERGED INTO
  (not blindly replace) an existing HA `/config/configuration.yaml` that already has
  `default_config:` etc., so core integrations aren't stripped.
