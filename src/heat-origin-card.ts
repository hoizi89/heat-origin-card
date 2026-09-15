import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import { CARD_TYPE, assertConfig, resolveConfig, stubConfig } from "./config";
import { localize } from "./localize";
import { circuitActive, classify, isRunning, shortWordLabel, wordLabel } from "./modes";
import { cardStyles } from "./styles";
import {
  buildDays,
  hourlyMeans,
  lastRun,
  midnight,
  parseHistory,
  withLive,
  type DayTimeline,
  type Segment,
  type StatePoint
} from "./timeline";
import type {
  ElectricSource,
  HeatOriginCardConfig,
  HomeAssistant,
  ModeKind,
  ResolvedConfig,
  StoreConfig,
  StoreKind
} from "./types";
import {
  clock,
  energyKwh,
  formatNumber,
  formatPower,
  formatSpan,
  formatTemp,
  localeOf,
  numberOf,
  powerKw,
  scalePower,
  stateOf,
  unitOf
} from "./values";

const DAY = 86400000;
const REFRESH = 5 * 60 * 1000;
const W = 368;
const NARROW = 340;

const TONE: Record<ModeKind, string> = {
  heating: "var(--ho-heating)",
  hot_water: "var(--ho-hot-water)",
  cooling: "var(--ho-cooling)",
  defrost: "var(--ho-defrost)",
  blocked: "var(--ho-muted)",
  idle: "var(--ho-muted)"
};

const SOURCE_TONE: Record<ElectricSource, string> = {
  solar: "var(--ho-sun)",
  battery: "var(--ho-battery)",
  grid: "var(--ho-grid)"
};

const STORE_TONE: Record<StoreKind, string> = {
  hot_water: "var(--ho-hot-water)",
  buffer: "var(--ho-heating)"
};

const ON = new Set(["on", "true", "running", "open", "1", "heat", "heating"]);

interface Tip {
  x: number;
  y: number;
  text: TemplateResult;
}

interface Sink {
  name: string;
  /** The store's circulation pump is running. */
  circulating?: boolean;
  value: string;
  detail?: string;
  right?: string;
  active: boolean;
  /** Heat is flowing to it from the heat pump right now. */
  fed: boolean;
  tone: string;
  entity?: string;
}

type Shares = Partial<Record<ElectricSource, number>>;

export class HeatOriginCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _points: { state: true },
    _pv: { state: true },
    _tip: { state: true },
    _narrow: { state: true }
  };

  static styles = cardStyles;

  hass?: HomeAssistant;
  private _config?: ResolvedConfig;
  private _points?: StatePoint[];
  private _pv: Record<number, Array<number | undefined>> = {};
  private _tip?: Tip;
  private _narrow = false;
  private _fetchedAt = 0;
  private _fetching = false;
  private _resize?: ResizeObserver;

  static getConfigElement() {
    return document.createElement(`${CARD_TYPE}-editor`);
  }

  static getStubConfig(hass: HomeAssistant) {
    return stubConfig(hass.states);
  }

  setConfig(config: HeatOriginCardConfig): void {
    assertConfig(config);
    this._config = resolveConfig(config);
    this._fetchedAt = 0;
  }

  getCardSize(): number {
    return this._config?.shape === "compact" ? 2 : 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 4 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === "undefined") return;
    // A narrow column needs a different layout for the flow, not just a smaller one.
    this._resize = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const narrow = width > 0 && width < NARROW;
      if (narrow !== this._narrow) this._narrow = narrow;
    });
    this._resize.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
  }

  protected updated(changed: PropertyValues): void {
    if ((changed.has("hass") || changed.has("_config")) && this._needsHistory()) {
      if (Date.now() - this._fetchedAt > REFRESH && !this._fetching) void this._fetch();
    }
  }

  private _needsHistory(): boolean {
    const c = this._config;
    return Boolean(this.hass && c && (c.shape === "compact" || c.sections.day || c.sections.flow));
  }

  private async _fetch(): Promise<void> {
    const hass = this.hass;
    const config = this._config;
    if (!hass || !config) return;
    this._fetching = true;
    const now = new Date();
    const start = new Date(midnight(now) - (config.day.days === 2 ? DAY : 0));
    try {
      const history = await hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: now.toISOString(),
        entity_ids: [config.entities.mode],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false
      });
      this._points = parseHistory(history, config.entities.mode);
    } catch {
      this._points = this._points ?? [];
    }

    const solar = config.entities.solar;
    if (solar && config.sections.day) {
      try {
        const stats = await hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: start.toISOString(),
          end_time: now.toISOString(),
          statistic_ids: [solar],
          period: "hour",
          types: ["mean"]
        });
        const unit = unitOf(stateOf(hass, solar));
        const pv: Record<number, Array<number | undefined>> = {};
        for (let day = start.getTime(); day < now.getTime(); day += DAY) {
          const dayStart = midnight(new Date(day + 3600000));
          pv[dayStart] = hourlyMeans(stats, solar, dayStart).map((v) => (v === undefined ? undefined : scalePower(v, unit)));
        }
        this._pv = pv;
      } catch {
        this._pv = {};
      }
    }
    this._fetchedAt = Date.now();
    this._fetching = false;
  }

  // ─── helpers ───────────────────────────────────────────────

  private get _locale(): string {
    return localeOf(this.hass);
  }

  private _t(key: string, vars?: Record<string, string>): string {
    return localize(key, this._locale, vars);
  }

  private _num(id: string | undefined) {
    return numberOf(stateOf(this.hass, id));
  }

  private _temp(id: string | undefined): string | undefined {
    const v = this._num(id);
    return v === undefined ? undefined : formatTemp(v, this._locale);
  }

  private _one(value: number): string {
    return formatNumber(value, this._locale, 1);
  }

  private _isOn(id: string | undefined): boolean {
    const state = stateOf(this.hass, id)?.state;
    return state !== undefined && ON.has(state.toLowerCase());
  }

  private _moreInfo(entityId: string | undefined) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
  }

  private _mode(): { raw?: string; kind: ModeKind; since?: number } {
    const config = this._config as ResolvedConfig;
    const entity = stateOf(this.hass, config.entities.mode);
    const raw = entity?.state;
    const since = entity?.last_changed ? Date.parse(entity.last_changed) : undefined;
    return { raw, kind: classify(raw, config.modes), since };
  }

  private _modeLabel(kind: ModeKind, raw: string | undefined): string {
    if (kind === "idle" || kind === "blocked") return wordLabel(raw, this._locale);
    return this._t(`kind.${kind}`);
  }

  private _live() {
    const e = (this._config as ResolvedConfig).entities;
    const heat = powerKw(stateOf(this.hass, e.heat_power));
    const electric = powerKw(stateOf(this.hass, e.electric_power));
    const copSensor = this._num(e.cop);
    const cop =
      copSensor !== undefined && copSensor > 0
        ? copSensor
        : heat !== undefined && electric !== undefined && electric > 0.05
          ? heat / electric
          : undefined;
    return { heat, electric, cop };
  }

  /**
   * Where the electricity comes from, split like the house's: the heat pump
   * draws from the same meter. With a house sensor the shares follow the
   * house; without one, PV at or above the draw counts as PV, the rest as grid.
   */
  private _shares(electric: number | undefined): Shares | undefined {
    const config = this._config as ResolvedConfig;
    const e = config.entities;
    const solar = powerKw(stateOf(this.hass, e.solar));
    const house = powerKw(stateOf(this.hass, e.house_power));
    const gridRaw = powerKw(stateOf(this.hass, e.grid_power));
    const batteryRaw = powerKw(stateOf(this.hass, e.battery_power));
    const grid = gridRaw === undefined ? undefined : config.grid_invert ? -gridRaw : gridRaw;
    const battery = batteryRaw === undefined ? undefined : config.battery_invert ? -batteryRaw : batteryRaw;

    if (house !== undefined && house > 0.05) {
      const fromSun = Math.min(Math.max(0, solar ?? 0), house);
      const fromBattery = Math.max(0, battery ?? 0);
      const fromGrid = Math.max(0, grid ?? house - fromSun - fromBattery);
      const total = fromSun + fromBattery + fromGrid;
      if (total <= 0) return undefined;
      return { solar: fromSun / total, battery: fromBattery / total, grid: fromGrid / total };
    }
    if (solar !== undefined && electric !== undefined) return solar >= electric ? { solar: 1 } : { grid: 1 };
    if (grid !== undefined) return grid > 0.05 ? { grid: 1 } : undefined;
    return undefined;
  }

  private _dominant(shares: Shares | undefined): ElectricSource | undefined {
    if (!shares) return undefined;
    return (Object.entries(shares) as Array<[ElectricSource, number]>).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  private _sourceLabel(shares: Shares | undefined): string {
    if (!shares) return this._t("flow.power");
    const parts = (["solar", "battery", "grid"] as ElectricSource[]).filter((s) => (shares[s] ?? 0) >= 0.1);
    return parts.map((s) => this._t(`source.${s}`)).join(" + ") || this._t("flow.power");
  }

  private _days(): DayTimeline[] | undefined {
    const config = this._config as ResolvedConfig;
    if (!this._points) return undefined;
    const mode = this._mode();
    const live = mode.raw !== undefined && mode.since !== undefined ? { state: mode.raw, at: mode.since } : undefined;
    return buildDays(withLive(this._points, live), config.modes, new Date(), config.day.days, config.day.short_run);
  }

  private _hm(minutes: number) {
    const rounded = Math.round(minutes);
    const value = `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
    return html`${value}<small>${this._t("day.hours")}</small>`;
  }

  private _spanText(minutes: number): string {
    const s = formatSpan(minutes);
    return [
      s.hours !== undefined ? `${s.hours} ${this._t("unit.h")}` : "",
      s.minutes !== undefined ? `${s.minutes} ${this._t("unit.min")}` : "",
      s.seconds !== undefined ? `${s.seconds} ${this._t("unit.s")}` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  // ─── render ────────────────────────────────────────────────

  protected render() {
    const config = this._config;
    if (!this.hass || !config) return nothing;

    const modeEntity = stateOf(this.hass, config.entities.mode);
    if (!modeEntity) {
      return html`<ha-card><div class="warn">${this._t("state.no_mode")} ${config.entities.mode}</div></ha-card>`;
    }

    if (config.shape === "compact") return this._renderCompact();

    const blocks: Record<string, () => unknown> = {
      flow: () => this._renderFlow(),
      day: () => this._renderDay(),
      stores: () => this._renderStores()
    };

    return html`
      <ha-card class=${config.font === "system" ? "font-system" : ""}>
        ${this._renderHead()}
        ${config.sections.order.filter((s) => config.sections[s]).map((s) => blocks[s]())}
        ${this._tip ? html`<div class="tip" style="left:${this._tip.x}px;top:${this._tip.y}px">${this._tip.text}</div>` : nothing}
      </ha-card>
    `;
  }

  private _chip() {
    const mode = this._mode();
    // At rest the moment that matters is when the last run ended, not when a block turned into standby.
    const last = isRunning(mode.kind) ? undefined : lastRun(this._days()?.at(-1));
    const sinceAt = last && mode.since !== undefined && last.to <= mode.since ? last.to : mode.since;
    const since =
      sinceAt !== undefined && Date.now() - sinceAt < DAY
        ? ` · ${this._t("flow.since", { time: clock(new Date(sinceAt), this._locale) })}`
        : "";
    return html`<span class="chip" style="--tone:${TONE[mode.kind]}" @click=${() => this._moreInfo(this._config?.entities.mode)}
      ><i></i>${this._modeLabel(mode.kind, mode.raw)}${since}</span
    >`;
  }

  private _renderHead() {
    const config = this._config as ResolvedConfig;
    return html`<div class="head">
      <p class="title">${config.title ?? this._t("card.title")}</p>
      ${this._chip()}
    </div>`;
  }

  // ─── flow ──────────────────────────────────────────────────

  private _sinks(): Sink[] {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const mode = this._mode();
    const running = isRunning(mode.kind);
    const details = config.flow.circuit_details;
    const sinks: Sink[] = [];

    for (const store of config.stores) {
      const top = this._temp(store.top);
      const bottom = this._temp(store.bottom);
      const fed = running && ((store.kind === "hot_water" && mode.kind === "hot_water") || (store.kind === "buffer" && mode.kind === "heating"));
      sinks.push({
        name: store.name,
        circulating: store.kind === "hot_water" && Boolean(store.circulation_pump) && this._isOn(store.circulation_pump),
        value: `${top ?? "–"} °C`,
        detail: details && fed && bottom !== undefined ? `${this._t("flow.bottom")} ${bottom} °C` : undefined,
        active: fed,
        fed,
        tone: STORE_TONE[store.kind],
        entity: store.top
      });
    }

    for (const circuit of config.circuits) {
      const raw = stateOf(this.hass, circuit.state)?.state;
      const pumpOn = circuit.pump ? this._isOn(circuit.pump) : undefined;
      const active = pumpOn ?? circuitActive(raw, circuit.active);
      const room = this._temp(circuit.room);
      const flow = this._num(circuit.flow ?? circuit.temperature);
      const ret = this._num(circuit.return);
      const max = room !== undefined ? 9 : 16;
      const word = circuit.state
        ? shortWordLabel(raw, locale, max)
        : pumpOn !== undefined
          ? this._t(pumpOn ? "flow.running" : "kind.idle")
          : undefined;

      let value: string;
      if (circuit.kind === "circulation") {
        value = flow !== undefined ? `${formatTemp(flow, locale)} °C${active ? ` · ${this._t("flow.running")}` : ""}` : word ?? "–";
      } else {
        const flowText = flow !== undefined ? `${this._t("flow.vl")} ${formatTemp(flow, locale)} °C` : undefined;
        value = active ? flowText ?? word ?? "–" : word ?? flowText ?? "–";
      }
      const cooling = raw ? /cool|kühl|cc-/i.test(raw) : false;
      const spread =
        details && active && flow !== undefined && ret !== undefined
          ? `${formatTemp(flow, locale)}/${formatTemp(ret, locale)} · Δ ${this._one(flow - ret)} K`
          : undefined;
      sinks.push({
        name: circuit.name,
        value,
        detail: spread,
        right: room !== undefined ? `${room}°` : undefined,
        active,
        fed: running && active && circuit.kind === "heating",
        tone: circuit.kind === "circulation" ? TONE.hot_water : cooling ? TONE.cooling : TONE.heating,
        entity: circuit.pump ?? circuit.state ?? circuit.flow ?? circuit.temperature
      });
    }
    return sinks;
  }

  private _flowFoot(running: boolean): TemplateResult[] {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const foot: TemplateResult[] = [];
    if (running && config.flow.spread) {
      const flowT = this._num(config.entities.flow);
      const retT = this._num(config.entities.return);
      const volume = this._num(config.entities.volume_flow);
      if (flowT !== undefined) foot.push(html`<span>${this._t("flow.flow")} <b>${formatTemp(flowT, locale)} °C</b></span>`);
      if (retT !== undefined) foot.push(html`<span>${this._t("flow.return")} <b>${formatTemp(retT, locale)} °C</b></span>`);
      if (flowT !== undefined && retT !== undefined) foot.push(html`<span>${this._t("flow.spread")} <b>${this._one(flowT - retT)} K</b></span>`);
      if (volume !== undefined)
        foot.push(html`<span><b>${formatNumber(volume, locale, 0)}</b> ${unitOf(stateOf(this.hass, config.entities.volume_flow)) || "l/h"}</span>`);
    }
    if (!running) {
      const today = this._days()?.at(-1);
      if (today) {
        foot.push(html`<span>${this._t("flow.today_starts")} <b>${this._t("flow.starts_n", { n: String(today.starts) })}</b></span>`);
        const last = lastRun(today);
        if (last)
          foot.push(
            html`<span>${this._t("flow.last")} ${this._t(`kind.${last.kind}`)} <b>${clock(new Date(last.from), locale)}–${clock(new Date(last.to), locale)}</b></span>`
          );
      }
    }
    for (const extra of config.flow.extras) {
      if (extra.running_only && !running) continue;
      const entity = stateOf(this.hass, extra.entity);
      if (!entity) continue;
      const n = numberOf(entity);
      const value = n === undefined ? entity.state : formatNumber(n, locale, Math.abs(n) < 100 ? 1 : 0);
      const name = extra.name ?? String(entity.attributes.friendly_name ?? extra.entity);
      foot.push(html`<span>${name} <b>${value}${unitOf(entity) ? ` ${unitOf(entity)}` : ""}</b></span>`);
    }
    return foot;
  }

  private _footBlock(running: boolean) {
    const foot = this._flowFoot(running);
    return foot.length ? html`<div class="foot">${foot}</div>` : nothing;
  }

  /** The ring around the heat pump: ambient heat, then each source of the electricity. */
  private _ring(cx: number, cy: number, r: number, heat: number, electric: number, shares: Shares | undefined) {
    if (heat <= 0) return nothing;
    const c = 2 * Math.PI * r;
    const air = Math.max(0, heat - electric) / heat;
    const parts: Array<[string, number]> = [["var(--ho-air)", air]];
    const rest = 1 - air;
    if (shares) {
      for (const s of ["solar", "battery", "grid"] as ElectricSource[]) {
        if ((shares[s] ?? 0) > 0) parts.push([SOURCE_TONE[s], rest * (shares[s] ?? 0)]);
      }
    } else parts.push(["var(--ho-power)", rest]);
    let offset = 0;
    return parts
      .filter(([, share]) => share > 0.005)
      .map(([tone, share]) => {
        const len = Math.max(0, c * share - 2);
        const arc = svg`<circle cx=${cx} cy=${cy} r=${r} fill="none" stroke=${tone} stroke-width="4.5"
          stroke-dasharray="${len} ${c - len}" stroke-dashoffset=${-offset} transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += c * share;
        return arc;
      });
  }

  private _renderFlow() {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const mode = this._mode();
    const live = this._live();
    const running = isRunning(mode.kind);
    const heat = running ? live.heat ?? 0 : 0;
    const electric = running ? live.electric ?? 0 : 0;
    const air = Math.max(0, heat - electric);
    const shares = running ? this._shares(live.electric) : undefined;
    const dominant = this._dominant(shares);
    const powerTone = running ? (dominant ? SOURCE_TONE[dominant] : "var(--ho-power)") : "var(--ho-muted)";
    const sinks = this._sinks();
    const outdoor = this._temp(config.entities.outdoor);
    const width = (kw: number) => Math.min(9, Math.max(2.5, 2 + kw * 1.1));
    const hasBoth = Boolean(config.entities.heat_power && config.entities.electric_power);
    const last = running ? undefined : lastRun(this._days()?.at(-1));
    const airTone = running ? "var(--ho-air)" : "var(--ho-muted)";
    const lineStyle = running ? "" : "3 5";

    const centre = (cx: number, cy: number, r: number, big: number) =>
      running
        ? svg`
          <text x=${cx} y=${cy} text-anchor="middle" font-size=${big} font-weight="700" fill="var(--ho-ink)">${formatNumber(heat, locale, 1)}</text>
          <text x=${cx} y=${cy + 13} text-anchor="middle" font-size="10" fill="var(--ho-muted)" class="mono">${this._t("flow.heat")}</text>
          ${live.cop !== undefined
            ? svg`<text x=${cx} y=${cy + r - 11} text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--ho-ink)" class="mono">COP ${formatNumber(live.cop, locale, 1)}</text>`
            : nothing}`
        : last
          ? svg`
            <text x=${cx} y=${cy - 14} text-anchor="middle" font-size="10" fill="var(--ho-muted)" class="mono">${this._t("flow.last")}</text>
            <text x=${cx} y=${cy + 5} text-anchor="middle" font-size=${big - 7} font-weight="700" fill="var(--ho-ink)">${this._spanText((last.to - last.from) / 60000)}</text>
            <text x=${cx} y=${cy + 20} text-anchor="middle" font-size="10" font-weight="600" fill=${TONE[last.kind]}>${this._t(`kind.${last.kind}`)}</text>`
          : svg`<text x=${cx} y=${cy + 4} text-anchor="middle" font-size="12" font-weight="600" fill="var(--ho-muted)">${this._modeLabel(mode.kind, mode.raw)}</text>`;

    const powerGlyph = (x: number, y: number) =>
      svg`<path d="M${x + 2} ${y - 10} L${x - 6} ${y + 2} H${x} L${x - 2} ${y + 10} L${x + 6} ${y - 2} H${x} Z" fill=${powerTone}/>`;
    const airGlyph = (x: number, y: number) =>
      svg`<path d="M${x - 10} ${y - 5} H${x + 5} a3.5 3.5 0 1 0 -3.5 -3.5 M${x - 10} ${y} H${x + 9} M${x - 10} ${y + 5} H${x + 3} a3.5 3.5 0 1 1 -3.5 3.5"
        fill="none" stroke=${airTone} stroke-width="2" stroke-linecap="round"/>`;

    if (this._narrow) {
      const cx = 124;
      const cy = 46;
      const r = 38;
      return html`
        <div class="section">
          <svg viewBox="0 0 248 112" role="img" aria-label="${this._modeLabel(mode.kind, mode.raw)}">
            ${config.entities.electric_power
              ? svg`<path d="M42 ${cy} H${cx - r}" stroke=${running ? powerTone : "var(--ho-track)"} stroke-width=${running ? width(electric) : 2} stroke-dasharray=${lineStyle} stroke-linecap="round"/>
                <g class="clickable" @click=${() => this._moreInfo(config.entities.electric_power)}>
                  <circle cx="24" cy=${cy} r="17" fill="var(--ho-surface)" stroke=${running ? powerTone : "var(--ho-hairline)"} stroke-width="2"/>
                  ${powerGlyph(24, cy)}
                  <text x="24" y=${cy + 32} text-anchor="middle" font-size="11" font-weight="600" fill="var(--ho-ink)" class="mono">${running ? formatPower(electric, locale) : "–"}</text>
                  <text x="24" y=${cy + 45} text-anchor="middle" font-size="10" fill="var(--ho-muted)">${running ? this._sourceLabel(shares) : this._t("flow.power")}</text>
                </g>`
              : nothing}
            ${hasBoth
              ? svg`<path d="M${cx + r} ${cy} H206" stroke=${running ? "var(--ho-air)" : "var(--ho-track)"} stroke-width=${running ? width(air) : 2} stroke-dasharray=${lineStyle} stroke-linecap="round"/>
                <g class="clickable" @click=${() => this._moreInfo(config.entities.outdoor ?? config.entities.heat_power)}>
                  <circle cx="224" cy=${cy} r="17" fill="var(--ho-surface)" stroke=${running ? "var(--ho-air)" : "var(--ho-hairline)"} stroke-width="2"/>
                  ${airGlyph(224, cy)}
                  <text x="224" y=${cy + 32} text-anchor="middle" font-size="11" font-weight="600" fill="var(--ho-ink)" class="mono">${running ? formatPower(air, locale) : outdoor !== undefined ? `${outdoor}°` : "–"}</text>
                  <text x="224" y=${cy + 45} text-anchor="middle" font-size="10" fill="var(--ho-muted)">${running ? this._t(`ambient.${config.source}`) : this._t("flow.outside")}</text>
                </g>`
              : nothing}
            <g class="clickable" @click=${() => this._moreInfo(config.entities.heat_power)}>
              <circle cx=${cx} cy=${cy} r=${r} fill="var(--ho-surface)" stroke="var(--ho-hairline)" stroke-width="2"/>
              ${running && hasBoth ? this._ring(cx, cy, r, heat, electric, shares) : nothing}
              ${centre(cx, cy, r, 24)}
            </g>
          </svg>
          ${sinks.length
            ? html`<div class="sinks">
                ${sinks.map(
                  (s) => html`<div class="sink ${s.active ? "active" : ""}" style="--tone:${s.tone}" @click=${() => this._moreInfo(s.entity)}>
                    <span>${s.name}</span><span class="v">${s.value}${s.right ? ` · ${s.right}` : ""}${s.circulating ? ` · ${this._t("stores.circulation")}` : ""}</span>
                  </div>`
                )}
              </div>`
            : nothing}
          ${this._footBlock(running)}
        </div>
      `;
    }

    const rowH = sinks.some((s) => s.detail) ? 46 : 36;
    const gap = 8;
    const stackOf = (n: number) => (n ? n * rowH + (n - 1) * gap : 0);

    // A box for one taker; the line leaves the ring towards the box's near edge.
    const sinkNode = (sink: Sink, x: number, w: number, y: number, from: [number, number], side: 1 | -1) => {
      const mid = y + rowH / 2;
      const edge = side === 1 ? x : x + w;
      const bend = Math.max(16, Math.abs(edge - from[0]) * 0.45) * side;
      const path = `M${from[0]} ${from[1]} C ${from[0] + bend} ${from[1]}, ${edge - bend} ${mid}, ${edge} ${mid}`;
      const maxChars = Math.floor((w - 16) / (11.5 * 0.58));
      const name = sink.name.length > maxChars ? `${sink.name.slice(0, maxChars - 1)}…` : sink.name;
      return svg`
        ${sink.fed
          ? svg`<path d=${path} fill="none" stroke=${sink.tone} stroke-width=${width(heat)} stroke-linecap="round"/>
               <path d=${path} fill="none" stroke="#fff" stroke-width="3" opacity="0.85" class="flow-dash"/>`
          : svg`<path d=${path} fill="none" stroke=${sink.active ? sink.tone : "var(--ho-track)"} stroke-width="2" opacity=${sink.active ? 0.6 : 1}
              stroke-dasharray=${running ? "" : "3 5"}/>`}
        <g class="clickable" @click=${() => this._moreInfo(sink.entity)}>
          ${name !== sink.name ? svg`<title>${sink.name}</title>` : nothing}
          <rect x=${x} y=${y} width=${w} height=${rowH} rx="8"
            fill=${sink.active ? `color-mix(in srgb, ${sink.tone} 16%, var(--ho-surface))` : "var(--ho-surface)"}
            stroke=${sink.active ? sink.tone : "var(--ho-hairline)"} stroke-width="1.5"/>
          <text x=${x + 9} y=${y + 15} font-size="11.5" font-weight="600" fill="var(--ho-ink)">${name}</text>
          <text x=${x + 9} y=${y + 29} font-size="10.5" fill=${sink.active ? "var(--ho-ink)" : "var(--ho-muted)"} class="mono">${sink.value}</text>
          ${sink.right ? svg`<text x=${x + w - 7} y=${y + 29} text-anchor="end" font-size="10.5" fill="var(--ho-muted)" class="mono">${sink.right}</text>` : nothing}
          ${sink.circulating
            ? svg`<g transform="translate(${x + w - 16} ${y + 25})" aria-label=${this._t("stores.circulation")}>
                <title>${this._t("stores.circulation")} ${this._t("stores.circulation_on")}</title>
                <path d="M-5.5 0 A5.5 5.5 0 1 1 0 5.5" fill="none" stroke="var(--ho-hot-water)" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M-3.2 5.5 L0 5.5 L0 2.3" fill="none" stroke="var(--ho-hot-water)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </g>`
            : nothing}
          ${sink.detail ? svg`<text x=${x + 9} y=${y + 41} font-size="10" fill="var(--ho-muted)" class="mono">${sink.detail}</text>` : nothing}
        </g>
      `;
    };

    if (config.flow.layout === "split" && sinks.length >= 2) {
      // Stores on the left, circuits on the right: heat leaves the heat pump both ways.
      const stores = sinks.slice(0, config.stores.length);
      const circuits = sinks.slice(config.stores.length);
      const half = Math.ceil(sinks.length / 2);
      const [left, right] = stores.length && circuits.length ? [stores, circuits] : [sinks.slice(0, half), sinks.slice(half)];
      const r = 36;
      const bw = 120;
      const cx = W / 2;

      // Electricity above the heat pump, ambient heat below, each as one short line.
      const top =
        running && config.entities.electric_power
          ? { glyph: powerGlyph(0, 0), strong: `${formatPower(electric, locale)} kW`, weak: ` · ${this._sourceLabel(shares)}`, entity: config.entities.electric_power }
          : undefined;
      const bottom =
        running && hasBoth
          ? {
              glyph: airGlyph(0, 0),
              strong: `${formatPower(air, locale)} kW`,
              weak: outdoor !== undefined ? ` · ${outdoor} °C` : ` · ${this._t(`ambient.${config.source}`)}`,
              entity: config.entities.outdoor ?? config.entities.heat_power
            }
          : outdoor !== undefined
            ? { glyph: airGlyph(0, 0), strong: `${outdoor} °C`, weak: ` ${this._t("flow.outside")}`, entity: config.entities.outdoor }
            : undefined;

      const reach = r + (top || bottom ? 22 : 6);
      const H = Math.max(stackOf(left.length), stackOf(right.length), 2 * reach) + 8;
      const cy = H / 2;
      const label = (line: { glyph: TemplateResult; strong: string; weak: string; entity?: string } | undefined, y: number) => {
        if (!line) return nothing;
        const size = 11;
        const textW = (line.strong.length + line.weak.length) * size * 0.56;
        const x0 = cx - (textW + 17) / 2;
        return svg`<g class="clickable source-line" @click=${() => this._moreInfo(line.entity)}>
          <g transform="translate(${x0 + 6} ${y - 4}) scale(0.6)">${line.glyph}</g>
          <text x=${x0 + 17} y=${y} font-size=${size} class="mono"><tspan font-weight="600" fill="var(--ho-ink)">${line.strong}</tspan><tspan fill="var(--ho-muted)">${line.weak}</tspan></text>
        </g>`;
      };
      const leftY0 = cy - stackOf(left.length) / 2;
      const rightY0 = cy - stackOf(right.length) / 2;

      return html`
        <div class="section">
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${this._modeLabel(mode.kind, mode.raw)}">
            ${left.map((s, i) => sinkNode(s, 1, bw, leftY0 + i * (rowH + gap), [cx - r, cy], -1))}
            ${right.map((s, i) => sinkNode(s, W - bw - 1, bw, rightY0 + i * (rowH + gap), [cx + r, cy], 1))}
            <g class="clickable" @click=${() => this._moreInfo(config.entities.heat_power)}>
              <circle cx=${cx} cy=${cy} r=${r} fill="var(--ho-surface)" stroke="var(--ho-hairline)" stroke-width="2"/>
              ${running && hasBoth ? this._ring(cx, cy, r, heat, electric, shares) : nothing}
              ${centre(cx, cy, r, 23)}
            </g>
            ${label(top, cy - r - 9)}
            ${label(bottom, cy + r + 17)}
          </svg>
          ${this._footBlock(running)}
        </div>
      `;
    }

    const stack = stackOf(sinks.length);
    const H = Math.max(200, stack + 8);
    const cy = H / 2;
    const cx = 150;
    const r = 38;
    const sinkX = 238;
    const sinkW = W - sinkX;
    const y0 = cy - stack / 2;
    const spreadY = Math.min(62, Math.max(50, H * 0.26));
    const powerY = cy - spreadY;
    const airY = cy + spreadY;

    const inputs: TemplateResult[] = [];
    if (config.entities.electric_power) {
      inputs.push(svg`
        <path d="M54 ${powerY} C 94 ${powerY}, 92 ${cy - 10}, ${cx - r + 2} ${cy - 10}" fill="none"
          stroke=${running ? powerTone : "var(--ho-track)"} stroke-width=${running ? width(electric) : 2} stroke-dasharray=${lineStyle} stroke-linecap="round"/>
        <g class="clickable" @click=${() => this._moreInfo(config.entities.electric_power)}>
          <circle cx="36" cy=${powerY} r="18" fill="var(--ho-surface)" stroke=${running ? powerTone : "var(--ho-hairline)"} stroke-width="2"/>
          ${powerGlyph(36, powerY)}
          ${running
            ? svg`<text x="36" y=${powerY + 33} text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--ho-ink)" class="mono">${formatPower(electric, locale)} kW</text>`
            : nothing}
          <text x="36" y=${powerY + (running ? 46 : 33)} text-anchor="middle" font-size="10.5" fill="var(--ho-muted)">${running ? `${this._t("flow.power")} · ${this._sourceLabel(shares)}` : this._t("flow.power")}</text>
        </g>`);
    }
    if (hasBoth) {
      inputs.push(svg`
        <path d="M54 ${airY} C 94 ${airY}, 92 ${cy + 10}, ${cx - r + 2} ${cy + 10}" fill="none"
          stroke=${running ? "var(--ho-air)" : "var(--ho-track)"} stroke-width=${running ? width(air) : 2} stroke-dasharray=${lineStyle} stroke-linecap="round"/>
        <g class="clickable" @click=${() => this._moreInfo(config.entities.outdoor ?? config.entities.heat_power)}>
          <circle cx="36" cy=${airY} r="18" fill="var(--ho-surface)" stroke=${running ? "var(--ho-air)" : "var(--ho-hairline)"} stroke-width="2"/>
          ${airGlyph(36, airY)}
          <text x="36" y=${airY + 33} text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--ho-ink)" class="mono">${running ? `${formatPower(air, locale)} kW` : outdoor !== undefined ? `${outdoor} °C` : ""}</text>
          <text x="36" y=${airY + 46} text-anchor="middle" font-size="10.5" fill="var(--ho-muted)">${running ? `${this._t(`ambient.${config.source}`)}${outdoor !== undefined ? ` ${outdoor} °C` : ""}` : this._t("flow.outside")}</text>
        </g>`);
    }

    const sinkNodes = sinks.map((sink, i) => sinkNode(sink, sinkX, sinkW - 1, y0 + i * (rowH + gap), [cx + r, cy], 1));

    return html`
      <div class="section">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${this._modeLabel(mode.kind, mode.raw)}">
          ${inputs}
          ${sinkNodes}
          <g class="clickable" @click=${() => this._moreInfo(config.entities.heat_power)}>
            <circle cx=${cx} cy=${cy} r=${r} fill="var(--ho-surface)" stroke="var(--ho-hairline)" stroke-width="2"/>
            ${running && hasBoth ? this._ring(cx, cy, r, heat, electric, shares) : nothing}
            ${centre(cx, cy, r, 25)}
          </g>
        </svg>
        ${this._footBlock(running)}
      </div>
    `;
  }

  // ─── day band ──────────────────────────────────────────────

  private _showTip(event: Event, text: TemplateResult) {
    const card = this.shadowRoot?.querySelector("ha-card");
    const target = event.currentTarget as Element | null;
    if (!card || !target) return;
    const box = card.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    this._tip = { x: r.left + r.width / 2 - box.left, y: r.top - box.top, text };
  }

  private _hideTip() {
    this._tip = undefined;
  }

  private _segmentFill(kind: Segment["kind"]): string {
    if (kind === "blocked") return "url(#ho-hatch)";
    if (kind === "defrost") return "url(#ho-defrost)";
    return TONE[kind];
  }

  private _patterns() {
    return svg`<defs>
      <pattern id="ho-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill="var(--ho-track)"/>
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ho-muted)" stroke-width="1.4"/>
      </pattern>
      <pattern id="ho-defrost" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill="var(--ho-defrost)" opacity="0.45"/>
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ho-defrost)" stroke-width="2"/>
      </pattern>
    </defs>`;
  }

  private _renderDay() {
    const config = this._config as ResolvedConfig;
    const days = this._days();
    if (!days) {
      return html`<div class="section"><div class="section-head"><span>${this._t("day.title")}</span></div><div class="loading">${this._t("day.loading")}</div></div>`;
    }

    const locale = this._locale;
    const two = config.day.days === 2;
    // A narrow card shrinks the drawing; its words must not shrink with it.
    const ts = this._narrow ? 1.45 : 1;
    const X0 = two ? 52 * ts : 4;
    const X1 = W - 4;
    const span = X1 - X0;
    const hasPv = Boolean(config.entities.solar) && Object.values(this._pv).some((row) => row.some((v) => v !== undefined));
    const PV_H = hasPv ? 18 : 0;
    const STRIP = 13;
    const ROW = PV_H + STRIP + 16 * ts;
    const H = days.length * ROW + 14 * ts;
    const pvMax = Math.max(1, ...Object.values(this._pv).flat().filter((v): v is number => v !== undefined));
    const xh = (h: number) => X0 + (h / 24) * span;

    const guides = [6, 12, 18].map(
      (h) => svg`<line x1=${xh(h)} x2=${xh(h)} y1="2" y2=${H - 14 * ts} stroke="var(--ho-hairline)" stroke-width="1" stroke-dasharray="2 3"/>`
    );

    const rows = days.map((day, i) => {
      const x = (t: number) => X0 + ((t - day.start) / DAY) * span;
      const top = 4 + i * ROW;
      const base = top + PV_H;
      const stripY = base + 3;
      const isToday = i === days.length - 1;

      let pvPaths: TemplateResult | typeof nothing = nothing;
      const pv = this._pv[day.start];
      if (hasPv && pv) {
        const pts = pv
          .map((kw, h) => (kw === undefined ? undefined : ([x(day.start + h * 3600000 + 1800000), base - (Math.max(0, kw) / pvMax) * PV_H] as const)))
          .filter((p): p is readonly [number, number] => p !== undefined);
        if (pts.length > 1) {
          const edge = pts.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
          pvPaths = svg`
            <path d="M${pts[0][0].toFixed(1)},${base} ${edge.replace(/^M/, "L")} L${pts[pts.length - 1][0].toFixed(1)},${base} Z" fill="var(--ho-sun)" opacity="0.18"/>
            <path d=${edge} fill="none" stroke="var(--ho-sun)" stroke-width="1.5" stroke-linejoin="round"/>`;
        }
      }

      const segs = day.segments.map((seg, k) => {
        const prev = day.segments[k - 1];
        const next = day.segments[k + 1];
        const x0 = x(seg.from) + (prev && prev.to === seg.from ? 1 : 0);
        const x1 = x(seg.to) - (next && next.from === seg.to ? 1 : 0);
        const w = Math.max(2, x1 - x0);
        const text = html`<b>${this._t(`kind.${seg.kind}`)}</b> ${clock(new Date(seg.from), locale)}–${clock(new Date(seg.to), locale)} · ${this._spanText((seg.to - seg.from) / 60000)}`;
        return svg`<rect class="seg" tabindex="0" x=${x0} y=${stripY} width=${w} height=${STRIP} rx=${w > 6 ? 2 : 1}
          fill=${this._segmentFill(seg.kind)}
          @pointerenter=${(e: Event) => this._showTip(e, text)} @pointerleave=${this._hideTip}
          @focus=${(e: Event) => this._showTip(e, text)} @blur=${this._hideTip}></rect>`;
      });

      const marks = day.shortRuns.map((run) => {
        const text = html`<b>${this._t("day.short_run")}</b> ${clock(new Date(run.from), locale)} · ${this._t("day.short_run_text", {
          kind: this._t(`kind.${run.kind}`),
          span: this._spanText((run.to - run.from) / 60000)
        })}`;
        return svg`<path class="seg short-mark" tabindex="0" d="M${x(run.from) + 1},${stripY - 1} l-5,-8 h10 z" fill="var(--ho-warn)"
          @pointerenter=${(e: Event) => this._showTip(e, text)} @pointerleave=${this._hideTip}
          @focus=${(e: Event) => this._showTip(e, text)} @blur=${this._hideTip}></path>`;
      });

      const openToday = isToday && day.end < day.start + DAY;
      return svg`
        ${two ? svg`<text x="0" y=${stripY + 10} font-size=${10.5 * ts} fill="var(--ho-muted)">${this._t(isToday ? "day.today" : "day.yesterday")}</text>` : nothing}
        ${pvPaths}
        <rect x=${X0} y=${stripY} width=${span} height=${STRIP} rx="3" fill="var(--ho-track)"/>
        ${openToday
          ? svg`<rect x=${x(day.end)} y=${stripY} width=${Math.max(0, X1 - x(day.end))} height=${STRIP} rx="3" fill="var(--ho-surface)" stroke="var(--ho-track)" stroke-dasharray="2 3"/>`
          : nothing}
        ${segs}
        ${marks}
        ${openToday ? svg`<line x1=${x(day.end)} x2=${x(day.end)} y1=${stripY - 3} y2=${stripY + STRIP + 3} stroke="var(--ho-ink)" stroke-width="1.5"/>` : nothing}
      `;
    });

    const axis = [0, 6, 12, 18, 24].map(
      (h) =>
        svg`<text x=${xh(h)} y=${H - 2} font-size=${9 * ts} fill="var(--ho-muted)" class="mono" text-anchor=${h === 0 ? "start" : h === 24 ? "end" : "middle"}>${String(h).padStart(2, "0")}</text>`
    );

    const today = days[days.length - 1];
    const yesterday = two ? days[0] : undefined;
    const kindsSeen = new Set(days.flatMap((d) => d.segments.map((s) => s.kind)));
    const legendOrder: Segment["kind"][] = ["heating", "hot_water", "cooling", "defrost", "blocked"];
    const third = today.minutes.cooling !== undefined && today.minutes.heating === undefined ? "cooling" : "heating";
    const shortToday = today.shortRuns.length;
    const shortYesterday = yesterday?.shortRuns.length ?? 0;

    // Performance factors under the running times: today's from the energy
    // counters, set against the month's (or the year's) so a change stands out.
    const e = config.entities;
    const kwh = (id: string | undefined) => energyKwh(stateOf(this.hass, id));
    const factor = (heat: number | undefined, electric: number | undefined) =>
      heat !== undefined && electric !== undefined && electric > 0.05 ? heat / electric : undefined;
    const perf = (today: number | undefined, month: number | undefined, year: number | undefined, entity: string | undefined) => {
      const ref = month ?? year;
      if (today === undefined && ref === undefined) return nothing;
      const diff = today !== undefined && ref !== undefined ? today - ref : 0;
      const arrow = Math.abs(diff) >= 0.5 ? (diff > 0 ? "▲" : "▼") : "";
      return html`<span class="stat-sub clickable" @click=${() => this._moreInfo(entity)}>
        ${today !== undefined
          ? html`<span>${this._t("cop.az")} <b>${this._one(today)}</b>${arrow ? html`<i>${arrow}</i>` : nothing}</span>`
          : nothing}
        ${ref !== undefined ? html`<span>${this._t(month !== undefined ? "cop.month" : "cop.year")} ${this._one(ref)}</span>` : nothing}
      </span>`;
    };
    const heatingPerf = perf(
      factor(kwh(e.heating_heat_today), kwh(e.heating_electric_today)),
      this._num(e.cop_heating_month),
      this._num(e.cop_heating_year),
      e.heating_heat_today ?? e.cop_heating_month ?? e.cop_heating_year
    );
    const waterPerf = perf(
      factor(kwh(e.hot_water_heat_today), kwh(e.hot_water_electric_today)),
      this._num(e.cop_hot_water_month),
      this._num(e.cop_hot_water_year),
      e.hot_water_heat_today ?? e.cop_hot_water_month ?? e.cop_hot_water_year
    );
    // Heat pumps that count only totals get one factor, under the starts.
    const totalPerf =
      heatingPerf === nothing && waterPerf === nothing ? perf(factor(kwh(e.heat_today), kwh(e.electric_today)), undefined, undefined, e.heat_today) : nothing;

    return html`
      <div class="section">
        <div class="section-head"><span>${this._t("day.title")}</span></div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${this._t("day.title")}">
          ${this._patterns()}
          ${guides}
          ${rows}
          ${axis}
        </svg>
        <div class="legend">
          ${legendOrder
            .filter((k) => kindsSeen.has(k))
            .map(
              (k) => html`<span><i class="sw ${k === "blocked" ? "hatch" : k === "defrost" ? "defrost" : ""}"
                  style=${k === "blocked" || k === "defrost" ? "" : `background:${TONE[k]}`}></i>${this._t(`kind.${k}`)}</span>`
            )}
          ${hasPv ? html`<span><i class="sw pv"></i>${this._t("day.pv")}</span>` : nothing}
        </div>
        <div class="stats">
          <div class="stat"><span class="stat-k">${this._t("day.starts")}</span><span class="stat-v">${today.starts}</span>${totalPerf}</div>
          ${config.day.short_run > 0
            ? html`<div class="stat ${shortToday + shortYesterday > 0 ? "warn" : ""}">
                <span class="stat-k">${this._t("day.short_runs")}</span>
                <span class="stat-v"
                  >${shortToday + shortYesterday > 0
                    ? html`<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5 L13 12.5 H1 Z" fill="var(--ho-warn)"/></svg>`
                    : nothing}${shortToday}${shortYesterday > 0 ? html`<small>${this._t("day.yesterday")} ${shortYesterday}</small>` : nothing}</span
                >
              </div>`
            : nothing}
          <div class="stat"><span class="stat-k">${this._t("kind.hot_water")}</span><span class="stat-v">${this._hm(today.minutes.hot_water ?? 0)}</span>${waterPerf}</div>
          <div class="stat"><span class="stat-k">${this._t(`kind.${third}`)}</span><span class="stat-v">${this._hm(today.minutes[third] ?? 0)}</span>${third === "heating" ? heatingPerf : nothing}</div>
        </div>
        ${config.day.cycling_from > 0 && shortToday >= config.day.cycling_from
          ? html`<div class="alert">
              <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5 L13 12.5 H1 Z" fill="none" stroke="var(--ho-warn)" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 5.5 V8.5 M7 10.4 V10.6" stroke="var(--ho-warn)" stroke-width="1.6" stroke-linecap="round"/></svg>
              <span>${this._t("day.cycling", { n: String(shortToday) })}</span>
            </div>`
          : nothing}
      </div>
    `;
  }

  // ─── stores ────────────────────────────────────────────────

  private _storeState(store: StoreConfig & { kind: StoreKind }, top: number | undefined): { text: string; tone: string } | undefined {
    const mode = this._mode();
    if ((store.kind === "hot_water" && mode.kind === "hot_water") || (store.kind === "buffer" && mode.kind === "heating"))
      return { text: this._t("stores.charging"), tone: STORE_TONE[store.kind] };
    if (top === undefined || !store.marks) return undefined;
    const m = store.marks;
    if (m.pv !== undefined && top >= m.pv) return { text: this._t("stores.pv_reached"), tone: "var(--ho-sun)" };
    if (m.target !== undefined && top >= m.target) return { text: this._t("stores.target_reached"), tone: "var(--ho-ink)" };
    if (m.eco !== undefined && top < m.eco) return { text: this._t("stores.below_eco"), tone: "var(--ho-warn)" };
    if (m.target !== undefined)
      return { text: this._t("stores.below", { k: this._one(m.target - top), mark: this._t("mark.target") }), tone: "var(--ho-warn)" };
    return undefined;
  }

  private _renderStores() {
    const config = this._config as ResolvedConfig;
    if (!config.stores.length) return nothing;
    const locale = this._locale;
    let totalUsable = 0;
    let anyVolume = false;
    const ramp = (t: number, tone: string) => {
      const p = Math.round(Math.min(1, Math.max(0, (t - 25) / 35)) * 100);
      return `color-mix(in srgb, ${tone} ${p}%, var(--ho-cold))`;
    };

    const rows = config.stores.map((store) => {
      const top = this._num(store.top);
      const bottom = this._num(store.bottom);
      const tone = STORE_TONE[store.kind];
      const state = this._storeState(store, top);
      const mean = top !== undefined && bottom !== undefined ? (top + bottom) / 2 : top;
      const floor = store.usable_min ?? (store.kind === "hot_water" ? 40 : 30);
      const ceiling = store.marks?.pv ?? store.marks?.max ?? store.marks?.target ?? 60;
      // The tank is a level gauge: empty at the usable minimum, full at the highest mark.
      const span = ceiling - floor;
      const level = (t: number) => (span > 0 ? Math.min(1, Math.max(0, (t - floor) / span)) : 0);
      const pct = mean !== undefined ? level(mean) : undefined;
      let energy: TemplateResult | typeof nothing = nothing;
      if (store.volume && mean !== undefined) {
        anyVolume = true;
        const usable = Math.max(0, (store.volume * 1.163 * (mean - floor)) / 1000);
        totalUsable += usable;
        energy = html`<div class="store-energy">
          <span class="store-kwh">${this._one(usable)}<small>kWh</small></span>
          <span class="store-above">${this._t("stores.above", { t: formatNumber(floor, locale, floor % 1 ? 1 : 0) })}</span>
        </div>`;
      }
      const ticks = (["eco", "target", "pv", "max"] as const)
        .map((k) => store.marks?.[k])
        .filter((v): v is number => v !== undefined && v > floor && v < ceiling)
        .map((v) => html`<span class="tick" style="bottom:${(level(v) * 100).toFixed(1)}%"></span>`);
      const layering = top !== undefined && bottom !== undefined ? top - bottom : undefined;
      const sub =
        bottom !== undefined
          ? `${this._t("flow.bottom")} ${formatTemp(bottom, locale)} · ${layering !== undefined && Math.abs(layering) >= 0.5 ? `Δ ${this._one(layering)} K` : this._t("stores.even")}`
          : undefined;
      const loopTemp = this._temp(store.circulation);
      const loopOn = store.circulation_pump ? this._isOn(store.circulation_pump) : undefined;
      const circulation =
        loopTemp !== undefined || loopOn !== undefined
          ? html`<span class="store-sub ${loopOn ? "loop-on" : ""}">${this._t("stores.circulation")}${loopTemp !== undefined ? ` ${loopTemp} °C` : ""}${
              loopOn !== undefined ? ` · ${this._t(loopOn ? "stores.circulation_on" : "stores.circulation_off")}` : ""
            }</span>`
          : nothing;
      const marks = (["eco", "target", "pv", "max"] as const)
        .filter((k) => store.marks?.[k] !== undefined)
        .map((k) => {
          const v = store.marks![k]!;
          const reached = top !== undefined && top >= v;
          return html`<span class="mark ${reached ? "reached" : ""}" style="--tone:${k === "pv" ? "var(--ho-sun)" : tone}"
            >${this._t(`mark.${k}`)} ${formatNumber(v, locale, v % 1 ? 1 : 0)}</span
          >`;
        });

      return html`<div class="store" @click=${() => this._moreInfo(store.top)}>
        <div class="tank" role="img" aria-label="${store.name}${pct !== undefined ? `: ${formatNumber(pct * 100, locale, 0)} %` : ""}">
          ${pct !== undefined
            ? html`<span class="fill" style="height:${(pct * 100).toFixed(1)}%; background: linear-gradient(to top, ${ramp(bottom ?? top ?? 25, tone)}, ${ramp(top ?? 25, tone)})"></span>`
            : nothing}
          ${ticks}
        </div>
        <div class="store-info">
          <span class="store-name">${store.name}</span>
          <span class="store-temp">${top !== undefined ? formatTemp(top, locale) : "–"}<small>°C</small></span>
          ${state ? html`<span class="store-state" style="color:${state.tone}">${state.text}</span>` : nothing}
          ${sub ? html`<span class="store-sub">${sub}</span>` : nothing}
          ${circulation}
        </div>
        ${energy}
        ${marks.length ? html`<div class="marks">${marks}</div>` : nothing}
      </div>`;
    });


    return html`
      <div class="section">
        <div class="section-head">
          <span>${this._t("stores.title")}</span>
          ${anyVolume ? html`<b>≈ ${this._one(totalUsable)} kWh ${this._t("stores.usable")}</b>` : nothing}
        </div>
        ${rows}
      </div>
    `;
  }

  // ─── compact ───────────────────────────────────────────────

  private _renderCompact() {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const mode = this._mode();
    const live = this._live();
    const running = isRunning(mode.kind);

    const hotWater = config.stores.find((s) => s.kind === "hot_water");
    let figure = mode.kind === "hot_water" && hotWater ? this._num(hotWater.top) : undefined;
    let figureId = hotWater?.top;
    if (figure === undefined && (mode.kind === "heating" || mode.kind === "cooling")) {
      figure = this._num(config.entities.flow);
      figureId = config.entities.flow;
    }
    if (figure === undefined) {
      figure = this._num(config.stores[0]?.top) ?? this._num(config.entities.outdoor);
      figureId = config.stores[0]?.top ?? config.entities.outdoor;
    }

    const sub: string[] = [];
    if (running) sub.push(this._sourceLabel(this._shares(live.electric)));
    if (running && live.cop !== undefined) sub.push(`COP ${formatNumber(live.cop, locale, 1)}`);
    const outdoor = this._temp(config.entities.outdoor);
    if (outdoor !== undefined && figureId !== config.entities.outdoor) sub.push(`${this._t("flow.outdoor")} ${outdoor} °C`);

    const today = this._days()?.at(-1);
    const x = (t: number) => (today ? ((t - today.start) / DAY) * W : 0);

    return html`
      <ha-card class="compact ${config.font === "system" ? "font-system" : ""}" style="--tone:${TONE[mode.kind]}">
        <span class="glyph" aria-hidden="true">${this._glyph(mode.kind)}</span>
        <span class="words" @click=${() => this._moreInfo(config.entities.mode)}>
          <span class="state">${this._modeLabel(mode.kind, mode.raw)}</span>
          ${sub.length ? html`<span class="sub">${sub.join(" · ")}</span>` : nothing}
        </span>
        ${figure !== undefined
          ? html`<span class="big clickable" @click=${() => this._moreInfo(figureId)}>${formatTemp(figure, locale)}<small>°C</small></span>`
          : nothing}
        ${today
          ? html`<svg class="strip" viewBox="0 0 ${W} 12" role="img" aria-label="${this._t("day.today")}">
              ${this._patterns()}
              <rect x="0" y="4" width=${W} height="5" rx="2.5" fill="var(--ho-track)"/>
              ${today.segments.map(
                (seg) => svg`<rect x=${x(seg.from) + 0.5} y="4" width=${Math.max(1.5, x(seg.to) - x(seg.from) - 1)} height="5" rx="1.5" fill=${this._segmentFill(seg.kind)}/>`
              )}
              <line x1=${x(today.end)} x2=${x(today.end)} y1="1" y2="12" stroke="var(--ho-ink)" stroke-width="1.5"/>
            </svg>`
          : nothing}
      </ha-card>
    `;
  }

  private _glyph(kind: ModeKind) {
    if (kind === "hot_water")
      return html`<svg viewBox="0 0 20 20"><path d="M10 2.5 C 13.5 7, 15 9.5, 15 12.2 A5 5 0 0 1 5 12.2 C 5 9.5, 6.5 7, 10 2.5 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    if (kind === "heating")
      return html`<svg viewBox="0 0 20 20"><path d="M6 16 C 3 12, 8 10, 7 5 C 10 7, 10 9, 10 10 C 11 8, 12 7, 12 5 C 16 9, 17 13, 14 16 Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
    if (kind === "cooling" || kind === "defrost")
      return html`<svg viewBox="0 0 20 20"><path d="M10 2 V18 M3 6 L17 14 M17 6 L3 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
    return html`<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.5 V10 L12.5 11.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  }
}

if (!customElements.get(CARD_TYPE)) {
  customElements.define(CARD_TYPE, HeatOriginCard);
}

void import("./editor").then(({ HeatOriginCardEditor }) => {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(`${CARD_TYPE}-editor`)) {
    customElements.define(`${CARD_TYPE}-editor`, HeatOriginCardEditor);
  }
});

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TYPE,
  name: localize("card.name"),
  description: localize("card.description"),
  preview: true,
  documentationURL: "https://github.com/hoizi89/heat-origin-card"
});
