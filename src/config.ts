import { guessCircuitIcon, guessShort, guessStoreIcon, isIconName, type IconName } from "./icons";
import { localize } from "./localize";
import { resolveModes } from "./modes";
import type {
  CircuitFace,
  DetailLevel,
  FootStyle,
  HeatOriginCardConfig,
  LabelStyle,
  ResolvedConfig,
  SectionName,
  StoreKind
} from "./types";

export const CARD_TYPE = "heat-origin-card";

/**
 * Three steps of one dial. The choices below hang together — a card asked for few
 * figures wants few of them in every box — so one setting moves them all, and the
 * single keys under `flow` override whatever the step put there.
 */
const DETAIL: Record<DetailLevel, {
  labels: LabelStyle;
  circuit: CircuitFace;
  origin: boolean;
  foot: FootStyle;
  scale: boolean;
}> = {
  low: { labels: "icon", circuit: "room", origin: false, foot: "drive", scale: false },
  normal: { labels: "short", circuit: "room", origin: false, foot: "full", scale: true },
  high: { labels: "short", circuit: "room", origin: true, foot: "full", scale: true }
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
export const SECTIONS: SectionName[] = ["flow", "day", "stores"];

export function assertConfig(config: HeatOriginCardConfig | undefined, locale?: string): void {
  if (!config?.entities?.mode) {
    throw new Error(localize("state.no_mode", locale) + " entities.mode");
  }
}

/** A store named like hot water is hot water; everything else is a buffer. */
function guessKind(name: string): StoreKind {
  return /warmwasser|hot.?water|boiler|dhw|brauchwasser/i.test(name) ? "hot_water" : "buffer";
}

/**
 * Circulation takes heat out of the hot water store; it is no taker of the
 * heat pump's. A circuit written as circulation, as earlier versions asked,
 * moves onto the first hot water store and leaves the flow.
 */
function foldCirculation(config: HeatOriginCardConfig) {
  /** What is written wins; what is not is read out of the name. */
  const dress = <T extends { name: string; icon?: string; short?: string }>(item: T, fallback: IconName) => ({
    ...item,
    icon: isIconName(item.icon) ? item.icon : fallback,
    short: item.short ?? guessShort(item.name)
  });
  const circuits = (config.circuits ?? []).map((c) => {
    const kind = c.kind ?? (/zirkulation|circulation/i.test(c.name) ? ("circulation" as const) : ("heating" as const));
    return { ...dress(c, kind === "circulation" ? "loop" : guessCircuitIcon(c.name)), kind };
  });
  const stores = (config.stores ?? []).map((s) => {
    const kind = s.kind ?? guessKind(s.name);
    return { ...dress(s, guessStoreIcon(kind)), kind };
  });
  const hotWater = stores.find((s) => s.kind === "hot_water");
  const loops = circuits.filter((c) => c.kind === "circulation");
  if (hotWater && loops.length) {
    const loop = loops[0];
    hotWater.circulation = hotWater.circulation ?? loop.temperature ?? loop.flow;
    hotWater.circulation_pump = hotWater.circulation_pump ?? loop.pump;
    return { circuits: circuits.filter((c) => c.kind !== "circulation"), stores };
  }
  return { circuits, stores };
}

export function resolveConfig(config: HeatOriginCardConfig): ResolvedConfig {
  const sections = config.sections ?? {};
  const chosen = (sections.order ?? []).filter((s): s is SectionName => SECTIONS.includes(s));
  const days = config.day?.days === 1 ? 1 : 2;
  const flow = config.flow ?? {};
  const step = DETAIL[oneOf(flow.detail, ["low", "normal", "high"] as const, "normal")];
  return {
    type: config.type,
    title: config.title,
    shape: config.shape === "compact" ? "compact" : "standard",
    sections: {
      flow: sections.flow ?? true,
      day: sections.day ?? true,
      // Once the flow draws each store as a level gauge, a section repeating it below
      // says nothing new — so it only comes on by itself when the flow is off.
      stores: sections.stores ?? (Boolean(config.stores?.length) && (config.sections?.flow === false)),
      order: [...chosen, ...SECTIONS.filter((s) => !chosen.includes(s))]
    },
    entities: config.entities,
    modes: resolveModes(config.modes),
    ...foldCirculation(config),
    flow: {
      layout: flow.layout === "split" ? "split" : "columns",
      spread: flow.spread ?? true,
      circuit_details: flow.circuit_details ?? false,
      extras: flow.extras ?? [],
      detail: oneOf(flow.detail, ["low", "normal", "high"] as const, "normal"),
      labels: oneOf(flow.labels, ["short", "icon", "name"] as const, step.labels),
      circuit: oneOf(flow.circuit, ["room", "flow"] as const, step.circuit),
      gauge: oneOf(flow.gauge, ["bar", "box"] as const, "bar"),
      origin: flow.origin ?? step.origin,
      bypass: flow.bypass ?? true,
      range: flow.range ?? true,
      ring: oneOf(flow.ring, ["both", "clock", "shares"] as const, "both"),
      sun: flow.sun ?? true,
      centre: oneOf(flow.centre, ["heat", "power", "both"] as const, "heat"),
      foot: oneOf(flow.foot, ["full", "drive", "none"] as const, step.foot)
    },
    forecast_min_slope: config.forecast_min_slope ?? 0.4,
    day: {
      days,
      short_run: config.day?.short_run ?? 120,
      cycling_from: config.day?.cycling_from ?? 3
    },
    source: config.source === "ground" || config.source === "water" ? config.source : "air",
    grid_invert: config.grid_invert ?? false,
    battery_invert: config.battery_invert ?? false,
    font: config.font === "mono" ? "mono" : "system"
  };
}

/**
 * What the editor shows: the stored configuration with every switch and
 * dropdown at the value the card really uses. A section left out of the YAML
 * is on, so its toggle must read on, not off. Lists and state words stay as
 * written; nothing the form does not show is filled in.
 */
export function editorData(config: HeatOriginCardConfig): HeatOriginCardConfig {
  const resolved = resolveConfig(config);
  return {
    ...config,
    font: config.font,
    source: config.source,
    shape: config.shape,
    sections: {
      ...config.sections,
      flow: resolved.sections.flow,
      day: resolved.sections.day,
      stores: resolved.sections.stores
    },
    flow: {
      ...config.flow,
      spread: resolved.flow.spread,
      circuit_details: resolved.flow.circuit_details,
      sun: resolved.flow.sun,
      bypass: resolved.flow.bypass,
      range: resolved.flow.range,
      origin: resolved.flow.origin
    },
    day: {
      ...config.day,
      days: resolved.day.days,
      short_run: resolved.day.short_run,
      cycling_from: resolved.day.cycling_from
    }
  };
}

const sensor = { entity: { domain: "sensor" } };

/** The form the visual editor shows; lists (circuits, stores) stay in YAML. */
export function getConfigForm(locale: string) {
  const t = (key: string) => localize(key, locale);
  const schema = [
    { name: "title", selector: { text: {} } },
    {
      name: "font",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "system", label: t("editor.font_system") },
            { value: "mono", label: t("editor.font_mono") }
          ]
        }
      }
    },
    {
      name: "source",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "air", label: t("editor.source_air") },
            { value: "ground", label: t("editor.source_ground") },
            { value: "water", label: t("editor.source_water") }
          ]
        }
      }
    },
    {
      name: "shape",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "standard", label: t("editor.shape_standard") },
            { value: "compact", label: t("editor.shape_compact") }
          ]
        }
      }
    },
    {
      type: "expandable",
      name: "sections",
      title: t("editor.sections"),
      schema: [
        {
          type: "grid",
          schema: SECTIONS.map((s) => ({ name: s, selector: { boolean: {} } }))
        }
      ]
    },
    {
      type: "expandable",
      name: "entities",
      title: t("editor.entities"),
      schema: [
        { name: "mode", required: true, selector: sensor },
        {
          type: "grid",
          schema: ["heat_power", "electric_power", "flow", "return", "volume_flow", "outdoor", "solar", "house_power", "grid_power", "battery_power", "cop"].map((name) => ({
            name,
            selector: sensor
          }))
        }
      ]
    },
    {
      type: "expandable",
      name: "entities",
      title: t("editor.energy"),
      schema: [
        {
          type: "grid",
          schema: [
            "heating_heat_today",
            "heating_electric_today",
            "hot_water_heat_today",
            "hot_water_electric_today",
            "heat_today",
            "electric_today"
          ].map((name) => ({ name, selector: sensor }))
        }
      ]
    },
    {
      type: "expandable",
      name: "flow",
      title: t("editor.options"),
      schema: [
        {
          name: "layout",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "columns", label: t("editor.layout_columns") },
                { value: "split", label: t("editor.layout_split") }
              ]
            }
          }
        },
        {
          name: "detail",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "low", label: t("editor.detail_low") },
                { value: "normal", label: t("editor.detail_normal") },
                { value: "high", label: t("editor.detail_high") }
              ]
            }
          }
        },
        {
          name: "centre",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "heat", label: t("editor.centre_heat") },
                { value: "power", label: t("editor.centre_power") },
                { value: "both", label: t("editor.centre_both") }
              ]
            }
          }
        },
        { name: "spread", selector: { boolean: {} } }
      ]
    },
    {
      type: "expandable",
      name: "flow",
      title: t("editor.showing"),
      schema: [
        {
          name: "labels",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "short", label: t("editor.labels_short") },
                { value: "icon", label: t("editor.labels_icon") },
                { value: "name", label: t("editor.labels_name") }
              ]
            }
          }
        },
        {
          name: "circuit",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "room", label: t("editor.circuit_room") },
                { value: "flow", label: t("editor.circuit_flow") }
              ]
            }
          }
        },
        {
          name: "gauge",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "bar", label: t("editor.gauge_bar") },
                { value: "box", label: t("editor.gauge_box") }
              ]
            }
          }
        },
        {
          name: "ring",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "both", label: t("editor.ring_both") },
                { value: "clock", label: t("editor.ring_clock") },
                { value: "shares", label: t("editor.ring_shares") }
              ]
            }
          }
        },
        {
          name: "foot",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "full", label: t("editor.foot_full") },
                { value: "drive", label: t("editor.foot_drive") },
                { value: "none", label: t("editor.foot_none") }
              ]
            }
          }
        },
        {
          type: "grid",
          schema: [
            { name: "sun", selector: { boolean: {} } },
            { name: "bypass", selector: { boolean: {} } },
            { name: "range", selector: { boolean: {} } },
            { name: "origin", selector: { boolean: {} } }
          ]
        }
      ]
    },
    {
      type: "expandable",
      name: "day",
      title: t("editor.section_day"),
      schema: [
        {
          name: "days",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: 1, label: t("editor.days_1") },
                { value: 2, label: t("editor.days_2") }
              ]
            }
          }
        },
        { name: "short_run", selector: { number: { min: 0, max: 900, step: 10, mode: "box" } } },
        { name: "cycling_from", selector: { number: { min: 0, max: 20, step: 1, mode: "box" } } }
      ]
    }
  ];

  const labels: Record<string, string> = {
    title: t("editor.title"),
    shape: t("editor.shape"),
    flow: t("editor.section_flow"),
    day: t("editor.section_day"),
    stores: t("editor.section_stores"),
    mode: t("editor.mode"),
    heat_power: t("editor.heat_power"),
    electric_power: t("editor.electric_power"),
    return: t("editor.return"),
    volume_flow: t("editor.volume_flow"),
    outdoor: t("editor.outdoor"),
    solar: t("editor.solar"),
    house_power: t("editor.house_power"),
    grid_power: t("editor.grid_power"),
    battery_power: t("editor.battery_power"),
    source: t("editor.source"),
    font: t("editor.font"),
    cop: t("editor.cop"),
    heating_heat_today: t("editor.heating_heat_today"),
    heating_electric_today: t("editor.heating_electric_today"),
    hot_water_heat_today: t("editor.hot_water_heat_today"),
    hot_water_electric_today: t("editor.hot_water_electric_today"),
    heat_today: t("editor.heat_today"),
    electric_today: t("editor.electric_today"),
    layout: t("editor.layout"),
    spread: t("editor.spread"),
    circuit_details: t("editor.circuit_details"),
    detail: t("editor.detail"),
    centre: t("editor.centre"),
    labels: t("editor.labels"),
    circuit: t("editor.circuit"),
    gauge: t("editor.gauge"),
    ring: t("editor.ring"),
    sun: t("editor.sun"),
    bypass: t("editor.bypass"),
    range: t("editor.range"),
    origin: t("editor.origin"),
    foot: t("editor.foot"),
    days: t("editor.days"),
    short_run: t("editor.short_run"),
    cycling_from: t("editor.cycling_from")
  };

  return {
    schema,
    // The flow temperature sensor and the flow section share a name; only the sensor has an entity selector.
    computeLabel: (item: { name: string; selector?: { entity?: unknown } }) =>
      item.name === "flow" && item.selector?.entity ? t("editor.flow") : labels[item.name] ?? item.name,
    computeHelper: (item: { name: string }) => {
      if (item.name === "mode") return t("editor.help_yaml");
      if (item.name === "detail") return t("editor.help_detail");
      if (item.name === "centre") return t("editor.help_centre");
      if (item.name === "labels") return t("editor.help_showing");
      return undefined;
    }
  };
}

export function stubConfig(states: Record<string, unknown>): HeatOriginCardConfig {
  const ids = Object.keys(states);
  const find = (re: RegExp) => ids.find((id) => id.startsWith("sensor.") && re.test(id));
  return {
    type: `custom:${CARD_TYPE}`,
    entities: {
      mode: find(/hp1_operating_state|heat_?pump.*(state|mode)|operating_state/) ?? "sensor.heat_pump_state",
      heat_power: find(/hp1_actual_heating_capacity|heat(ing)?_(output|power|capacity)/),
      electric_power: find(/hp1_inverter_power_consumption|heat_?pump.*power/)
    }
  };
}
