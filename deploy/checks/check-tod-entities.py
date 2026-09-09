#!/usr/bin/env python3
"""Prove the time-of-day entities are live on the Pi, from the recorder DB.

The entity registry and restore_state are HISTORICAL — they list entities that
once existed. The recorder DB is the only local source that shows current state.
Run ON the Pi:  ssh kitchencom 'python3 -' < deploy/checks/check-tod-entities.py
"""
import sqlite3

DB = "/home/garrettdehart/homeassistant/home-assistant_v2.db"
ENTITIES = (
    "sensor.kitchen_time_of_day",
    "timer.kitchen_nav_defer",
    "input_datetime.kitchen_morning_start",
    "input_datetime.kitchen_afternoon_start",
    "input_datetime.kitchen_evening_start",
    "input_button.kitchen_activity",
    "input_boolean.kitchen_idle",
    "input_boolean.kitchen_screensaver_enabled",
    "todo.reminders",
)

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()
for eid in ENTITIES:
    cur.execute(
        "SELECT s.state FROM states s JOIN states_meta m ON s.metadata_id = m.metadata_id "
        "WHERE m.entity_id = ? ORDER BY s.last_updated_ts DESC LIMIT 1",
        (eid,),
    )
    row = cur.fetchone()
    print("  %-46s %s" % (eid, row[0] if row else "(NOT FOUND)"))
