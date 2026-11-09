// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { BUFFER_HEIGHTS, EDGE_MIN, HOT_WATER_HEIGHTS, calendarDays, edgeAt, edgeLabelY, pillCentres, ringArcs, showerLitres, tempTone, usableKwh, wrapText } from "../src/origin";
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
    expect(litres(40.6, 38.4)).toBe(163);
    expect(litres(39.2, 27.5)).toBe(40);
    expect(litres(47.8, 44.1)).toBe(366);
    expect(litres(58.3, 55.0)).toBe(477);
    expect(litres(37.0, 36.0)).toBe(0);
  });

  it("rises smoothly while a nearly uniform store warms through the mix line", () => {
    // 09.11.2026: with a hard cut this step went 149 -> 246 litres
    expect(litres(40.0, 38.4)).toBe(145);
    expect(litres(40.4, 38.8)).toBe(178);
    expect(litres(40.5, 39.3)).toBe(208);
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

  it("counts the days since 60 °C in calendar days from a time stamp, and says when a run is on", async () => {
    const last = new Date(Date.now() - 3 * 86_400_000);
    last.setHours(23, 30, 0, 0);
    const stamp = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")} 23:30:00`;
    const base = {
      "input_datetime.ww_60": { entity_id: "input_datetime.ww_60", state: stamp, attributes: { timestamp: last.getTime() / 1000 } },
      "sensor.ww_tage": { entity_id: "sensor.ww_tage", state: "2.4", attributes: {} }
    };
    const config = { ...origin, entities: { ...IDS, hot_water_reason: "input_text.ww_stufe", legionella_days: "sensor.ww_tage", legionella_last: "input_datetime.ww_60" } };
    const idle = makeHass({ ...base, [IDS.mode]: { entity_id: IDS.mode, state: "CH", attributes: {} }, "input_text.ww_stufe": { entity_id: "input_text.ww_stufe", state: "Grundstellung -> 42.0 Grad", attributes: {} } });
    let text = (await mount(config, idle)).querySelector(".origin svg")!.textContent!.replace(/\s+/g, " ");
    expect(text.slice(text.indexOf("WARMWASSER"), text.indexOf("WARMWASSER") + 160)).toContain(`60° vor ${calendarDays(last.getTime(), Date.now())} Tagen`);
    const running = makeHass({ ...base, "input_text.ww_stufe": { entity_id: "input_text.ww_stufe", state: "Legionellen erzwungen -> 59.0 Grad", attributes: {} } });
    text = (await mount(config, running)).querySelector(".origin svg")!.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("60° läuft");
  });

  it("says hot water comes first instead of a deviation while the heat pump charges hot water", async () => {
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} }
    });
    const text = (await mount(origin, hass)).querySelector(".origin svg")!.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("WW-Vorrang");
    expect(text).not.toMatch(/−4,8 K/);
  });

  it("keeps the classic columns on request", async () => {
    const root = await mount({ ...FULL_CONFIG, layout: "classic" });
    expect(root.querySelector(".origin")).toBeNull();
  });
});

describe("pill placement", () => {
  const span = { top: 220, bottom: 284, gap: 24 };
  it("keeps pills out of the round caps", () => {
    // buffer sensors at 85 % and 20 % of a 112 px tank starting at 196
    const [top, bottom] = pillCentres([196 + 112 * 0.15, 196 + 112 * 0.8], span);
    expect(top).toBe(220);
    expect(bottom).toBeCloseTo(285.6 > 284 ? 284 : 285.6);
  });
  it("pushes close pills apart and stays inside", () => {
    const [a, b] = pillCentres([250, 255], span);
    expect(b - a).toBeGreaterThanOrEqual(24);
    expect(a).toBeGreaterThanOrEqual(220);
    expect(b).toBeLessThanOrEqual(284);
  });
});

describe("edge label", () => {
  const span = { top: 204, bottom: 306, clear: 15 };
  it("stays at the edge when no pill is near", () => {
    expect(edgeLabelY(260, [220, 284], span)).toBe(260);
  });
  it("moves off a pill at the same height", () => {
    const y = edgeLabelY(222, [220, 284], span)!;
    expect(Math.abs(y - 220)).toBeGreaterThanOrEqual(15);
    expect(y).toBeGreaterThanOrEqual(204);
  });
});

describe("calendar days", () => {
  it("counts days the way the automation does, not elapsed hours", () => {
    const last = new Date(2026, 9, 30, 15, 55).getTime();
    expect(calendarDays(last, new Date(2026, 10, 9, 10, 58).getTime())).toBe(10);
    expect(calendarDays(last, new Date(2026, 9, 30, 23, 0).getTime())).toBe(0);
  });
});

describe("wrapped stage text", () => {
  it("breaks at spaces and never runs past the column", () => {
    expect(wrapText("Grundstellung ohne Sonne", 18)).toEqual(["Grundstellung ohne", "Sonne"]);
    expect(wrapText("Mittag mit Sonne", 18)).toEqual(["Mittag mit Sonne"]);
    const lines = wrapText("Sonne kommt noch, nur Notladung bis morgen früh", 18);
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.length <= 18)).toBe(true);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(wrapText("Legionellenschaltungsprogramm", 18)[0].length).toBeLessThanOrEqual(18);
  });
});

describe("wrapped units", () => {
  it("keeps a unit with its number", () => {
    expect(wrapText("usable down to 29 °C", 17)).toEqual(["usable down to", "29\u00a0°C"]);
  });
});
