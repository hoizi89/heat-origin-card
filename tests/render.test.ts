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

  it("turns a room reading into an answer by naming the room that was asked for", async () => {
    const { root } = await mount(FULL_CONFIG);
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG"));
    const t = text(eg as Element);
    // 24,5 in a room asked to be 22,5 is two kelvin too warm — which is why it rests.
    expect(t).toContain("Soll 22,5°");
    expect(t).toContain("+2,0 K");
  });

  it("shows a resting circuit its room and target alone: standing water has nothing to say", async () => {
    const { root } = await mount(FULL_CONFIG);
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG"));
    const t = text(eg as Element);
    expect(t).toContain("Soll 22,5°");
    expect(t).not.toContain("25,8°");
    expect(t).not.toContain("30,6°");
  });

  it("asks the heating curve what it wants of a resting circuit when told to, beside the flow it has", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { curve: true } });
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG"));
    expect(text(eg as Element)).toContain("25,8° 30,6° VL-Soll");
  });

  it("leaves the target out when asked for the plain room", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { circuit: "room_plain" } });
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG"));
    expect(text(eg as Element)).not.toContain("Soll");
  });

  it("gives the day's figures in place of a last run the circle already tells", async () => {
    const { root } = await mount(FULL_CONFIG, idle());
    const foot = text(root.querySelector(".section .foot") as Element);
    expect(foot).toContain("Heute");
    expect(foot).toContain("3 Starts");
    expect(foot).not.toContain("zuletzt");
    // Asked for the last run, the old pair comes back.
    const old = await mount({ ...FULL_CONFIG, flow: { balance: false } }, idle());
    expect(text(old.root.querySelector(".section .foot") as Element)).toContain("zuletzt");
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
    const { root } = await mount({ ...FULL_CONFIG, layout: "split" });
    const hotWater = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Warmwasser"));
    // At 116 px the figures leave no gap between them, so it falls back to the tooltip.
    expect(text(hotWater as Element)).toContain("Soll");
    expect(text(hotWater as Element)).not.toContain("34,3°");
    expect(root.querySelector(".section svg title")?.textContent).toContain("Zirkulation");
  });

  it("splits stores left of the heat pump and circuits right when asked", async () => {
    const { root } = await mount({ ...FULL_CONFIG, layout: "split" });
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
    const { root } = await mount({ ...FULL_CONFIG, flow: { foot: "no_spread" } });
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
    // Hot gas means nothing with the compressor at rest; the store's bottom is the tooltip's business.
    expect(text(root.querySelector(".section .foot") as Element)).not.toContain("Heißgas");
    expect(text(root.querySelector(".section svg") as Element)).not.toContain("unten");
    expect(root.querySelectorAll(".flow-dash")).toHaveLength(0);
  });

  it("names the ground for a ground source heat pump", async () => {
    const hass = makeHass({
      [IDS.mode]: { entity_id: IDS.mode, state: "CH", attributes: {} }
    });
    const { root } = await mount({ ...FULL_CONFIG, source: "ground", entities: { ...FULL_CONFIG.entities, outdoor: undefined } }, hass);
    expect(text(root.querySelector(".foot") as Element)).toContain("Erdreich");
  });

  it("reads today's history once, and nothing more: no band, no statistics", async () => {
    const { root, hass } = await mount(FULL_CONFIG);
    const calls = (hass as ReturnType<typeof makeHass>).calls;
    expect(calls.filter((c) => c === "history/history_during_period")).toHaveLength(2);
    expect(calls).not.toContain("recorder/statistics_during_period");
    expect(root.querySelector("rect.seg")).toBeNull();
    expect(root.querySelector(".store")).toBeNull();
    expect(text(root)).not.toContain("Kurzläufe");
  });

  it("draws a store's level as stages between its set-points, and one stage where there are none", async () => {
    const { root } = await mount(FULL_CONFIG);
    const hotWater = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Warmwasser")) as Element;
    const t = text(hotWater);
    expect(t).toContain("unter Eco");
    expect(t).toContain("Soll");
    expect(t).toContain("PV");
    // Three stages, each a track of its own; 57,6° fills every one of them.
    const tracks = [...hotWater.querySelectorAll("rect")].filter((r) => r.getAttribute("rx") === "2");
    expect(tracks.length).toBe(6);
    const buffer = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Puffer")) as Element;
    expect([...buffer.querySelectorAll("rect")].filter((r) => r.getAttribute("rx") === "2").length).toBe(2);
    expect(text(buffer)).not.toMatch(/unter (Eco|Soll|PV)/);
  });

  it("draws the level as a thermometer when asked: a scale with a pointer, its ends and marks named", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { gauge: "scale" } });
    const hotWater = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Warmwasser")) as Element;
    expect(hotWater.querySelector("linearGradient")).not.toBeNull();
    expect(text(hotWater)).toContain("PV 57,5°");
    expect(text(hotWater)).toContain("40°");
    expect(text(hotWater)).toContain("Eco");
  });

  it("names the store's empty and full ends in its tooltip", async () => {
    const { root } = await mount(FULL_CONFIG);
    const titles = [...root.querySelectorAll(".section svg title")].map((t) => t.textContent ?? "");
    // The buffer has no marks and stands at 55,2°: twenty over its floor would call it over full, so the scale stretches to 60.
    expect(titles.find((t) => t.startsWith("Puffer"))).toContain("leer unter 30,0 °C · voll ab 60,0 °C");
    expect(titles.find((t) => t.startsWith("Warmwasser"))).toContain("leer unter 40,0 °C · voll ab 57,5 °C");
  });
});

describe("general", () => {
  it("warns plainly when the state sensor does not exist", async () => {
    const { root } = await mount({ type: "t", entities: { mode: "sensor.missing" } });
    expect(text(root)).toContain("sensor.missing");
  });

  it("speaks English where the dashboard does", async () => {
    const { root } = await mount(FULL_CONFIG, makeHass({}, "en"));
    expect(root.querySelector(".chip")?.textContent).toContain("Hot water");
    expect(text(root.querySelector(".foot") as Element)).toContain("kW PV");
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
