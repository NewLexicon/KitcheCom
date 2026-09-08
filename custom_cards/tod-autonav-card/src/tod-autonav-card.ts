import { LitElement, html, css, type PropertyValues, type TemplateResult } from "lit";

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

/**
 * Navigate the Lovelace panel to `path`.
 *
 * pushState + a `location-changed` event is how HA's own frontend navigates
 * (see reference/frontend-dev/). A plain location.assign() would be a full page
 * reload: white flash, websocket reconnect, several seconds of blank panel.
 */
export function navigateTo(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
}

export class TodAutonavCard extends LitElement {
  static properties = {
    hass: { attribute: false },
  };

  // Renders nothing and occupies no space. This card is pure behaviour.
  static styles = css`
    :host {
      display: none;
    }
  `;

  hass?: HassLike;
  private _view = "";
  private _basePath = "/kitchen-snapshot";

  setConfig(config: Record<string, unknown>): void {
    const view = typeof config.view === "string" ? config.view : "";
    if (!(VIEWS as readonly string[]).includes(view)) {
      throw new Error(
        `tod-autonav-card: "view" must be one of ${VIEWS.join(", ")} (got ${JSON.stringify(config.view)})`,
      );
    }
    this._view = view;
    if (typeof config.base_path === "string" && config.base_path) {
      this._basePath = config.base_path;
    }
  }

  // Zero rows in a sections layout.
  getCardSize(): number {
    return 0;
  }

  getGridOptions(): Record<string, number> {
    return { rows: 0, columns: 1 };
  }

  updated(changed: PropertyValues): void {
    if (!changed.has("hass")) return;
    if (!shouldNavigate(this.hass, this._view)) return;

    const target = this.hass?.states?.[TOD_SENSOR]?.state;
    if (!target) return;
    navigateTo(`${this._basePath}/${target}`);
  }

  render(): TemplateResult {
    return html``;
  }
}

if (!customElements.get("tod-autonav-card")) {
  customElements.define("tod-autonav-card", TodAutonavCard);
}
