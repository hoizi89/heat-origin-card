// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { BUFFER_HEIGHTS, EDGE_MIN, HOT_WATER_HEIGHTS, edgeAt, ringArcs, showerLitres, tempTone, usableKwh } from "../src/origin";
import type { HeatOriginCardConfig, HomeAssistant } from "../src/types";
import { FULL_CONFIG, IDS, makeHass } from "./fixtures";

describe("tank colours", () => {
  it("steps through clear bands and never blends", () => {
    expect(tempTone(30)).toBe("#0A84FF");
    expect(tempTone(34.9)).toBe("#0A84FF");
    expect(tempTone(35)).toBe("#64D2FF");
    expect(tempTone(38.9)).toBe("#64D2FF");
    // From 39 °C the water counts as shower water.
    expect(tempTone(39)).toBe("#FFD60A");
    expect(tempTone(45)).toBe("#FF9F0A");
    expect(tempTone(52)).toBe("#FF453A");
    expect(tempTone(undefined)).toBe("#48484A");
  });
});

describe("the usable edge", () => {
  it("sits where the line through both sensors crosses the threshold", () => {
    // 40.6 at 81 %, 38.3 at 35 %: 39 °C is reached at 0.35 + 0.7 / 5 = 0.49.
    expect(edgeAt(40.6, 38.3, HOT_WATER_HEIGHTS, 39)).toBeCloseTo(0.49, 2);
    expect(edgeAt(37.6, 31.2, BUFFER_HEIGHTS, 35)).toBeCloseTo(0.586, 2);
  });

  it("covers the whole tank or none of it when both sensors agree", () => {
    expect(edgeAt(45, 42, HOT_WATER_HEIGHTS, 39)).toBe(EDGE_MIN);
    expect(edgeAt(37, 30, HOT_WATER_HEIGHTS, 39)).toBe(1);
    expect(edgeAt(undefined, 40, HOT_WATER_HEIGHTS, 39)).toBe(1);
    expect(edgeAt(41, undefined, HOT_WATER_HEIGHTS, 39)).toBe(EDGE_MIN);
  });
});

describe("shower litres", () => {
  const litres = (top: number, bottom: number) => Math.round(showerLitres({ top, bottom, heights: HOT_WATER_HEIGHTS, volume: 300 }) ?? -1);

  it("matches the Home Assistant sensor it was taken from", () => {
    expect(litres(40.6, 38.4)).toBe(172);
    expect(litres(39.2, 27.5)).toBe(63);
    expect(litres(47.8, 44.1)).toBe(366);
    expect(litres(58.3, 55.0)).toBe(477);
    expect(litres(37.0, 36.0)).toBe(0);
  });

  it("gets hotter water to more litres, and needs a volume", () => {
    expect(litres(55, 55)).toBeGreaterThan(litres(45, 45));
    expect(showerLitres({ top: 50, bottom: 50, heights: HOT_WATER_HEIGHTS, volume: undefined })).toBeUndefined();
  });
});

describe("usable heat", () => {
  it("counts the warm layers even when the mean is below the floor", () => {
    // 38.5 on top, 30.9 at the bottom: the mean of 34.7 is under 35, the top layers are not.
    const kwh = usableKwh(38.5, 30.9, BUFFER_HEIGHTS, 300, 35)!;
    expect(kwh).toBeGreaterThan(0.3);
    expect(kwh).toBeLessThan(1.2);
    expect(usableKwh(30, 28, BUFFER_HEIGHTS, 300, 35)).toBe(0);
    // A mixed store: 300 l, 10 K over the floor, 3.49 kWh.
    expect(usableKwh(45, 45, BUFFER_HEIGHTS, 300, 35)).toBeCloseTo(3.49, 1);
  });
});

describe("the ring", () => {
  it("puts the electricity on the left and gives each part its share", () => {
    const arcs = ringArcs(7.1, 1.2, { solar: 0.7, grid: 0.3 });
    const solar = arcs.find((a) => a.part === "solar")!;
    const grid = arcs.find((a) => a.part === "grid")!;
    const air = arcs.find((a) => a.part === "air")!;
    const electric = 360 * (1.2 / 7.1);
    // Centred at nine o'clock (180°).
    expect(solar.start).toBeLessThan(180);
    expect(grid.start + grid.length).toBeGreaterThan(180);
    expect(solar.length + grid.length).toBeGreaterThan(electric - 8);
    expect(air.length).toBeCloseTo(360 - electric - 3, 0);
  });

  it("draws nothing without heat, and grey electricity without a source", () => {
    expect(ringArcs(0, 0, undefined)).toEqual([]);
    expect(ringArcs(5, 1, undefined).map((a) => a.part)).toEqual(["power", "air"]);
  });
});

describe("the origin layout", () => {
  type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: HeatOriginCardConfig): void; updateComplete: Promise<boolean> };
  beforeAll(async () => {
    await import("../src/heat-origin-card");
  });

  async function mount(config: HeatOriginCardConfig, hass = makeHass()) {
    const card = document.createElement(CARD_TYPE) as Card;
    card.setConfig(config);
    card.hass = hass;
    document.body.append(card);
    await card.updateComplete;
    for (let i = 0; i < 3; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
      await card.updateComplete;
    }
    return card.shadowRoot as ShadowRoot;
  }

  const origin = { ...FULL_CONFIG, layout: undefined } as HeatOriginCardConfig;

  it("is the default and draws sources, stores and circuits in one picture", async () => {
    const root = await mount(origin);
    const svg = root.querySelector(".origin svg");
    expect(svg).not.toBeNull();
    const text = svg!.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("STROM");
    expect(text).toContain("UMWELTWÄRME");
    expect(text).toContain("WARMWASSER");
    expect(text).toContain("PUFFER");
    expect(text).toMatch(/≈ \d+ l/);
    expect(text).toContain("Dusche bei 38 °C");
    expect(root.querySelectorAll(".o-tank").length).toBe(2);
    expect(root.querySelectorAll(".o-circuit").length).toBe(2);
  });

  it("names the reason for the set-point and the days since 60 °C when told where to find them", async () => {
    const hass = makeHass({
      "input_text.ww_stufe": { entity_id: "input_text.ww_stufe", state: "Mittag mit Sonne -> 50.0 Grad", attributes: {} },
      "sensor.ww_tage": { entity_id: "sensor.ww_tage", state: "6.2", attributes: {} }
    });
    const root = await mount({ ...origin, entities: { ...IDS, hot_water_reason: "input_text.ww_stufe", legionella_days: "sensor.ww_tage" } }, hass);
    // What is drawn, without the tooltips that carry the full wording.
    const svg = root.querySelector(".origin svg")!.cloneNode(true) as Element;
    svg.querySelectorAll("title").forEach((n) => n.remove());
    const text = svg.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("Mittag mit Sonne");
    expect(text).not.toContain("-> 50.0");
    expect(text).toContain("60° vor 6 Tagen");
  });

  it("keeps the classic columns on request", async () => {
    const root = await mount({ ...FULL_CONFIG, layout: "classic" });
    expect(root.querySelector(".origin")).toBeNull();
  });
});
