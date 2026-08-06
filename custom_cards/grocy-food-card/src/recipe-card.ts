import { LitElement, html, css, nothing } from "lit";
// NOTE: explicit .js extension is required — tsc emits this specifier verbatim
// and browsers cannot resolve extensionless module paths (spec §3).
import {
  parseRecipes, parseIngredients, scaleIngredients, formatAmount,
  type RecipeRow, type IngredientRow,
} from "./shared.js";

type HassLike = { states?: Record<string, { attributes?: any } | undefined> };

export class GrocyRecipeCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _selectedId: { state: true },
  };
  hass?: HassLike;
  private _entity = "sensor.grocy_recipes";
  private _selectedId: number | null = null;   // null = LIST view, else DETAIL

  setConfig(config: Record<string, unknown>): void {
    if (typeof config?.entity === "string" && config.entity) this._entity = config.entity;
  }

  private get _attrs(): any {
    return this.hass?.states?.[this._entity]?.attributes ?? {};
  }
  private get _recipes(): RecipeRow[] {
    return parseRecipes(this._attrs.recipes);
  }
  private get _selected(): RecipeRow | undefined {
    return this._recipes.find((r) => r.id === this._selectedId);
  }

  private _open(id: number): void { this._selectedId = id; }
  private _back(): void { this._selectedId = null; }

  render() {
    return this._selectedId === null ? this._renderList() : this._renderDetail();
  }

  private _renderList() {
    const recipes = this._recipes;
    if (recipes.length === 0) return html`<div class="empty">No recipes</div>`;
    return html`
      <div class="grid">
        ${recipes.map((r) => html`
          <button class="tile" @click=${() => this._open(r.id)}>
            ${r.pictureUrl
              ? html`<img class="thumb" src=${r.pictureUrl} alt="" loading="lazy" />`
              : html`<div class="thumb placeholder"></div>`}
            <span class="tile-name">${r.name}</span>
          </button>`)}
      </div>`;
  }

  private _renderDetail() {
    const r = this._selected;
    if (!r) return html`<div class="empty">Recipe not found</div>`;
    const scaled = scaleIngredients(
      parseIngredients(this._attrs.recipes_pos, r.id),
      r.baseServings,
      r.desiredServings,
    );
    return html`
      <div class="detail">
        <button class="back" @click=${this._back}>← Back</button>
        ${r.pictureUrl ? html`<img class="hero" src=${r.pictureUrl} alt="" />` : nothing}
        <h2 class="title">${r.name}</h2>
        <div class="servings">Serves ${r.desiredServings}</div>
        <ul class="ingredients">
          ${scaled.map((i: IngredientRow) => html`
            <li><span class="amt">${formatAmount(i.amount as number)}</span>
                <span class="unit">${i.unit}</span>
                <span class="iname">${i.name}</span></li>`)}
        </ul>
        <div class="instructions">${r.instructions}</div>
      </div>`;
  }

  static styles = css`
    :host { color: var(--primary-text-color, #e8edf6);
      font: 500 18px/1.35 system-ui, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px; padding: 8px; }
    /* Real <button>s, not click-handled divs: tabbable + Enter/Space activatable,
       which is the whole of the no-touch degradation (spec §5.3). */
    .tile { display: flex; flex-direction: column; gap: 6px; padding: 0;
      min-height: 44px; cursor: pointer; border: none; border-radius: 12px;
      overflow: hidden; background: var(--card-background-color, #1b2130);
      color: inherit; font: inherit; text-align: left; }
    .thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
    .placeholder { background: linear-gradient(135deg, #2a3348, #1b2130); }
    .tile-name { padding: 0 8px 8px; font-weight: 700; }
    .detail { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
    .back { align-self: flex-start; min-height: 44px; min-width: 44px; padding: 0 14px;
      cursor: pointer; border: none; border-radius: 8px;
      background: var(--primary-color, #3b82f6); color: #fff; font: inherit; }
    .hero { width: 100%; max-height: 260px; object-fit: cover; border-radius: 12px; }
    .title { margin: 0; font-size: 24px; }
    .servings { opacity: .7; }
    .ingredients { margin: 0; padding-left: 18px; display: flex;
      flex-direction: column; gap: 4px; }
    .amt { font-weight: 700; }
    /* pre-line is load-bearing: stripTags emits \n between steps and they are
       invisible without it (spec §5.4). */
    .instructions { white-space: pre-line; opacity: .92; }
    .empty { padding: 16px; opacity: .7; }
  `;
}

if (!customElements.get("grocy-recipe-card")) {
  customElements.define("grocy-recipe-card", GrocyRecipeCard);
}
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "grocy-recipe-card", name: "Grocy Recipes", description: "Browse recipes from Grocy",
});
