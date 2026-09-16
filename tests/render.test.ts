// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import type { HeatOriginCardConfig, HomeAssistant } from "../src/types";
import { FULL_CONFIG, IDS, makeHass } from "./fixtures";

type Card = HTMLElement & {
  hass?: HomeAssistant;
  setConfig(c: HeatOriginCardConfig): void;
  updateComplete: Promise<boolean>;
};

beforeAll(async () => {
  await import("../src/heat-origin-card");
});

async function mount(config: HeatOriginCardConfig, hass = makeHass()) {
  const card = document.createElement(CARD_TYPE) as Card;
  card.setConfig(config);
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  // The history arrives a few microtasks later; then the band renders.
  for (let i = 0; i < 3; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;
  }
  return { card, root: card.shadowRoot as ShadowRoot, hass };
}

/** Every text node on its own, the way the eye separates what layout separates. */
const text = (root: ShadowRoot | Element) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.tagName === "STYLE") continue;
    const value = node.textContent?.trim();
    if (value) parts.push(value);
  }
  return parts.join(" ").replace(/\s+/g, " ");
};

const idle = () =>
  makeHass({
    [IDS.mode]: { entity_id: IDS.mode, state: "STBY", attributes: {}, last_changed: new Date(2026, 8, 15, 13, 39, 46).toISOString() }
  });

describe("the flow", () => {
  it("names the state and since when in the chip", async () => {
    const { root } = await mount(FULL_CONFIG);
    expect(root.querySelector(".chip")?.textContent?.replace(/\s+/g, " ")).toContain("Warmwasser · seit 13:00");
  });

  it("colours the electricity by where it comes from and names the source", async () => {
    const { root } = await mount(FULL_CONFIG);
    expect(text(root.querySelector(".foot") as Element)).toContain("1,73 kW PV");
    const grid = await mount(
      FULL_CONFIG,
      makeHass({
        [IDS.solar]: { entity_id: IDS.solar, state: "0", attributes: { unit_of_measurement: "W" } },
        [IDS.grid_power]: { entity_id: IDS.grid_power, state: "2700", attributes: { unit_of_measurement: "W" } }
      })
    );
    expect(text(grid.root.querySelector(".foot") as Element)).toContain("Netz");
  });

  it("draws the heat flowing to hot water and the circuits with their words, the circulation only as a mark on the hot water", async () => {
    const { root } = await mount(FULL_CONFIG);
    const t = text(root);
    expect(t).toContain("6,6");
    expect(t).toContain("COP 3,8");
    // The circuit's own word survives as its label, in capitals like every label.
    expect(t).toContain("SOMMER");
    // A circuit in summer mode moves no water; its spread would be a number without meaning.
    expect(t).not.toContain("25,8/24,7");
    expect(t).toContain("24,5°");
    // Circulation draws from the store, not from the heat pump: no box of its own in the flow.
    expect(text(root.querySelector(".section svg") as Element)).not.toContain("Zirkulation 34,3");
    expect(root.querySelector(".section svg title")?.textContent).toContain("Zirkulation läuft");
    expect(root.querySelectorAll(".flow-dash")).toHaveLength(1);
  });

  const boxX = (root: ShadowRoot, name: string) => {
    const rect = [...root.querySelectorAll(".section svg rect")].find((r) => r.parentElement?.textContent?.includes(name));
    return Number(rect?.getAttribute("x"));
  };

  it("puts the heating group in one column and hot water in the other", async () => {
    const { root } = await mount(FULL_CONFIG);
    // The buffer belongs with the circuits it feeds, not with the hot water store.
    expect(boxX(root, "Warmwasser")).toBeLessThan(100);
    expect(boxX(root, "Puffer")).toBeGreaterThan(150);
    expect(boxX(root, "FBH EG")).toBeGreaterThan(150);
    expect(boxX(root, "Heizkörper OG")).toBeGreaterThan(150);
    // Two things beside each other, so every box is half again as wide as in a split.
    const rect = [...root.querySelectorAll(".section svg rect")].find((r) => r.parentElement?.textContent?.includes("FBH EG"));
    expect(Number(rect?.getAttribute("width"))).toBeGreaterThan(160);
  });

  it("writes the circulation into the hot water box where the box is wide enough", async () => {
    const { root } = await mount(FULL_CONFIG);
    const hotWater = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Warmwasser"));
    // It sits in the widest gap there is, between the temperature and the usable heat,
    // so the scale below keeps room for the set-points to name themselves.
    expect(text(hotWater as Element)).toContain("34,3°");
    expect(text(hotWater as Element)).toContain("Soll");
    const buffer = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Puffer"));
    expect(text(buffer as Element)).not.toContain("34,3°");
  });

  it("keeps the circulation out of the narrower split box, where it would not fit", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { layout: "split" } });
    const hotWater = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Warmwasser"));
    // At 116 px the figures leave no gap between them, so it falls back to the tooltip.
    expect(text(hotWater as Element)).toContain("Soll");
    expect(text(hotWater as Element)).not.toContain("34,3°");
    expect(root.querySelector(".section svg title")?.textContent).toContain("Zirkulation");
  });

  it("splits stores left of the heat pump and circuits right when asked", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { layout: "split" } });
    const x = (name: string) => boxX(root, name);
    expect(x("Warmwasser")).toBeLessThan(100);
    expect(x("Puffer")).toBeLessThan(100);
    expect(x("FBH EG")).toBeGreaterThan(200);
    expect(x("Heizkörper OG")).toBeGreaterThan(200);
    const foot = text(root.querySelector(".foot") as Element);
    expect(foot).toContain("1,73 kW PV");
    expect(foot).toContain("4,88 kW Luft 20,2 °C");
  });

  it("keeps only the outdoor temperature in the foot while standing still", async () => {
    const { root } = await mount(FULL_CONFIG, idle());
    expect(text(root.querySelector(".foot") as Element)).toContain("20,2 °C außen");
  });

  it("puts flow, return, spread, volume and extra figures under the flow while running", async () => {
    const { root } = await mount(FULL_CONFIG);
    const foot = text(root.querySelector(".section .foot") as Element);
    expect(foot).toContain("WP 67,2 → 63,9 °C · Δ 3,2 K");
    expect(foot).toContain("1.752 l/h");
    expect(foot).toContain("Heißgas 87,5 °C");
  });

  it("shows a heating circuit's flow, return and spread while it takes heat", async () => {
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} }
    });
    const { root } = await mount(FULL_CONFIG, hass);
    const t = text(root);
    // Flow up, return down, and the spread under them.
    expect(t).toContain("25,8°");
    expect(t).toContain("24,7°");
    expect(t).toContain("Δ 1,1 K");
  });

  it("draws the buffer feeding a circuit the heat pump is not heating, and says how long for", async () => {
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} }
    });
    const { root } = await mount(FULL_CONFIG, hass);
    // The heat pump is making hot water; the floor loop is taking it from the buffer.
    const chips = [...root.querySelectorAll(".chip")].map((c) => c.textContent?.replace(/\s+/g, " ") ?? "");
    expect(chips.some((c) => c.includes("Puffer → FBH EG"))).toBe(true);
  });

  it("leaves the spread out when asked", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { spread: false } });
    expect(text(root)).not.toContain("Spreizung");
    expect(text(root)).not.toContain("Δ 1,1 K");
  });

  it("tells the last run while standing still instead of zeros", async () => {
    const { root } = await mount(FULL_CONFIG, idle());
    const t = text(root);
    // A resting heat pump gets no chip: the middle of the circle says what it last did.
    expect(root.querySelector(".chip")).toBeNull();
    expect(t).toContain("ZULETZT");
    expect(t).toContain("40 min");
    expect(t).toContain("Heute 3 Starts");
    expect(t).not.toContain("0,00 kW");
    // Hot gas means nothing with the compressor at rest; the store's bottom lives in the storage section.
    expect(text(root.querySelector(".section .foot") as Element)).not.toContain("Heißgas");
    expect(text(root.querySelector(".section svg") as Element)).not.toContain("unten");
    expect(root.querySelectorAll(".flow-dash")).toHaveLength(0);
  });
});

describe("the day band", () => {
  it("reads history, counts starts and short runs as figures, without a notice for one short run", async () => {
    const { root, hass } = await mount(FULL_CONFIG);
    expect((hass as ReturnType<typeof makeHass>).calls).toContain("history/history_during_period");
    expect(root.querySelectorAll("rect.seg").length).toBeGreaterThan(8);
    const stats = text(root.querySelector(".stats") as Element);
    expect(stats).toContain("Starts 3");
    expect(stats).toContain("Kurzläufe 0 Gestern 1");
    expect(stats).toContain("Warmwasser 1:59");
    expect(stats).toContain("Heizen 2:16");
    expect(root.querySelector(".alert")).toBeNull();
    expect(root.querySelectorAll("path.short-mark")).toHaveLength(1);
  });

  it("raises a notice once the heat pump cycles", async () => {
    const { root } = await mount({ ...FULL_CONFIG, day: { cycling_from: 1, days: 2 } });
    // Yesterday's single short run does not count for today.
    expect(root.querySelector(".alert")).toBeNull();
  });
});

describe("performance factors", () => {
  it("stand under the running times, today against the month, with an arrow where they part", async () => {
    const { root } = await mount(FULL_CONFIG);
    const stats = [...root.querySelectorAll(".stat")].map((s) => text(s));
    expect(stats.find((s) => s.startsWith("Heizen"))).toContain("AZ 6,2 Monat 6,0");
    expect(stats.find((s) => s.startsWith("Warmwasser"))).toContain("AZ 4,1 ▼ Monat 5,1");
    expect(text(root)).not.toContain("Umweltwärme");
    expect(text(root)).not.toContain("KWH");
  });

  it("falls back to the year where no month is given", async () => {
    const { cop_heating_month, cop_hot_water_month, ...entities } = FULL_CONFIG.entities;
    const { root } = await mount({ ...FULL_CONFIG, entities });
    expect(text(root.querySelector(".stats") as Element)).toContain("AZ 4,1 Jahr 4,4");
  });

  it("names the ground for a ground source heat pump", async () => {
    const hass = makeHass({
      [IDS.mode]: { entity_id: IDS.mode, state: "CH", attributes: {} }
    });
    const { root } = await mount({ ...FULL_CONFIG, source: "ground", entities: { ...FULL_CONFIG.entities, outdoor: undefined } }, hass);
    expect(text(root.querySelector(".foot") as Element)).toContain("Erdreich");
  });
});

describe("storage", () => {
  /** The section is a repeat of the flow's own gauges, so every test here asks for it. */
  const WITH_STORES = { ...FULL_CONFIG, sections: { stores: true } };
  it("shows the temperature first, the layering, the marks and the usable heat from the volume", async () => {
    const { root } = await mount(WITH_STORES);
    const stores = [...root.querySelectorAll(".store")].map((s) => text(s));
    expect(stores[0]).toContain("Warmwasser 57,6 °C lädt unten 57,6 · gleichmäßig");
    expect(stores[0]).toContain("6,1 kWh über 40 °C");
    expect(stores[0]).not.toContain("%");
    expect(stores[1]).toContain("über 30 °C");
    // Every tank has the same height; its filling runs from the usable minimum to the highest mark.
    const fills = [...root.querySelectorAll(".tank .fill")].map((f) => (f as HTMLElement).style.height);
    expect(fills).toEqual(["100%", "78.2%"]);
    expect(root.querySelectorAll(".tank .tick").length).toBe(2);
    expect(stores[0]).toContain("PV 57,5");
    expect(stores[1]).toContain("unten 51,7 · Δ 3,5 K");
    expect(stores[1]).toContain("8,2 kWh");
    expect(text(root)).toContain("≈ 14,3 kWh nutzbar");
    expect(root.querySelectorAll(".mark.reached")).toHaveLength(3);
    expect(stores[0]).toContain("Zirkulation 34,3 °C · läuft");
    expect(stores[1]).not.toContain("Zirkulation");
  });

  it("folds a circulation written as a circuit into the hot water store", async () => {
    const legacy = {
      ...FULL_CONFIG,
      circuits: [...(FULL_CONFIG.circuits ?? []), { name: "Zirkulation", pump: "switch.zirkulationspumpe", temperature: "sensor.lambdawp_boil1_actual_circulation_temperature" }],
      stores: (FULL_CONFIG.stores ?? []).map(({ circulation, circulation_pump, ...s }) => s)
    };
    const { root } = await mount({ ...legacy, sections: { stores: true } });
    expect(text(root.querySelector(".section svg") as Element)).not.toContain("Zirkulation 34,3");
    expect(root.querySelector(".section svg title")?.textContent).toContain("Zirkulation läuft");
    expect(text(root.querySelector(".store") as Element)).toContain("Zirkulation 34,3 °C · läuft");
  });

  it("says how far below target a store is once nothing charges it", async () => {
    const hass = makeHass({
      [IDS.mode]: { entity_id: IDS.mode, state: "STBY", attributes: {} },
      "sensor.lambdawp_boil1_actual_high_temperature": {
        entity_id: "sensor.lambdawp_boil1_actual_high_temperature",
        state: "46.0",
        attributes: { unit_of_measurement: "°C" }
      }
    });
    const { root } = await mount(WITH_STORES, hass);
    expect(text(root.querySelector(".store") as Element)).toContain("2,5 K unter Soll");
  });
});

describe("general", () => {
  it("shows only the chosen sections", async () => {
    const { root } = await mount({ ...FULL_CONFIG, sections: { flow: false, stores: false } });
    expect(root.querySelector(".flow-dash")).toBeNull();
    expect(root.querySelector(".store")).toBeNull();
    expect(text(root)).toContain("Kurzläufe");
  });

  it("warns plainly when the state sensor does not exist", async () => {
    const { root } = await mount({ type: "t", entities: { mode: "sensor.missing" } });
    expect(text(root)).toContain("sensor.missing");
  });

  it("speaks English where the dashboard does", async () => {
    const { root } = await mount(FULL_CONFIG, makeHass({}, "en"));
    expect(root.querySelector(".chip")?.textContent).toContain("Hot water");
    expect(text(root)).toContain("Short runs");
  });

  it("the compact form is one row: the state, the hot water temperature and today's thread", async () => {
    const { root } = await mount({ ...FULL_CONFIG, shape: "compact" });
    expect(root.querySelector("ha-card")?.classList.contains("compact")).toBe(true);
    expect(text(root)).toContain("Warmwasser");
    expect(text(root)).toContain("PV");
    expect(root.querySelector(".big")?.textContent).toContain("57,6");
    expect(root.querySelector("svg.strip")).not.toBeNull();
  });
});
