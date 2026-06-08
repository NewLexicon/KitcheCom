// Pure idle-decision logic — the card's one piece of real, testable logic.
// Reads input_boolean.kitchen_idle from hass (spec §5 reactive-card model, M-9).
// Fail-safe: any missing/unknown state => inactive, so the screensaver can never
// trap the screen if the entity is absent.

export const IDLE_ENTITY = "input_boolean.kitchen_idle";

type HassLike = { states?: Record<string, { state?: string } | undefined> };

export function isScreensaverActive(hass?: HassLike): boolean {
  return hass?.states?.[IDLE_ENTITY]?.state === "on";
}
