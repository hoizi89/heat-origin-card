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

export type SectionName = "flow" | "day" | "origin" | "stores";
export type CardShape = "standard" | "compact";
export type StoreKind = "hot_water" | "buffer";

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
  /** PV power, for the day band and the "on sun" note. */
  solar?: string;
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
  /** The circuit's own state, e.g. HEATING, CH-SUMMER, OFF. */
  state?: string;
  flow?: string;
  return?: string;
  room?: string;
  /** Words of `state` that mean the circuit is taking heat; sensible defaults apply. */
  active?: string[];
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
  circulation?: string;
  /** Set-points entered as numbers: many integrations report them wrongly. */
  marks?: StoreMarks;
}

export interface ExtraFigure {
  entity: string;
  name?: string;
}

export interface FlowOptions {
  /** Flow, return, spread and volume under the flow drawing. */
  spread?: boolean;
  /** Flow, return and spread inside each circuit's box. */
  circuit_details?: boolean;
  /** Any further figures worth a glance, e.g. hot gas or compressor speed. */
  extras?: ExtraFigure[];
}

export interface DayOptions {
  /** One day or yesterday and today. */
  days?: 1 | 2;
  /** Runs shorter than this many seconds are flagged. 0 turns the flag off. */
  short_run?: number;
}

export interface SectionToggles {
  flow?: boolean;
  day?: boolean;
  origin?: boolean;
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
}

export interface ResolvedConfig {
  type: string;
  title: string | undefined;
  shape: CardShape;
  sections: Required<Omit<SectionToggles, "order">> & { order: SectionName[] };
  entities: HeatOriginEntities;
  modes: Required<ModeWords>;
  circuits: CircuitConfig[];
  stores: Array<StoreConfig & { kind: StoreKind }>;
  flow: Required<FlowOptions>;
  day: Required<DayOptions>;
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
