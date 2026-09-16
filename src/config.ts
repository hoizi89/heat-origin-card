import { guessCircuitIcon, guessShort, guessStoreIcon, isIconName, type IconName } from "./icons";
import { localize } from "./localize";
import { resolveModes } from "./modes";
import type { FlowOptions, HeatOriginCardConfig, ResolvedConfig, ResolvedFlow, StoreKind } from "./types";

export const CARD_TYPE = "heat-origin-card";

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

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

/** The words each choice may take, in the order the editor lists them. */
export const CHOICES = {
  layout: ["columns", "split"],
  labels: ["short", "icon", "name"],
  circuit: ["room", "room_plain", "flow"],
  gauge: ["bar", "box"],
  trend: ["rate", "arrow", "none"],
  ring: ["sun", "plain", "shares"],
  centre: ["heat", "power", "both"],
  foot: ["full", "no_spread", "drive", "none"],
  buffer_line: ["range", "line", "named", "none"]
} as const;

/** The switches: two looks each. All but the curve are on by default. */
export const SWITCHES = ["curve", "scale", "balance", "rest_colour"] as const;

/**
 * What earlier versions wrote is read once more here and lands on what it meant, so an
 * older YAML keeps its look; the editor writes the current keys from then on.
 */
function resolveFlow(flow: FlowOptions): ResolvedFlow {
  const low = flow.detail === "low";
  const legacyBuffer = flow.bypass === false ? "none" : flow.origin ? "named" : flow.range === false ? "line" : "range";
  const legacyFoot = low ? "drive" : flow.spread === false ? "no_spread" : "full";
  const legacyTrend = typeof flow.trend === "boolean" ? (flow.trend ? "rate" : "none") : undefined;
  // 1.0.0 had the dial's two ends as `ring: both|clock` plus `dial`; 0.9 as `sun`.
  const legacyRing = flow.ring === "shares" ? "shares" : flow.dial === "plain" || flow.sun === false ? "plain" : "sun";
  const on = (value: boolean | undefined, word: string | undefined, off: string) => value ?? (word === undefined ? true : word !== off);
  return {
    layout: oneOf(flow.layout, CHOICES.layout, "columns"),
    extras: flow.extras ?? [],
    labels: oneOf(flow.labels, CHOICES.labels, low ? "icon" : "short"),
    circuit: oneOf(flow.circuit, CHOICES.circuit, flow.target === false ? "room_plain" : "room"),
    // Off by default: at rest the room and its target already say why the circuit rests.
    curve: flow.curve ?? flow.resting === "curve",
    gauge: oneOf(flow.gauge, CHOICES.gauge, "bar"),
    scale: typeof flow.scale === "boolean" ? flow.scale : flow.scale === undefined ? !low : flow.scale !== "hide",
    trend: oneOf(flow.trend, CHOICES.trend, legacyTrend ?? "rate"),
    ring: oneOf(flow.ring, CHOICES.ring, legacyRing),
    centre: oneOf(flow.centre, CHOICES.centre, "heat"),
    // A foot asked for in full with the spread switched off, as 0.9 wrote it, is a foot without the spread.
    foot: flow.foot === "full" && flow.spread === false ? "no_spread" : oneOf(flow.foot, CHOICES.foot, legacyFoot),
    balance: on(flow.balance, flow.idle_foot, "last"),
    buffer_line: oneOf(flow.buffer_line, CHOICES.buffer_line, legacyBuffer),
    rest_colour: on(flow.rest_colour, flow.rest, "grey")
  };
}

export function resolveConfig(config: HeatOriginCardConfig): ResolvedConfig {
  return {
    type: config.type,
    title: config.title,
    shape: config.shape === "compact" ? "compact" : "standard",
    entities: config.entities,
    modes: resolveModes(config.modes),
    ...foldCirculation(config),
    flow: resolveFlow(config.flow ?? {}),
    forecast_min_slope: config.forecast_min_slope ?? 0.4,
    source: config.source === "ground" || config.source === "water" ? config.source : "air",
    grid_invert: config.grid_invert ?? false,
    battery_invert: config.battery_invert ?? false,
    font: config.font === "mono" ? "mono" : "system"
  };
}

const LEGACY_FLOW_KEYS = ["spread", "sun", "target", "bypass", "range", "origin", "detail", "circuit_details", "resting", "dial", "idle_foot", "rest"] as const;
const LEGACY_CARD_KEYS = ["sections", "day"] as const;

/**
 * What the editor shows: every list and switch at what the card really uses, so what is
 * on the screen and what is in the form agree. Home Assistant writes back every field
 * the form shows, so opening the editor once turns the defaults into YAML — and since
 * they are exactly what the card does, that YAML is a true record rather than a frozen
 * guess. Keys from earlier versions are translated and dropped on the way, and lists
 * (circuits, stores, extras, state words) stay as written.
 */
export function editorData(config: HeatOriginCardConfig): HeatOriginCardConfig {
  const resolved = resolveConfig(config);
  const card: Record<string, unknown> = { ...config };
  for (const key of LEGACY_CARD_KEYS) delete card[key];
  const flow: Record<string, unknown> = { ...(config.flow ?? {}) };
  for (const key of LEGACY_FLOW_KEYS) delete flow[key];
  const { extras: _extras, ...choices } = resolved.flow;
  return {
    ...(card as unknown as HeatOriginCardConfig),
    font: resolved.font,
    source: resolved.source,
    shape: resolved.shape,
    flow: { ...flow, ...choices }
  };
}

const sensor = { entity: { domain: "sensor" } };

/** The form the visual editor shows; lists (circuits, stores) stay in YAML. */
export function getConfigForm(locale: string) {
  const t = (key: string) => localize(key, locale);
  const choice = (name: keyof typeof CHOICES) => ({
    name,
    selector: {
      select: {
        mode: "dropdown",
        options: CHOICES[name].map((value) => ({ value, label: t(`editor.${name}_${value}`) }))
      }
    }
  });
  const words = (name: string, values: readonly string[]) => ({
    name,
    selector: { select: { mode: "dropdown", options: values.map((value) => ({ value, label: t(`editor.${name}_${value}`) })) } }
  });
  const toggle = (name: (typeof SWITCHES)[number]) => ({ name, selector: { boolean: {} } });

  const schema = [
    { name: "title", selector: { text: {} } },
    // The layout's words are long; they get the row to themselves.
    choice("layout"),
    { type: "grid", schema: [words("shape", ["standard", "compact"]), words("font", ["system", "mono"])] },
    words("source", ["air", "ground", "water"]),
    {
      type: "expandable",
      name: "entities",
      title: t("editor.entities"),
      schema: [
        { name: "mode", required: true, selector: sensor },
        {
          type: "grid",
          schema: [
            "heat_power", "electric_power", "flow", "return", "volume_flow", "outdoor", "solar", "house_power", "grid_power", "battery_power", "cop",
            "heating_heat_today", "heating_electric_today", "hot_water_heat_today", "hot_water_electric_today", "heat_today", "electric_today"
          ].map((name) => ({ name, selector: sensor }))
        }
      ]
    },
    // One group per part of the drawing. A choice with three or more looks is a list,
    // one with two a switch; the helper under each says when it is on the screen at all.
    { type: "expandable", name: "flow", title: t("editor.group_pump"), schema: [choice("centre"), choice("ring")] },
    {
      type: "expandable",
      name: "flow",
      title: t("editor.group_boxes"),
      schema: [choice("labels"), choice("circuit"), toggle("curve"), choice("gauge"), toggle("scale"), choice("trend"), toggle("rest_colour")]
    },
    { type: "expandable", name: "flow", title: t("editor.group_lines"), schema: [choice("buffer_line"), choice("foot"), toggle("balance")] }
  ];

  const labelled = [
    "title", "layout", "shape", "font", "source", "mode", "heat_power", "electric_power", "return", "volume_flow", "outdoor", "solar",
    "house_power", "grid_power", "battery_power", "cop", "heating_heat_today", "heating_electric_today", "hot_water_heat_today",
    "hot_water_electric_today", "heat_today", "electric_today", "centre", "ring", "labels", "circuit", "curve", "gauge",
    "scale", "trend", "rest_colour", "buffer_line", "foot", "balance"
  ];
  const labels: Record<string, string> = Object.fromEntries(labelled.map((name) => [name, t(`editor.${name}`)]));
  const helped = ["mode", "circuit", "curve", "scale", "trend", "ring", "centre", "buffer_line", "balance"];

  return {
    schema,
    // The flow temperature sensor and the flow group share a name; only the sensor has an entity selector.
    computeLabel: (item: { name: string; selector?: { entity?: unknown } }) =>
      item.name === "flow" && item.selector?.entity ? t("editor.flow") : labels[item.name] ?? item.name,
    computeHelper: (item: { name: string }) => (helped.includes(item.name) ? t(`editor.help_${item.name}`) : undefined)
  };
}

export function stubConfig(states: Record<string, unknown>): HeatOriginCardConfig {
  const ids = Object.keys(states).filter((id) => id.startsWith("sensor."));
  const find = (...patterns: RegExp[]) => {
    for (const re of patterns) {
      const hit = ids.find((id) => re.test(id));
      if (hit) return hit;
    }
    return undefined;
  };
  return {
    type: `custom:${CARD_TYPE}`,
    entities: {
      // The heat pump's own state first; an ambient or circuit state carries the same word and must not win.
      mode: find(/hp1_operating_state/, /heat_?pump.*(state|mode)/, /^(?!.*(ambient|hc\d|boil|buff)).*operating_state/) ?? "sensor.heat_pump_state",
      heat_power: find(/hp1_actual_heating_capacity/, /heat(ing)?_(output|power|capacity)/),
      electric_power: find(/hp1_inverter_power_consumption/, /heat_?pump.*power/)
    }
  };
}
