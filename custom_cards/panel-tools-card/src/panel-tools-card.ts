import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { buildBrowseContentId, collectPlayable } from "../../screensaver-card/src/media-browse";
import {
  ENTITIES, HIDDEN_PATH, PAGE_SIZE, checkPin, findSkipped, fromTimeInput, hexEncodeUtf8,
  isSupportedName, isValidPin, isVideoName, pageSlice, parseShellResponse, stepMinutes,
  toTimeInput, topLevelFilename, type ShellResult,
} from "./logic";

// Panel tools: ⚙ (PIN → settings drawer) and 🖼 (photos overlay), on every time view.
// Spec: docs/superpowers/specs/2026-10-21-sleep-settings-photos-design.md
//
// Taps in here already count as activity: screensaver-card's bridge listens on
// window in the capture phase, and it is on all three views.
// Layering: everything here sits BELOW the screensaver overlay (z-index 9999), so
// when the screensaver engages it covers an open drawer — and updated() closes it.

type EntityState = { state: string; attributes?: Record<string, unknown> };
type Hass = {
  states: Record<string, EntityState | undefined>;
  callService: (
    domain: string, service: string, data?: unknown,
    target?: unknown, notify?: boolean, returnResponse?: boolean,
  ) => Promise<any>;
  callWS: (msg: Record<string, unknown>) => Promise<any>;
};

type Mode = "closed" | "pin" | "drawer" | "photos";
type Tile = { contentId: string; kind: "image" | "video"; name: string | null };

export class PanelToolsCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _mode: { state: true },
    _pin: { state: true },
    _pinError: { state: true },
    _error: { state: true },
    _tab: { state: true },
    _page: { state: true },
    _tiles: { state: true },
    _hidden: { state: true },
    _skipped: { state: true },
    _urls: { state: true },
    _selected: { state: true },
    _busy: { state: true },
  };

  hass?: Hass;
  private _cfgPin = "";
  private _mediaPath = "photos";
  private _loadGen = 0;

  _mode: Mode = "closed";
  _pin = "";
  _pinError = false;
  _error = "";
  _tab: "rotation" | "hidden" = "rotation";
  _page = 0;
  _tiles: Tile[] = [];
  _hidden: string[] = [];
  _skipped: string[] = [];
  _urls: Record<string, string> = {};
  _selected: string | null = null;
  _busy = false;

  setConfig(config: Record<string, unknown>): void {
    const pin = typeof config.pin === "string" ? config.pin : String(config.pin ?? "");
    if (!isValidPin(pin)) {
      throw new Error('panel-tools-card: "pin" must be exactly 4 digits, quoted (pin: "0412")');
    }
    this._cfgPin = pin;
    if (typeof config.media_path === "string" && config.media_path) {
      this._mediaPath = config.media_path;
    }
  }

  getCardSize(): number {
    return 0;
  }

  getGridOptions(): Record<string, number> {
    return { rows: 0, columns: 1 };
  }

  updated(changed: PropertyValues): void {
    // Screensaver engaged → close and re-lock. A kid must never find an open drawer.
    if (changed.has("hass") && this._mode !== "closed" && this._state(ENTITIES.idle) === "on") {
      this._close();
    }
  }

  private _state(entityId: string): string | undefined {
    return this.hass?.states[entityId]?.state;
  }

  private _close(): void {
    this._mode = "closed";
    this._pin = "";
    this._pinError = false;
    this._clearPhotos();
  }

  private async _call(domain: string, service: string, data: Record<string, unknown>, entityId: string): Promise<void> {
    try {
      await this.hass?.callService(domain, service, data, { entity_id: entityId });
      this._error = "";
    } catch (e) {
      this._error = `Couldn't save: ${(e as Error)?.message ?? e}`;
    }
  }

  // ── PIN ──────────────────────────────────────────────────────────────────────
  private _pressDigit(d: string): void {
    if (this._pin.length >= 4) return;
    this._pin += d;
    this._pinError = false;
    if (this._pin.length < 4) return;
    const ok = checkPin(this._pin, this._cfgPin);
    this._pin = "";
    if (ok) this._mode = "drawer";
    else this._pinError = true;
  }

  private _renderPin(): TemplateResult {
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
    return html`
      <div class="scrim" @click=${() => this._close()}></div>
      <div class="pin" role="dialog" aria-label="Parent PIN">
        <div class="pin-title">${this._pinError ? "Wrong PIN" : "Parent PIN"}</div>
        <div class="pin-dots">${[0, 1, 2, 3].map((i) => html`<span class=${i < this._pin.length ? "on" : ""}></span>`)}</div>
        <div class="pin-pad">
          ${digits.map((d) => d === ""
            ? html`<span></span>`
            : html`<button @click=${() => (d === "⌫" ? (this._pin = this._pin.slice(0, -1)) : this._pressDigit(d))}>${d}</button>`)}
        </div>
      </div>`;
  }

  // ── Drawer ───────────────────────────────────────────────────────────────────
  private _timeRow(label: string, entityId: string): TemplateResult {
    return html`
      <label class="row">
        <span>${label}</span>
        <input type="time" .value=${toTimeInput(this._state(entityId))}
          @change=${(e: Event) => {
            const t = fromTimeInput((e.target as HTMLInputElement).value);
            if (t) void this._call("input_datetime", "set_datetime", { time: t }, entityId);
          }} />
      </label>`;
  }

  // Phase B (Task 16) adds the Sleep section here.
  protected _renderSleepSection(): TemplateResult | typeof nothing {
    return nothing;
  }

  private _renderDrawer(): TemplateResult {
    const theme = this._state(ENTITIES.theme);
    const minutes = this._state(ENTITIES.screensaverMinutes);
    const setMinutes = (delta: number) =>
      this._call("input_number", "set_value", { value: stepMinutes(minutes, delta) }, ENTITIES.screensaverMinutes);
    return html`
      <div class="scrim" @click=${() => this._close()}></div>
      <aside class="drawer" role="dialog" aria-label="Settings">
        <header><h2>Settings</h2><button class="x" @click=${() => this._close()} aria-label="Close">✕</button></header>
        ${this._renderSleepSection()}
        <section>
          <h3>Views switch at</h3>
          ${this._timeRow("Morning", ENTITIES.morningStart)}
          ${this._timeRow("Afternoon", ENTITIES.afternoonStart)}
          ${this._timeRow("Evening", ENTITIES.eveningStart)}
        </section>
        <section>
          <h3>Theme</h3>
          <div class="seg">
            ${["Dark", "Light"].map((opt) => html`
              <button class=${theme === opt ? "on" : ""}
                @click=${() => this._call("input_select", "select_option", { option: opt }, ENTITIES.theme)}>${opt}</button>`)}
          </div>
        </section>
        <section>
          <h3>Screensaver after</h3>
          <div class="stepper">
            <button @click=${() => setMinutes(-5)} aria-label="Less">−</button>
            <span>${stepMinutes(minutes, 0)} min</span>
            <button @click=${() => setMinutes(5)} aria-label="More">+</button>
          </div>
        </section>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
      </aside>`;
  }

  // ── Photos (Task 10 fills these in) ──────────────────────────────────────────
  private _clearPhotos(): void {
    this._loadGen++;
    this._tiles = [];
    this._hidden = [];
    this._skipped = [];
    this._urls = {};
    this._selected = null;
    this._page = 0;
    this._error = "";
    this._busy = false;
  }

  private async _shell(service: string, data: Record<string, unknown>): Promise<ShellResult> {
    try {
      const res = await this.hass?.callService("shell_command", service, data, undefined, false, true);
      return parseShellResponse(res);
    } catch (e) {
      return { ok: false, error: `Home Assistant refused: ${(e as Error)?.message ?? e}` };
    }
  }

  private async _openPhotos(): Promise<void> {
    const tab = this._mode === "photos" ? this._tab : "rotation";
    const page = this._mode === "photos" ? this._page : 0;
    this._mode = "photos";
    this._clearPhotos();
    this._tab = tab;
    this._page = page;
    const hass = this.hass;
    if (!hass) return;
    const gen = this._loadGen;
    this._busy = true;
    // Same walk as screensaver-card (shared media-browse), so the counts agree.
    const [leaves, listing] = await Promise.all([
      collectPlayable(
        (id) => hass.callWS({ type: "media_source/browse_media", media_content_id: id }),
        buildBrowseContentId(this._mediaPath),
        () => gen !== this._loadGen,
      ),
      this._shell("kitchen_photo_list", {}),
    ]);
    if (gen !== this._loadGen) return;
    const shown = leaves.filter((l) => isSupportedName(l.contentId));
    this._tiles = shown.map((l) => ({ ...l, name: topLevelFilename(l.contentId, this._mediaPath) }));
    if (listing.ok) {
      this._hidden = listing.hidden ?? [];
      const rotationNames = leaves
        .map((l) => topLevelFilename(l.contentId, this._mediaPath))
        .filter((n): n is string => n !== null);
      this._skipped = findSkipped(listing.photos ?? [], rotationNames);
    } else {
      this._error = listing.error;
    }
    this._busy = false;
    void this._resolvePage();
  }

  private _list(): Tile[] {
    if (this._tab === "rotation") return this._tiles;
    const root = buildBrowseContentId(HIDDEN_PATH);
    return this._hidden.map((n): Tile => ({ contentId: `${root}/${n}`, kind: isVideoName(n) ? "video" : "image", name: n }));
  }

  /** Resolve URLs for the visible page only. Called after every page/tab change with
   *  _urls already emptied, so off-screen images are released (renderer memory). */
  private async _resolvePage(): Promise<void> {
    const gen = this._loadGen;
    const { items } = pageSlice(this._list(), this._page, PAGE_SIZE);
    for (const t of items) {
      if (t.kind !== "image" || this._urls[t.contentId]) continue;
      try {
        const res = await this.hass?.callWS({ type: "media_source/resolve_media", media_content_id: t.contentId });
        if (gen !== this._loadGen) return;
        if (res?.url) this._urls = { ...this._urls, [t.contentId]: res.url };
      } catch {
        // Tile stays a placeholder.
      }
    }
  }

  private _goto(tab: "rotation" | "hidden", page: number): void {
    this._loadGen++;
    this._tab = tab;
    this._page = page;
    this._urls = {};
    this._selected = null;
    void this._resolvePage();
  }

  private async _move(service: "kitchen_photo_hide" | "kitchen_photo_unhide", name: string): Promise<void> {
    this._busy = true;
    const r = await this._shell(service, { name_hex: hexEncodeUtf8(name) });
    this._busy = false;
    this._selected = null;
    if (!r.ok) {
      this._error = r.error;
      return;
    }
    await this._openPhotos();
  }

  private _renderPhotos(): TemplateResult {
    const list = this._list();
    const { items, page, pages } = pageSlice(list, this._page, PAGE_SIZE);
    const isHidden = this._tab === "hidden";
    return html`
      <div class="photos" role="dialog" aria-label="Photos">
        <header>
          <h2>Photos</h2>
          <div class="seg">
            <button class=${!isHidden ? "on" : ""} @click=${() => this._goto("rotation", 0)}>In rotation (${this._tiles.length})</button>
            <button class=${isHidden ? "on" : ""} @click=${() => this._goto("hidden", 0)}>Hidden (${this._hidden.length})</button>
          </div>
          <button class="x" @click=${() => this._close()} aria-label="Close">✕</button>
        </header>
        ${this._skipped.length && !isHidden ? html`
          <p class="note">Not shown on the panel (${this._skipped.length}): ${this._skipped.join(", ")}.
            HEIC and other unsupported formats need converting to JPEG.</p>` : nothing}
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        ${this._busy && !list.length ? html`<p class="note">Loading…</p>` : nothing}
        <div class="grid">
          ${items.map((t) => {
            const url = this._urls[t.contentId];
            const selected = this._selected === t.contentId;
            return html`
              <div class="tile ${selected ? "sel" : ""}" @click=${() => { this._selected = selected ? null : t.contentId; }}>
                ${t.kind === "video"
                  ? html`<div class="ph">▶<small>${t.name ?? "video"}</small></div>`
                  : url
                    ? html`<img src=${url} loading="lazy" decoding="async" alt="" />`
                    : html`<div class="ph">…</div>`}
                ${selected
                  ? t.name === null
                    ? html`<div class="act"><small>In a subfolder — move it off-panel</small></div>`
                    : html`<div class="act"><button ?disabled=${this._busy}
                        @click=${(e: Event) => { e.stopPropagation(); void this._move(isHidden ? "kitchen_photo_unhide" : "kitchen_photo_hide", t.name!); }}>
                        ${isHidden ? "Show again" : "Hide"}</button></div>`
                  : nothing}
              </div>`;
          })}
        </div>
        ${pages > 1 ? html`
          <footer class="stepper">
            <button ?disabled=${page === 0} @click=${() => this._goto(this._tab, page - 1)}>‹</button>
            <span>${page + 1} / ${pages}</span>
            <button ?disabled=${page >= pages - 1} @click=${() => this._goto(this._tab, page + 1)}>›</button>
          </footer>` : nothing}
      </div>`;
  }

  // Phase B (Task 16) adds the wake layer here.
  protected _renderWakeLayer(): TemplateResult | typeof nothing {
    return nothing;
  }

  render(): TemplateResult {
    return html`
      ${this._renderWakeLayer()}
      ${this._mode === "closed" ? html`
        <div class="corner">
          <button @click=${() => void this._openPhotos()} aria-label="Photos">🖼</button>
          <button @click=${() => { this._mode = "pin"; }} aria-label="Settings">⚙</button>
        </div>` : nothing}
      ${this._mode === "pin" ? this._renderPin() : nothing}
      ${this._mode === "drawer" ? this._renderDrawer() : nothing}
      ${this._mode === "photos" ? this._renderPhotos() : nothing}`;
  }

  static styles = css`
    :host { display: block; height: 0; }
    button { font: inherit; color: inherit; cursor: pointer; touch-action: manipulation; }
    .corner { position: fixed; right: 12px; bottom: 12px; z-index: 50; display: flex; gap: 8px; }
    .corner button { width: 48px; height: 48px; border-radius: 24px; border: none; font-size: 22px;
      background: var(--kc-tools-bg, rgba(0, 0, 0, 0.35)); opacity: 0.6; }
    .scrim { position: fixed; inset: 0; z-index: 9000; background: rgba(0, 0, 0, 0.45); }
    .pin { position: fixed; z-index: 9001; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 320px; padding: 24px; border-radius: 16px; text-align: center;
      background: var(--kc-card-bg, var(--card-background-color, #1c1c1c));
      color: var(--kc-card-fg, var(--primary-text-color, #fff)); }
    .pin-title { font-size: 20px; margin-bottom: 12px; }
    .pin-dots { display: flex; justify-content: center; gap: 12px; margin-bottom: 16px; }
    .pin-dots span { width: 14px; height: 14px; border-radius: 7px; border: 2px solid currentColor; }
    .pin-dots span.on { background: currentColor; }
    .pin-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .pin-pad button { height: 64px; font-size: 26px; border-radius: 12px; border: none;
      background: var(--kc-tools-key, rgba(127, 127, 127, 0.2)); }
    .drawer { position: fixed; z-index: 9001; top: 0; right: 0; bottom: 0; width: 420px; max-width: 90vw;
      overflow-y: auto; padding: 20px 24px; box-sizing: border-box;
      background: var(--kc-card-bg, var(--card-background-color, #1c1c1c));
      color: var(--kc-card-fg, var(--primary-text-color, #fff)); }
    .drawer header { display: flex; justify-content: space-between; align-items: center; }
    .drawer h2 { margin: 0; font-size: 26px; }
    .drawer h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; margin: 20px 0 8px; }
    .x { border: none; background: none; font-size: 24px; width: 48px; height: 48px; }
    .row { display: flex; justify-content: space-between; align-items: center; min-height: 52px; font-size: 18px; }
    .row input { font-size: 18px; padding: 6px 8px; }
    .seg, .stepper { display: flex; gap: 8px; align-items: center; }
    .seg button, .stepper button { min-width: 64px; height: 48px; border-radius: 10px; border: none; font-size: 18px;
      background: var(--kc-tools-key, rgba(127, 127, 127, 0.2)); }
    .seg button.on { background: var(--kc-hero-fg, #4fc3f7); color: #000; }
    .stepper span { min-width: 90px; text-align: center; font-size: 20px; }
    .error { color: var(--kc-error, #ef5350); }
    .photos { position: fixed; inset: 0; z-index: 9001; overflow-y: auto; padding: 16px 24px; box-sizing: border-box;
      background: var(--kc-card-bg, var(--card-background-color, #1c1c1c));
      color: var(--kc-card-fg, var(--primary-text-color, #fff)); }
    .photos header { display: flex; align-items: center; gap: 16px; }
    .photos h2 { margin: 0; font-size: 26px; flex: 0 0 auto; }
    .photos header .seg { flex: 1; }
    .note { opacity: 0.8; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
    .tile { position: relative; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden;
      background: var(--kc-tools-key, rgba(127, 127, 127, 0.2)); }
    .tile.sel { outline: 3px solid var(--kc-hero-fg, #4fc3f7); }
    .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ph { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center;
      justify-content: center; font-size: 32px; gap: 6px; }
    .ph small { font-size: 12px; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .act { position: absolute; inset: auto 0 0 0; padding: 8px; display: flex; justify-content: center;
      background: rgba(0, 0, 0, 0.6); color: #fff; }
    .act button { height: 44px; padding: 0 20px; border-radius: 10px; border: none; font-size: 17px;
      background: var(--kc-hero-fg, #4fc3f7); color: #000; }
    footer.stepper { justify-content: center; }
  `;
}

if (!customElements.get("panel-tools-card")) {
  customElements.define("panel-tools-card", PanelToolsCard);
}
