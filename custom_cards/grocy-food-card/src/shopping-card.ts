import { LitElement, html, css, nothing } from "lit";
// NOTE: explicit .js extension is required — see mealplan-card.ts for the rationale.
import { parseShoppingItems, canCheckOff, canToggleDone, buildRemovePayload, type ShoppingRow } from "./shared.js";

type HassLike = {
  states?: Record<string, { attributes?: any } | undefined>;
  callService?: (domain: string, service: string, data: Record<string, unknown>) => void;
};

export class GrocyShoppingCard extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: HassLike;
  private _entity = "sensor.grocy_shopping_list";
  // grocy v1.15.0 exposes a todo entity whose UPDATE path keys on the shopping-list
  // ENTRY id, so it can mark ANY row done -- including free-text rows the old
  // remove-service could not touch. Overridable for a differently-named entity.
  private _todoEntity = "todo.grocy_shopping_list";
  private _listId?: string;   // OQ-3: sourced from config for slice 1; Tier-2 confirms
  // Rows the user just tapped. The sensor only refreshes on the integration's
  // 30s poll, so without this the row sits unchanged and the natural response is
  // to tap again -- which is how two items vanished while testing one button.
  private _pending = new Set<number>();

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
    if (typeof config?.todo_entity === "string" && config.todo_entity) this._todoEntity = config.todo_entity;
    this._listId = config?.shopping_list_id != null ? String(config.shopping_list_id) : undefined;
  }

  private get _rows(): ShoppingRow[] {
    return parseShoppingItems(this.hass?.states?.[this._entity]?.attributes?.products);
  }

  // Mark done / not-done. Reversible, and it works on free-text rows -- verified
  // live 2026-08-18: toggling "paper towels" (product_id: null) wrote done=1 to
  // Grocy. Supersedes the delete-only _checkOff below for ordinary use.
  private _toggleDone(row: ShoppingRow): void {
    if (!canToggleDone(row)) return;
    this._pending.add(row.id);
    this.requestUpdate();                     // optimistic: reflect the tap now
    this.hass?.callService?.("todo", "update_item", {
      entity_id: this._todoEntity,
      item: String(row.id),
      status: row.done ? "needs_action" : "completed",
    });
  }

  // DELETE path, retained. The remove service keys on PRODUCT id and removes the
  // row outright, so it cannot touch free-text rows -- canCheckOff hides it there.
  // Kept for "remove this from the list entirely", which done-toggling does not do.
  private _checkOff(row: ShoppingRow): void {
    if (!canCheckOff(this._listId, row.productId)) return;
    this.hass?.callService?.("grocy", "remove_product_in_shopping_list",
      buildRemovePayload(this._listId as string, row.productId as number, row.amount));
  }

  render() {
    const rows = this._rows;
    if (rows.length === 0) return html`<div class="empty">Nothing on the list</div>`;
    // Outstanding first, done collected at the bottom -- the done ones are kept
    // visible (and un-tickable) rather than hidden, because `done` is reversible
    // and a vanished row reads as "deleted".
    const open = rows.filter((r) => !this._isDone(r));
    const done = rows.filter((r) => this._isDone(r));
    return html`
      <div class="list">
        ${open.map((r) => this._row(r))}
        ${done.length ? html`<div class="sep">Done</div>` : nothing}
        ${done.map((r) => this._row(r))}
      </div>`;
  }

  // A pending tap flips the row's apparent state until the poll catches up.
  private _isDone(r: ShoppingRow): boolean {
    return this._pending.has(r.id) ? !r.done : r.done;
  }

  private _row(r: ShoppingRow) {
    const isDone = this._isDone(r);
    return html`
      <div class="row ${isDone ? "is-done" : ""}">
        <button class="box" role="checkbox" aria-checked=${isDone ? "true" : "false"}
                aria-label=${r.name} @click=${() => this._toggleDone(r)}>
          ${isDone ? "✓" : nothing}
        </button>
        <span class="name">${r.name}</span>
        ${/* Amount is suppressed for a plain single free-text item: "1 paper
              towels" reads worse than "paper towels". Shown whenever it carries
              information -- any product row, or any quantity above one. */
          r.productId !== null || r.amount > 1
            ? html`<span class="amt">${r.amountLabel}</span>`
            : nothing}
      </div>`;
  }

  static styles = css`
    /* Sized for a wall panel read at arm's length and tapped with a thumb:
       20px text, 44px targets (the accessibility minimum). */
    .list { display: flex; flex-direction: column; padding: 4px 0;
      color: var(--primary-text-color, #e8edf6); font: 500 20px/1.3 system-ui, sans-serif; }
    .row { display: flex; gap: 14px; align-items: center; padding: 6px 12px;
      min-height: 44px; border-radius: 10px; }
    .row:not(:last-child) { border-bottom: 1px solid var(--divider-color, rgba(255,255,255,.08)); }
    .name { flex: 1; }
    .amt { opacity: .55; font-variant-numeric: tabular-nums; }
    .box { width: 30px; height: 30px; flex: 0 0 30px; margin: 7px 0; cursor: pointer;
      display: grid; place-items: center; font-size: 18px; line-height: 1;
      border-radius: 8px; color: #fff; background: transparent;
      border: 2px solid var(--secondary-text-color, #8b96a8); padding: 0; }
    .is-done .box { background: var(--primary-color, #3b82f6);
      border-color: var(--primary-color, #3b82f6); }
    .is-done .name { opacity: .45; text-decoration: line-through; }
    .is-done .amt { opacity: .3; }
    .sep { padding: 14px 12px 4px; font-size: 13px; letter-spacing: .08em;
      text-transform: uppercase; opacity: .45; }
    .empty { padding: 20px 12px; opacity: .6; color: var(--primary-text-color, #e8edf6); }
  `;
}

if (!customElements.get("grocy-shopping-card")) {
  customElements.define("grocy-shopping-card", GrocyShoppingCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-shopping-card", name: "Grocy Shopping List", description: "Shopping list from Grocy with check-off",
});
