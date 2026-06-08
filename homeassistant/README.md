# KitchenCOM HA config

Deployed to the Pi's Home Assistant `/config` directory (Pi OS + HA Container).

## Dashboard mode (Balanced decision — spec §2)
- The LIVE kitchen dashboard runs in **storage mode** → drag-and-drop editable from the
  phone/Companion app. It is NOT this file tree (storage mode lives in HA's `.storage/`).
- `dashboards/kitchen.yaml` is a committed **YAML-mode SNAPSHOT** registered as a separate
  dashboard ("Kitchen (snapshot)") for version-control, review, and disaster recovery.
- To update the snapshot: export the live dashboard's YAML and paste it into kitchen.yaml.

## Layout (keystone)
`configuration.yaml` wires `packages/` (helpers+automations), `themes/` (look),
and registers the snapshot dashboard. Nothing in `packages/`/`themes/` loads without it.
