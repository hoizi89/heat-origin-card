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
const text = (root: ShadowRoot) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.tagName === "STYLE") continue;
    const value = node.textContent?.trim();
    if (value) parts.push(value);
  }
  return parts.join(" ").replace(/\s+/g, " ");
};

describe("the full card on the real afternoon", () => {
  it("names the state in the chip, with PV while the sun covers the draw", async () => {
    const { root } = await mount(FULL_CONFIG);
    expect(root.querySelector(".chip")?.textContent).toContain("Warmwasser · PV");
  });

  it("draws the heat flowing to hot water and the circuits with their own words and spread", async () => {
    const { root } = await mount(FULL_CONFIG);
    const t = text(root);
    expect(t).toContain("6,6");
    expect(t).toContain("COP 3,8");
    expect(t).toContain("57,6 °C · lädt");
    expect(t).toContain("Sommer");
    expect(t).toContain("25,8/24,7 · Δ 1,1 K");
    expect(t).toContain("24,5 °C");
    expect(root.querySelectorAll(".flow-dash")).toHaveLength(1);
  });

  it("puts flow, return, spread, volume and extra figures under the flow", async () => {
    const { root } = await mount(FULL_CONFIG);
    const foot = root.querySelector(".section .foot")?.textContent?.replace(/\s+/g, " ");
    expect(foot).toContain("Spreizung 3,2 K");
    expect(foot).toContain("1.752 l/h");
    expect(foot).toContain("Heißgas 87,5 °C");
  });

  it("leaves the spread out when asked", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { spread: false } });
    expect(text(root)).not.toContain("Spreizung");
    expect(text(root)).not.toContain("Δ 1,1 K");
  });

  it("reads the day band from history and flags yesterday's short run", async () => {
    const { root, hass } = await mount(FULL_CONFIG);
    expect(hass.calls).toContain("history/history_during_period");
    expect(root.querySelectorAll("rect.seg").length).toBeGreaterThan(8);
    const t = text(root);
    expect(t).toContain("Starts heute 3");
    const alert = root.querySelector(".alert")?.textContent?.replace(/\s+/g, " ").trim();
    expect(alert).toBe("Kurzlauf gestern 15:43: Heizen nach 30 s wieder aus");
    expect(t).toContain("PV-Leistung");
  });

  it("splits the day's heat into electricity and air", async () => {
    const { root } = await mount(FULL_CONFIG);
    const t = text(root);
    expect(t).toContain("80 % der Wärme kam heute aus der Luft");
    expect(t).toContain("COP 6,2");
    expect(t).toContain("Jahr Heizen COP 6,0");
  });

  it("draws both stores with their marks, layering and circulation", async () => {
    const { root } = await mount(FULL_CONFIG);
    const t = text(root);
    expect(t).toContain("PV-Ziel erreicht");
    expect(t).toContain("Soll 48,5");
    expect(t).toContain("Δ 3,5 K");
    expect(t).toContain("Zirkulation 34,3 °C");
  });

  it("shows only the chosen sections", async () => {
    const { root, hass } = await mount({ ...FULL_CONFIG, sections: { flow: false, day: false, stores: false } });
    expect(root.querySelector(".flow-dash")).toBeNull();
    expect(text(root)).not.toContain("Starts heute");
    expect(text(root)).toContain("aus der Luft");
    expect(hass.calls).not.toContain("history/history_during_period");
  });

  it("stands idle quietly: no flowing line, the raw word translated", async () => {
    const hass = makeHass({ [IDS.mode]: { entity_id: IDS.mode, state: "STBY", attributes: {} } });
    const { root } = await mount(FULL_CONFIG, hass);
    expect(root.querySelector(".chip")?.textContent).toContain("Bereit");
    expect(root.querySelectorAll(".flow-dash")).toHaveLength(0);
  });

  it("warns plainly when the state sensor does not exist", async () => {
    const { root } = await mount({ type: "t", entities: { mode: "sensor.missing" } });
    expect(text(root)).toContain("sensor.missing");
  });

  it("speaks English where the dashboard does", async () => {
    const { root } = await mount(FULL_CONFIG, makeHass({}, "en"));
    expect(root.querySelector(".chip")?.textContent).toContain("Hot water · PV");
    expect(text(root)).toContain("of today's heat came from the air");
  });
});

describe("the compact form", () => {
  it("is one row: the state, the hot water temperature and today's thread", async () => {
    const { root } = await mount({ ...FULL_CONFIG, shape: "compact" });
    const card = root.querySelector("ha-card");
    expect(card?.classList.contains("compact")).toBe(true);
    expect(text(root)).toContain("Warmwasser");
    expect(root.querySelector(".big")?.textContent).toContain("57,6");
    expect(root.querySelector("svg.strip")).not.toBeNull();
  });
});
