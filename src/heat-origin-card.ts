import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import { CARD_TYPE, assertConfig, resolveConfig, stubConfig } from "./config";
import { W as DRAW_W, T as TYPE, box, branch, bypass, connector, dial, spine, type BoxModel, type DialSegment, type Tone } from "./flow-draw";
import { icon as iconMark } from "./icons";
import { coarseSpan, hoursLeft, parseTrend, slopePerHour, type TrendPoint } from "./trend";
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

/** A symbol for a foot line: its own element, because the foot is HTML, not a drawing. */
function mark(kind: "bolt" | "air" | "drop", tone: string) {
  const body =
    kind === "bolt"
      ? svg`<path d="M9.2 1 L3.2 9.2 H7.4 L6.4 15 L12.8 6.6 H8.6 Z" fill=${tone}/>`
      : kind === "air"
        ? svg`<path d="M1.5 5 H9 a2.6 2.6 0 1 0 -2.6 -2.6 M1.5 8.5 H12.6 M1.5 12 H7.4 a2.6 2.6 0 1 1 -2.6 2.6"
            fill="none" stroke=${tone} stroke-width="1.6" stroke-linecap="round"/>`
        : svg`<path d="M8 1.4 C11.4 5.9, 12.9 8.4, 12.9 11.1 A4.9 4.9 0 0 1 3.1 11.1 C3.1 8.4, 4.6 5.9, 8 1.4 Z"
            fill="none" stroke=${tone} stroke-width="1.7" stroke-linejoin="round"/>`;
  return html`<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">${body}</svg>`;
}

const PALETTE: Tone = {
  ink: "var(--ho-ink)",
  muted: "var(--ho-muted)",
  hairline: "var(--ho-hairline)",
  track: "var(--ho-track)",
  surface: "var(--ho-surface)",
  sun: "var(--ho-sun)"
};

/** The drawing's grid. The blocks set the height; the circle only has to fit inside it. */
const BOX_H = 64;
const BOX_GAP = 28;
const BOX_W = 116;
const R_PUMP = 30;
/** The heat pump rides above the middle, which frees the corridor under it. */
const PUMP_LIFT = 10;
const TREND_WINDOW = 20 * 60 * 1000;

/**
 * Two columns. The heat pump takes the head of the left one and hot water hangs under
 * it; the whole heating group — the buffer, then the circuits it feeds — owns the
 * right one. Three things beside each other leave 116 px each; two leave 171, which is
 * where the figures stop being cramped. And with the buffer standing next to the
 * circuits it carries, its line to them is a run down the column instead of a route
 * around the drawing.
 */
const COL_W = 171;
const COL_R = 196;
const COL_GAP = 8;
const R_COL_PUMP = 44;

interface Tip {
  x: number;
  y: number;
  text: TemplateResult;
}

type Shares = Partial<Record<ElectricSource, number>>;

export class HeatOriginCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _points: { state: true },
    _pv: { state: true },
    _tip: { state: true },
    _narrow: { state: true },
    _trend: { state: true }
  };

  static styles = cardStyles;

  hass?: HomeAssistant;
  private _config?: ResolvedConfig;
  private _points?: StatePoint[];
  private _pv: Record<number, Array<number | undefined>> = {};
  /** Each store's own temperature over the last while, for how long it still lasts. */
  private _trend: Record<string, TrendPoint[]> = {};
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
      const tops = config.stores.map((store) => store.top).filter(Boolean);
      const since = Date.now() - TREND_WINDOW;
      const [history, trends] = await Promise.all([
        hass.callWS({
          type: "history/history_during_period",
          start_time: start.toISOString(),
          end_time: now.toISOString(),
          entity_ids: [config.entities.mode],
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false
        }),
        tops.length
          ? hass.callWS({
              type: "history/history_during_period",
              start_time: new Date(since).toISOString(),
              end_time: now.toISOString(),
              entity_ids: tops,
              minimal_response: true,
              no_attributes: true,
              significant_changes_only: false
            })
          : Promise.resolve(undefined)
      ]);
      this._points = parseHistory(history, config.entities.mode);
      const trend: Record<string, TrendPoint[]> = {};
      for (const id of tops) trend[id] = parseTrend(trends, id, since);
      this._trend = trend;
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

  // ─── how long a store lasts ────────────────────────────────

  /**
   * The lowest temperature still worth something. A shower needs 40 °C whatever the
   * season, so hot water keeps its fixed floor; a buffer is only useful while it is
   * warmer than the circuit it feeds, and that moves with the weather. Measuring a
   * buffer against a fixed 30 °C says it is empty on a September morning when it is
   * carrying the house, and that it is full in January when it cannot.
   */
  private _floor(store: StoreConfig & { kind: StoreKind }): number {
    if (store.usable_min !== undefined) return store.usable_min;
    if (store.kind === "hot_water") return 40;
    const config = this._config as ResolvedConfig;
    let warmest: number | undefined;
    for (const circuit of config.circuits) {
      if (circuit.kind !== "heating" || !this._circuitActive(circuit)) continue;
      const flow = this._num(circuit.flow ?? circuit.temperature);
      if (flow !== undefined && (warmest === undefined || flow > warmest)) warmest = flow;
    }
    return warmest ?? 30;
  }

  private _ceiling(store: StoreConfig & { kind: StoreKind }, floor: number): number {
    if (store.usable_max !== undefined) return store.usable_max;
    const marks = store.marks ?? {};
    const highest = Math.max(...[marks.max, marks.pv, marks.target, marks.eco].filter((v): v is number => v !== undefined), -Infinity);
    if (Number.isFinite(highest) && highest > floor) return highest;
    // Hot water is nearly always marked; a heating buffer rarely is, and a heat pump
    // pushes one to about twenty kelvin over what the circuits need.
    return floor + (store.kind === "buffer" ? 20 : 12);
  }

  private _mean(store: StoreConfig): number | undefined {
    const top = this._num(store.top);
    const bottom = this._num(store.bottom);
    if (top === undefined) return undefined;
    return bottom === undefined ? top : (top + bottom) / 2;
  }

  /** Litres of water carry 1.163 Wh per kelvin; above the floor that is what is left. */
  private _usable(store: StoreConfig & { kind: StoreKind }, floor: number): number | undefined {
    const mean = this._mean(store);
    if (store.volume === undefined || mean === undefined) return undefined;
    return Math.max(0, (store.volume * 1.163 * (mean - floor)) / 1000);
  }

  /** The measured fall, in kelvin per hour, or nothing when the recorder was quiet. */
  private _fall(store: StoreConfig): number | undefined {
    return slopePerHour(this._trend[store.top] ?? []);
  }

  /** The power being taken out of a store: its litres times how fast it is cooling. */
  private _draw(store: StoreConfig): number | undefined {
    const config = this._config as ResolvedConfig;
    const fall = this._fall(store);
    if (store.volume === undefined || fall === undefined || fall < config.forecast_min_slope) return undefined;
    return (store.volume * 1.163 * fall) / 1000;
  }

  private _spanWords(hours: number): string {
    const coarse = coarseSpan(hours);
    return [
      coarse.hours !== undefined ? `${coarse.hours} ${this._t("unit.h")}` : "",
      coarse.minutes ? `${coarse.minutes}${coarse.hours !== undefined ? "" : ` ${this._t("unit.min")}`}` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  /** How long until this store drops to the temperature that makes it useless. */
  private _lasts(store: StoreConfig & { kind: StoreKind }, floor: number): string | undefined {
    const config = this._config as ResolvedConfig;
    const mean = this._mean(store);
    if (mean === undefined) return undefined;
    const hours = hoursLeft(mean, floor, this._fall(store), config.forecast_min_slope);
    if (hours === undefined) return undefined;
    return this._t("flow.lasts", { span: this._spanWords(hours) });
  }

  /**
   * When a store will reach one of its own marks, from the fall it is measuring on
   * itself. It says that and no more: whether the heat pump then starts is not the
   * card's to know — a surplus of sun may have it charge to the PV mark hours earlier,
   * and an eco setting may let it sink further. So the line names the mark it is
   * counting down to rather than promising a start, and `due_at` chooses which mark.
   */
  private _hotWaterDue(): string | undefined {
    const config = this._config as ResolvedConfig;
    const store = config.stores.find((st) => st.kind === "hot_water");
    if (!store) return undefined;
    const key = store.due_at ?? "eco";
    const at = store.marks?.[key];
    if (at === undefined) return undefined;
    if (this._mode().kind === "hot_water") return undefined;
    const top = this._num(store.top);
    if (top === undefined) return undefined;
    const mark = this._t(`mark.${key}`);
    if (top <= at) return this._t("store.due", { mark });
    const hours = hoursLeft(top, at, this._fall(store), config.forecast_min_slope);
    if (hours === undefined) return undefined;
    return this._t("store.due_in", { mark, span: this._spanWords(hours) });
  }

  private _circuitActive(circuit: ResolvedConfig["circuits"][number]): boolean {
    const raw = stateOf(this.hass, circuit.state)?.state;
    const pumpOn = circuit.pump ? this._isOn(circuit.pump) : undefined;
    return pumpOn ?? circuitActive(raw, circuit.active);
  }

  /**
   * Which circuits the buffer is carrying on its own. Everything it needs is already
   * configured: a store marked as a buffer, a heat pump that is not heating, and a
   * circuit that says it is taking heat. No extra sensor, no extra setting.
   */
  private _fromBuffer(): { store: ResolvedConfig["stores"][number]; circuits: number[] } | undefined {
    const config = this._config as ResolvedConfig;
    if (!config.flow.bypass) return undefined;
    const store = config.stores.find((st) => st.kind === "buffer");
    if (!store) return undefined;
    if (this._mode().kind === "heating") return undefined;
    const circuits: number[] = [];
    config.circuits.forEach((circuit, index) => {
      if (circuit.kind === "heating" && this._circuitActive(circuit)) circuits.push(index);
    });
    return circuits.length ? { store, circuits } : undefined;
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
    const running = isRunning(mode.kind);
    const carried = this._fromBuffer();
    const chips: TemplateResult[] = [];

    // A heat pump at rest has nothing to announce: the middle of the circle already
    // says when it last ran and for how long. "Ready" is a word about nothing.
    if (running || mode.kind === "blocked") {
      const last = running ? undefined : lastRun(this._days()?.at(-1));
      const sinceAt = last && mode.since !== undefined && last.to <= mode.since ? last.to : mode.since;
      const since =
        !carried && sinceAt !== undefined && Date.now() - sinceAt < DAY
          ? ` · ${this._t("flow.since", { time: clock(new Date(sinceAt), this._locale) })}`
          : "";
      chips.push(html`<span class="chip ${running ? "live" : ""}" style="--tone:${TONE[mode.kind]}"
        @click=${() => this._moreInfo(this._config?.entities.mode)}><i></i>${this._modeLabel(mode.kind, mode.raw)}${since}</span>`);
    }

    if (carried) {
      const config = this._config as ResolvedConfig;
      const names = carried.circuits.map((i) => config.circuits[i]?.name).filter(Boolean);
      const what =
        names.length === 1
          ? this._t("flow.bypass_to", { to: String(names[0]) })
          : this._t("flow.bypass_many", { n: String(names.length) });
      const floor = this._floor(carried.store);
      const lasts = config.flow.range && config.flow.layout === "columns" ? this._lasts(carried.store, floor) : undefined;
      chips.push(html`<span class="chip live" style="--tone:var(--ho-heating)"
        @click=${() => this._moreInfo(carried.store.top)}><i></i>${what}${lasts ? ` · ${lasts}` : ""}</span>`);
    }

    return chips.length ? html`<span class="chips">${chips}</span>` : nothing;
  }

  private _renderHead() {
    const config = this._config as ResolvedConfig;
    return html`<div class="head">
      <p class="title">${config.title ?? this._t("card.title")}</p>
      ${this._chip()}
    </div>`;
  }

  // ─── flow ──────────────────────────────────────────────────

  /** Every store and circuit as the drawing wants it: a symbol, two rows, a foot. */
  private _boxes(): { stores: BoxModel[]; circuits: BoxModel[] } {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const mode = this._mode();
    const running = isRunning(mode.kind);
    const face = config.flow.circuit;
    const carried = this._fromBuffer();

    const stores: BoxModel[] = config.stores.map((store) => {
      const floor = this._floor(store);
      const ceiling = this._ceiling(store, floor);
      const span = ceiling - floor;
      const at = (t: number) => (span > 0 ? Math.min(1, Math.max(0, (t - floor) / span)) : 0);
      const top = this._num(store.top);
      const bottom = this._num(store.bottom) ?? top;
      const charging = running && ((store.kind === "hot_water" && mode.kind === "hot_water") || (store.kind === "buffer" && mode.kind === "heating"));
      const draining = carried?.store === store;
      const usable = this._usable(store, floor);
      // Every set-point carries its own name to its own notch: a bare line on the bar
      // is something to wonder about, and wondering is what the card is meant to end.
      const marks = (["eco", "target", "pv", "max"] as const)
        .map((key) => ({ key, value: store.marks?.[key] }))
        .filter((x): x is { key: "eco" | "target" | "pv" | "max"; value: number } =>
          x.value !== undefined && x.value > floor && x.value < ceiling)
        .map((x) => ({ at: at(x.value), name: this._t(`mark.${x.key}`) }));

      const word = charging ? this._t("flow.charging") : draining ? this._t("flow.discharging") : this._t("flow.top");
      const digits = (v: number) => `${formatTemp(v, locale)}°`;
      return {
        name: store.name,
        icon: store.icon,
        short: store.short,
        tone: STORE_TONE[store.kind],
        on: charging || draining,
        label: word.toUpperCase(),
        labelTone: charging || draining ? STORE_TONE[store.kind] : undefined,
        value: top === undefined ? "–" : digits(top),
        labelRight: usable === undefined ? undefined : this._t("flow.usable_unit"),
        valueRight: usable === undefined ? undefined : this._one(usable),
        level:
          top === undefined
            ? undefined
            : {
                top: at(top),
                bottom: at(bottom ?? top),
                marks,
                scale: [digits(floor), digits(ceiling)] as [string, string]
              },
        loop: this._loopOf(store),
        hint: this._storeHint(store, floor, ceiling, usable)
      };
    });

    const circuits: BoxModel[] = config.circuits.map((circuit, index) => {
      const raw = stateOf(this.hass, circuit.state)?.state;
      const active = this._circuitActive(circuit);
      const room = this._num(circuit.room);
      const flow = this._num(circuit.flow ?? circuit.temperature);
      const ret = this._num(circuit.return);
      const cooling = raw ? /cool|kühl|cc-/i.test(raw) : false;
      const tone = circuit.kind === "circulation" ? TONE.hot_water : cooling ? TONE.cooling : TONE.heating;
      const buffered = Boolean(carried?.circuits.includes(index));
      const digits = (v: number | undefined) => (v === undefined ? "–" : `${formatTemp(v, locale)}°`);
      const spread = active && flow !== undefined && ret !== undefined ? `Δ ${this._one(flow - ret)} K` : undefined;
      const origin = buffered && config.flow.origin ? this._t("flow.from_buffer") : undefined;
      const resting = circuit.state ? shortWordLabel(raw, locale, 10) : this._t("flow.off");

      // The room is what the circuit is for; flow and return are how it gets there.
      if (face === "room" && room !== undefined) {
        return {
          name: circuit.name,
          icon: circuit.icon,
          short: circuit.short,
          tone,
          on: active,
          label: (origin ?? (active ? this._t("flow.room") : resting)).toUpperCase(),
          labelTone: origin ? tone : undefined,
          value: digits(room),
          pair: {
            up: digits(flow),
            down: active ? digits(ret) : undefined,
            note: buffered && !config.flow.origin ? this._t("flow.bypass") : undefined,
            spread
          },
          hint: circuit.name
        };
      }

      return {
        name: circuit.name,
        icon: circuit.icon,
        short: circuit.short,
        tone,
        on: active,
        label: (active ? this._t("flow.flow_label") : resting).toUpperCase(),
        value: digits(flow),
        labelRight: room === undefined ? undefined : this._t("flow.room"),
        valueRight: room === undefined ? undefined : digits(room),
        sub: active && ret !== undefined ? `${this._t("flow.rl")} ${formatTemp(ret, locale)}${spread ? ` · ${spread}` : ""}` : undefined,
        hint: circuit.name
      };
    });

    return { stores, circuits };
  }

  /**
   * The circulation belongs to the store it draws from, not to a box of its own: it
   * takes hot water out of the cylinder and gives none back. Its temperature says how
   * far the loop has cooled; whether the pump runs says whether that matters now.
   */
  private _loopOf(store: StoreConfig & { kind: StoreKind }): BoxModel["loop"] {
    if (!store.circulation && !store.circulation_pump) return undefined;
    const temp = this._temp(store.circulation);
    const on = store.circulation_pump ? this._isOn(store.circulation_pump) : false;
    const text = temp !== undefined ? `${temp}°` : this._t(on ? "stores.circulation_on" : "stores.circulation_off");
    return { text, on };
  }

  /** What the box says when the pointer rests on it: the sums behind its two figures. */
  private _storeHint(store: StoreConfig & { kind: StoreKind }, floor: number, ceiling: number, usable: number | undefined): string {
    const locale = this._locale;
    const parts = [store.name];
    if (usable !== undefined) parts.push(`${this._one(usable)} kWh ${this._t("stores.above", { t: formatTemp(floor, locale) })}`);
    parts.push(`${formatTemp(floor, locale)}–${formatTemp(ceiling, locale)} °C`);
    // Circulation draws from this store, so it is told here rather than given a box.
    if (store.circulation_pump) {
      const on = this._isOn(store.circulation_pump);
      parts.push(`${this._t("stores.circulation")} ${this._t(on ? "stores.circulation_on" : "stores.circulation_off")}`);
    }
    return parts.join(" · ");
  }

  /**
   * The line under the drawing. What drives the heat pump used to stand under the
   * circle, but at 368 px that line ran into the right-hand boxes; across the full
   * width it fits with a symbol beside it, and the ring shows the split anyway.
   */
  private _flowFoot(running: boolean): TemplateResult[] {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const foot: TemplateResult[] = [];
    if (config.flow.foot === "none") return foot;

    const live = this._live();
    const heat = running ? live.heat ?? 0 : 0;
    const electric = running ? live.electric ?? 0 : 0;
    const air = Math.max(0, heat - electric);
    const shares = running ? this._shares(live.electric) : undefined;
    const dominant = this._dominant(shares);
    const outdoor = this._temp(config.entities.outdoor);
    const ambient = this._t("ambient." + config.source);

    if (running && config.entities.electric_power) {
      foot.push(html`<span>${mark("bolt", dominant ? SOURCE_TONE[dominant] : "var(--ho-power)")}
        <span><b>${formatPower(electric, locale)} kW</b> ${this._sourceLabel(shares)}</span></span>`);
    }
    if (running && config.entities.heat_power && config.entities.electric_power) {
      foot.push(html`<span>${mark("air", "var(--ho-air)")}
        <span><b>${formatPower(air, locale)} kW</b> ${ambient}${outdoor !== undefined ? " " + outdoor + " °C" : ""}</span></span>`);
    }
    if (!running && outdoor !== undefined) {
      foot.push(html`<span>${mark("air", PALETTE.muted)}<span><b>${outdoor} °C</b> ${this._t("flow.outside")}</span></span>`);
    }

    // What the circuits are pulling out of the buffer: its litres times how fast it
    // falls. The split layout writes this on the pipe; two columns have no pipe.
    const carried = config.flow.layout === "columns" ? this._fromBuffer() : undefined;
    const drawn = carried ? this._draw(carried.store) : undefined;
    if (drawn !== undefined) {
      foot.push(html`<span style="color:${TONE.heating}">${mark("drop", TONE.heating)}<b>${formatPower(drawn, locale)} kW</b> ${this._t("flow.from_buffer")}</span>`);
    }

    // The hot water store cools too, and the Eco mark is where the heat pump gives in.
    const due = this._hotWaterDue();
    if (due) foot.push(html`<span style="color:${TONE.hot_water}">${mark("drop", TONE.hot_water)}<b>${due}</b></span>`);

    if (config.flow.foot === "drive") return foot;

    if (running && config.flow.spread) {
      const flowT = this._num(config.entities.flow);
      const retT = this._num(config.entities.return);
      const volume = this._num(config.entities.volume_flow);
      if (flowT !== undefined && retT !== undefined) {
        foot.push(html`<span>${this._t("flow.wp")} <b>${formatTemp(flowT, locale)} → ${formatTemp(retT, locale)} °C</b> · Δ <b>${this._one(flowT - retT)} K</b></span>`);
      } else if (flowT !== undefined) {
        foot.push(html`<span>${this._t("flow.flow")} <b>${formatTemp(flowT, locale)} °C</b></span>`);
      }
      if (volume !== undefined) {
        foot.push(html`<span><b>${formatNumber(volume, locale, 0)}</b> ${unitOf(stateOf(this.hass, config.entities.volume_flow)) || "l/h"}</span>`);
      }
    }
    if (!running) {
      const today = this._days()?.at(-1);
      if (today) {
        foot.push(html`<span>${this._t("flow.today_starts")} <b>${this._t("flow.starts_n", { n: String(today.starts) })}</b></span>`);
        const last = lastRun(today);
        if (last) {
          foot.push(
            html`<span>${this._t("flow.last")} ${this._t("kind." + last.kind)} <b>${clock(new Date(last.from), locale)}–${clock(new Date(last.to), locale)}</b></span>`
          );
        }
      }
    }
    for (const extra of config.flow.extras) {
      if (extra.running_only && !running) continue;
      const entity = stateOf(this.hass, extra.entity);
      if (!entity) continue;
      const n = numberOf(entity);
      const value = n === undefined ? entity.state : formatNumber(n, locale, Math.abs(n) < 100 ? 1 : 0);
      const name = extra.name ?? String(entity.attributes.friendly_name ?? extra.entity);
      foot.push(html`<span>${name} <b>${value}${unitOf(entity) ? " " + unitOf(entity) : ""}</b></span>`);
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
    if (config.flow.layout === "columns" && !this._narrow) return this._renderColumns();
    return this._renderSplit();
  }

  /**
   * The heating group on one side, hot water on the other. Nothing here is a special
   * case: a buffer feeding the circuits and a heat pump feeding them travel the same
   * upright, so what changes between the two is a colour and a direction.
   */
  private _renderColumns() {
    const config = this._config as ResolvedConfig;
    const mode = this._mode();
    const live = this._live();
    const running = isRunning(mode.kind);
    const heat = running ? live.heat ?? 0 : 0;
    const electric = running ? live.electric ?? 0 : 0;
    const shares = running ? this._shares(live.electric) : undefined;
    const hasBoth = Boolean(config.entities.heat_power && config.entities.electric_power);
    const { stores, circuits } = this._boxes();
    const carried = this._fromBuffer();

    const hotIx = config.stores.map((st, i) => ({ st, i })).filter((x) => x.st.kind === "hot_water");
    const bufIx = config.stores.map((st, i) => ({ st, i })).filter((x) => x.st.kind === "buffer");

    const days = this._days();
    const showClock = config.flow.ring !== "shares";
    const rRing = showClock ? R_COL_PUMP + 7 : R_COL_PUMP;
    const reach = showClock ? rRing + 9 : rRing + 4;

    const cx = 1 + COL_W / 2;
    const cy = 6 + reach;
    const rightY = (i: number) => 6 + i * (BOX_H + COL_GAP);
    const leftY = (i: number) => cy + reach + 22 + i * (BOX_H + COL_GAP);
    const rightCount = bufIx.length + circuits.length;
    const H = Math.max(rightY(rightCount - 1) + BOX_H, leftY(hotIx.length - 1) + BOX_H, cy + reach + 6) + 6;

    const style = { labels: config.flow.labels, gauge: config.flow.gauge, scale: config.flow.detail !== "low" };
    const parts: unknown[] = [];

    // The pump to hot water: out of the ring at half past seven, clear of the moon.
    hotIx.forEach((_, k) => {
      parts.push(branch(cx, cy, reach, cx - 32, leftY(k), {
        tone: STORE_TONE.hot_water,
        surface: PALETTE.surface,
        track: PALETTE.track,
        live: running && mode.kind === "hot_water" && k === 0
      }));
    });

    // The pump to the head of the heating column.
    const headY = rightY(0) + BOX_H / 2;
    parts.push(connector(cx + reach, cy, COL_R, headY, 1, {
      tone: bufIx.length ? STORE_TONE.buffer : TONE.heating,
      fed: running && mode.kind === "heating",
      dashed: !running,
      dim: !running && !carried,
      track: PALETTE.track,
      surface: PALETTE.surface
    }));

    // The manifold: every circuit hangs on one upright under the buffer.
    const circuitYs = circuits.map((_, i) => rightY(bufIx.length + i) + BOX_H / 2);
    if (circuitYs.length) {
      const anyTaking = circuits.some((c) => c.on);
      parts.push(spine(COL_R, headY, COL_R, circuitYs, {
        tone: TONE.heating,
        surface: PALETTE.surface,
        track: PALETTE.track,
        live: anyTaking && (Boolean(carried) || (running && mode.kind === "heating"))
      }));
    }

    let uid = 0;
    const draw = (model: BoxModel, x: number, y: number, w: number, entity: string | undefined) => {
      uid += 1;
      parts.push(box(model, x, y, w, BOX_H, PALETTE, style, uid, () => this._moreInfo(entity)));
    };
    hotIx.forEach((x, k) => draw(stores[x.i], 1, leftY(k), COL_W, x.st.top));
    bufIx.forEach((x, k) => draw(stores[x.i], COL_R, rightY(k), DRAW_W - COL_R - 1, x.st.top));
    circuits.forEach((model, i) => {
      const circuit = config.circuits[i];
      draw(model, COL_R, rightY(bufIx.length + i), DRAW_W - COL_R - 1, circuit?.pump ?? circuit?.state ?? circuit?.flow ?? circuit?.temperature);
    });

    if (showClock) parts.push(this._dial(cx, cy, rRing, days));
    parts.push(svg`<circle cx=${cx} cy=${cy} r=${R_COL_PUMP} fill=${PALETTE.surface} stroke=${PALETTE.hairline} stroke-width="2"/>`);
    if (running && hasBoth && config.flow.ring !== "clock") parts.push(this._ring(cx, cy, R_COL_PUMP, heat, electric, shares));
    parts.push(this._centre(cx, cy, R_COL_PUMP, heat, electric, live.cop, running, mode));

    return html`
      <div class="section">
        <svg viewBox="0 0 ${DRAW_W} ${H}" role="img" aria-label=${this._modeLabel(mode.kind, mode.raw)}>${parts}</svg>
        ${this._footBlock(running)}
      </div>
    `;
  }

  private _renderSplit() {
    const config = this._config as ResolvedConfig;
    const mode = this._mode();
    const live = this._live();
    const running = isRunning(mode.kind);
    const heat = running ? live.heat ?? 0 : 0;
    const electric = running ? live.electric ?? 0 : 0;
    const shares = running ? this._shares(live.electric) : undefined;
    const hasBoth = Boolean(config.entities.heat_power && config.entities.electric_power);
    const { stores, circuits } = this._boxes();
    const carried = this._fromBuffer();

    const days = this._days();
    const showClock = config.flow.ring !== "shares";
    const rRing = showClock ? R_PUMP + 7 : R_PUMP;
    const reach = rRing + 4;
    const outer = showClock ? rRing + 26 : rRing + 2;

    const rows = Math.max(stores.length, circuits.length);
    const stack = rows ? rows * BOX_H + (rows - 1) * BOX_GAP : 0;
    const H = Math.max(stack, 2 * outer + 4) + 8;
    const y0 = (H - stack) / 2;
    // The blocks keep the true middle; only the heat pump rides above it.
    const cy = Math.max(outer + 2, Math.round(H / 2) - PUMP_LIFT);
    const cx = DRAW_W / 2;
    const leftEdge = 1 + BOX_W;
    const rightEdge = DRAW_W - BOX_W - 1;
    const midOf = (i: number) => y0 + i * (BOX_H + BOX_GAP) + BOX_H / 2;

    if (this._narrow) return this._renderFlowList(stores.concat(circuits), running);

    const style = { labels: config.flow.labels, gauge: config.flow.gauge, scale: config.flow.detail !== "low" };
    const parts: unknown[] = [];

    stores.forEach((model, i) => {
      const fed = model.on && model.label === this._t("flow.charging").toUpperCase();
      parts.push(connector(cx - reach, cy, leftEdge, midOf(i), -1, {
        tone: model.tone, fed, dashed: !running, dim: !model.on && !fed, track: PALETTE.track, surface: PALETTE.surface
      }));
    });

    const buffered: number[] = [];
    circuits.forEach((model, i) => {
      if (carried?.circuits.includes(i)) { buffered.push(midOf(i)); return; }
      const fed = running && mode.kind === "heating" && model.on;
      parts.push(connector(cx + reach, cy, rightEdge, midOf(i), 1, {
        tone: model.tone, fed, dashed: !running, dim: !model.on && !fed, track: PALETTE.track, surface: PALETTE.surface
      }));
    });

    if (carried && buffered.length) {
      const bufferIndex = config.stores.indexOf(carried.store);
      const floor = this._floor(carried.store);
      const lasts = config.flow.range ? this._lasts(carried.store, floor) : undefined;
      const kw = config.flow.range ? this._draw(carried.store) : undefined;
      const label = [kw === undefined ? "" : `${formatPower(kw, this._locale)} kW`, lasts ?? ""].filter(Boolean).join(" · ");
      parts.push(bypass(leftEdge, midOf(bufferIndex), rightEdge, buffered, {
        cx, cy, ring: rRing, tone: TONE.heating, surface: PALETTE.surface,
        label: label || undefined, hint: this._t("forecast.how")
      }));
    }

    let uid = 0;
    stores.forEach((model, i) => {
      uid += 1;
      parts.push(box(model, 1, midOf(i) - BOX_H / 2, BOX_W, BOX_H, PALETTE, style, uid, () => this._moreInfo(config.stores[i]?.top)));
    });
    circuits.forEach((model, i) => {
      uid += 1;
      const circuit = config.circuits[i];
      const entity = circuit?.pump ?? circuit?.state ?? circuit?.flow ?? circuit?.temperature;
      parts.push(box(model, rightEdge, midOf(i) - BOX_H / 2, BOX_W, BOX_H, PALETTE, style, uid, () => this._moreInfo(entity)));
    });

    if (showClock) parts.push(this._dial(cx, cy, rRing, days));

    parts.push(svg`<circle cx=${cx} cy=${cy} r=${R_PUMP} fill=${PALETTE.surface} stroke=${PALETTE.hairline} stroke-width="2"/>`);
    if (running && hasBoth && config.flow.ring !== "clock") parts.push(this._ring(cx, cy, R_PUMP, heat, electric, shares));
    parts.push(this._centre(cx, cy, R_PUMP, heat, electric, live.cop, running, mode));

    return html`
      <div class="section">
        <svg viewBox="0 0 ${DRAW_W} ${H}" role="img" aria-label=${this._modeLabel(mode.kind, mode.raw)}>${parts}</svg>
        ${this._footBlock(running)}
      </div>
    `;
  }

  /** The dial's day: today's stretches in the colour of what the heat pump was doing. */
  private _dial(cx: number, cy: number, r: number, days: DayTimeline[] | undefined) {
    const config = this._config as ResolvedConfig;
    const today = days?.[days.length - 1];
    const hourOf = (t: number) => (t - (today?.start ?? 0)) / 3600000;
    const segments: DialSegment[] = (today?.segments ?? []).map((seg) => ({
      from: hourOf(seg.from),
      // A minute of running would be invisible; every stretch gets a mark you can see.
      to: Math.max(hourOf(seg.to), hourOf(seg.from) + 0.12),
      tone: TONE[seg.kind]
    }));
    const now = new Date();
    return dial(cx, cy, r, {
      segments,
      now: now.getHours() + now.getMinutes() / 60,
      sun: config.flow.sun ? this._daylight() : undefined,
      tone: PALETTE
    });
  }

  /** Sunrise and sunset in hours, from Home Assistant's own sun entity. */
  private _daylight(): [number, number] | undefined {
    const sun = stateOf(this.hass, "sun.sun");
    const rise = sun?.attributes?.next_rising;
    const set = sun?.attributes?.next_setting;
    const hour = (value: unknown) => {
      const at = Date.parse(String(value ?? ""));
      if (!Number.isFinite(at)) return undefined;
      const date = new Date(at);
      return date.getHours() + date.getMinutes() / 60;
    };
    const up = hour(rise);
    const down = hour(set);
    if (up === undefined || down === undefined || up >= down) return undefined;
    return [up, down];
  }

  /** What the circle reads. Electricity is as interesting as heat on some days. */
  private _centre(cx: number, cy: number, r: number, heat: number, electric: number, cop: number | undefined, running: boolean, mode: ReturnType<HeatOriginCard["_mode"]>) {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    if (!running) {
      const last = lastRun(this._days()?.at(-1));
      if (!last) {
        return svg`<text x=${cx} y=${cy + 4} text-anchor="middle" font-size="12" font-weight="600"
          fill=${PALETTE.muted}>${this._modeLabel(mode.kind, mode.raw)}</text>`;
      }
      const span = formatSpan((last.to - last.from) / 60000);
      const short = span.hours !== undefined
        ? `${span.hours}:${String(span.minutes ?? 0).padStart(2, "0")} ${this._t("unit.h")}`
        : `${span.minutes ?? 0} ${this._t("unit.min")}`;
      // A symbol alone leaves the reader to guess what it meant. Where the circle is wide
      // enough at that height, the word itself goes there; the symbol is the fallback,
      // and it has to be shifted by half its own width to sit on the middle.
      const word = this._t(`kind.${last.kind}`);
      const chord = 2 * Math.sqrt(Math.max(0, r * r - 21 * 21)) - 8;
      const fits = word.length * TYPE.small * 0.56 <= chord;
      const mark = last.kind === "hot_water" ? "water" : last.kind === "heating" ? "flame" : undefined;
      return svg`
        <text x=${cx} y=${cy - 12} text-anchor="middle" font-size=${TYPE.micro} letter-spacing="0.08em"
          fill=${PALETTE.muted}>${this._t("flow.last").toUpperCase()}</text>
        <text x=${cx} y=${cy + 6} text-anchor="middle" font-size=${TYPE.figure} font-weight="700" fill=${PALETTE.ink}>${short}</text>
        ${fits
          ? svg`<text x=${cx} y=${cy + 21} text-anchor="middle" font-size=${TYPE.small} font-weight="600" fill=${TONE[last.kind]}>${word}</text>`
          : mark
            ? iconMark(mark, cx - 8, cy + 11, TONE[last.kind])
            : nothing}`;
    }

    const centre = config.flow.centre;
    const big = centre === "power" ? electric : heat;
    const unit = centre === "power" ? this._t("flow.power") : this._t("flow.heat");
    const third = centre === "both"
      ? `${formatNumber(electric, locale, electric < 10 ? 1 : 0)} kW`
      : cop === undefined
        ? undefined
        : `COP ${formatNumber(cop, locale, 1)}`;
    const thirdTone = centre === "both" ? "var(--ho-power)" : PALETTE.ink;
    return svg`
      <text x=${cx} y=${cy - 4} text-anchor="middle" font-size=${TYPE.hero} font-weight="700"
        fill=${PALETTE.ink}>${formatNumber(big, locale, big < 10 ? 1 : 0)}</text>
      <text x=${cx} y=${cy + 7} text-anchor="middle" font-size=${TYPE.micro} letter-spacing="0.06em" fill=${PALETTE.muted}>${unit}</text>
      ${third
        ? svg`<text x=${cx} y=${cy + 20} text-anchor="middle" font-size=${TYPE.small} font-weight="600" fill=${thirdTone}>${third}</text>`
        : nothing}`;
  }

  /** In a column too narrow for the drawing, the takers become a list. */
  private _renderFlowList(models: BoxModel[], running: boolean) {
    return html`
      <div class="section">
        <div class="sinks">
          ${models.map(
            (m) => html`<div class="sink ${m.on ? "active" : ""}" style="--tone:${m.tone}" title=${m.hint ?? m.name}>
              <span>${m.name}</span>
              <span class="v">${[m.value, m.valueRight, m.pair?.up].filter(Boolean).join(" · ")}</span>
            </div>`
          )}
        </div>
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
