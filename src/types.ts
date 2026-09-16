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

export type SectionName = "flow" | "day" | "stores";
export type CardShape = "standard" | "compact";
export type StoreKind = "hot_water" | "buffer";
export type CircuitKind = "heating" | "circulation";
/** How much a box is asked to say. One dial instead of five switches. */
export type DetailLevel = "low" | "normal" | "high";
/** What a box writes beside its symbol. */
export type LabelStyle = "short" | "icon" | "name";
/** Which face a heating circuit shows. */
export type CircuitFace = "room" | "flow";
/** Where a store's level is drawn. */
export type GaugeStyle = "bar" | "box";
/** What rings the heat pump. */
export type RingStyle = "both" | "clock" | "shares";
/** What the middle of the heat pump reads. */
export type CentreValue = "heat" | "power" | "both";
/** How much of the foot line is kept. */
export type FootStyle = "full" | "drive" | "none";
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
  /** PV power, for the day band and the colour of the electricity. */
  solar?: string;
  /** House consumption; with it the electricity is split by source like the house's. */
  house_power?: string;
  /** Grid power, positive while importing (see grid_invert). */
  grid_power?: string;
  /** Battery power, positive while discharging (see battery_invert). */
  battery_power?: string;
  /** A live COP the integration computes; without it the card divides heat by electricity. */
  cop?: string;
  heating_heat_today?: string;
  heating_electric_today?: string;
  hot_water_heat_today?: string;
  hot_water_electric_today?: string;
  /** Totals, for heat pumps that do not split by mode. */
  heat_today?: string;
  electric_today?: string;
  cop_heating_month?: string;
  cop_heating_year?: string;
  cop_hot_water_month?: string;
  cop_hot_water_year?: string;
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
  /** The lowest useful temperature: 40 °C for a shower, 30 °C for underfloor heating.
   *  A buffer without one measures against the flow of its warmest running circuit. */
  usable_min?: number;
  /** The temperature the level bar calls full; the highest mark, else minimum + 12 K. */
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

export interface FlowOptions {
  /**
   * `columns`: the heat pump heads the left column with hot water under it, and the
   * heating group — the buffer, then the circuits it feeds — owns the right one. Two
   * things beside each other instead of three, so the boxes are half again as wide and
   * the buffer's line to its circuits is a run down the column. `split`: stores left,
   * circuits right, the heat pump between them.
   */
  layout?: "columns" | "split";
  /** Flow, return, spread and volume under the flow drawing. */
  spread?: boolean;
  /** Flow, return and spread inside each circuit's box. */
  circuit_details?: boolean;
  /** Any further figures worth a glance, e.g. hot gas or compressor speed. */
  extras?: ExtraFigure[];
  /**
   * How much each box says. One dial that sets `labels`, `circuit`, `foot` and the
   * store's scale together, because those choices belong together: whoever wants few
   * figures wants few of them everywhere. The single settings below override it.
   */
  detail?: DetailLevel;
  /** Symbol with the storey under it, symbol alone, or the name as before. */
  labels?: LabelStyle;
  /** The circuit's face: the room with flow and return beside it, or the flow itself. */
  circuit?: CircuitFace;
  /** The store's level as a bar in the box's foot, or as the box's own filling. */
  gauge?: GaugeStyle;
  /** Name the buffer in the circuit's box as well; the drawn line says it already. */
  origin?: boolean;
  /** Draw the line from a discharging buffer to the circuits it is carrying. */
  bypass?: boolean;
  /** How long the buffer still carries the circuits, on the line that carries them. */
  range?: boolean;
  /** What rings the heat pump: the day's dial, the shares of the heat, or both. */
  ring?: RingStyle;
  /** The hours the sun was up, as an arc outside the dial. */
  sun?: boolean;
  /** What the middle of the circle reads while the heat pump runs. */
  centre?: CentreValue;
  /** How much of the line under the drawing is kept. */
  foot?: FootStyle;
  /** The room a circuit is asked for, under the room it has. */
  target?: boolean;
  /** What the heating curve asks of a resting circuit, in place of its return. */
  curve?: boolean;
  /** Which way a store is going, from the fall the card measures anyway. */
  trend?: boolean;
  /** The day's starts, running time and performance factor, in place of the last run. */
  balance?: boolean;
  /** Keep a box's symbol in its own colour while it rests, so the card keeps its order. */
  rest_colour?: boolean;
}

export interface DayOptions {
  /** One day or yesterday and today. */
  days?: 1 | 2;
  /** Runs shorter than this many seconds are flagged. 0 turns the flag off. */
  short_run?: number;
  /** From this many short runs in a day, a notice says the heat pump is cycling. */
  cycling_from?: number;
}

export interface SectionToggles {
  flow?: boolean;
  day?: boolean;
  stores?: boolean;
  order?: SectionName[];
}

export interface HeatOriginCardConfig {
  type: string;
  title?: string;
  shape?: CardShape;
  sections?: SectionToggles;
  entities: HeatOriginEntities;
  modes?: ModeWords;
  circuits?: CircuitConfig[];
  stores?: StoreConfig[];
  flow?: FlowOptions;
  day?: DayOptions;
  source?: HeatSource;
  grid_invert?: boolean;
  battery_invert?: boolean;
  /** Figures in the dashboard's own face (default) or in monospace. */
  font?: "system" | "mono";
  /** Kelvin per hour; below this measured fall no remaining time is shown. */
  forecast_min_slope?: number;
}

export interface ResolvedConfig {
  type: string;
  title: string | undefined;
  shape: CardShape;
  sections: Required<Omit<SectionToggles, "order">> & { order: SectionName[] };
  entities: HeatOriginEntities;
  modes: Required<ModeWords>;
  circuits: Array<CircuitConfig & { kind: CircuitKind; icon: IconName; short: string }>;
  stores: Array<StoreConfig & { kind: StoreKind; icon: IconName; short: string }>;
  flow: Required<FlowOptions>;
  /** Below this measured fall per hour the card says nothing about how long a store lasts. */
  forecast_min_slope: number;
  day: Required<DayOptions>;
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
