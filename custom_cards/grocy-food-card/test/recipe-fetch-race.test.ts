// This file MIRRORS the `_open`/`_back` logic in ../src/recipe-card.ts (the
// GrocyRecipeCard Lit element) rather than instantiating the real element:
// the project's vitest environment is `node` (no DOM) and there is no
// happy-dom installed, so a Lit custom element cannot be constructed here.
// The class below is a faithful copy of the committed method bodies, driving
// the REAL fetchIngredients/fetchUnitMap/parseIngredients from ../src/shared.
// If `_open`/`_back` change in recipe-card.ts, this mirror must be updated too.

import { describe, it, expect, vi } from "vitest";
import { fetchIngredients, fetchUnitMap, parseIngredients, type IngredientRow } from "../src/shared";
import fixture from "./fixtures/recipes-pos-resolved.json";
import units from "./fixtures/quantity-units.json";

type HassLike = {
  callService?: (
    domain: string, service: string, data?: unknown,
    target?: unknown, notify?: boolean, returnResponse?: boolean,
  ) => Promise<any>;
};

class FakeRecipeCard {
  hass?: HassLike;
  _selectedId: number | null = null;
  _ingredients: IngredientRow[] = [];
  _loading = false;
  _unitMap: Record<number, string> = {};
  _unitMapLoaded = false;
  _fetchSeq = 0;

  async _open(id: number): Promise<void> {
    if (typeof id !== "number" || !Number.isFinite(id)) return;
    // Monotonic token: comparing _selectedId alone is not enough, because
    // navigating 1 -> 2 -> 1 makes the FIRST recipe-1 fetch look current again
    // when it finally lands, overwriting the correct rows with stale ones.
    const seq = ++this._fetchSeq;
    this._selectedId = id;
    this._ingredients = [];
    this._loading = true;
    try {
      // Only latch on success: fetchUnitMap returns {} on failure, and this
      // screen runs for weeks without a reload — latching an empty map would
      // mean every ingredient renders unit-less until the Pi is power-cycled.
      if (!this._unitMapLoaded) {
        const unitsMap = await fetchUnitMap(this.hass);
        if (Object.keys(unitsMap).length > 0) {
          this._unitMap = unitsMap;
          this._unitMapLoaded = true;
        }
      }
      const raw = await fetchIngredients(this.hass, id);
      // Superseded by a newer open (or a back) while in flight — drop the result.
      if (seq !== this._fetchSeq || this._selectedId !== id) return;
      this._ingredients = parseIngredients(raw, id, this._unitMap);
    } finally {
      if (seq === this._fetchSeq && this._selectedId === id) this._loading = false;
    }
  }

  _back(): void {
    this._selectedId = null;
    this._ingredients = [];
    this._loading = false;
  }
}

const ALL_ROWS = fixture.recipes_pos_resolved;
const RECIPE_1_ROWS = ALL_ROWS.filter((r) => r.recipe_id === 1);
const RECIPE_3_ROWS = ALL_ROWS.filter((r) => r.recipe_id === 3);

/** A deterministic gate: one manually-resolved promise per _open() call,
 * returned to the test so it can control exactly when each fetch lands. */
function fakeHassManualGate() {
  let unitShouldFail = false;
  const pending: Array<{ recipeId: number; release: (rows: unknown[]) => void }> = [];

  const hass: HassLike = {
    callService: vi.fn((_domain, service, data) => {
      if (service === "grocy_quantity_units") {
        if (unitShouldFail) return Promise.reject(new Error("unit fetch failed"));
        return Promise.resolve({ response: { content: units.quantity_units } });
      }
      if (service === "grocy_recipe_ingredients") {
        const recipeId = (data as any)?.recipe_id;
        return new Promise((resolve) => {
          pending.push({
            recipeId,
            release: (rows) => resolve({ response: { content: rows } }),
          });
        });
      }
      return Promise.reject(new Error(`unexpected service ${service}`));
    }),
  };

  return {
    hass,
    setUnitShouldFail: (v: boolean) => { unitShouldFail = v; },
    // Release the Nth-oldest still-pending ingredient fetch for recipeId, in
    // the order _open() issued them (FIFO per recipeId isn't required here —
    // tests track order explicitly via the returned index).
    takePending: () => pending.splice(0, pending.length),
  };
}

describe("recipe-card fetch race guards (mirrors _open/_back)", () => {
  it("1 -> 2 -> 1: the first recipe-1 fetch landing late does not overwrite current rows", async () => {
    const { hass, takePending } = fakeHassManualGate();
    const card = new FakeRecipeCard();
    card.hass = hass;

    // Open recipe 1 (id=1) — fetch #1 issued, left in flight.
    const openPromise1 = card._open(1);
    // Let the unit-map microtask resolve before we grab pending ingredient calls.
    await Promise.resolve();
    await Promise.resolve();

    // Open recipe 3 (id=3) before fetch #1 resolves — fetch #2 issued.
    const openPromise3 = card._open(3);
    await Promise.resolve();
    await Promise.resolve();

    // Re-open recipe 1 (id=1) again — fetch #3 issued (the "current" one).
    const openPromise1Again = card._open(1);
    await Promise.resolve();
    await Promise.resolve();

    const allPending = takePending();
    // Expect 3 ingredient fetches queued: recipe 1, recipe 3, recipe 1.
    expect(allPending.map((p) => p.recipeId)).toEqual([1, 3, 1]);

    // Resolve fetch #3 (current recipe-1 open) FIRST, simulating fast network.
    allPending[2].release(RECIPE_1_ROWS);
    // Then resolve the STALE first fetch (#1) LAST — it must be dropped.
    allPending[0].release(RECIPE_1_ROWS.map((r) => ({ ...r, product_name: "STALE" })));
    // The recipe-3 fetch (#2) also resolves late, but selectedId has moved on.
    allPending[1].release(RECIPE_3_ROWS);

    await Promise.all([openPromise1, openPromise3, openPromise1Again]);

    expect(card._selectedId).toBe(1);
    expect(card._ingredients.map((i) => i.name)).toEqual(
      RECIPE_1_ROWS.map((r) => r.product_name ?? "(unknown)"),
    );
    expect(card._ingredients.some((i) => i.name === "STALE")).toBe(false);
    expect(card._loading).toBe(false);
  });

  it("a failed unit-map fetch does not latch; a later successful open populates units", async () => {
    const { hass, setUnitShouldFail, takePending } = fakeHassManualGate();
    const card = new FakeRecipeCard();
    card.hass = hass;

    setUnitShouldFail(true);
    const firstOpen = card._open(1);
    await Promise.resolve();
    await Promise.resolve();
    let pending = takePending();
    pending[0].release(RECIPE_1_ROWS);
    await firstOpen;

    expect(card._unitMapLoaded).toBe(false);
    expect(card._unitMap).toEqual({});
    // Ground beef (qu_id 4) has no resolvable unit while the map failed to latch.
    const beef = card._ingredients.find((i) => i.name === "Ground beef");
    expect(beef?.unit).toBe("");

    // Now let the unit fetch succeed on the next open.
    setUnitShouldFail(false);
    const openAgain = card._open(1);
    await Promise.resolve();
    await Promise.resolve();
    pending = takePending();
    pending[0].release(RECIPE_1_ROWS);
    await openAgain;

    expect(card._unitMapLoaded).toBe(true);
    const beefAfter = card._ingredients.find((i) => i.name === "Ground beef");
    expect(beefAfter?.unit).toBe("Pound");
  });

  it("back-during-flight leaves no rows and _loading === false", async () => {
    const { hass, takePending } = fakeHassManualGate();
    const card = new FakeRecipeCard();
    card.hass = hass;

    const openPromise = card._open(1);
    await Promise.resolve();
    await Promise.resolve();

    card._back();

    const pending = takePending();
    pending[0].release(RECIPE_1_ROWS);
    await openPromise;

    expect(card._selectedId).toBeNull();
    expect(card._ingredients).toEqual([]);
    expect(card._loading).toBe(false);
  });

  it("a normal open still renders the right rows", async () => {
    const { hass, takePending } = fakeHassManualGate();
    const card = new FakeRecipeCard();
    card.hass = hass;

    const openPromise = card._open(3);
    await Promise.resolve();
    await Promise.resolve();
    const pending = takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].recipeId).toBe(3);
    pending[0].release(RECIPE_3_ROWS);
    await openPromise;

    expect(card._selectedId).toBe(3);
    expect(card._ingredients.map((i) => i.name)).toEqual(
      RECIPE_3_ROWS.map((r) => r.product_name ?? "(unknown)"),
    );
    expect(card._loading).toBe(false);
    expect(card._unitMapLoaded).toBe(true);
  });
});
