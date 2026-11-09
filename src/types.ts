import type { IconName } from "./icons";

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  locale?: { language?: string };
  language?: string;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
}

/** The four things a heat pump does, plus the two ways it does nothing. */
export type ModeKind = "heating" | "hot_water" | "cooling" | "defrost" | "blocked" | "idle";

export type CardShape = "standard" | "compact";
export type StoreKind = "hot_water" | "buffer";
export type CircuitKind = "heating" | "circulation";
/** What a box writes beside its symbol. */
export type LabelStyle = "short" | "icon" | "name";
/** Which face a heating circuit shows; `room_plain` is the room without its target. */
export type CircuitFace = "room" | "room_plain" | "flow";
/** Where a store's level is drawn. */
export type GaugeStyle = "zones" | "scale" | "bar" | "box";
/** Which way a store is going, and whether the rate stands beside the arrow. */
export type TrendStyle = "rate" | "arrow" | "none";
/** What rings the heat pump: the day's dial with or without the hours of daylight, or no dial at all. */
export type RingStyle = "sun" | "plain" | "shares";
/** What the middle of the heat pump reads. */
export type CentreValue = "heat" | "power" | "both";
/** How much of the foot line is kept. */
export type FootStyle = "full" | "no_spread" | "drive" | "none";
/**
 * The parts of the foot line, each one kept or dropped on its own: the electricity and
 * where it comes from, the ambient heat (the outdoor temperature at rest), what the
 * circuits pull from the buffer, when hot water is due, the heat pump's flow and return,
 * its volume flow, the day's figures at rest, and the extras.
 */
export type FootItem = "power" | "ambient" | "buffer" | "due" | "pump" | "volume" | "day" | "extras";
/** What is drawn while a buffer carries the circuits on its own. */
export type BufferLine = "range" | "line" | "none";
/** How a running circuit's box is arranged: what stands right of the room, and what under it. */
export type RunningFace = "pair" | "quiet" | "headline" | "flow" | "stack" | "spread";
/** What a resting circuit writes under its room: when it last heated, the room's target, or nothing. */
export type RestNote = "last" | "target" | "none";
/** What a discharging store writes where its word would stand. */
export type StoreHead = "word" | "left" | "draw";
/** Where the ambient heat comes from. */
export type HeatSource = "air" | "ground" | "water";
/** Where the electricity comes from right now. */
export type ElectricSource = "solar" | "battery" | "grid";

export interface ModeWords {
  heating?: string[];
  hot_water?: string[];
  cooling?: string[];
  defrost?: string[];
  blocked?: string[];
  /** Words that interrupt nothing, like a passing info message: the state before them carries on. */
  ignore?: string[];
}

export interface HeatOriginEntities {
  /** What the heat pump is doing right now, as the integration words it. Required. */
  mode: string;
  /** Heat delivered right now. */
  heat_power?: string;
  /** Electricity drawn right now. */
  electric_power?: string;
  flow?: string;
  return?: string;
  /** Litres per hour through the heat pump. */
  volume_flow?: string;
  outdoor?: string;
  /** PV power, for the colour of the electricity. */
  solar?: string;
  /** House consumption; with it the electricity is split by source like the house's. */
  house_power?: string;
  /** Grid power, positive while importing (see grid_invert). */
  grid_power?: string;
  /** Battery power, positive while discharging (see battery_invert). */
  battery_power?: string;
  /** A live COP the integration computes; without it the card divides heat by electricity. */
  cop?: string;
  /**
   * Whether the heat pump runs on surplus solar: a switch or binary sensor that is on,
   * or the surplus power it is sent (Lambda's E-Manager), counted from `pv_mode_above`.
   */
  pv_mode?: string;
  /** The day's heat and electricity per mode, for the day's performance factor in the foot. */
  heating_heat_today?: string;
  heating_electric_today?: string;
  hot_water_heat_today?: string;
  hot_water_electric_today?: string;
  /** Totals, for heat pumps that do not split by mode. */
  heat_today?: string;
  electric_today?: string;
  /** Why the hot water set-point is what it is, e.g. an input_text an automation writes ("Midday sun -> 50 Grad"); the part before " -> " is shown. */
  hot_water_reason?: string;
  /** Days since the hot water was last held at 60 °C; with it a badge says when that was. */
  legionella_days?: string;
}

export interface CircuitConfig {
  name: string;
  /** A heating circuit takes heat from the heat pump. `circulation` is moved to the hot water store. */
  kind?: CircuitKind;
  /** A pump or valve whose "on" means the circuit is running. */
  pump?: string;
  /** One temperature, for loops without flow and return (circulation). */
  temperature?: string;
  /** The circuit's own state, e.g. HEATING, CH-SUMMER, OFF. */
  state?: string;
  flow?: string;
  return?: string;
  room?: string;
  /** Words of `state` that mean the circuit is taking heat; sensible defaults apply. */
  active?: string[];
  /** What the room is asked to be. With it, the room's own figure becomes an answer. */
  target_room?: string;
  /** The flow the heating curve is asking for; at rest it says more than the return. */
  curve_flow?: string;
  /** The symbol, guessed from the name when left out. */
  icon?: string;
  /** The mark under the symbol — the storey, guessed from the name when left out. */
  short?: string;
}

/** A number in °C, or the id of an entity that reports it: a controller's own set-point is worth more than a copy of it. */
export type Setting = number | string;

export interface StoreMarks {
  eco?: Setting;
  target?: Setting;
  pv?: Setting;
  max?: Setting;
}

export interface StoreConfig {
  name: string;
  kind?: StoreKind;
  top: string;
  bottom?: string;
  /** The temperature in the circulation line. */
  circulation?: string;
  /** The circulation pump; on means hot water is being moved through the pipes. */
  circulation_pump?: string;
  /** Set-points, as numbers or as the entities that report them. */
  marks?: StoreMarks;
  /** Litres; with it the card shows the usable heat in kWh. */
  volume?: number;
  /**
   * Which mark the cooling is extrapolated to, for the line that says when a store
   * reaches it. `eco` by default. What the heat pump then does is its own business:
   * a surplus of sun may have it charge long before, and the card cannot know that.
   */
  due_at?: "eco" | "target" | "pv" | "max";
  /** Where the level reads empty: 40 °C for a shower, 30 °C for underfloor heating.
   *  A buffer without one measures against the flow of its warmest running circuit. */
  usable_min?: Setting;
  /** Where the level reads full; the highest mark, else the minimum plus 20 K for a buffer and 12 K for hot water. */
  usable_max?: Setting;
  icon?: string;
  short?: string;
  /** Height of the top sensor as a share of the water column (0 bottom, 1 top), for the origin layout. */
  top_height?: number;
  /** Height of the bottom sensor, the same way. */
  bottom_height?: number;
  /** Hot water: what the origin layout counts, litres of shower water or kWh. Litres by default. */
  usable?: "liters" | "kwh";
  /** Hot water: the temperature the tap mixes to, 38 °C by default. */
  mix?: number;
  /** Hot water: the cold water it mixes with, 10 °C by default. */
  cold?: number;
}

export interface ExtraFigure {
  entity: string;
  name?: string;
  /** Only while the heat pump runs, for figures that mean nothing at rest (hot gas, compressor speed). */
  running_only?: boolean;
}

/**
 * A choice with three or more looks is a word from a short list; one with two is a
 * switch. Most of them only show in one situation — while the heat pump runs, while it
 * stands, while the buffer carries the house — so the editor says under each one when
 * that is.
 */
export interface FlowOptions {
  /** @deprecated The layout is the card's own key now. */
  layout?: "columns" | "split";
  /** Any further figures worth a glance in the foot, e.g. hot gas or compressor speed. */
  extras?: ExtraFigure[];
  /** Symbol with the storey under it, symbol alone, or the name as before. */
  labels?: LabelStyle;
  /** The circuit's face: the room with its target, the room alone, or the flow itself. */
  circuit?: CircuitFace;
  /** While a circuit takes no heat: what the heating curve asks of it, in place of its return. */
  curve?: boolean;
  /** The store's level as a bar in the box's foot, or as the box's own filling. */
  gauge?: GaugeStyle;
  /** The level's two ends, written under it. `show`/`hide` from 1.0.0 still read. */
  scale?: boolean | "show" | "hide";
  /** Which way a store is going, from the fall the card measures anyway. `true`/`false` from earlier versions still read. */
  trend?: TrendStyle | boolean;
  /** What rings the heat pump: the day's dial with the hours of daylight, without them, or none. The shares of the heat always ring it while it runs. `both`/`clock` from earlier versions still read. */
  ring?: RingStyle | "both" | "clock";
  /** What the middle of the circle reads while the heat pump runs. */
  centre?: CentreValue;
  /** The badges in the head: what the heat pump does and since when, and a buffer carrying the house. */
  chips?: boolean;
  /** How much of the line under the drawing is kept. `foot_items` decides where it is written. */
  foot?: FootStyle;
  /** The parts of the line under the drawing, picked one by one. An empty list is no line. */
  foot_items?: FootItem[];
  /** While the heat pump stands: the day's starts, running time and performance factor in place of the last run. */
  balance?: boolean;
  /** While a buffer carries the circuits alone: the line with its remaining time, the line alone, or nothing. `named` from 1.5 reads as `range`. */
  buffer_line?: BufferLine | "named";
  /**
   * A running circuit, right of its room: `pair` the flow and what the curve wants of
   * it, return and spread under; `quiet` the same with nothing under; `headline` the
   * curve's ask as the word above, flow and return right; `flow` the flow as the figure
   * with the room beside it; `stack` flow, curve and return in three rows; `spread`
   * flow, spread and the curve's ask in three rows.
   */
  running?: RunningFace;
  /** Under a resting circuit's room: when it last heated (`last`), the room's target and how far off (`target`), or nothing. */
  rest_note?: RestNote;
  /** A discharging store's word: `word` says discharging, `left` how long it can keep this up, `draw` the power going out and where to. */
  store_head?: StoreHead;
  /** A resting box keeps its symbol in its own colour instead of greying out with its state. */
  rest_colour?: boolean;
  /** Origin layout: kelvin a running circuit's flow may be off its curve and still count as on target. 0.5 by default. */
  on_target?: number;

  /** @deprecated Read as `foot: no_spread`. */
  spread?: boolean;
  /** @deprecated Read as `ring: plain`. */
  sun?: boolean;
  /** @deprecated Read as `circuit: room_plain`. */
  target?: boolean;
  /** @deprecated Read as `buffer_line`. */
  bypass?: boolean;
  /** @deprecated Read as `buffer_line`. */
  range?: boolean;
  /** @deprecated Read as `buffer_line: named`. */
  origin?: boolean;
  /** @deprecated `low` once set labels, scale and foot together; each is its own choice now. */
  detail?: "low" | "normal" | "high";
  /** @deprecated 1.0.0 words for `curve`, `ring`, `balance` and `rest_colour`; each reads as the switch it meant. */
  resting?: "curve" | "flow";
  dial?: "sun" | "plain";
  idle_foot?: "balance" | "last";
  rest?: "colour" | "grey";
}

export interface HeatOriginCardConfig {
  type: string;
  title?: string;
  /** The card's own title. Off where the dashboard already names the section: the head then carries PV mode, when on, and since when. */
  show_title?: boolean;
  /**
   * `columns`: the heat pump heads the left column with hot water under it, and the
   * heating group — the buffer, then the circuits it feeds — owns the right one. Two
   * things beside each other instead of three, so the boxes are half again as wide and
   * the buffer's line to its circuits is a run down the column. `split`: stores left,
   * circuits right, the heat pump between them.
   */
  layout?: "origin" | "columns" | "split" | "classic";
  shape?: CardShape;
  entities: HeatOriginEntities;
  modes?: ModeWords;
  circuits?: CircuitConfig[];
  stores?: StoreConfig[];
  flow?: FlowOptions;
  source?: HeatSource;
  grid_invert?: boolean;
  battery_invert?: boolean;
  /** Figures in the dashboard's own face (default) or in monospace. */
  font?: "system" | "mono";
  /** kW of surplus from which `entities.pv_mode` means the heat pump runs on solar. 1.5 by default, Lambda's own minimum. */
  pv_mode_above?: number;
  /** `entities.pv_mode` is a bare export figure, measured after the heat pump's own draw: add that draw back, and hold through short dips. */
  pv_mode_own?: boolean;
  /** Kelvin per hour; below this measured fall no remaining time is shown. */
  forecast_min_slope?: number;
  /**
   * From this many pixels of card width the drawing spreads out: stores left, the heat
   * pump between, circuits right, every box as wide as the columns' and the circle as
   * large — instead of the columns simply scaling up. 0 never.
   */
  wide_from?: number;
}

export interface ResolvedFlow {
  layout: "origin" | "columns" | "split";
  on_target: number;
  extras: ExtraFigure[];
  labels: LabelStyle;
  circuit: CircuitFace;
  curve: boolean;
  gauge: GaugeStyle;
  scale: boolean;
  trend: TrendStyle;
  ring: RingStyle;
  centre: CentreValue;
  chips: boolean;
  foot: FootStyle;
  foot_items: FootItem[];
  balance: boolean;
  buffer_line: BufferLine;
  running: RunningFace;
  rest_note: RestNote;
  store_head: StoreHead;
  rest_colour: boolean;
}

export interface ResolvedConfig {
  type: string;
  title: string | undefined;
  show_title: boolean;
  shape: CardShape;
  entities: HeatOriginEntities;
  modes: Required<ModeWords>;
  circuits: Array<CircuitConfig & { kind: CircuitKind; icon: IconName; short: string }>;
  stores: Array<StoreConfig & { kind: StoreKind; icon: IconName; short: string }>;
  flow: ResolvedFlow;
  /** Below this measured fall per hour the card says nothing about how long a store lasts. */
  forecast_min_slope: number;
  wide_from: number;
  source: HeatSource;
  grid_invert: boolean;
  battery_invert: boolean;
  font: "system" | "mono";
  pv_mode_above: number;
  pv_mode_own: boolean;
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
