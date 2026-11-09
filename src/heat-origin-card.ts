import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import { CARD_TYPE, assertConfig, resolveConfig, stubConfig } from "./config";
import { W as DRAW_W, T, TL, textWidth, box, branch, bypass, connector, dial, spine, type BoxModel, type DialSegment, type Tone } from "./flow-draw";
import { icon as iconMark } from "./icons";
import { coarseSpan, hoursLeft, parseTrend, slopePerHour, type TrendPoint } from "./trend";
import { chargedAt, heatingRuns, learnBuffer, learnMarks, weatherFactor, type BufferLearning, type LearnedMarks, type Sample } from "./learn";
import { localize } from "./localize";
import { BUFFER_HEIGHTS, EDGE_MIN, HOT_WATER_HEIGHTS, edgeAt, ringArcs, showerLitres, tempTone, usableKwh, type Heights } from "./origin";
import { circuitActive, classify, isRunning, shortWordLabel, wordLabel } from "./modes";
import { cardStyles } from "./styles";
import {
  buildDays,
  lastRun,
  lastActive,
  midnight,
  parseHistory,
  withLive,
  type DayTimeline,
  type Segment,
  type StatePoint
} from "./timeline";
import type {
  ElectricSource,
  FootItem,
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
  stateOf,
  unitOf
} from "./values";

const DAY = 86400000;
const REFRESH = 5 * 60 * 1000;
/** How far back "last heated" looks: a week, well inside the recorder's default ten days. */
const LAST_HEAT_DAYS = 7;
/** What the card learns about a buffer changes by the day; half an hour is fresh enough. */
const LEARN_REFRESH = 30 * 60 * 1000;
/** A start the card learned is only trusted on this many examples. */
const LEARN_OFFSET_MIN = 3;
/** How long a worked-out start time stands before it is worked out again. */
const FORECAST_CACHE = 60_000;
/** How long PV mode holds through a dip in the surplus while the heat pump runs. */
const PV_HOLD = 10 * 60 * 1000;
const W = 368;
/** Under this many pixels the drawing gives way to a list. Scaled down to 300 the drawing
 *  still reads better than any list; below that its small words are gone. */
const NARROW = 300;

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
function mark(kind: "bolt" | "air" | "drop" | "sun", tone: string) {
  const body =
    kind === "sun"
      ? svg`<circle cx="8" cy="8" r="3.2" fill=${tone}/><path d="M8 1 V3 M8 13 V15 M1 8 H3 M13 8 H15 M3 3 L4.4 4.4 M11.6 11.6 L13 13 M3 13 L4.4 11.6 M11.6 4.4 L13 3" stroke=${tone} stroke-width="1.5" stroke-linecap="round"/>`
      : kind === "bolt"
      ? svg`<path d="M9.2 1 L3.2 9.2 H7.4 L6.4 15 L12.8 6.6 H8.6 Z" fill=${tone}/>`
      : kind === "air"
        ? svg`<path d="M1.5 5 H9 a2.6 2.6 0 1 0 -2.6 -2.6 M1.5 8.5 H12.6 M1.5 12 H7.4 a2.6 2.6 0 1 1 -2.6 2.6"
            fill="none" stroke=${tone} stroke-width="1.6" stroke-linecap="round"/>`
        : svg`<path d="M8 1.4 C11.4 5.9, 12.9 8.4, 12.9 11.1 A4.9 4.9 0 0 1 3.1 11.1 C3.1 8.4, 4.6 5.9, 8 1.4 Z"
            fill="none" stroke=${tone} stroke-width="1.7" stroke-linejoin="round"/>`;
  return html`<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">${body}</svg>`;
}

const MUTED = "var(--ho-muted)";

const PALETTE: Tone = {
  ink: "var(--ho-ink)",
  muted: "var(--ho-muted)",
  hairline: "var(--ho-hairline)",
  track: "var(--ho-track)",
  surface: "var(--ho-surface)",
  sun: "var(--ho-sun)"
};

/**
 * The split arrangement — stores left, the heat pump between, circuits right — in the
 * two sizes it comes in: three things beside each other at 368 units, where each box
 * is 116 wide and the circle small; or the same three at 600, once the card is wide
 * enough, where the boxes are as wide as the columns' and the circle as large. The
 * heat pump rides above the middle, which frees the corridor under it.
 */
const SPLIT = { W: 368, boxW: 116, boxH: 64, gap: 28, r: 30, lift: 10 };
const WIDE = { W: 600, boxW: 196, boxH: 80, gap: 14, r: 48, lift: 10 };
/** The forecast reads the last twenty minutes: a shower shows up at once. */
const TREND_WINDOW = 20 * 60 * 1000;
/** The direction reads a whole hour: a buffer losing standby heat moves a tenth of a
 *  kelvin at a time, and twenty minutes of that is a wobble, not a way. */
const DRIFT_WINDOW = 60 * 60 * 1000;
/** Kelvin per hour under which a store counts as holding. */
const DRIFT_MIN = 0.15;

/**
 * Two columns. The heat pump takes the head of the left one and hot water hangs under
 * it; the whole heating group — the buffer, then the circuits it feeds — owns the
 * right one. Three things beside each other leave 116 px each; two leave 171, which is
 * where the figures stop being cramped. And with the buffer standing next to the
 * circuits it carries, its line to them is a run down the column instead of a route
 * around the drawing.
 */
const COL_W = 171;
const BOX_H_COL = 80;
const COL_R = 196;
const COL_GAP = 8;
const R_COL_PUMP = 48;

type Shares = Partial<Record<ElectricSource, number>>;

export class HeatOriginCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _points: { state: true },
    _narrow: { state: true },
    _wide: { state: true },
    _trend: { state: true },
    _lastHeat: { state: true },
    _learned: { state: true },
    _learnedMarks: { state: true }
  };

  static styles = cardStyles;

  hass?: HomeAssistant;
  private _config?: ResolvedConfig;
  private _points?: StatePoint[];
  /** Each store's own temperature over the last while, for how long it still lasts. */
  private _trend: Record<string, TrendPoint[]> = {};
  /** When each circuit last heated, by index, as far back as the recorder was asked. */
  private _lastHeat: Array<number | "now" | undefined> = [];
  /** Per buffer (by store index): what its last days taught, and the history it was taught from. */
  private _learned: Record<
    number,
    { learning: BufferLearning; top: Sample[]; bottom: Sample[]; curves: Sample[][]; outdoor: Sample[]; runs: Array<[number, number]> }
  > = {};
  /** Per store (by index): the set-points its charges have been ending at. */
  private _learnedMarks: Record<number, LearnedMarks> = {};
  /** Per buffer: the last start time worked out, and when. Cleared whenever the card learns anew. */
  private _forecasts: Record<number, { at: number; value: number | undefined }> = {};
  private _learnedAt = 0;
  /** When surplus solar was last enough for the heat pump's PV mode. */
  private _pvSeenAt = 0;
  /** Today's history of the PV signal, for since when the heat pump runs on the sun. */
  private _pvPoints: StatePoint[] = [];
  private _learning = false;
  private _narrow = false;
  private _wide = false;
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
      const from = this._config?.wide_from ?? 0;
      const wide = from > 0 && width >= from;
      if (wide !== this._wide) this._wide = wide;
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
      if (Date.now() - this._learnedAt > LEARN_REFRESH && !this._learning) void this._learn();
    }
  }

  private _needsHistory(): boolean {
    return Boolean(this.hass && this._config);
  }

  private async _fetch(): Promise<void> {
    const hass = this.hass;
    const config = this._config;
    if (!hass || !config) return;
    this._fetching = true;
    const now = new Date();
    const start = new Date(midnight(now));
    try {
      const tops = config.stores.map((store) => store.top).filter(Boolean);
      const since = Date.now() - DRIFT_WINDOW;
      // Whatever the box calls active, its pump or its state word, is what "last heated" reads.
      const watched = config.flow.rest_note === "last" ? config.circuits.map((c) => c.pump ?? c.state) : [];
      const circuitIds = [...new Set(watched.filter((id): id is string => Boolean(id)))];
      const [history, trends, circuits] = await Promise.all([
        hass.callWS({
          type: "history/history_during_period",
          start_time: start.toISOString(),
          end_time: now.toISOString(),
          // The PV signal rides along: since when the sun runs the heat pump is a line of the head.
          entity_ids: [config.entities.mode, ...(config.entities.pv_mode ? [config.entities.pv_mode] : [])],
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
          : Promise.resolve(undefined),
        circuitIds.length
          ? hass.callWS({
              type: "history/history_during_period",
              start_time: new Date(Date.now() - LAST_HEAT_DAYS * DAY).toISOString(),
              end_time: now.toISOString(),
              entity_ids: circuitIds,
              minimal_response: true,
              no_attributes: true,
              significant_changes_only: false
            })
          : Promise.resolve(undefined)
      ]);
      this._points = parseHistory(history, config.entities.mode);
      this._pvPoints = config.entities.pv_mode ? parseHistory(history, config.entities.pv_mode) : [];
      this._lastHeat = config.circuits.map((c, i) => {
        const id = watched[i];
        if (!id || !circuits) return undefined;
        const active = c.pump ? (s: string) => s === "on" : (s: string) => circuitActive(s, c.active);
        return lastActive(parseHistory(circuits, id), active);
      });
      const trend: Record<string, TrendPoint[]> = {};
      for (const id of tops) trend[id] = parseTrend(trends, id, since);
      this._trend = trend;
    } catch {
      this._points = this._points ?? [];
    }

    this._fetchedAt = Date.now();
    this._fetching = false;
  }

  /**
   * A week of the heat pump's modes and the buffer's two temperatures, as the recorder's
   * five-minute means: enough to see where it starts again and how long a charge lasts.
   */
  private async _learn(): Promise<void> {
    const hass = this.hass;
    const config = this._config;
    if (!hass || !config) return;
    const stores = config.stores.map((store, index) => ({ store, index })).filter(({ store }) => Boolean(store.top));
    const buffers = stores.filter(({ store }) => store.kind === "buffer");
    this._learnedAt = Date.now();
    if (!stores.length) return;
    this._learning = true;
    const now = new Date();
    const start = new Date(now.getTime() - LAST_HEAT_DAYS * DAY).toISOString();
    const curveIds = config.circuits.map((c) => c.curve_flow).filter((id): id is string => Boolean(id));
    const statIds = [
      ...new Set([...stores.flatMap(({ store }) => [store.top, store.bottom]), ...curveIds, config.entities.outdoor].filter((id): id is string => Boolean(id)))
    ];
    try {
      const [history, stats] = await Promise.all([
        hass.callWS({
          type: "history/history_during_period",
          start_time: start,
          end_time: now.toISOString(),
          entity_ids: [config.entities.mode],
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false
        }),
        hass.callWS<Record<string, Array<{ start: number | string; mean?: number | null }>>>({
          type: "recorder/statistics_during_period",
          start_time: start,
          end_time: now.toISOString(),
          statistic_ids: statIds,
          period: "5minute",
          types: ["mean"]
        })
      ]);
      const series = (id: string | undefined): Sample[] =>
        (id ? stats?.[id] ?? [] : [])
          .filter((row) => typeof row.mean === "number")
          .map((row) => ({ at: typeof row.start === "number" ? row.start : Date.parse(row.start), value: row.mean as number }))
          .filter((s) => Number.isFinite(s.at) && Number.isFinite(s.value))
          .sort((a, b) => a.at - b.at);
      const modes = parseHistory(history, config.entities.mode);
      const curves = curveIds.map((id) => series(id));
      const outdoor = series(config.entities.outdoor);
      const learned: typeof this._learned = {};
      for (const { store, index } of buffers) {
        const top = series(store.top);
        const bottom = store.bottom ? series(store.bottom) : top;
        const learning = learnBuffer({ modes, words: config.modes, top, bottom, curves, outdoor, volume: store.volume, now: now.getTime() });
        learned[index] = { learning, top, bottom, curves, outdoor, runs: heatingRuns(modes, config.modes, now.getTime()) };
      }
      this._learned = learned;
      this._forecasts = {};
      const marks: typeof this._learnedMarks = {};
      for (const { store, index } of stores) {
        marks[index] = learnMarks({
          modes,
          words: config.modes,
          kind: store.kind === "hot_water" ? "hot_water" : "heating",
          top: series(store.top),
          target: this._setting(store.marks?.target),
          now: now.getTime()
        });
      }
      this._learnedMarks = marks;
    } catch {
      // The recorder may keep no five-minute statistics; the card then measures as before.
    }
    this._learning = false;
  }

  /** Where a buffer's heat pump starts again, as it has done lately; undefined until the card has seen enough. */
  private _startsAt(store: StoreConfig & { kind: StoreKind }): number | undefined {
    const config = this._config as ResolvedConfig;
    const learned = this._learned[config.stores.indexOf(store as ResolvedConfig["stores"][number])]?.learning;
    if (!learned) return undefined;
    if (learned.offset !== undefined && learned.starts >= LEARN_OFFSET_MIN) {
      const curves = config.circuits.map((c) => this._num(c.curve_flow)).filter((v): v is number => v !== undefined && v > 5);
      if (curves.length) return Math.max(...curves) + learned.offset;
    }
    return learned.start;
  }

  /**
   * What the house is taking from a buffer now: the rate the last discharge showed,
   * carried over to tonight's weather. Learned in September and read in November, the
   * bare figure is too small by half; the air outside says by how much.
   */
  private _drawNow(store: StoreConfig & { kind: StoreKind }): number | undefined {
    const config = this._config as ResolvedConfig;
    const learned = this._learned[config.stores.indexOf(store as ResolvedConfig["stores"][number])];
    if (!learned?.learning.draw) return undefined;
    return learned.learning.draw * weatherFactor({ learning: learned.learning, outdoor: learned.outdoor, now: Date.now() });
  }

  /**
   * When the heat pump will have to start again, from the last full charge: the heat it
   * held above the start temperature, spent at the rate the house has been taking it.
   * Not from how fast the top sensor falls — in a layered buffer that sensor holds for
   * hours and then drops twenty kelvin in one, so any slope read off it is wrong.
   */
  private _startForecast(store: StoreConfig & { kind: StoreKind }): number | undefined {
    // Home Assistant hands a card a new `hass` on every state change in the house, and
    // three places on this card ask for the forecast. Working it out means walking two
    // days of five-minute means, which is a millisecond a time — nothing once, but the
    // card would spend it many times a second on a tablet. The answer is a clock time
    // that moves by the minute, so once a minute is as often as it is worth having.
    const index = (this._config as ResolvedConfig).stores.indexOf(store as ResolvedConfig["stores"][number]);
    const cached = this._forecasts[index];
    if (cached && Date.now() - cached.at < FORECAST_CACHE) return cached.value;
    const value = this._forecastNow(store);
    this._forecasts[index] = { at: Date.now(), value };
    return value;
  }

  private _forecastNow(store: StoreConfig & { kind: StoreKind }): number | undefined {
    const config = this._config as ResolvedConfig;
    const learned = this._learned[config.stores.indexOf(store as ResolvedConfig["stores"][number])];
    const draw = this._drawNow(store);
    const threshold = this._startsAt(store);
    if (!learned || draw === undefined || threshold === undefined || !store.volume) return undefined;
    const now = Date.now();
    const charges = learned.runs.filter(([from, to]) => to - from > 10 * 60 * 1000);
    const charged = chargedAt(learned.top, learned.bottom, charges, now, threshold, now - 36 * 60 * 60 * 1000);
    // What is in the store right now, at the rate the house takes it. On its own this runs
    // late — two sensors flatter a layered store near the end — so it is a ceiling, not the
    // answer: whichever of the two comes first is the one the card can stand behind.
    const mean = this._mean(store);
    const fromNow =
      mean === undefined ? undefined : now + (Math.max(0, (store.volume * 1.163 * (mean - threshold)) / 1000) / draw) * 3600_000;
    const fromCharge = charged ? charged.at + (Math.max(0, (store.volume * 1.163 * (charged.mean - threshold)) / 1000) / draw) * 3600_000 : undefined;
    const times = [fromCharge, fromNow].filter((t): t is number => t !== undefined);
    return times.length ? Math.min(...times) : undefined;
  }

  /** The learned figures in words, for the tooltip. */
  private _learnedHint(store: StoreConfig & { kind: StoreKind }): string {
    const config = this._config as ResolvedConfig;
    const learning = this._learned[config.stores.indexOf(store as ResolvedConfig["stores"][number])]?.learning;
    const threshold = this._startsAt(store);
    if (!learning || threshold === undefined) return "";
    const parts = [this._t("learn.start", { t: formatTemp(threshold, this._locale) })];
    if (learning.draw !== undefined) {
      parts.push(this._t("learn.draw", { kw: formatPower(learning.draw, this._locale), n: String(learning.discharges) }));
      // Only worth saying once the weather has moved the figure by more than rounding would.
      const now = this._drawNow(store);
      if (now !== undefined && Math.abs(now - learning.draw) >= 0.05) {
        parts.push(this._t("learn.weather", { kw: formatPower(now, this._locale) }));
      }
    }
    return parts.join(" · ");
  }

  // ─── how long a store lasts ────────────────────────────────

  /**
   * The lowest temperature still worth something. A shower needs 40 °C whatever the
   * season, so hot water keeps its fixed floor; a buffer is only useful while it is
   * warmer than the circuit it feeds, and that moves with the weather. Measuring a
   * buffer against a fixed 30 °C says it is empty on a September morning when it is
   * carrying the house, and that it is full in January when it cannot.
   */
  /** A setting that is a number, a number written as text, or the id of an entity that reports it. */
  private _setting(value: number | string | undefined): number | undefined {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (value === undefined || value === "") return undefined;
    const asNumber = Number(value.replace(",", "."));
    return Number.isFinite(asNumber) ? asNumber : this._num(value);
  }

  /** The store's set-points as numbers, whichever way they were written. */
  /** The store's set-points as numbers: what the YAML says, and where it says nothing, what the charges have shown. */
  private _marks(store: StoreConfig): { eco?: number; target?: number; pv?: number; max?: number } {
    const config = this._config as ResolvedConfig;
    const learned = this._learnedMarks[config.stores.indexOf(store as ResolvedConfig["stores"][number])]?.marks ?? {};
    return {
      eco: this._setting(store.marks?.eco) ?? learned.eco,
      target: this._setting(store.marks?.target) ?? learned.target,
      pv: this._setting(store.marks?.pv) ?? learned.pv,
      max: this._setting(store.marks?.max) ?? learned.max
    };
  }

  /** Which of the store's set-points were learned rather than written down. */
  private _learnedKeys(store: StoreConfig): string[] {
    const config = this._config as ResolvedConfig;
    const learned = this._learnedMarks[config.stores.indexOf(store as ResolvedConfig["stores"][number])]?.marks ?? {};
    return (["eco", "target", "pv", "max"] as const).filter((key) => store.marks?.[key] === undefined && learned[key] !== undefined);
  }

  private _floor(store: StoreConfig & { kind: StoreKind }): number {
    const set = this._setting(store.usable_min);
    if (set !== undefined) return set;
    if (store.kind === "hot_water") return 40;
    // Empty is where the heat pump has been starting again, once the card has watched it do so.
    const learned = this._startsAt(store);
    if (learned !== undefined) return learned;
    const config = this._config as ResolvedConfig;
    let warmest: number | undefined;
    for (const circuit of config.circuits) {
      if (circuit.kind !== "heating" || !this._circuitTaking(circuit)) continue;
      // What the circuit is asking for, where the controller says; else what it gets.
      const want = this._num(circuit.curve_flow);
      const need = want !== undefined && want > 5 ? want : this._num(circuit.flow ?? circuit.temperature);
      if (need !== undefined && (warmest === undefined || need > warmest)) warmest = need;
    }
    return warmest ?? 30;
  }

  private _ceiling(store: StoreConfig & { kind: StoreKind }, floor: number, top: number | undefined): number {
    const set = this._setting(store.usable_max);
    if (set !== undefined) return set;
    const marks = this._marks(store);
    const highest = Math.max(...[marks.max, marks.pv, marks.target, marks.eco].filter((v): v is number => v !== undefined), -Infinity);
    if (Number.isFinite(highest) && highest > floor) return highest;
    // Hot water is nearly always marked; a heating buffer rarely is, and a heat pump
    // pushes one to about twenty kelvin over what the circuits need. A store warmer
    // than that is not "over full": the scale stretches to the next five above it.
    const guess = floor + (store.kind === "buffer" ? 20 : 12);
    return top === undefined ? guess : Math.max(guess, Math.ceil((top + 1) / 5) * 5);
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

  /** The measured fall over the last twenty minutes, in kelvin per hour, or nothing when the recorder was quiet. */
  private _fall(store: StoreConfig): number | undefined {
    const since = Date.now() - TREND_WINDOW;
    return slopePerHour((this._trend[store.top] ?? []).filter((p) => p.at >= since));
  }

  /**
   * The same over the last hour: slower, steadier, for the direction a store is going.
   * A store being charged is measured from its last twenty minutes only. A charge starts
   * by stirring the cold bottom into the top — fifty degrees drops to forty-two before it
   * climbs — and an hour that holds that dip reads falling while the store fills.
   */
  private _drift(store: StoreConfig, charging = false): number | undefined {
    const points = this._trend[store.top] ?? [];
    if (!charging) return slopePerHour(points);
    const since = Date.now() - TREND_WINDOW;
    return slopePerHour(points.filter((p) => p.at >= since));
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
    const learned = store.kind === "buffer" ? this._startForecast(store) : undefined;
    if (learned !== undefined) {
      if (learned <= Date.now()) return this._t("learn.due");
      return this._t("learn.until", { time: clock(new Date(learned), this._locale) });
    }
    const mean = this._mean(store);
    if (mean === undefined) return undefined;
    const hours = hoursLeft(mean, floor, this._fall(store), config.forecast_min_slope);
    if (hours === undefined) return undefined;
    // Past a day and a half the number would be a guess dressed up; "a day or more" is what is known.
    if (hours > 36) return this._t("flow.lasts_long");
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
    const at = this._marks(store)[key];
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

  /**
   * When a resting circuit last heated, in words: the time and how long ago today,
   * "yesterday" and a time, then days. Nothing until the recorder has answered.
   */
  private _lastHeatWords(index: number): string | undefined {
    const circuit = (this._config as ResolvedConfig).circuits[index];
    if (!circuit || !(circuit.pump ?? circuit.state)) return undefined;
    if (!this._fetchedAt || index >= this._lastHeat.length) return undefined;
    const last = this._lastHeat[index];
    if (last === "now") return undefined;
    if (last === undefined) return this._t("rest.long", { n: String(LAST_HEAT_DAYS) });
    const now = new Date();
    const time = clock(new Date(last), this._locale);
    const days = Math.round((midnight(now) - midnight(new Date(last))) / DAY);
    if (days <= 0) {
      const minutes = Math.max(1, Math.round((now.getTime() - last) / 60000));
      const ago = minutes < 60 ? `${minutes} ${this._t("unit.min")}` : `${Math.round(minutes / 60)} ${this._t("unit.h")}`;
      return this._t("rest.today", { time, ago });
    }
    if (days === 1) return this._t("rest.yesterday", { time });
    return this._t("rest.days", { n: String(days) });
  }

  /** Whether the heat pump runs on surplus solar right now, as far as the card was told. */
  private _pvMode(): boolean {
    const config = this._config as ResolvedConfig;
    const entity = stateOf(this.hass, config.entities.pv_mode);
    if (!entity) return false;
    const word = entity.state.toLowerCase();
    if (["on", "true", "active", "pv"].includes(word)) return true;
    if (["off", "false", "inactive"].includes(word)) return false;
    const surplus = powerKw(entity);
    if (surplus === undefined) return false;
    // What the heat pump itself asks for from the sun (Lambda's E-Manager set-point) is
    // the answer as it is: nought at night, its own minimum and up by day, held through
    // a passing cloud by the heat pump's own logic.
    if (!config.pv_mode_own) return surplus >= config.pv_mode_above;
    // A bare export figure is measured after the heat pump has taken its share. Running
    // on the sun it eats its own surplus: 3 kW off the roof, 1.4 kW into the compressor,
    // 0.1 kW left over. Both together are what counts, held through a short dip.
    const running = isRunning(this._mode().kind);
    const own = running ? Math.max(0, this._live().electric ?? 0) : 0;
    const now = Date.now();
    if (surplus + own >= config.pv_mode_above) {
      this._pvSeenAt = now;
      return true;
    }
    return running && now - this._pvSeenAt < PV_HOLD;
  }

  /** When the PV signal last came on today; undefined when it has been on since before midnight, or is off. */
  private _pvSince(): number | undefined {
    const config = this._config as ResolvedConfig;
    const on = (state: string) => {
      const word = state.toLowerCase();
      if (["on", "true", "active", "pv"].includes(word)) return true;
      const n = Number(state);
      const unit = unitOf(stateOf(this.hass, config.entities.pv_mode)).toLowerCase();
      return Number.isFinite(n) && (unit === "w" ? n / 1000 : n) >= config.pv_mode_above;
    };
    let since: number | undefined;
    let was = false;
    for (const p of this._pvPoints) {
      if (p.state === "unknown" || p.state === "unavailable") continue;
      const now = on(p.state);
      if (now && !was) since = p.at;
      if (!now) since = undefined;
      was = now;
    }
    // On since the first point of the day is on since before it: no time is better than a wrong one.
    return since !== undefined && since !== this._pvPoints[0]?.at ? since : undefined;
  }

  /** What the circuit says it is doing: its state word, or its pump. This is what its box shows. */
  private _circuitActive(circuit: ResolvedConfig["circuits"][number]): boolean {
    const raw = stateOf(this.hass, circuit.state)?.state;
    const pumpOn = circuit.pump ? this._isOn(circuit.pump) : undefined;
    return pumpOn ?? circuitActive(raw, circuit.active);
  }

  /**
   * Whether heat is actually moving into the circuit. The state says it wants to; the
   * water says whether it does. A pump can run against a closed mixer — the state reads
   * HEATING while flow and return sit at room temperature — and then the buffer is
   * carrying nothing and its scale must not take that flow for its floor. Half a
   * kelvin of spread: a closed mixer hovers within three tenths of nothing, a floor
   * that heats runs two to five.
   */
  private _circuitTaking(circuit: ResolvedConfig["circuits"][number]): boolean {
    if (!this._circuitActive(circuit)) return false;
    const flow = this._num(circuit.flow);
    const ret = this._num(circuit.return);
    return flow === undefined || ret === undefined || flow - ret >= 0.5;
  }

  /**
   * Which circuits the buffer is carrying on its own. Everything it needs is already
   * configured: a store marked as a buffer, a heat pump that is not heating, and a
   * circuit that says it is taking heat. No extra sensor, no extra setting.
   */
  private _fromBuffer(): { store: ResolvedConfig["stores"][number]; circuits: number[] } | undefined {
    const config = this._config as ResolvedConfig;
    if (config.flow.buffer_line === "none") return undefined;
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
    // Today alone, and no run is too short to count: the starts in the foot are every start.
    return buildDays(withLive(this._points, live), config.modes, new Date(), 1, 0);
  }

  private _hm(minutes: number) {
    const rounded = Math.round(minutes);
    const value = `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
    return html`${value}<small>${this._t("day.hours")}</small>`;
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

    return html`
      <ha-card class=${config.font === "system" ? "font-system" : ""}>
        ${this._renderHead()}
        ${this._renderFlow()}
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
      const lasts = config.flow.buffer_line !== "line" && config.flow.layout === "columns" ? this._lasts(carried.store, floor) : undefined;
      chips.push(html`<span class="chip live" style="--tone:var(--ho-heating)"
        @click=${() => this._moreInfo(carried.store.top)}><i></i>${what}${lasts ? ` · ${lasts}` : ""}</span>`);
    }

    return chips.length ? html`<span class="chips">${chips}</span>` : nothing;
  }

  private _renderHead() {
    const config = this._config as ResolvedConfig;
    if (!config.show_title) {
      // Without its title the head is only news: running on the sun, and since when.
      const pv = this._pvMode();
      const since = pv ? this._pvSince() : undefined;
      const chips = config.flow.chips ? this._chip() : nothing;
      if (!pv && chips === nothing) return nothing;
      return html`<div class="head">
        ${pv
          ? html`<p class="pv-mode" @click=${() => this._moreInfo(config.entities.pv_mode)}>${mark("sun", "var(--ho-sun)")}<b>${this._t("flow.pv_mode")}</b>${
              since === undefined ? nothing : html`<span>· ${this._t("flow.pv_since", { time: clock(new Date(since), this._locale) })}</span>`
            }</p>`
          : html`<span></span>`}
        ${chips}
      </div>`;
    }
    return html`<div class="head">
      <p class="title">${config.title ?? this._t("card.title")}${
        // Running on surplus solar is the whole plant's state, so it stands by the title,
        // whether the badges are shown or not.
        this._pvMode()
          ? html`<span class="pv" @click=${() => this._moreInfo(config.entities.pv_mode)}>${mark("sun", "var(--ho-sun)")}${this._t("flow.pv")}</span>`
          : nothing
      }</p>
      ${config.flow.chips ? this._chip() : nothing}
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
      const top = this._num(store.top);
      const ceiling = this._ceiling(store, floor, top);
      // A scale with numbers on its ends runs between round ones: 30 to 50 reads at a glance,
      // 31,4 to 50,5 does not. Stages carry names, not numbers, and a round end would only
      // add a stage above the top set-point. What is usable is counted from the exact floor.
      const round = config.flow.gauge !== "zones";
      const low = round ? Math.round(floor / 5) * 5 : floor;
      const high = round ? Math.max(low + 5, Math.round(ceiling / 5) * 5) : ceiling;
      const span = high - low;
      const at = (t: number) => (span > 0 ? Math.min(1, Math.max(0, (t - low) / span)) : 0);
      const bottom = this._num(store.bottom) ?? top;
      const charging = running && ((store.kind === "hot_water" && mode.kind === "hot_water") || (store.kind === "buffer" && mode.kind === "heating"));
      const draining = carried?.store === store;
      const usable = this._usable(store, floor);
      // Every set-point carries its own name to its own notch: a bare line on the bar
      // is something to wonder about, and wondering is what the card is meant to end.
      const set = this._marks(store);
      const marks = (["eco", "target", "pv", "max"] as const)
        .map((key) => ({ key, value: set[key] }))
        .filter((x): x is { key: "eco" | "target" | "pv" | "max"; value: number } =>
          x.value !== undefined && x.value > low && x.value < high)
        .map((x) => ({ at: at(x.value), name: this._t(`mark.${x.key}`) }));

      // Charging or discharging is the news and takes the slot — and a discharging buffer
      // has better news than the word: how long it can keep this up, carried forward from
      // its own measured fall, marked as the estimate it is. With nothing to report, the
      // store's own name is worth more there than the word "top" on every box.
      const head = config.flow.store_head;
      const lasts = draining && head === "left" ? this._lasts(store, floor) : undefined;
      const kw = draining && head === "draw" ? this._draw(store) : undefined;
      const to = draining ? carried!.circuits.map((i) => config.circuits[i]?.short).filter(Boolean).join("+") : "";
      // A buffer charging on the sun charges to a top the card has seen it reach; how fast it
      // climbs says when. Off the sun the heat pump stops far lower, at a point the card does
      // not know, so it says nothing rather than a time that is hours off.
      const fullAt = (() => {
        if (!charging || store.kind !== "buffer" || top === undefined || !this._pvMode()) return undefined;
        const fall = this._drift(store, true);
        const rise = fall === undefined ? undefined : -fall;
        if (rise === undefined || rise < 1 || ceiling - top < 0.3) return undefined;
        const hours = (ceiling - top) / rise;
        return hours <= 8 ? Date.now() + hours * 3600_000 : undefined;
      })();
      // Hot water whose set-point is steered from outside (a controller, an automation) says
      // where it is headed: the scale's notch is too small to read across a room.
      const goal = store.kind === "hot_water" ? set.target : undefined;
      const goalText = goal === undefined ? "" : `${goal % 1 === 0 ? formatNumber(goal, locale, 0) : formatTemp(goal, locale)}°`;
      const word = charging
        ? fullAt === undefined
          ? goal === undefined
            ? this._t("flow.charging")
            : `${this._t("flow.charging")} → ${goalText}`
          : `${this._t("flow.charging")} · ${this._t("flow.full_at", { time: clock(new Date(fullAt), locale) })}`
        : !draining
          ? goal === undefined
            ? store.name
            : `${this._t("mark.target")} ${goalText}`
          : head === "left" && lasts
            ? this._startForecast(store) !== undefined ? lasts : `≈ ${lasts}`
            : head === "draw"
              ? `${kw === undefined ? this._t("flow.discharging") : `${formatPower(kw, locale)} kW`} → ${to}`
              : this._t("flow.discharging");
      // Which way the store is going, off a whole hour: a tenth of a kelvin at a time is
      // all a resting buffer moves, and the arrow says "holding" rather than nothing.
      const drift = config.flow.trend !== "none" ? this._drift(store, charging) : undefined;
      const digits = (v: number) => `${formatTemp(v, locale)}°`;
      // The scale's ends drop a ",0" nobody needs, so the names between them have room.
      const end = (v: number) => `${v % 1 === 0 ? formatNumber(v, locale, 0) : formatTemp(v, locale)}°`;
      return {
        name: store.name,
        icon: store.icon,
        short: store.short,
        tone: STORE_TONE[store.kind],
        on: charging || draining,
        label: word.toUpperCase(),
        labelTone: charging || draining ? STORE_TONE[store.kind] : undefined,
        value: top === undefined ? "–" : digits(top),
        labelRight: usable === undefined ? undefined : this._t("flow.usable").toUpperCase(),
        valueRight: usable === undefined ? undefined : this._one(usable),
        unitRight: usable === undefined ? undefined : this._t("flow.usable_unit"),
        level:
          top === undefined
            ? undefined
            : {
                top: at(top),
                bottom: at(bottom ?? top),
                marks,
                scale: [end(low), end(high)] as [string, string],
                // The set-point that is the top of the scale names its right-hand end.
                ceilingName: (["eco", "target", "pv", "max"] as const)
                  .filter((key) => set[key] !== undefined && (set[key] as number) >= high - 1.5 && (set[key] as number) <= high + 1.5)
                  .map((key) => this._t(`mark.${key}`))[0],
                under: this._t("stores.under")
              },
        loop: this._loopOf(store),
        // Charging, the word says which way it goes; an arrow beside it only says it twice.
        trend:
          drift === undefined || charging
            ? undefined
            : Math.abs(drift) < DRIFT_MIN
              ? { dir: "flat" }
              : { dir: drift > 0 ? "down" : "up", rate: config.flow.trend === "rate" ? `${this._one(Math.abs(drift))} K/h` : undefined },
        hint: [
          this._storeHint(store, floor, ceiling, usable),
          store.kind === "buffer" ? this._learnedHint(store) : "",
          lasts ? this._t(store.kind === "buffer" && this._startForecast(store) !== undefined ? "learn.how" : "forecast.how") : ""
        ].filter(Boolean).join(" · ")
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
      const digits = (v: number | undefined) => (v === undefined ? "–" : `${formatTemp(v, locale)}°`);
      const spread = active && flow !== undefined && ret !== undefined ? `Δ ${this._one(flow - ret)} K` : undefined;
      const resting = circuit.state ? shortWordLabel(raw, locale, 10) : this._t("flow.off");
      // Running, the box's word is what the circuit does and since when: "HEIZT · 21:40".
      const changed = stateOf(this.hass, circuit.pump ?? circuit.state)?.last_changed;
      const sinceAt = changed ? Date.parse(changed) : NaN;
      // Since yesterday is said as such: a bare 22:09 in the afternoon reads as tonight.
      // A run from before midnight keeps its time out of the word: a bare 22:09 in the
      // afternoon reads as tonight, and "yesterday" does not fit a box. The tooltip says it.
      const fresh = Number.isFinite(sinceAt) && Date.now() - sinceAt < DAY;
      const since = fresh && sinceAt >= midnight(new Date()) ? ` · ${clock(new Date(sinceAt), locale)}` : "";
      const sinceLong = fresh && !since ? this._t("flow.since_yesterday", { time: clock(new Date(sinceAt), locale) }) : "";
      const doing = `${circuit.state ? shortWordLabel(raw, locale, 10) : this._t("flow.running")}${since}`;
      // What the heating curve wants of the flow, and how far the flow is from it.
      // A controller writes 0 for a circuit it has switched off; that is no target.
      const curveRaw = this._num(circuit.curve_flow);
      const curveAll = curveRaw !== undefined && curveRaw > 5 ? curveRaw : undefined;
      const curveOff = curveAll !== undefined && flow !== undefined ? flow - curveAll : undefined;
      const signed = (off: number) => `${off > 0 ? "+" : off < 0 ? "−" : ""}${this._one(Math.abs(off))} K`;

      // Twenty-five degrees in a room is neither good nor bad until something says what
      // was wanted there. The heat pump knows; the card only had to ask it.
      const want = face === "room" && config.flow.rest_note === "target" ? this._num(circuit.target_room) : undefined;
      const target =
        want === undefined || room === undefined
          ? undefined
          : (() => {
              const off = room - want;
              const tone = Math.abs(off) < 0.6 ? MUTED : off > 0 ? "var(--ho-warn)" : TONE.heating;
              return {
                text: this._t("flow.target", { t: `${formatTemp(want, locale)}°` }),
                off: `${off > 0 ? "+" : off < 0 ? "−" : ""}${this._one(Math.abs(off))} K`,
                tone
              };
            })();

      // A return line at rest is a number with nothing behind it. What the heating curve
      // is asking for is the one of the two that still says something.
      const curveT = !active && config.flow.curve ? curveAll : undefined;

      // The room is what the circuit is for; flow and return are how it gets there.
      if (face !== "flow" && room !== undefined) {
        const base = { name: circuit.name, icon: circuit.icon, short: circuit.short, tone, on: active };
        if (!active) {
          // A circuit at rest moves no water, so its flow and return are standing figures
          // that say nothing. The room and what it was asked for are the whole story; the
          // curve's ask comes in beside the flow only when somebody wants it.
          const lastWords = config.flow.rest_note === "last" ? this._lastHeatWords(index) : undefined;
          return {
            ...base,
            label: resting.toUpperCase(),
            value: digits(room),
            pair: curveT === undefined ? undefined : { up: digits(flow), curve: digits(curveT), curveLabel: this._t("flow.curve") },
            target: lastWords ? { text: lastWords, off: "", tone: MUTED } : target,
            hint: [circuit.name, lastWords].filter(Boolean).join(" · ")
          };
        }
        // Running, the room's target explains nothing — the circuit is doing what it
        // can — so the row goes to the flow and what the curve wants of it, in one of
        // five arrangements. The return and the spread are in the tooltip whichever.
        const view = config.flow.running;
        const rl = ret === undefined ? "" : `${this._t("flow.rl")} ${digits(ret)}`;
        const detail = [rl, spread].filter(Boolean).join(" · ");
        const raised = curveAll !== undefined && this._pvMode();
        const curveWord = this._t(raised ? "flow.curve_pv" : "flow.curve");
        const curveTone = raised ? "var(--ho-sun)" : undefined;
        const curveText = curveAll === undefined ? undefined : `${curveWord} ${digits(curveAll)}`;
        const hint = [circuit.name, doing, sinceLong, detail, curveText && curveOff !== undefined ? `${curveText} ${signed(curveOff)}` : "", raised ? this._t("flow.curve_pv_how") : ""].filter(Boolean).join(" · ");
        const flowPair = (extra: Partial<NonNullable<BoxModel["pair"]>> = {}) =>
          curveAll === undefined
            ? { up: digits(flow), down: digits(ret), ...extra }
            : { up: digits(flow), curve: digits(curveAll), curveLabel: curveWord, curveTone, ...extra };
        if (view === "flow") {
          return {
            ...base,
            label: doing.toUpperCase(),
            labelRight: this._t("flow.room"),
            value: digits(flow),
            valueRight: digits(room),
            pair: { up: "", spread },
            target: curveText && curveOff !== undefined ? { text: curveText, off: signed(curveOff), tone: MUTED } : undefined,
            hint
          };
        }
        if (view === "spread") {
          // Flow, then how much of it the circuit keeps, then what the curve asked for.
          return {
            ...base,
            label: doing.toUpperCase(),
            value: digits(room),
            pair: { up: digits(flow), mid: spread, curve: curveAll === undefined ? undefined : digits(curveAll), curveLabel: curveWord, curveTone },
            hint
          };
        }
        if (view === "headline") {
          return {
            ...base,
            label: (curveText ?? doing).toUpperCase(),
            labelTone: curveText ? curveTone ?? "var(--ho-warn)" : undefined,
            value: digits(room),
            pair: { up: digits(flow), down: digits(ret), spread },
            hint
          };
        }
        return {
          ...base,
          label: doing.toUpperCase(),
          value: digits(room),
          pair:
            view === "stack"
              ? flowPair({ down: digits(ret) })
              : view === "pair"
                ? flowPair({ note: detail || undefined })
                : flowPair(),
          hint
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
        // Running: the return and spread under the flow. Resting, with the curve asked for: its target.
        sub: active && ret !== undefined
          ? `${this._t("flow.rl")} ${formatTemp(ret, locale)}${spread ? ` · ${spread}` : ""}`
          : curveT !== undefined
            ? `${this._t("flow.curve")} ${digits(curveT)}`
            : undefined,
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
    // The box fills by the mean; its two sensors, which the box has no room for, are said here.
    const top = this._num(store.top);
    const bottom = this._num(store.bottom);
    if (top !== undefined && bottom !== undefined && store.bottom) {
      parts.push(this._t("stores.layers", { top: formatTemp(top, locale), bottom: formatTemp(bottom, locale) }));
    }
    if (usable !== undefined) parts.push(`${this._one(usable)} kWh ${this._t("stores.above", { t: formatTemp(floor, locale) })}`);
    // The two ends the level is measured between, named: a bare range would leave that to guess.
    parts.push(`${this._t("stores.empty", { t: formatTemp(floor, locale) })} · ${this._t("stores.full", { t: formatTemp(ceiling, locale) })}`);
    // Set-points the card worked out itself say so, and what they are.
    const learned = this._learnedKeys(store);
    if (learned.length) {
      const set = this._marks(store);
      parts.push(
        this._t("learn.marks", {
          marks: learned.map((key) => `${this._t(`mark.${key}`)} ${formatTemp(set[key as "eco"] as number, locale)} °C`).join(", ")
        })
      );
    }
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
  private _flowFoot(running: boolean): { columns: Array<{ label: string; value: TemplateResult; sub?: TemplateResult | string }>; foot: TemplateResult[] } {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const foot: TemplateResult[] = [];
    // While the heat pump runs, where its heat comes from and what it does with it read
    // best as three named columns: the electricity, the ambient heat, the pump itself.
    const columns: Array<{ label: string; value: TemplateResult; sub?: TemplateResult | string }> = [];
    const has = (item: FootItem) => config.flow.foot_items.includes(item);
    if (config.flow.foot_items.length === 0) return { columns, foot };

    const live = this._live();
    const heat = running ? live.heat ?? 0 : 0;
    const electric = running ? live.electric ?? 0 : 0;
    const air = Math.max(0, heat - electric);
    const shares = running ? this._shares(live.electric) : undefined;
    const dominant = this._dominant(shares);
    const outdoor = this._temp(config.entities.outdoor);
    const ambient = this._t("ambient." + config.source);

    if (running && has("power") && config.entities.electric_power) {
      columns.push({
        label: this._t("foot.power"),
        value: html`${formatPower(electric, locale)} kW`,
        sub: html`<span style="color:${dominant ? SOURCE_TONE[dominant] : "inherit"}">${this._sourceLabel(shares)}</span>`
      });
    }
    if (running && has("ambient") && config.entities.heat_power && config.entities.electric_power) {
      columns.push({
        label: this._t("foot.ambient"),
        value: html`${formatPower(air, locale)} kW`,
        sub: `${ambient}${outdoor !== undefined ? ` ${outdoor} °C` : ""}`
      });
    }
    if (!running && has("ambient") && outdoor !== undefined) {
      foot.push(html`<span>${mark("air", PALETTE.muted)}<span><b>${outdoor} °C</b> ${this._t("flow.outside")}</span></span>`);
    }

    // What the circuits are pulling out of the buffer: its litres times how fast it
    // falls. The split layout writes this on the pipe; two columns have no pipe.
    const carried = has("buffer") && config.flow.layout === "columns" ? this._fromBuffer() : undefined;
    const drawn = carried ? this._draw(carried.store) : undefined;
    if (drawn !== undefined) {
      foot.push(html`<span style="color:${TONE.heating}">${mark("drop", TONE.heating)}<b>${formatPower(drawn, locale)} kW</b> ${this._t("flow.from_buffer")}</span>`);
    }

    // The hot water store cools too, and the Eco mark is where the heat pump gives in.
    const due = has("due") ? this._hotWaterDue() : undefined;
    if (due) foot.push(html`<span style="color:${TONE.hot_water}">${mark("drop", TONE.hot_water)}<b>${due}</b></span>`);

    if (running) {
      const flowT = has("pump") ? this._num(config.entities.flow) : undefined;
      const retT = has("pump") ? this._num(config.entities.return) : undefined;
      const volume = has("volume") ? this._num(config.entities.volume_flow) : undefined;
      const litres = volume === undefined ? "" : `${formatNumber(volume, locale, 0)} ${unitOf(stateOf(this.hass, config.entities.volume_flow)) || "l/h"}`;
      if (flowT !== undefined) {
        const spread = retT === undefined ? "" : `Δ ${this._one(flowT - retT)} K`;
        columns.push({
          label: this._t("foot.pump"),
          value: html`${formatTemp(flowT, locale)}${retT === undefined ? "" : ` → ${formatTemp(retT, locale)}`} °C`,
          sub: [spread, litres].filter(Boolean).join(" · ")
        });
      } else if (litres) {
        columns.push({ label: this._t("foot.pump"), value: html`${litres}` });
      }
    }
    if (!running && has("day")) {
      const today = this._days()?.at(-1);
      if (today) {
        if (config.flow.balance) {
          // The middle of the circle already says when the last run was and how long it
          // lasted. Saying it twice costs the line that could carry the day instead.
          const minutes = (["heating", "hot_water", "cooling", "defrost"] as const)
            .map((k) => today.minutes[k] ?? 0)
            .reduce((a, b) => a + b, 0);
          const e = config.entities;
          const kwh = (id: string | undefined) => energyKwh(stateOf(this.hass, id));
          const heatSum = (kwh(e.heating_heat_today) ?? 0) + (kwh(e.hot_water_heat_today) ?? 0) + (kwh(e.heat_today) ?? 0);
          const elecSum = (kwh(e.heating_electric_today) ?? 0) + (kwh(e.hot_water_electric_today) ?? 0) + (kwh(e.electric_today) ?? 0);
          const az = elecSum > 0.05 ? heatSum / elecSum : undefined;
          foot.push(html`<span>${this._t("day.balance")} <b>${this._t("flow.starts_n", { n: String(today.starts) })}</b>${
            minutes >= 1 ? html` · <b>${this._hm(minutes)}</b>` : nothing
          }${az === undefined ? nothing : html` · ${this._t("cop.az")} <b>${this._one(az)}</b>`}</span>`);
        } else {
          foot.push(html`<span>${this._t("flow.today_starts")} <b>${this._t("flow.starts_n", { n: String(today.starts) })}</b></span>`);
          const last = lastRun(today);
          if (last) {
            foot.push(
              html`<span>${this._t("flow.last")} ${this._t("kind." + last.kind)} <b>${clock(new Date(last.from), locale)}–${clock(new Date(last.to), locale)}</b></span>`
            );
          }
        }
      }
    }
    for (const extra of has("extras") ? config.flow.extras : []) {
      if (extra.running_only && !running) continue;
      const entity = stateOf(this.hass, extra.entity);
      if (!entity) continue;
      const n = numberOf(entity);
      const value = n === undefined ? entity.state : formatNumber(n, locale, Math.abs(n) < 100 ? 1 : 0);
      const name = extra.name ?? String(entity.attributes.friendly_name ?? extra.entity);
      foot.push(html`<span>${name} <b>${value}${unitOf(entity) ? " " + unitOf(entity) : ""}</b></span>`);
    }
    return { columns, foot };
  }

  private _footBlock(running: boolean) {
    const { columns, foot } = this._flowFoot(running);
    if (!columns.length && !foot.length) return nothing;
    return html`<div class="foot">
      ${columns.length
        ? html`<div class="foot-cols" style="--cols:${columns.length}">${columns.map(
            (c) => html`<div class="foot-col"><small>${c.label}</small><b>${c.value}</b>${c.sub ? html`<span>${c.sub}</span>` : nothing}</div>`
          )}</div>`
        : nothing}
      ${foot.length ? html`<div class="foot-line">${foot}</div>` : nothing}
    </div>`;
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

  // ─── origin layout ─────────────────────────────────────────

  /** Several entities on one history page; a single one opens its more-info dialog. */
  private _history(ids: Array<string | number | undefined>) {
    const list = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.includes(".")))];
    if (!list.length) return;
    if (list.length === 1) {
      this._moreInfo(list[0]);
      return;
    }
    window.history.pushState(null, "", `/history?entity_id=${encodeURIComponent(list.join(","))}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  private _heights(store: StoreConfig & { kind: StoreKind }): Heights {
    const fallback = store.kind === "hot_water" ? HOT_WATER_HEIGHTS : BUFFER_HEIGHTS;
    const ok = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
    const top = ok(store.top_height) ? (store.top_height as number) : fallback.top;
    const bottom = ok(store.bottom_height) ? (store.bottom_height as number) : fallback.bottom;
    return top > bottom ? { top, bottom } : fallback;
  }

  /** "h:mm h" for the day block. */
  private _hmText(minutes: number): string {
    const m = Math.round(minutes);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ${this._t("day.hours")}`;
  }

  /**
   * A store standing upright: two colour zones split where its water stops being usable,
   * a thin dark line on that edge, both temperatures at the height of their sensor.
   */
  private _originTank(
    x: number,
    y: number,
    w: number,
    h: number,
    store: ResolvedConfig["stores"][number],
    tone: string,
    active: boolean,
    threshold: number
  ) {
    const heights = this._heights(store);
    const top = this._num(store.top);
    const bottom = store.bottom ? this._num(store.bottom) : undefined;
    const edge = edgeAt(top, bottom ?? top, heights, threshold);
    const cut = y + h * (1 - edge);
    const clip = `ho-tank-${store.kind}-${x}`;
    const target = store.marks?.target;
    const pills = ([
      [heights.top, top],
      [heights.bottom, bottom]
    ] as Array<[number, number | undefined]>)
      .filter(([, v]) => v !== undefined)
      .map(([f, v]) => {
        const yy = y + h * (1 - f);
        return svg`<rect x=${x + 4} y=${yy - 10} width=${w - 8} height="20" rx="6" class="o-pill"/>
          <text x=${x + w / 2} y=${yy + 4.5} text-anchor="middle" class="o-pill-text">${this._one(v as number)}°</text>`;
      });
    return svg`<g class="o-tank ${active ? "active" : ""}" style="--glow:${tone}" @click=${() => this._history([store.top, store.bottom, typeof target === "string" ? target : undefined])}>
      <title>${store.name}</title>
      <defs><clipPath id=${clip}><rect x=${x} y=${y} width=${w} height=${h} rx=${w / 2}/></clipPath></defs>
      <g clip-path="url(#${clip})">
        <rect x=${x} y=${y} width=${w} height=${Math.max(0, cut - y)} fill=${tempTone(top)}/>
        <rect x=${x} y=${cut} width=${w} height=${Math.max(0, y + h - cut)} fill=${tempTone(bottom ?? top)}/>
        ${edge > EDGE_MIN && edge < 1 ? svg`<rect x=${x} y=${cut - 1} width=${w} height="2" fill="#111"/>` : nothing}
      </g>
      <rect x=${x - 3} y=${y - 3} width=${w + 6} height=${h + 6} rx=${w / 2 + 3} fill="none" stroke=${tone} stroke-width=${active ? 2 : 1.5} class="o-rim"/>
      ${edge > EDGE_MIN && edge < 1
        ? svg`<text x=${x + w + 5} y=${cut + 3} class="o-tick">${formatNumber(threshold, this._locale, 0)}°</text>`
        : nothing}
      ${pills}
    </g>`;
  }

  /**
   * Where the heat comes from and where it goes, read top to bottom. Top: electricity
   * (and where it comes from) and ambient heat, flowing into the ring that adds them up.
   * Middle: the two stores. Bottom: the day, and each circuit in one line.
   */
  private _renderOrigin() {
    const config = this._config as ResolvedConfig;
    const locale = this._locale;
    const mode = this._mode();
    const running = isRunning(mode.kind);
    const live = this._live();
    const heat = running ? Math.max(0, live.heat ?? 0) : 0;
    const electric = running ? Math.max(0, live.electric ?? 0) : 0;
    const air = Math.max(0, heat - electric);
    const shares = running ? this._shares(live.electric) : undefined;
    const outdoor = this._num(config.entities.outdoor);
    const cx = 226;
    const cy = 86;
    const r = 54;
    const out: TemplateResult[] = [];
    const t = (x: number, y: number, text: unknown, cls: string, anchor: "start" | "middle" | "end" = "start", fill?: string) =>
      svg`<text x=${x} y=${y} class=${cls} text-anchor=${anchor} style=${fill ? `fill:${fill}` : ""}>${text}</text>`;

    // ── top: electricity left, ambient heat right ──
    out.push(t(16, 26, this._t("origin.power").toUpperCase(), "o-cap"));
    out.push(svg`<text x="16" y="52" class="o-value">${formatPower(electric, locale)}<tspan class="o-unit"> kW</tspan></text>`);
    if (running && electric > 0.02) {
      const split = (["solar", "battery", "grid"] as ElectricSource[]).map((s) => [s, shares?.[s] ?? 0] as const).filter(([, v]) => v > 0.005);
      const total = split.reduce((a, [, v]) => a + v, 0);
      let at = 16;
      const bars = total
        ? split.map(([s, v]) => {
            const width = (112 * v) / total;
            const bar = svg`<rect x=${at} y="62" width=${width} height="6" fill=${SOURCE_TONE[s]}/>`;
            at += width;
            return bar;
          })
        : [svg`<rect x="16" y="62" width="112" height="6" fill="var(--ho-power)"/>`];
      out.push(svg`<g clip-path="url(#ho-bar-now)">${bars}</g>`);
      if (total) {
        out.push(svg`<text x="16" y="82" class="o-small">${split.map(
          ([s, v], i) => svg`<tspan style="fill:${SOURCE_TONE[s]}">${i ? " · " : ""}${formatPower((electric * v) / total, locale)} ${this._t(`origin.src_${s}`)}</tspan>`
        )}</text>`);
      }
      if (heat > 0) out.push(t(16, 98, this._t("origin.share", { p: String(Math.round((100 * electric) / heat)) }), "o-small o-muted"));
    } else out.push(t(16, 76, this._t("origin.idle"), "o-small o-muted"));

    out.push(t(436, 26, this._t("origin.ambient").toUpperCase(), "o-cap", "end"));
    out.push(svg`<text x="436" y="52" text-anchor="end" class="o-value" style="fill:${running ? "var(--ho-air)" : "var(--ho-muted)"}">${formatPower(air, locale)}<tspan class="o-unit"> kW</tspan></text>`);
    if (outdoor !== undefined) out.push(t(436, 72, this._t(`origin.${config.source}`, { t: this._one(outdoor) }), "o-small o-muted", "end"));
    if (running && heat > 0) out.push(t(436, 88, this._t("origin.share", { p: String(Math.round((100 * air) / heat)) }), "o-small", "end", "var(--ho-air)"));

    // The lines arrive exactly at their own arc: electricity on the left, ambient heat on the right.
    const sun = this._dominant(shares);
    out.push(svg`<path d="M134 44 C152 44 150 ${cy} ${cx - r - 6} ${cy}" class="o-line ${running ? "flowing" : ""}" style="stroke:${sun ? SOURCE_TONE[sun] : "var(--ho-power)"}"/>`);
    out.push(svg`<path d="M346 44 C302 44 302 ${cy} ${cx + r + 6} ${cy}" class="o-line ${running ? "flowing" : ""}" style="stroke:var(--ho-air)"/>`);

    // The ring: electricity plus ambient heat is the heat.
    const C = 2 * Math.PI * r;
    const arcTone: Record<string, string> = { air: "var(--ho-air)", power: "var(--ho-power)", ...SOURCE_TONE };
    const arcs = ringArcs(heat, electric, shares).map(
      (a) => svg`<circle cx=${cx} cy=${cy} r=${r} fill="none" stroke=${arcTone[a.part]} stroke-width="10"
        stroke-dasharray="${((C * a.length) / 360).toFixed(1)} ${C.toFixed(1)}" transform="rotate(${a.start.toFixed(1)} ${cx} ${cy})"/>`
    );
    const flowT = this._num(config.entities.flow);
    const retT = this._num(config.entities.return);
    const volume = this._num(config.entities.volume_flow);
    const hint =
      flowT !== undefined && retT !== undefined
        ? this._t("origin.pump_hint", {
            k: this._one(flowT - retT),
            v: volume === undefined ? "" : `${formatNumber(volume, locale, 0)} ${unitOf(stateOf(this.hass, config.entities.volume_flow)) || "l/h"}`
          })
        : "";
    out.push(svg`<g class="o-ring" @click=${() => this._moreInfo(config.entities.mode)}>
      <title>${hint}</title>
      <circle cx=${cx} cy=${cy} r=${r} fill="none" class="o-track" stroke-width="10"/>
      ${arcs}
      ${running
        ? svg`<text x=${cx} y=${cy + 2} text-anchor="middle" class="o-heat">${formatNumber(heat, locale, 1)}</text>
            <text x=${cx} y=${cy + 18} text-anchor="middle" class="o-cap">${this._t("origin.heat")}</text>
            ${live.cop !== undefined ? svg`<text x=${cx} y=${cy + 34} text-anchor="middle" class="o-cop">COP ${this._one(live.cop)}</text>` : nothing}`
        : svg`<text x=${cx} y=${cy + 7} text-anchor="middle" class="o-pause">${this._t("origin.pause")}</text>`}
    </g>`);
    if (running && flowT !== undefined) {
      out.push(t(cx, 162, this._t("origin.pump", { flow: this._one(flowT), ret: retT === undefined ? "–" : this._one(retT) }), "o-small o-muted", "middle"));
    } else if (!running && mode.since !== undefined && Date.now() - mode.since < DAY) {
      out.push(t(cx, 162, this._t("origin.paused_since", { time: clock(new Date(mode.since), locale) }), "o-small o-muted", "middle"));
    }

    // ── middle: the stores ──
    const hw = config.stores.find((s) => s.kind === "hot_water");
    const buf = config.stores.find((s) => s.kind === "buffer");
    const tankY = 196;
    const tankH = 112;
    if (hw) {
      const active = mode.kind === "hot_water";
      out.push(svg`<path d="M${cx} 170 L${cx} 180 L186 180 L186 190" class="o-line ${active ? "flowing" : "idle"}" style="stroke:var(--ho-hot-water)"/>`);
      const mix = typeof hw.mix === "number" ? hw.mix : 38;
      const cold = typeof hw.cold === "number" ? hw.cold : 10;
      const litresMode = hw.usable !== "kwh";
      const floor = this._floor(hw);
      out.push(this._originTank(160, tankY, 52, tankH, hw, "var(--ho-hot-water)", active, litresMode ? mix + 1 : floor));
      const top = this._num(hw.top);
      const bottom = hw.bottom ? this._num(hw.bottom) : undefined;
      const x = 146;
      out.push(t(x, tankY + 8, hw.name.toUpperCase(), "o-cap", "end", "var(--ho-hot-water)"));
      if (litresMode) {
        const litres = showerLitres({ top, bottom, heights: this._heights(hw), volume: hw.volume, mix, cold });
        if (litres !== undefined) {
          out.push(svg`<text x=${x} y=${tankY + 38} text-anchor="end" class="o-big">≈ ${formatNumber(Math.round(litres / 10) * 10, locale, 0)}<tspan class="o-unit"> l</tspan></text>`);
          out.push(t(x, tankY + 56, this._t("origin.shower", { t: formatNumber(mix, locale, 0) }), "o-small o-muted", "end"));
        }
      } else {
        const usable = usableKwh(top, bottom, this._heights(hw), hw.volume, floor);
        if (usable !== undefined) {
          out.push(svg`<text x=${x} y=${tankY + 38} text-anchor="end" class="o-big">${this._one(usable)}<tspan class="o-unit"> kWh</tspan></text>`);
          out.push(t(x, tankY + 56, this._t("origin.kwh_usable", { t: formatNumber(floor, locale, 0) }), "o-small o-muted", "end"));
        }
      }
      const target = this._marks(hw).target;
      if (target !== undefined) out.push(t(x, tankY + 74, this._t("origin.target", { t: formatNumber(target, locale, 0) }), "o-small o-strong", "end", "var(--ho-hot-water)"));
      const reasonRaw = stateOf(this.hass, config.entities.hot_water_reason)?.state;
      const reason = reasonRaw && !["unknown", "unavailable", ""].includes(reasonRaw) ? reasonRaw.split(" -> ")[0].trim() : undefined;
      if (reason) out.push(svg`<text x=${x} y=${tankY + 89} text-anchor="end" class="o-small o-reason"><title>${reasonRaw}</title>${reason.length > 26 ? `${reason.slice(0, 25)}…` : reason}</text>`);
      const days = this._num(config.entities.legionella_days);
      if (days !== undefined) {
        const words = days < 1 ? this._t("origin.legio_today") : days < 2 ? this._t("origin.legio_one") : this._t("origin.legio", { n: String(Math.floor(days)) });
        const tone = days >= 10 ? "var(--ho-legio-late)" : days >= 5 ? "var(--ho-warn)" : "var(--ho-legio-ok)";
        const width = words.length * 5.6 + 16;
        out.push(svg`<g class="o-badge" @click=${() => this._moreInfo(config.entities.legionella_days)}>
          <rect x=${x - width} y=${tankY + 98} width=${width} height="15" rx="7.5" fill="none" stroke=${tone}/>
          <text x=${x - width / 2} y=${tankY + 109} text-anchor="middle" class="o-badge-text" style="fill:${tone}">${words}</text>
        </g>`);
      }
    }
    const carried = this._fromBuffer();
    if (buf) {
      const charging = mode.kind === "heating";
      const draining = carried?.store === buf;
      out.push(svg`<path d="M${cx} 170 L${cx} 180 L266 180 L266 190" class="o-line ${charging ? "flowing" : "idle"}" style="stroke:var(--ho-heating)"/>`);
      const floor = this._floor(buf);
      out.push(this._originTank(240, tankY, 52, tankH, buf, "var(--ho-heating)", charging, floor));
      const x = 318;
      const state = charging ? this._t("origin.charging") : draining ? this._t("origin.giving") : "";
      out.push(t(x, tankY + 8, `${buf.name.toUpperCase()}${state ? ` · ${state.toUpperCase()}` : ""}`, "o-cap", "start", "var(--ho-heating)"));
      const usable = usableKwh(this._num(buf.top), buf.bottom ? this._num(buf.bottom) : undefined, this._heights(buf), buf.volume, floor);
      if (usable !== undefined) out.push(svg`<text x=${x} y=${tankY + 38} class="o-big">${this._one(usable)}<tspan class="o-unit"> kWh</tspan></text>`);
      out.push(t(x, tankY + 56, this._t("origin.usable_to", { t: formatNumber(floor, locale, 0) }), "o-small o-muted"));
      let note: string | undefined;
      const top = this._num(buf.top);
      if (charging && this._pvMode() && top !== undefined) {
        const ceiling = this._ceiling(buf, floor, top);
        const fall = this._drift(buf, true);
        const rise = fall === undefined ? undefined : -fall;
        if (rise !== undefined && rise >= 1 && ceiling - top >= 0.3) {
          const hours = (ceiling - top) / rise;
          if (hours <= 8) note = this._t("flow.full_at", { time: clock(new Date(Date.now() + hours * 3600_000), locale) });
        }
      } else if (!charging) note = this._lasts(buf, floor);
      if (note) out.push(svg`<text x=${x} y=${tankY + 75} class="o-note"><title>${this._learnedHint(buf)}</title>${note}</text>`);
    }

    // ── bottom: the day, and where the heat goes ──
    const today = this._days()?.at(-1);
    const e = config.entities;
    const kwh = (id: string | undefined) => energyKwh(stateOf(this.hass, id));
    const elecSum = (kwh(e.heating_electric_today) ?? 0) + (kwh(e.hot_water_electric_today) ?? 0) + (kwh(e.electric_today) ?? 0);
    const heatSum = (kwh(e.heating_heat_today) ?? 0) + (kwh(e.hot_water_heat_today) ?? 0) + (kwh(e.heat_today) ?? 0);
    const dayY = 334;
    const dayLines: string[] = [];
    const first = [
      elecSum > 0.05 ? this._t("origin.day_power", { kwh: this._one(elecSum) }) : "",
      elecSum > 0.05 && heatSum > 0 ? this._t("origin.day_az", { az: this._one(heatSum / elecSum) }) : ""
    ].filter(Boolean);
    if (first.length) dayLines.push(first.join(" · "));
    if (today) {
      const second = [
        (today.minutes.heating ?? 0) >= 1 ? this._t("origin.day_heating", { t: this._hmText(today.minutes.heating ?? 0) }) : "",
        (today.minutes.hot_water ?? 0) >= 1 ? this._t("origin.day_water", { t: this._hmText(today.minutes.hot_water ?? 0) }) : ""
      ].filter(Boolean);
      if (second.length) dayLines.push(second.join(" · "));
      dayLines.push(today.starts === 1 ? this._t("origin.day_start") : this._t("origin.day_starts", { n: String(today.starts) }));
    }
    if (dayLines.length) {
      out.push(t(16, dayY, this._t("origin.today").toUpperCase(), "o-cap"));
      dayLines.forEach((line, i) => out.push(t(16, dayY + 18 + i * 16, line, i === 0 ? "o-small o-strong" : "o-small o-muted")));
    }

    const circuits = config.circuits.filter((c) => c.kind === "heating");
    const anyOn = circuits.some((c) => this._circuitActive(c));
    if (buf && circuits.length) out.push(svg`<path d="M266 312 L266 318 L332 318 L332 326" class="o-line ${anyOn ? "flowing" : "idle"}" style="stroke:var(--ho-heating)"/>`);
    circuits.forEach((c, i) => {
      const x = 228;
      const y = 328 + i * 36;
      const w = 208;
      const on = this._circuitActive(c);
      const room = this._num(c.room);
      const flow = this._num(c.flow);
      const curve = this._num(c.curve_flow);
      let status: TemplateResult;
      if (on) {
        const dev = flow !== undefined && curve !== undefined && curve > 5 ? flow - curve : undefined;
        const ok = dev === undefined || Math.abs(dev) <= config.flow.on_target;
        const tone = ok ? "var(--ho-legio-ok)" : "var(--ho-warn)";
        const words = ok ? this._t("origin.on_target") : `${dev! > 0 ? "+" : "−"}${this._one(Math.abs(dev!))} K`;
        status = svg`<text x=${x + w - 22} y=${y + 19} text-anchor="end" class="o-small" style="fill:${tone}">${words}</text>
          <circle cx=${x + w - 12} cy=${y + 15} r="4" fill=${tone}/>`;
      } else {
        const index = config.circuits.indexOf(c);
        const last = this._lastHeat[index];
        let words = this._t("origin.off");
        if (typeof last === "number") {
          const days = Math.round((midnight(new Date()) - midnight(new Date(last))) / DAY);
          words = days <= 0 ? this._t("origin.off_since", { time: clock(new Date(last), locale) }) : days === 1 ? this._t("origin.off_yesterday") : this._t("origin.off");
        }
        status = t(x + w - 10, y + 19, words, "o-small o-muted", "end");
      }
      out.push(svg`<g class="o-circuit ${on ? "on" : "off"}" @click=${() => this._history([c.room, c.flow, c.curve_flow])}>
        <title>${c.name}</title>
        <rect x=${x} y=${y} width=${w} height="30" rx="8" class="o-row"/>
        <text x=${x + 10} y=${y + 19} class="o-cap" style="fill:${on ? "var(--ho-heating)" : "var(--ho-muted)"}">${c.short || c.name.slice(0, 3).toUpperCase()}</text>
        ${room !== undefined ? svg`<text x=${x + 38} y=${y + 21} class="o-room">${this._one(room)}°</text>` : nothing}
        ${on && flow !== undefined ? svg`<text x=${x + 98} y=${y + 19} class="o-small o-flow">VL ${this._one(flow)}°</text>` : nothing}
        ${status}
      </g>`);
    });

    const height = Math.max(dayLines.length ? dayY + 18 + dayLines.length * 16 : 0, circuits.length ? 328 + circuits.length * 36 : 0, tankY + tankH + 8) + 8;
    return html`<div class="origin">
      <svg viewBox="0 0 452 ${height}" role="img" aria-label=${this._t("card.title")}>
        <defs><clipPath id="ho-bar-now"><rect x="16" y="62" width="112" height="6" rx="3"/></clipPath></defs>
        <rect x="16" y="62" width="112" height="6" rx="3" class="o-track-fill" style=${running && electric > 0.02 ? "" : "display:none"}/>
        ${out}
      </svg>
    </div>`;
  }

  private _renderFlow() {
    const config = this._config as ResolvedConfig;
    if (config.flow.layout === "origin") return this._renderOrigin();
    if (this._wide) return this._renderSplit(WIDE);
    if (config.flow.layout === "columns" && !this._narrow) return this._renderColumns();
    return this._renderSplit(SPLIT);
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
    const rightY = (i: number) => 6 + i * (BOX_H_COL + COL_GAP);
    const leftY = (i: number) => cy + reach + 22 + i * (BOX_H_COL + COL_GAP);
    const rightCount = bufIx.length + circuits.length;
    const H = Math.max(rightY(rightCount - 1) + BOX_H_COL, leftY(hotIx.length - 1) + BOX_H_COL, cy + reach + 6) + 6;

    const style = { labels: config.flow.labels, gauge: config.flow.gauge, scale: config.flow.scale, restColour: config.flow.rest_colour };
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
    const headY = rightY(0) + BOX_H_COL / 2;
    parts.push(connector(cx + reach, cy, COL_R, headY, 1, {
      tone: bufIx.length ? STORE_TONE.buffer : TONE.heating,
      fed: running && mode.kind === "heating",
      dashed: !running,
      dim: !running && !carried,
      track: PALETTE.track,
      surface: PALETTE.surface
    }));

    // The manifold: every circuit hangs on one upright under the buffer.
    const circuitYs = circuits.map((_, i) => rightY(bufIx.length + i) + BOX_H_COL / 2);
    if (circuitYs.length) {
      parts.push(spine(COL_R, headY, COL_R, circuitYs, {
        tone: TONE.heating,
        surface: PALETTE.surface,
        track: PALETTE.track,
        live: Boolean(carried) || (running && mode.kind === "heating"),
        taking: config.circuits.map((c) => this._circuitActive(c))
      }));
    }

    let uid = 0;
    const draw = (model: BoxModel, x: number, y: number, w: number, entity: string | undefined) => {
      uid += 1;
      parts.push(box(model, x, y, w, BOX_H_COL, PALETTE, style, uid, () => this._moreInfo(entity)));
    };
    hotIx.forEach((x, k) => draw(stores[x.i], 1, leftY(k), COL_W, x.st.top));
    bufIx.forEach((x, k) => draw(stores[x.i], COL_R, rightY(k), DRAW_W - COL_R - 1, x.st.top));
    circuits.forEach((model, i) => {
      const circuit = config.circuits[i];
      draw(model, COL_R, rightY(bufIx.length + i), DRAW_W - COL_R - 1, circuit?.pump ?? circuit?.state ?? circuit?.flow ?? circuit?.temperature);
    });

    if (showClock) parts.push(this._dial(cx, cy, rRing, days));
    parts.push(svg`<circle cx=${cx} cy=${cy} r=${R_COL_PUMP} fill=${PALETTE.surface} stroke=${PALETTE.hairline} stroke-width="2"/>`);
    if (running && hasBoth) parts.push(this._ring(cx, cy, R_COL_PUMP, heat, electric, shares));
    parts.push(this._centre(cx, cy, R_COL_PUMP, heat, electric, live.cop, running, mode));

    return html`
      <div class="section">
        <svg viewBox="0 0 ${DRAW_W} ${H}" role="img" aria-label=${this._modeLabel(mode.kind, mode.raw)}>${parts}</svg>
        ${this._footBlock(running)}
      </div>
    `;
  }

  private _renderSplit(g: typeof SPLIT) {
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
    const rRing = showClock ? g.r + 7 : g.r;
    const reach = rRing + 4;
    const outer = showClock ? rRing + 26 : rRing + 2;

    const rows = Math.max(stores.length, circuits.length);
    const stack = rows ? rows * g.boxH + (rows - 1) * g.gap : 0;
    const H = Math.max(stack, 2 * outer + 4) + 8;
    const y0 = (H - stack) / 2;
    // The blocks keep the true middle; only the heat pump rides above it.
    const cy = Math.max(outer + 2, Math.round(H / 2) - g.lift);
    const cx = g.W / 2;
    const leftEdge = 1 + g.boxW;
    const rightEdge = g.W - g.boxW - 1;
    const midOf = (i: number) => y0 + i * (g.boxH + g.gap) + g.boxH / 2;

    if (this._narrow) return this._renderFlowList(stores.concat(circuits), running);

    const style = { labels: config.flow.labels, gauge: config.flow.gauge, scale: config.flow.scale, restColour: config.flow.rest_colour };
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
      const lasts = config.flow.buffer_line !== "line" ? this._lasts(carried.store, floor) : undefined;
      const kw = config.flow.buffer_line !== "line" ? this._draw(carried.store) : undefined;
      const label = [kw === undefined ? "" : `${formatPower(kw, this._locale)} kW`, lasts ?? ""].filter(Boolean).join(" · ");
      parts.push(bypass(leftEdge, midOf(bufferIndex), rightEdge, buffered, {
        cx, cy, ring: rRing, tone: TONE.heating, surface: PALETTE.surface,
        label: label || undefined, hint: this._t("forecast.how")
      }));
    }

    let uid = 0;
    stores.forEach((model, i) => {
      uid += 1;
      parts.push(box(model, 1, midOf(i) - g.boxH / 2, g.boxW, g.boxH, PALETTE, style, uid, () => this._moreInfo(config.stores[i]?.top)));
    });
    circuits.forEach((model, i) => {
      uid += 1;
      const circuit = config.circuits[i];
      const entity = circuit?.pump ?? circuit?.state ?? circuit?.flow ?? circuit?.temperature;
      parts.push(box(model, rightEdge, midOf(i) - g.boxH / 2, g.boxW, g.boxH, PALETTE, style, uid, () => this._moreInfo(entity)));
    });

    if (showClock) parts.push(this._dial(cx, cy, rRing, days));

    parts.push(svg`<circle cx=${cx} cy=${cy} r=${g.r} fill=${PALETTE.surface} stroke=${PALETTE.hairline} stroke-width="2"/>`);
    if (running && hasBoth) parts.push(this._ring(cx, cy, g.r, heat, electric, shares));
    parts.push(this._centre(cx, cy, g.r, heat, electric, live.cop, running, mode));

    return html`
      <div class="section">
        <svg class=${g === WIDE ? "wide" : ""} viewBox="0 0 ${g.W} ${H}" role="img" aria-label=${this._modeLabel(mode.kind, mode.raw)}>${parts}</svg>
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
      sun: config.flow.ring === "sun" ? this._daylight() : undefined,
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
    // The wide circle of the columns takes the larger type; the split's smaller one keeps the smaller.
    const TYPE = r >= 40 ? TL : T;
    if (!running) {
      const last = lastRun(this._days()?.at(-1));
      if (!last) {
        return svg`<text x=${cx} y=${cy + 4} text-anchor="middle" font-size="12" font-weight="600"
          fill=${PALETTE.muted}>${this._modeLabel(mode.kind, mode.raw)}</text>`;
      }
      // The word names what it did last, so the length beside it is that part's own: a
      // run that heated for an hour and then made hot water for twenty minutes reads
      // "20 min Warmwasser", and the dial shows the hour before it.
      const span = formatSpan((last.to - last.lastFrom) / 60000);
      const short = span.hours !== undefined
        ? `${span.hours}:${String(span.minutes ?? 0).padStart(2, "0")} ${this._t("unit.h")}`
        : `${span.minutes ?? 0} ${this._t("unit.min")}`;
      // A symbol alone leaves the reader to guess what it meant. Where the circle is wide
      // enough at that height, the word itself goes there; the symbol is the fallback,
      // and it has to be shifted by half its own width to sit on the middle.
      const word = this._t(`kind.${last.kind}`);
      const sec = TYPE.small;
      const chord = 2 * Math.sqrt(Math.max(0, r * r - 21 * 21)) - 8;
      const fits = textWidth(word, sec) <= chord;
      const mark = last.kind === "hot_water" ? "water" : last.kind === "heating" ? "flame" : undefined;
      return svg`
        <text x=${cx} y=${cy - 12} text-anchor="middle" font-size=${TYPE.micro} letter-spacing="0.08em"
          fill=${PALETTE.muted}>${this._t("flow.last").toUpperCase()}</text>
        <text x=${cx} y=${cy + 6} text-anchor="middle" font-size=${TYPE.figure} font-weight="700" fill=${PALETTE.ink}>${short}</text>
        ${fits
          ? svg`<text x=${cx} y=${cy + 21} text-anchor="middle" font-size=${sec} font-weight="600" fill=${TONE[last.kind]}>${word}</text>`
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
              <span class="n">${m.name}<small>${m.label}${m.target ? ` · ${m.target.text} ${m.target.off}` : ""}</small></span>
              <span class="v">${[m.value, m.valueRight ? `${m.valueRight} ${m.labelRight ?? ""}`.trim() : undefined, m.pair?.up ? `↑ ${m.pair.up}` : undefined]
                .filter(Boolean)
                .join(" · ")}</span>
            </div>`
          )}
        </div>
        ${this._footBlock(running)}
      </div>
    `;
  }

  // ─── today as a thread ─────────────────────────────────────

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
