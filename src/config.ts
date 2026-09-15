import { localize } from "./localize";
import { resolveModes } from "./modes";
import type { HeatOriginCardConfig, ResolvedConfig, SectionName, StoreKind } from "./types";

export const CARD_TYPE = "heat-origin-card";
export const SECTIONS: SectionName[] = ["flow", "day", "origin", "stores"];

export function assertConfig(config: HeatOriginCardConfig | undefined, locale?: string): void {
  if (!config?.entities?.mode) {
    throw new Error(localize("state.no_mode", locale) + " entities.mode");
  }
}

/** A store named like hot water is hot water; everything else is a buffer. */
function guessKind(name: string): StoreKind {
  return /warmwasser|hot.?water|boiler|dhw|brauchwasser/i.test(name) ? "hot_water" : "buffer";
}

export function resolveConfig(config: HeatOriginCardConfig): ResolvedConfig {
  const sections = config.sections ?? {};
  const chosen = (sections.order ?? []).filter((s): s is SectionName => SECTIONS.includes(s));
  const days = config.day?.days === 1 ? 1 : 2;
  return {
    type: config.type,
    title: config.title,
    shape: config.shape === "compact" ? "compact" : "standard",
    sections: {
      flow: sections.flow ?? true,
      day: sections.day ?? true,
      origin: sections.origin ?? true,
      stores: sections.stores ?? Boolean(config.stores?.length),
      order: [...chosen, ...SECTIONS.filter((s) => !chosen.includes(s))]
    },
    entities: config.entities,
    modes: resolveModes(config.modes),
    circuits: config.circuits ?? [],
    stores: (config.stores ?? []).map((s) => ({ ...s, kind: s.kind ?? guessKind(s.name) })),
    flow: {
      spread: config.flow?.spread ?? true,
      circuit_details: config.flow?.circuit_details ?? false,
      extras: config.flow?.extras ?? []
    },
    day: {
      days,
      short_run: config.day?.short_run ?? 120
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
          schema: ["heat_power", "electric_power", "flow", "return", "volume_flow", "outdoor", "solar", "cop"].map((name) => ({
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
        { name: "spread", selector: { boolean: {} } },
        { name: "circuit_details", selector: { boolean: {} } }
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
        { name: "short_run", selector: { number: { min: 0, max: 900, step: 10, mode: "box" } } }
      ]
    }
  ];

  const labels: Record<string, string> = {
    title: t("editor.title"),
    shape: t("editor.shape"),
    flow: t("editor.section_flow"),
    day: t("editor.section_day"),
    origin: t("editor.section_origin"),
    stores: t("editor.section_stores"),
    mode: t("editor.mode"),
    heat_power: t("editor.heat_power"),
    electric_power: t("editor.electric_power"),
    return: t("editor.return"),
    volume_flow: t("editor.volume_flow"),
    outdoor: t("editor.outdoor"),
    solar: t("editor.solar"),
    cop: t("editor.cop"),
    heating_heat_today: t("editor.heating_heat_today"),
    heating_electric_today: t("editor.heating_electric_today"),
    hot_water_heat_today: t("editor.hot_water_heat_today"),
    hot_water_electric_today: t("editor.hot_water_electric_today"),
    heat_today: t("editor.heat_today"),
    electric_today: t("editor.electric_today"),
    spread: t("editor.spread"),
    circuit_details: t("editor.circuit_details"),
    days: t("editor.days"),
    short_run: t("editor.short_run")
  };

  return {
    schema,
    // The flow temperature sensor and the flow section share a name; only the sensor has an entity selector.
    computeLabel: (item: { name: string; selector?: { entity?: unknown } }) =>
      item.name === "flow" && item.selector?.entity ? t("editor.flow") : labels[item.name] ?? item.name,
    computeHelper: (item: { name: string }) => (item.name === "mode" ? t("editor.help_yaml") : undefined)
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
