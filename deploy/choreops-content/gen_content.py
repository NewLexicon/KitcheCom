#!/usr/bin/env python3
"""Generate ChoreOps content JSON from the entry sheets.

Reads an existing choreops storage file, replaces the rewards/bonuses/
penalties/achievements/badges collections with the entry-sheet content,
and writes a new file. User + chore IDs are resolved from the live data,
never hardcoded -- so the same script works against the dev rig or the Pi.

Field names/nesting were resolved from reference/ChoreOps-main (v1.0.8):
  rewards      data_builders.build_reward        (verified against live record)
  bonus/pen    data_builders.build_bonus_or_penalty:504
  achievements data_builders.build_achievement:2603
  badges       data_builders.build_badge:2011  (nested target/awards/etc)

Usage: gen_content.py <in.json> <out.json>
"""
import json
import sys
import uuid


def uid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------- rewards
# Sheet: 2026-07-22-choreops-reward-store-entry-sheet.md §2 + §3.
# Names use ASCII per §5a Finding 2 (em-dash untested, parens proven).
REWARDS = [
    ("Special Snack",           8,   "Pick a special snack or candy from the treat stash.", "mdi:candy"),
    ("Cash Out ($1)",          10,   "Trade 10 points for $1. Ask a parent to pay out.", "mdi:cash"),
    ("Screen Time (15 Min)",   10,   "15 extra minutes of screen time.", "mdi:timer-sand"),
    ("Screen Time (30 Min)",   18,   "30 extra minutes of screen time.", "mdi:timer"),
    ("Screen Time (1 Hour)",   32,   "A full extra hour of screen time.", "mdi:timer-outline"),
    ("Cash Out ($5)",          50,   "Trade 50 points for $5. Ask a parent to pay out.", "mdi:cash-multiple"),
    ("Cash Out ($10)",        100,   "Trade 100 points for $10. Ask a parent to pay out.", "mdi:cash-multiple"),
    ("Cash Out ($20)",        200,   "Trade 200 points for $20. Ask a parent to pay out.", "mdi:cash-100"),
    ("Pick Dinner Menu",       15,   "Choose what the family eats for dinner one night.", "mdi:silverware-fork-knife"),
    ("Stay Up 30 Min Late",    20,   "Stay up half an hour past bedtime. Not on a school night.", "mdi:weather-night"),
    ("Movie Night Pick",       25,   "You choose the family movie.", "mdi:movie-open"),
    ("Friend Over",            40,   "Have a friend over. Clear the day with a parent first.", "mdi:account-group"),
    ("Choose Weekend Activity", 50,  "Pick what the family does this weekend.", "mdi:calendar-star"),
    ("Day Trip / Special Outing", 150, "A big day out - your pick, planned with a parent.", "mdi:map-marker-star"),
    ("Ice Cream Outing",       25,   "A trip out for ice cream.", "mdi:ice-cream"),
    ("Small Toy / Trinket",    30,   "A small toy or trinket on the next store run.", "mdi:teddy-bear"),
]

# ------------------------------------------------------- bonuses/penalties
# Sheet: 2026-08-05-choreops-bonuses-penalties-entry-sheet.md §2-§3.
BONUSES = [
    ("Above & Beyond",   10, "Went well past what was asked - without being told.", "mdi:star-shooting"),
    ("Great Attitude",    5, "Cheerful and willing, even about a chore you didn't feel like doing.", "mdi:emoticon-happy-outline"),
    ("Helped a Sibling",  8, "Pitched in on someone else's chore without being asked.", "mdi:hand-heart"),
    ("Initiative",        7, "Saw something that needed doing and just did it.", "mdi:lightbulb-on-outline"),
]
# NOTE: stored NEGATIVE. The *form* takes positive and negates internally
# (process_penalty_form_input :2995 -> -abs(points)). Writing JSON directly
# bypasses the form, so we must apply the negation ourselves.
PENALTIES = [
    ("Missed Chore",     -5, "An assigned chore didn't get done and nobody flagged it.", "mdi:close-circle-outline"),
    ("Reminder Needed",  -2, "Needed more than one reminder to get started.", "mdi:bell-alert-outline"),
]

# ----------------------------------------------------------- achievements
# Sheet: 2026-08-05-choreops-achievements-badges-entry-sheet.md §2.
# (name, type, chore_name_or_None, target, reward_points, desc, icon)
ACHIEVEMENTS = [
    ("7-Day Streak",    "daily_minimum", None,           7,   25,
     "Complete at least one chore every day for 7 days running.", "mdi:calendar-check"),
    ("Chore Champion",  "chore_total",   None,           250, 100,
     "250 chores completed all-time. A long haul.", "mdi:trophy-award"),
    ("Early Riser",     "chore_streak",  "Brush Teeth",  5,   20,
     "Brush your teeth 5 days running without a reminder.", "mdi:weather-sunset-up"),
]

# ----------------------------------------------------------------- badges
# Sheet §4. Fields vary by badge type -- only emit what that type uses.
BADGES = [
    dict(name="Perfect Week", type="periodic", target_type="daily_minimum",
         threshold=7, points=30, icon="mdi:calendar-star",
         desc="Every assigned chore, Monday through Sunday.", reset="weekly"),
    dict(name="Clean Sweep", type="daily", target_type="daily_minimum",
         threshold=4, points=10, icon="mdi:broom",
         desc="Every chore on your list, done in one day.", reset="daily"),
    dict(name="Century Club", type="cumulative", target_type="points",
         threshold=100, points=25, icon="mdi:numeric-100-box",
         desc="100 points earned, all-time.", reset="none"),
    dict(name="500 Club", type="cumulative", target_type="points",
         threshold=500, points=75, icon="mdi:trophy-variant",
         desc="500 points earned, all-time. A serious milestone.", reset="none"),
    dict(name="Holiday Helper", type="special_occasion", occasion="holiday",
         points=20, icon="mdi:gift",
         desc="Pitched in with extra chores over a holiday.", reset="none"),
    dict(name="Streak Master", type="achievement_linked", achievement="7-Day Streak",
         points=40, icon="mdi:fire",
         desc="Earned by completing the 7-Day Streak achievement.", reset="none"),
]


def main(src, dst):
    raw = json.load(open(src))
    data = raw["data"]

    kids = [u["internal_id"] if "internal_id" in u else k
            for k, u in data["users"].items()
            if u.get("enable_gamification")]
    kids = [k for k, u in data["users"].items() if u.get("enable_gamification")]
    chores_by_name = {v.get("name", "").lower(): k for k, v in data["chores"].items()}
    print(f"gamified users: {len(kids)}")

    warnings = []

    # rewards
    data["rewards"] = {}
    for name, cost, desc, icon in REWARDS:
        i = uid()
        data["rewards"][i] = {
            "internal_id": i, "name": name, "cost": float(cost),
            "description": desc, "icon": icon,
            "reward_labels": [], "assigned_user_ids": list(kids),
        }

    # bonuses / penalties
    data["bonuses"] = {}
    for name, pts, desc, icon in BONUSES:
        i = uid()
        data["bonuses"][i] = {"internal_id": i, "name": name, "points": float(pts),
                              "description": desc, "icon": icon, "bonus_labels": []}
    data["penalties"] = {}
    for name, pts, desc, icon in PENALTIES:
        i = uid()
        data["penalties"][i] = {"internal_id": i, "name": name, "points": float(pts),
                                "description": desc, "icon": icon, "penalty_labels": []}

    # achievements
    data["achievements"] = {}
    ach_ids = {}
    for name, typ, chore, target, rp, desc, icon in ACHIEVEMENTS:
        i = uid()
        ach_ids[name] = i
        chore_id = ""
        if chore:
            chore_id = chores_by_name.get(chore.lower(), "")
            if not chore_id:
                warnings.append(
                    f"achievement {name!r}: chore {chore!r} not found -> "
                    f"selected_chore_id left EMPTY (chore_streak will not track)")
        data["achievements"][i] = {
            "internal_id": i, "name": name, "description": desc, "icon": icon,
            "achievement_labels": [], "assigned_user_ids": list(kids),
            "type": typ, "selected_chore_id": chore_id, "criteria": "",
            "target_value": float(target), "reward_points": float(rp),
            "progress": {},
        }

    # badges
    data["badges"] = {}
    for b in BADGES:
        i = uid()
        rec = {
            "internal_id": i, "name": b["name"], "badge_type": b["type"],
            "description": b["desc"], "icon": b["icon"], "badge_labels": [],
            "earned_by": [],
            "awards": {"award_points": float(b["points"]),
                       "points_multiplier": 1.0, "award_items": []},
            "reset_schedule": {"recurring_frequency": b["reset"],
                               "start_date": None, "end_date": None,
                               "grace_period_days": 0,
                               "custom_interval": None,
                               "custom_interval_unit": None},
        }
        t = b["type"]
        if t in ("cumulative", "daily", "periodic"):
            rec["target"] = {"threshold_value": float(b["threshold"]),
                             "target_type": b["target_type"]}
            if t == "cumulative":
                rec["target"]["maintenance_rules"] = {}
            else:
                rec["tracked_chores"] = {"selected_chores": []}
        if t == "special_occasion":
            rec["occasion_type"] = b["occasion"]
        if t == "achievement_linked":
            aid = ach_ids.get(b["achievement"], "")
            if not aid:
                warnings.append(f"badge {b['name']!r}: achievement not found")
            rec["associated_achievement"] = aid
        else:
            rec["assigned_user_ids"] = list(kids)
        data["badges"][i] = rec

    json.dump(raw, open(dst, "w"), indent=2)

    print(f"rewards={len(data['rewards'])} bonuses={len(data['bonuses'])} "
          f"penalties={len(data['penalties'])} achievements={len(data['achievements'])} "
          f"badges={len(data['badges'])}")
    if warnings:
        print("\nWARNINGS:")
        for w in warnings:
            print("  !", w)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
