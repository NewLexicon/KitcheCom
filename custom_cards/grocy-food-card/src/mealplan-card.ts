import { LitElement, html, css } from "lit";
// NOTE: explicit .js extension is required — tsc emits this specifier verbatim and
// browsers cannot resolve extensionless module paths (moduleResolution "bundler"
// assumes a bundler that this package does not use). Without it, dist/shared 404s.
import { parseMeals, type MealRow } from "./shared.js";

type HassLike = { states?: Record<string, { attributes?: any } | undefined> };

export class GrocyMealplanCard extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: HassLike;
  private _entity = "sensor.grocy_meal_plan";

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
  }

  private get _rows(): MealRow[] {
    return parseMeals(this.hass?.states?.[this._entity]?.attributes?.meals);
  }

  render() {
    const rows = this._rows;
    if (rows.length === 0) return html`<div class="empty">No meals planned</div>`;
    return html`
      <div class="list">
        ${rows.map((r) => html`
          <div class="row">
            <span class="day">${String(r.day ?? "")}</span>
            <span class="label">${r.label}</span>
          </div>`)}
      </div>`;
  }

  static styles = css`
    .list { display: flex; flex-direction: column; gap: 6px; padding: 8px;
      color: var(--primary-text-color, #e8edf6); font: 500 18px/1.3 system-ui, sans-serif; }
    .row { display: flex; gap: 12px; align-items: baseline; }
    .day { opacity: .7; min-width: 88px; }
    .label { font-weight: 700; }
    .empty { padding: 16px; opacity: .7; color: var(--primary-text-color, #e8edf6); }
  `;
}

if (!customElements.get("grocy-mealplan-card")) {
  customElements.define("grocy-mealplan-card", GrocyMealplanCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-mealplan-card", name: "Grocy Meal Plan", description: "This week's planned meals from Grocy",
});
