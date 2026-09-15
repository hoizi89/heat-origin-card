import { LitElement, css, html, nothing } from "lit";
import { assertConfig, getConfigForm } from "./config";
import type { HeatOriginCardConfig, HomeAssistant } from "./types";
import { localeOf } from "./values";

type ConfigElementCardConstructor = Function & {
  getConfigElement?: () => HTMLElement | Promise<HTMLElement>;
};

/** `ha-form` exists only once a built-in editor has been opened; nudge one open. */
async function ensureHaFormLoaded(): Promise<void> {
  if (customElements.get("ha-form")) return;
  const helpers = await (window as unknown as { loadCardHelpers?: () => Promise<{ createCardElement(c: Record<string, unknown>): HTMLElement }> }).loadCardHelpers?.();
  const buttonCard = helpers?.createCardElement({ type: "button" });
  const constructor = buttonCard?.constructor as ConfigElementCardConstructor | undefined;
  await constructor?.getConfigElement?.();
}

export class HeatOriginCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true }
  };

  hass?: HomeAssistant;
  private _config?: HeatOriginCardConfig;

  static styles = css`
    :host {
      display: block;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    void ensureHaFormLoaded().then(() => this.requestUpdate());
  }

  setConfig(config: HeatOriginCardConfig): void {
    assertConfig(config);
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const form = getConfigForm(localeOf(this.hass));
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${form.schema}
        .computeLabel=${form.computeLabel}
        .computeHelper=${form.computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _valueChanged(event: CustomEvent): void {
    event.stopPropagation();
    const config = event.detail.value as HeatOriginCardConfig;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config } }));
  }
}
