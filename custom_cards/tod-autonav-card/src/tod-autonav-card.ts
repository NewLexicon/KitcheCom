// Invisible auto-nav card for the time-of-day panel layouts.
// Spec: docs/superpowers/specs/2026-09-08-time-of-day-layouts-design.md
//
// Home Assistant core has NO service that switches a browser's Lovelace view, so
// the switch has to happen in the browser. This card sits on each of the three
// time views, watches sensor.kitchen_time_of_day, and navigates when the panel
// is showing the wrong one for the current time.

export const TOD_SENSOR = "sensor.kitchen_time_of_day";
export const DEFER_TIMER = "timer.kitchen_nav_defer";

/** The three periods that map 1:1 to dashboard views. */
export const VIEWS = ["morning", "afternoon", "evening"] as const;
export type ViewName = (typeof VIEWS)[number];

export interface HassLike {
  states?: Record<string, { state: string } | undefined>;
  callService?: (domain: string, service: string, data?: unknown) => void;
}

/**
 * Decide whether the panel should navigate away from `view` right now.
 *
 * Deliberately conservative: anything unexpected returns false and the panel
 * stays where it is. A broken sensor must never strand the panel on a blank or
 * wrong view.
 *
 * The ONE exception is a missing defer timer, which returns true — a timer that
 * never runs has to read as "nobody is here". The previous design failed the
 * other way, where a wedged timer silently disabled auto-nav forever.
 */
export function shouldNavigate(hass: HassLike | undefined, view: string): boolean {
  const period = hass?.states?.[TOD_SENSOR]?.state;
  if (!period) return false;
  if (!(VIEWS as readonly string[]).includes(period)) return false;
  if (period === view) return false;

  // Absent timer => not deferring. See docstring.
  const defer = hass?.states?.[DEFER_TIMER]?.state;
  if (defer === "active") return false;

  return true;
}
