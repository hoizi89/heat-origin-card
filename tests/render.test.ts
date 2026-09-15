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
    expect(text(root)).toContain("Strom · PV");
    const grid = await mount(
      FULL_CONFIG,
      makeHass({
        [IDS.solar]: { entity_id: IDS.solar, state: "0", attributes: { unit_of_measurement: "W" } },
        [IDS.grid_power]: { entity_id: IDS.grid_power, state: "2700", attributes: { unit_of_measurement: "W" } }
      })
    );
    expect(text(grid.root)).toContain("Strom · Netz");
  });

  it("draws the heat flowing to hot water, the circuits with their words, and the circulation running", async () => {
    const { root } = await mount(FULL_CONFIG);
    const t = text(root);
    expect(t).toContain("6,6");
    expect(t).toContain("COP 3,8");
    expect(t).toContain("Sommer");
    // A circuit in summer mode moves no water; its spread would be a number without meaning.
    expect(t).not.toContain("25,8/24,7");
    expect(t).toContain("24,5°");
    expect(t).toContain("34,3 °C · läuft");
    // Only the hot water is fed by the heat pump; the circulation runs on its own.
    expect(root.querySelectorAll(".flow-dash")).toHaveLength(1);
  });

  it("puts flow, return, spread, volume and extra figures under the flow while running", async () => {
    const { root } = await mount(FULL_CONFIG);
    const foot = text(root.querySelector(".section .foot") as Element);
    expect(foot).toContain("Spreizung 3,2 K");
    expect(foot).toContain("1.752 l/h");
    expect(foot).toContain("Heißgas 87,5 °C");
  });

  it("shows a heating circuit's flow, return and spread while it takes heat", async () => {
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} }
    });
    const { root } = await mount(FULL_CONFIG, hass);
    expect(text(root)).toContain("25,8/24,7 · Δ 1,1 K");
  });

  it("leaves the spread out when asked", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { spread: false } });
    expect(text(root)).not.toContain("Spreizung");
    expect(text(root)).not.toContain("Δ 1,1 K");
  });

  it("tells the last run while standing still instead of zeros", async () => {
    const { root } = await mount(FULL_CONFIG, idle());
    const t = text(root);
    // Standby since the run ended at 13:39, even if a block turned into standby later.
    expect(root.querySelector(".chip")?.textContent?.replace(/\s+/g, " ")).toContain("Bereit · seit 13:39");
    expect(t).toContain("zuletzt");
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

describe("heat today", () => {
  it("speaks of ambient heat and performance factors", async () => {
    const { root } = await mount(FULL_CONFIG);
    const t = text(root);
    expect(t).toContain("80 % Umweltwärme aus der Luft");
    expect(t).toContain("AZ 6,2");
    expect(t).toContain("JAZ 6,0");
    expect(t).toContain("27,6 kWh");
    expect(t).not.toContain("KWH");
  });

  it("names the ground for a ground source heat pump", async () => {
    const { root } = await mount({ ...FULL_CONFIG, source: "ground" });
    expect(text(root)).toContain("Umweltwärme aus dem Erdreich");
  });
});

describe("storage", () => {
  it("shows the temperature first, the layering, the marks and the usable heat from the volume", async () => {
    const { root } = await mount(FULL_CONFIG);
    const stores = [...root.querySelectorAll(".store")].map((s) => text(s));
    expect(stores[0]).toContain("Warmwasser 57,6 °C lädt unten 57,6 · gleichmäßig");
    expect(stores[0]).toContain("6,1 kWh");
    expect(stores[0]).toContain("100 %");
    expect(stores[0]).toContain("PV 57,5");
    expect(stores[1]).toContain("unten 51,7 · Δ 3,5 K");
    expect(stores[1]).toContain("8,2 kWh");
    expect(text(root)).toContain("≈ 14,3 kWh nutzbar");
    expect(root.querySelectorAll(".mark.reached")).toHaveLength(3);
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
    const { root } = await mount(FULL_CONFIG, hass);
    expect(text(root.querySelector(".store") as Element)).toContain("2,5 K unter Soll");
  });
});

describe("general", () => {
  it("shows only the chosen sections", async () => {
    const { root } = await mount({ ...FULL_CONFIG, sections: { flow: false, day: false, stores: false } });
    expect(root.querySelector(".flow-dash")).toBeNull();
    expect(text(root)).not.toContain("Kurzläufe");
    expect(text(root)).toContain("Umweltwärme");
  });

  it("warns plainly when the state sensor does not exist", async () => {
    const { root } = await mount({ type: "t", entities: { mode: "sensor.missing" } });
    expect(text(root)).toContain("sensor.missing");
  });

  it("speaks English where the dashboard does", async () => {
    const { root } = await mount(FULL_CONFIG, makeHass({}, "en"));
    expect(root.querySelector(".chip")?.textContent).toContain("Hot water");
    expect(text(root)).toContain("ambient heat from the air");
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
