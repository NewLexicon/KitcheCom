"""Print the latest RECORDED state of each entity given, with timer attributes.

Runs INSIDE the HA container, fed on stdin, so no API token is needed:

  ssh kitchencom 'sudo docker exec -i homeassistant python3 - timer.kitchen_inactivity' \
    < deploy/tools/ha-recorder-state.py

The recorder DB, not the entity registry, is the live-state record (memory
entity-registry-is-not-live-state.md).
"""
import json
import sqlite3
import sys

db = sqlite3.connect("/config/home-assistant_v2.db")
for eid in sys.argv[1:]:
    row = db.execute(
        """select s.state, a.shared_attrs, datetime(s.last_updated_ts, 'unixepoch')
           from states s join states_meta m on s.metadata_id = m.metadata_id
           left join state_attributes a on s.attributes_id = a.attributes_id
           where m.entity_id = ? order by s.last_updated_ts desc limit 1""",
        (eid,),
    ).fetchone()
    if row is None:
        print(f"{eid}: NOT RECORDED")
        continue
    attrs = json.loads(row[1]) if row[1] else {}
    keep = {k: attrs[k] for k in ("duration", "remaining", "finishes_at") if k in attrs}
    print(f"{eid}: {row[0]}  (updated {row[2]} UTC)  {json.dumps(keep) if keep else ''}")
