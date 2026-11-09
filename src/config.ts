import { guessCircuitIcon, guessShort, guessStoreIcon, isIconName, type IconName } from "./icons";
import { localize } from "./localize";
import { resolveModes } from "./modes";
import type { CircuitConfig, FlowOptions, FootItem, FootStyle, HeatOriginCardConfig, ResolvedConfig, ResolvedFlow, StoreConfig, StoreKind } from "./types";

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
  layout: ["origin", "columns", "split"],
  labels: ["short", "icon", "name"],
  circuit: ["room", "room_plain", "flow"],
  gauge: ["zones", "scale", "bar", "box"],
  trend: ["rate", "arrow", "none"],
  ring: ["sun", "plain", "shares"],
  centre: ["heat", "power", "both"],
  foot: ["full", "no_spread", "drive", "none"],
  buffer_line: ["range", "line", "none"],
  running: ["pair", "quiet", "headline", "flow", "stack", "spread"],
  rest_note: ["last", "target", "none"],
  store_head: ["word", "left", "draw"]
} as const;

/** The switches: two looks each. All but the curve are on by default. */
export const SWITCHES = ["curve", "scale", "balance", "rest_colour", "chips"] as const;

/** Every part of the foot line, in the order it is written. */
export const FOOT_ITEMS: readonly FootItem[] = ["power", "ambient", "buffer", "due", "pump", "volume", "day", "extras"];

/** What each of the foot's earlier words kept; a YAML without `foot_items` still reads as it did. */
const FOOT_PRESETS: Record<FootStyle, readonly FootItem[]> = {
  full: FOOT_ITEMS,
  no_spread: FOOT_ITEMS.filter((item) => item !== "pump" && item !== "volume"),
  drive: ["power", "ambient", "buffer", "due"],
  none: []
};

/**
 * What earlier versions wrote is read once more here and lands on what it meant, so an
 * older YAML keeps its look; the editor writes the current keys from then on.
 */
function resolveFlow(flow: FlowOptions, layout: unknown): ResolvedFlow {
  const low = flow.detail === "low";
  const legacyBuffer = flow.bypass === false ? "none" : flow.range === false ? "line" : "range";
  const legacyFoot = low ? "drive" : flow.spread === false ? "no_spread" : "full";
  const legacyTrend = typeof flow.trend === "boolean" ? (flow.trend ? "rate" : "none") : undefined;
  // 1.0.0 had the dial's two ends as `ring: both|clock` plus `dial`; 0.9 as `sun`.
  const legacyRing = flow.ring === "shares" ? "shares" : flow.dial === "plain" || flow.sun === false ? "plain" : "sun";
  const on = (value: boolean | undefined, word: string | undefined, off: string) => value ?? (word === undefined ? true : word !== off);
  // A foot asked for in full with the spread switched off, as 0.9 wrote it, is a foot without the spread.
  const foot = flow.foot === "full" && flow.spread === false ? "no_spread" : oneOf(flow.foot, CHOICES.foot, legacyFoot);
  const picked = flow.foot_items;
  return {
    // The layout is the card's, and the editor writes it at the root; `flow.layout` is where 1.0 kept it.
    // 2.0 opens on the origin layout; `classic` is the two columns every earlier version drew.
    layout: (layout ?? flow.layout) === "classic" ? "columns" : oneOf(layout ?? flow.layout, CHOICES.layout, "origin"),
    on_target: typeof flow.on_target === "number" && flow.on_target >= 0 ? flow.on_target : 0.5,
    extras: flow.extras ?? [],
    labels: oneOf(flow.labels, CHOICES.labels, low ? "icon" : "short"),
    circuit: oneOf(flow.circuit, CHOICES.circuit, flow.target === false ? "room_plain" : "room"),
    // Off by default: at rest the room and its target already say why the circuit rests.
    curve: flow.curve ?? flow.resting === "curve",
    gauge: oneOf(flow.gauge, CHOICES.gauge, "zones"),
    scale: typeof flow.scale === "boolean" ? flow.scale : flow.scale === undefined ? !low : flow.scale !== "hide",
    trend: oneOf(flow.trend, CHOICES.trend, legacyTrend ?? "rate"),
    ring: oneOf(flow.ring, CHOICES.ring, legacyRing),
    centre: oneOf(flow.centre, CHOICES.centre, "heat"),
    chips: flow.chips ?? true,
    foot,
    // Picked one by one, the list is the whole answer — an empty one included.
    foot_items: Array.isArray(picked) ? FOOT_ITEMS.filter((item) => picked.includes(item)) : [...FOOT_PRESETS[foot]],
    balance: on(flow.balance, flow.idle_foot, "last"),
    // 1.5 had a fourth word, `named`, that wrote "from the buffer" into the circuit; the line says it.
    buffer_line: oneOf(flow.buffer_line, CHOICES.buffer_line, legacyBuffer),
    running: oneOf(flow.running, CHOICES.running, "pair"),
    // A circuit switched off for the summer is nowhere near its target and not meant to be;
    // when it last heated is what still says something. The plain room of 1.x wrote nothing.
    rest_note: oneOf(flow.rest_note, CHOICES.rest_note, flow.circuit === "room_plain" || flow.target === false ? "none" : "last"),
    store_head: oneOf(flow.store_head, CHOICES.store_head, "left"),
    rest_colour: on(flow.rest_colour, flow.rest, "grey")
  };
}

export function resolveConfig(config: HeatOriginCardConfig): ResolvedConfig {
  return {
    type: config.type,
    title: config.title,
    show_title: config.show_title !== false,
    shape: config.shape === "compact" ? "compact" : "standard",
    entities: config.entities,
    modes: resolveModes(config.modes),
    ...foldCirculation(config),
    flow: resolveFlow(config.flow ?? {}, config.layout),
    forecast_min_slope: config.forecast_min_slope ?? 0.4,
    wide_from: typeof config.wide_from === "number" && config.wide_from >= 0 ? config.wide_from : 560,
    source: config.source === "ground" || config.source === "water" ? config.source : "air",
    grid_invert: config.grid_invert ?? false,
    battery_invert: config.battery_invert ?? false,
    font: config.font === "mono" ? "mono" : "system",
    pv_mode_above: typeof config.pv_mode_above === "number" && config.pv_mode_above >= 0 ? config.pv_mode_above : 1.5,
    pv_mode_own: config.pv_mode_own === true
  };
}

const LEGACY_FLOW_KEYS = ["layout", "foot", "spread", "sun", "target", "bypass", "range", "origin", "detail", "circuit_details", "resting", "dial", "idle_foot", "rest"] as const;
const LEGACY_CARD_KEYS = ["sections", "day"] as const;

/** `stores[1]` is `store_1` to the form: ha-form reaches into objects by key, never into a list by index. */
const listKey = (list: "store" | "circuit", i: number) => `${list}_${i}`;
const LIST_KEY = /^(store|circuit)_(\d+)$/;

/**
 * What the editor shows: every list and switch at what the card really uses, so what is
 * on the screen and what is in the form agree. Home Assistant writes back every field
 * the form shows, so opening the editor once turns the defaults into YAML — and since
 * they are exactly what the card does, that YAML is a true record rather than a frozen
 * guess. Keys from earlier versions are translated and dropped on the way. Each store
 * and circuit gets a key of its own, so the form can reach it; `foldEditorData` puts
 * them back into their lists.
 */
export function editorData(config: HeatOriginCardConfig): HeatOriginCardConfig & Record<string, unknown> {
  const resolved = resolveConfig(config);
  const card: Record<string, unknown> = { ...config };
  for (const key of LEGACY_CARD_KEYS) delete card[key];
  delete card.stores;
  delete card.circuits;
  const flow: Record<string, unknown> = { ...(config.flow ?? {}) };
  for (const key of LEGACY_FLOW_KEYS) delete flow[key];
  // The foot's one word became a list of its parts; the form writes the list.
  const { extras: _extras, foot: _foot, layout, on_target: _onTarget, ...choices } = resolved.flow;
  // Every circuit and store as its own key, and one empty slot after each list: filled
  // in, it becomes the next entry; left empty, it is dropped on the way back.
  const circuits = config.circuits ?? [];
  const stores = config.stores ?? [];
  circuits.forEach((c, i) => (card[listKey("circuit", i)] = { ...c }));
  stores.forEach((s, i) => (card[listKey("store", i)] = { ...s }));
  card[listKey("circuit", circuits.length)] = {};
  card[listKey("store", stores.length)] = {};
  return {
    ...(card as unknown as HeatOriginCardConfig),
    layout,
    wide_from: resolved.wide_from,
    show_title: resolved.show_title,
    font: resolved.font,
    source: resolved.source,
    shape: resolved.shape,
    flow: { ...flow, ...choices }
  };
}

/** A field cleared in the form comes back empty; it is dropped rather than written as "". */
function tidy(value: unknown): unknown {
  if (typeof value === "number") return Number.isNaN(value) ? undefined : value;
  // A number typed into a text field is a number.
  if (typeof value === "string" && /^\s*-?\d+([.,]\d+)?\s*$/.test(value)) return Number(value.trim().replace(",", "."));
  if (!value || typeof value !== "object" || Array.isArray(value)) return value === "" || value === null ? undefined : value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const clean = tidy(v);
    if (clean === undefined) continue;
    if (clean && typeof clean === "object" && !Array.isArray(clean) && Object.keys(clean as object).length === 0) continue;
    out[k] = clean;
  }
  return out;
}

/** What the form hands back, folded into the card's own shape again. */
export function foldEditorData(data: Record<string, unknown>): HeatOriginCardConfig {
  const out: Record<string, unknown> = {};
  const lists: Record<"store" | "circuit", Array<[number, unknown]>> = { store: [], circuit: [] };
  for (const [key, value] of Object.entries(data)) {
    const m = LIST_KEY.exec(key);
    if (!m) {
      out[key] = value;
      continue;
    }
    const clean = tidy(value);
    // The empty slot, or an entry cleared out completely, is no entry.
    if (clean && typeof clean === "object" && Object.keys(clean as object).length > 0) lists[m[1] as "store" | "circuit"].push([Number(m[2]), clean]);
  }
  const inOrder = (items: Array<[number, unknown]>) => items.sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  if (lists.circuit.length) out.circuits = inOrder(lists.circuit);
  if (lists.store.length) out.stores = inOrder(lists.store);
  return out as unknown as HeatOriginCardConfig;
}

const sensor = { entity: { domain: "sensor" } };
const onOff = { entity: { domain: ["switch", "binary_sensor", "input_boolean"] } };
const MARKS = ["eco", "target", "pv", "max"] as const;

/**
 * The form the visual editor shows. Every store and circuit already in the card gets a
 * group of its own; adding or removing one is done in YAML, where the lists live.
 */
export function getConfigForm(locale: string, config?: HeatOriginCardConfig) {
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
  // A temperature as a number, or the entity that reports it: a text field takes both.
  const degrees = (name: string) => ({ name, selector: { text: {} } });
  const text = (name: string) => ({ name, selector: { text: {} } });
  const grid = (schema: unknown[]) => ({ type: "grid", schema });
  const share = (name: string) => ({ name, selector: { number: { min: 0, max: 1, step: 0.01, mode: "box" } } });

  const icons = () => words("icon", ["floor", "radiator", "fancoil", "pipe", "water", "buffer", "loop"]);
  // The last group of each list is empty: "add a circuit". Its title says so, and a name
  // typed there is enough to make it the next entry.
  const storeForm = (store: StoreConfig | undefined, i: number) => ({
    type: "expandable",
    name: listKey("store", i),
    title: store ? `${t("editor.store")} ${i + 1} · ${store.name || "…"}` : t("editor.store_add"),
    schema: [
      grid([text("name"), words("kind", ["hot_water", "buffer"])]),
      grid([icons(), text("short")]),
      grid([{ name: "top", selector: sensor }, { name: "bottom", selector: sensor }]),
      grid([{ name: "volume", selector: { number: { min: 0, max: 5000, step: 10, mode: "box", unit_of_measurement: "l" } } }, degrees("usable_min"), degrees("usable_max")]),
      grid([share("top_height"), share("bottom_height")]),
      { type: "expandable", name: "marks", title: t("editor.marks"), schema: [grid(MARKS.map(degrees))] },
      grid([{ name: "circulation", selector: sensor }, { name: "circulation_pump", selector: onOff }]),
      words("due_at", ["eco", "target", "pv", "max"])
    ]
  });
  const circuitForm = (circuit: CircuitConfig | undefined, i: number) => ({
    type: "expandable",
    name: listKey("circuit", i),
    title: circuit ? `${t("editor.circuit_one")} ${i + 1} · ${circuit.name || "…"}` : t("editor.circuit_add"),
    schema: [
      grid([text("name"), text("short")]),
      icons(),
      grid([{ name: "state", selector: sensor }, { name: "pump", selector: onOff }]),
      grid([{ name: "flow", selector: sensor }, { name: "return", selector: sensor }]),
      grid([{ name: "room", selector: sensor }, { name: "target_room", selector: sensor }]),
      { name: "curve_flow", selector: sensor }
    ]
  });
  const circuits = config?.circuits ?? [];
  const stores = config?.stores ?? [];

  const schema = [
    {
      type: "expandable",
      title: t("editor.group_general"),
      expanded: true,
      schema: [
        grid([text("title"), { name: "show_title", selector: { boolean: {} } }]),
        // The layout's words are long; they get the row to themselves.
        choice("layout"),
        grid([words("shape", ["standard", "compact"]), words("font", ["system", "mono"])]),
        words("source", ["air", "ground", "water"]),
        { name: "wide_from", selector: { number: { min: 0, max: 2000, step: 10, mode: "box", unit_of_measurement: "px" } } }
      ]
    },
    {
      type: "expandable",
      name: "entities",
      title: t("editor.group_pump_sensors"),
      schema: [
        { name: "mode", required: true, selector: sensor },
        { name: "hot_water_reason", selector: { entity: {} } },
        { name: "legionella_last", selector: { entity: {} } },
        grid(
          [
            "heat_power", "electric_power", "flow", "return", "volume_flow", "outdoor", "solar", "house_power", "grid_power", "battery_power", "cop", "pv_mode",
            "heating_heat_today", "heating_electric_today", "hot_water_heat_today", "hot_water_electric_today", "heat_today", "electric_today",
            "legionella_days"
          ].map((name) => ({ name, selector: sensor }))
        )
      ]
    },
    // The heat pump, then the circuits, then the stores: each thing's sensors first, its
    // group of one empty slot to add another, and its looks last. A choice with three or
    // more looks is a list, one with two a switch; the helper under each says when it is
    // on the screen at all.
    { type: "expandable", name: "flow", title: t("editor.group_pump"), schema: [choice("centre"), choice("ring")] },
    ...circuits.map(circuitForm),
    circuitForm(undefined, circuits.length),
    { type: "expandable", name: "flow", title: t("editor.group_circuits"), schema: [choice("circuit"), choice("running"), choice("rest_note"), toggle("curve")] },
    ...stores.map(storeForm),
    storeForm(undefined, stores.length),
    {
      type: "expandable",
      name: "flow",
      title: t("editor.group_stores"),
      schema: [choice("gauge"), toggle("scale"), choice("trend"), choice("buffer_line"), choice("store_head")]
    },
    {
      type: "expandable",
      name: "flow",
      title: t("editor.group_boxes"),
      schema: [
        choice("labels"),
        toggle("rest_colour"),
        toggle("chips"),
        {
          name: "foot_items",
          selector: { select: { multiple: true, mode: "list", options: FOOT_ITEMS.map((value) => ({ value, label: t(`editor.foot_items_${value}`) })) } }
        },
        toggle("balance")
      ]
    }
  ];

  const labelled = [
    "title", "show_title", "layout", "shape", "font", "source", "wide_from", "mode", "heat_power", "electric_power", "flow", "return", "volume_flow", "outdoor", "solar",
    "house_power", "grid_power", "battery_power", "cop", "pv_mode", "heating_heat_today", "heating_electric_today", "hot_water_heat_today",
    "hot_water_electric_today", "heat_today", "electric_today", "centre", "ring", "labels", "circuit", "curve", "gauge",
    "scale", "trend", "rest_colour", "buffer_line", "foot_items", "chips", "balance", "running", "rest_note", "store_head",
    "name", "kind", "top", "bottom", "volume", "usable_min", "usable_max", "circulation", "circulation_pump", "due_at",
    "short", "state", "pump", "room", "target_room", "curve_flow", "icon", "hot_water_reason", "legionella_days", "legionella_last", "top_height", "bottom_height"
  ];
  const labels: Record<string, string> = Object.fromEntries(labelled.map((name) => [name, t(`editor.${name}`)]));
  const helped = ["show_title", "pv_mode", "mode", "source", "wide_from", "volume", "usable_min", "usable_max", "eco", "circuit", "running", "curve", "gauge", "scale", "trend", "ring", "centre", "buffer_line", "store_head", "balance", "chips", "foot_items", "rest_note"];

  return {
    schema,
    computeLabel: (item: { name: string }) =>
      (MARKS as readonly string[]).includes(item.name) ? t(`mark.${item.name}`) : labels[item.name] ?? item.name,
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
