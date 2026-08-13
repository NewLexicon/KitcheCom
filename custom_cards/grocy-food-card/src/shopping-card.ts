import { LitElement, html, css, nothing } from "lit";
// NOTE: explicit .js extension is required — see mealplan-card.ts for the rationale.
import { parseShoppingItems, canCheckOff, buildRemovePayload, type ShoppingRow } from "./shared.js";

type HassLike = {
  states?: Record<string, { attributes?: any } | undefined>;
  callService?: (domain: string, service: string, data: Record<string, unknown>) => void;
};

export class GrocyShoppingCard extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: HassLike;
  private _entity = "sensor.grocy_shopping_list";
  private _listId?: string;   // OQ-3: sourced from config for slice 1; Tier-2 confirms

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
    this._listId = config?.shopping_list_id != null ? String(config.shopping_list_id) : undefined;
  }

  private get _rows(): ShoppingRow[] {
    return parseShoppingItems(this.hass?.states?.[this._entity]?.attributes?.products);
  }

  private _checkOff(productId: number): void {
    if (!canCheckOff(this._listId)) return;
    this.hass?.callService?.("grocy", "remove_product_in_shopping_list",
      buildRemovePayload(this._listId as string, productId));
  }

  render() {
    const rows = this._rows;
    const canCheck = canCheckOff(this._listId);
    if (rows.length === 0) return html`<div class="empty">Shopping list empty</div>`;
    return html`
      <div class="list">
        ${rows.map((r) => html`
          <div class="row">
            <span class="amt">${r.amountLabel}</span>
            <span class="name">${r.name}</span>
            ${canCheck
              ? html`<button class="check" @click=${() => this._checkOff(r.id)}>✓</button>`
              : nothing}
          </div>`)}
      </div>`;
  }

  static styles = css`
    .list { display: flex; flex-direction: column; gap: 6px; padding: 8px;
      color: var(--primary-text-color, #e8edf6); font: 500 18px/1.3 system-ui, sans-serif; }
    .row { display: flex; gap: 12px; align-items: center; }
    .amt { opacity: .7; min-width: 44px; text-align: right; }
    .name { flex: 1; }
    .check { min-width: 44px; min-height: 44px; font-size: 20px; cursor: pointer;
      border: none; border-radius: 8px; background: var(--primary-color, #3b82f6); color: #fff; }
    .empty { padding: 16px; opacity: .7; color: var(--primary-text-color, #e8edf6); }
  `;
}

if (!customElements.get("grocy-shopping-card")) {
  customElements.define("grocy-shopping-card", GrocyShoppingCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-shopping-card", name: "Grocy Shopping List", description: "Shopping list from Grocy with check-off",
});
