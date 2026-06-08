# Calendar-by-Voice (C-4) — setup & manual test

The `intent_script` `KitchenAddCalendarEvent` (in `homeassistant/packages/calendar.yaml`)
lets the Gemini voice pipeline create calendar events. Config-only; verified structurally
in-repo (`.calendar-verify.py` + yamllint). Runtime behavior is verified here, on hardware.

## Hardware-phase setup
1. Replace the `calendar.family` placeholder in `calendar.yaml` with your real calendar
   entity id (Settings → Devices & Services → your calendar integration → entity id).
2. Ensure the Gemini conversation agent (Assist) is configured and the Assist LLM API is
   enabled on it (so it can call custom intents). The agent's system prompt should instruct
   it to emit a **tz-aware** ISO 8601 `start` and to call `KitchenAddCalendarEvent` for
   calendar requests. (This prompt work is part of the deferred voice slice.)

## Manual test (run once live)
- Say / type to Assist: **"add dentist Tuesday at 3pm"**
- Expect: a 1-hour event titled "dentist" on the target calendar, starting the upcoming
  Tuesday 15:00 (local tz), and the spoken reply **"Added dentist to the calendar."**
- Verify the `end_date_time` template: the event should END at 16:00 (start + default 1h).
- Edge to check: a request with an explicit duration ("...for 2 hours") → 2h event, IF the
  voice prompt is set up to pass `duration`. Without a duration slot, defaults to 1h.

## Carry-forwards
- Real calendar entity id (replaces `calendar.family`).
- Gemini agent exposure/prompt for the intent = deferred voice slice / hardware phase.
- Later (own slices): all-day events, location/description, multi-calendar routing.
