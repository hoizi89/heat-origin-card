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
export type GaugeStyle = "bar" | "box";
/** Which way a store is going, and whether the rate stands beside the arrow. */
export type TrendStyle = "rate" | "arrow" | "none";
/** What rings the heat pump: the day's dial with or without the hours of daylight, or no dial at all. */
export type RingStyle = "sun" | "plain" | "shares";
/** What the middle of the heat pump reads. */
export type CentreValue = "heat" | "power" | "both";
/** How much of the foot line is kept. */
export type FootStyle = "full" | "no_spread" | "drive" | "none";
/** What is drawn while a buffer carries the circuits on its own. */
export type BufferLine = "range" | "line" | "named" | "none";
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
  /** The day's heat and electricity per mode, for the day's performance factor in the foot. */
  heating_heat_today?: string;
  heating_electric_today?: string;
  hot_water_heat_today?: string;
  hot_water_electric_today?: string;
  /** Totals, for heat pumps that do not split by mode. */
  heat_today?: string;
  electric_today?: string;
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

export interface StoreMarks {
  eco?: number;
  target?: number;
  pv?: number;
  max?: number;
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
  /** Set-points entered as numbers: many integrations report them wrongly. */
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
  usable_min?: number;
  /** Where the level reads full; the highest mark, else the minimum plus 20 K for a buffer and 12 K for hot water. */
  usable_max?: number;
  icon?: string;
  short?: string;
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
  /**
   * `columns`: the heat pump heads the left column with hot water under it, and the
   * heating group — the buffer, then the circuits it feeds — owns the right one. Two
   * things beside each other instead of three, so the boxes are half again as wide and
   * the buffer's line to its circuits is a run down the column. `split`: stores left,
   * circuits right, the heat pump between them.
   */
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
  /** How much of the line under the drawing is kept. */
  foot?: FootStyle;
  /** While the heat pump stands: the day's starts, running time and performance factor in place of the last run. */
  balance?: boolean;
  /** While a buffer carries the circuits alone: the line with its remaining time, the line alone, both plus "from buffer" in the circuit's box, or nothing. */
  buffer_line?: BufferLine;
  /** A resting box keeps its symbol in its own colour instead of greying out with its state. */
  rest_colour?: boolean;

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
  /** Kelvin per hour; below this measured fall no remaining time is shown. */
  forecast_min_slope?: number;
}

export interface ResolvedFlow {
  layout: "columns" | "split";
  extras: ExtraFigure[];
  labels: LabelStyle;
  circuit: CircuitFace;
  curve: boolean;
  gauge: GaugeStyle;
  scale: boolean;
  trend: TrendStyle;
  ring: RingStyle;
  centre: CentreValue;
  foot: FootStyle;
  balance: boolean;
  buffer_line: BufferLine;
  rest_colour: boolean;
}

export interface ResolvedConfig {
  type: string;
  title: string | undefined;
  shape: CardShape;
  entities: HeatOriginEntities;
  modes: Required<ModeWords>;
  circuits: Array<CircuitConfig & { kind: CircuitKind; icon: IconName; short: string }>;
  stores: Array<StoreConfig & { kind: StoreKind; icon: IconName; short: string }>;
  flow: ResolvedFlow;
  /** Below this measured fall per hour the card says nothing about how long a store lasts. */
  forecast_min_slope: number;
  source: HeatSource;
  grid_invert: boolean;
  battery_invert: boolean;
  font: "system" | "mono";
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
