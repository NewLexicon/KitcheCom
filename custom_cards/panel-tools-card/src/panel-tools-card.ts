import { LitElement, html } from "lit";

export class PanelToolsCard extends LitElement {
  setConfig(_config: Record<string, unknown>): void {}
  render() { return html``; }
}

if (!customElements.get("panel-tools-card")) {
  customElements.define("panel-tools-card", PanelToolsCard);
}
