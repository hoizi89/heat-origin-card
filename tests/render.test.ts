// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE, resolveConfig } from "../src/config";
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

const resolveWide = (c: HeatOriginCardConfig) => resolveConfig(c).wide_from;

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
    const { root } = await mount({ ...FULL_CONFIG, flow: { rest_note: "target" } });
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG"));
    const t = text(eg as Element);
    // 24,5 in a room asked to be 22,5 is two kelvin too warm — which is why it rests.
    expect(t).toContain("Soll 22,5°");
    expect(t).toContain("+2,0 K");
  });

  it("shows a resting circuit its room and target alone: standing water has nothing to say", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { rest_note: "target" } });
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

  it("says when a resting circuit last heated instead of a target it is not meant to reach", async () => {
    const hass = makeHass();
    const HOUR = 3600_000;
    const at = (ms: number) => Math.round(ms / 1000);
    const threeDays = Date.now() - 3 * 24 * HOUR;
    const lastNight = new Date();
    lastNight.setHours(0, 0, 0, 0);
    const answer = (message: Record<string, unknown>) => ({
      [IDS.mode]: [],
      "sensor.lambdawp_hc1_operating_state": [
        { s: "CH-SUMMER", lu: at(threeDays - 6 * HOUR) },
        { s: "HEATING", lu: at(lastNight.getTime() - 2 * HOUR) },
        // A restart in the middle of a run ends nothing.
        { s: "unavailable", lu: at(lastNight.getTime() - 90 * 60_000) },
        { s: "HEATING", lu: at(lastNight.getTime() - 89 * 60_000) },
        { s: "CH-SUMMER", lu: at(lastNight.getTime() - HOUR) }
      ],
      "sensor.lambdawp_hc2_operating_state": [
        { s: "HEATING", lu: at(threeDays - HOUR) },
        { s: "OFF", lu: at(threeDays) }
      ],
      _: message
    });
    const plain = hass.callWS.bind(hass);
    hass.callWS = (async (message: Record<string, unknown>) =>
      (message.entity_ids as string[] | undefined)?.includes("sensor.lambdawp_hc2_operating_state")
        ? answer(message)
        : plain(message)) as typeof hass.callWS;
    const { root } = await mount(FULL_CONFIG, hass);
    const words = (name: string) => text([...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes(name)) as Element);
    expect(words("FBH EG")).toContain("zuletzt gestern 23:00");
    expect(words("FBH EG")).not.toContain("Soll 22,5°");
    expect(words("Heizkörper OG")).toContain("zuletzt vor 3 Tagen");
    // Switched off, nothing under the room at all.
    const none = await mount({ ...FULL_CONFIG, flow: { rest_note: "none" } }, hass);
    const og = text([...none.root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Heizkörper OG")) as Element);
    expect(og).not.toContain("zuletzt");
    expect(og).not.toContain("Soll");
  });

  it("leaves the target out when asked for the plain room", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { circuit: "room_plain" } });
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG"));
    expect(text(eg as Element)).not.toContain("Soll");
  });

  it("marks surplus solar once, by the title, and the flow target it raised", async () => {
    const surplus = (watts: number, own = 1725) =>
      makeHass({
        "sensor.emgr": { entity_id: "sensor.emgr", state: String(watts), attributes: { unit_of_measurement: "W" } },
        [IDS.electric_power]: { entity_id: IDS.electric_power, state: String(own), attributes: { unit_of_measurement: "W" } },
        "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} }
      });
    // A bare export figure, so the heat pump's own draw is added back.
    const config = { ...FULL_CONFIG, pv_mode_own: true, entities: { ...FULL_CONFIG.entities, pv_mode: "sensor.emgr" }, flow: { running: "spread" as const, chips: false } };
    // 150 W left over while the compressor draws 1,4 kW of the sun: that is PV mode.
    const sunny = await mount(config, surplus(150, 1400));
    expect(text(sunny.root.querySelector(".head .title") as Element)).toContain("PV");
    const eg = [...sunny.root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG")) as Element;
    expect(text(eg)).toContain("PV-Soll");
    // Only by the title and at the raised target: the stores' own words stay as they were.
    const stores = [...sunny.root.querySelectorAll(".section svg g")].filter((g) => /Warmwasser|Puffer/.test(g.textContent ?? ""));
    for (const store of stores) expect(text(store)).not.toMatch(/·\s*PV/);
    // Under Lambda's own minimum of 1,5 kW, counted with the heat pump's own draw, it is no solar mode.
    const dull = await mount(config, surplus(100, 1000));
    expect(dull.root.querySelector(".head .pv")).toBeNull();
    const egDull = [...dull.root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG")) as Element;
    expect(text(egDull)).toContain("VL-Soll");
    // The heat pump's own set-point is taken as it is: the draw is not added to nought at night.
    const setpoint = { ...config, pv_mode_own: false };
    expect((await mount(setpoint, surplus(0, 1900))).root.querySelector(".head .pv")).toBeNull();
    expect((await mount(setpoint, surplus(1500, 1400))).root.querySelector(".head .pv")).not.toBeNull();
  });

  it("says since yesterday rather than a bare time that reads as tonight", async () => {
    const lastNight = new Date();
    lastNight.setHours(0, 0, 0, 0);
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": {
        entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {}, last_changed: new Date(lastNight.getTime() - 60_000).toISOString()
      }
    });
    const { root } = await mount(FULL_CONFIG, hass);
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG")) as Element;
    expect(text(eg)).toContain("HEIZT");
    expect(text(eg)).not.toContain("HEIZT · 23:59");
    expect(text(eg)).toContain("seit gestern 23:59");
  });

  it("leaves the title to the dashboard when asked, and says in its place since when the sun runs the heat pump", async () => {
    const at = new Date();
    at.setHours(0, 0, 0, 0);
    const morning = at.getTime() + 10 * 3600_000;
    const hass = makeHass({
      "sensor.emgr_set": { entity_id: "sensor.emgr_set", state: "1839", attributes: { unit_of_measurement: "W" } }
    });
    const plain = hass.callWS.bind(hass);
    hass.callWS = (async (message: Record<string, unknown>) => {
      const answer = (await plain(message)) as Record<string, unknown>;
      if ((message.entity_ids as string[] | undefined)?.includes("sensor.emgr_set")) {
        answer["sensor.emgr_set"] = [
          { s: "0", lu: at.getTime() / 1000 },
          { s: "1500", lu: morning / 1000 },
          { s: "2400", lu: morning / 1000 + 600 }
        ];
      }
      return answer;
    }) as typeof hass.callWS;
    const config = { ...FULL_CONFIG, show_title: false, entities: { ...FULL_CONFIG.entities, pv_mode: "sensor.emgr_set" }, flow: { chips: false } };
    const { root } = await mount(config, hass);
    expect(root.querySelector(".head .title")).toBeNull();
    const line = text(root.querySelector(".head .pv-mode") as Element);
    expect(line).toContain("PV-Betrieb");
    expect(line).toContain("seit 10:00");
    // Nothing to say, no head at all.
    const dark = makeHass({ "sensor.emgr_set": { entity_id: "sensor.emgr_set", state: "0", attributes: { unit_of_measurement: "W" } } });
    expect((await mount(config, dark)).root.querySelector(".head")).toBeNull();
  });

  it("says when a buffer charging on the sun is full, and draws no arrow beside the word that says it charges", async () => {
    const TOP = "sensor.lambdawp_buff1_actual_high_temperature";
    const climbing = (pv: number) => {
      const hass = makeHass({
        [IDS.mode]: { entity_id: IDS.mode, state: "CH", attributes: {} },
        [TOP]: { entity_id: TOP, state: "46", attributes: { unit_of_measurement: "°C" } },
        "sensor.lambdawp_buff1_actual_low_temperature": { entity_id: "sensor.lambdawp_buff1_actual_low_temperature", state: "44", attributes: {} },
        "sensor.pv_set": { entity_id: "sensor.pv_set", state: String(pv), attributes: { unit_of_measurement: "W" } }
      });
      const plain = hass.callWS.bind(hass);
      hass.callWS = (async (message: Record<string, unknown>) => {
        const answer = (await plain(message)) as Record<string, unknown>;
        if ((message.entity_ids as string[] | undefined)?.includes(TOP)) {
          // Twelve kelvin an hour over the last quarter of an hour.
          const now = Date.now() / 1000;
          answer[TOP] = [0, 1, 2, 3].map((i) => ({ s: String(43 + i), lu: now - (15 - 5 * i) * 60 }));
        }
        return answer;
      }) as typeof hass.callWS;
      return hass;
    };
    const config = { ...FULL_CONFIG, entities: { ...FULL_CONFIG.entities, pv_mode: "sensor.pv_set" }, flow: { gauge: "box" as const } };
    const sunny = await mount(config, climbing(2400));
    const buffer = [...sunny.root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("PU")) as Element;
    expect(text(buffer)).toMatch(/LÄDT · VOLL ≈ \d\d:\d\d/);
    expect(text(buffer)).not.toContain("K/h");
    // Off the sun the heat pump stops somewhere the card does not know: no time.
    const dull = await mount(config, climbing(0));
    const plain = [...dull.root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("PU")) as Element;
    expect(text(plain)).toContain("LÄDT");
    expect(text(plain)).not.toContain("VOLL");
  });

  it("drops the head's badges when asked, and keeps the title", async () => {
    const shown = await mount(FULL_CONFIG);
    expect(shown.root.querySelector(".head .chip")).not.toBeNull();
    const { root } = await mount({ ...FULL_CONFIG, flow: { chips: false } });
    expect(root.querySelector(".head .chip")).toBeNull();
    expect(root.querySelector(".head .title")).not.toBeNull();
  });

  it("writes only the picked parts of the foot, and none of them is no foot", async () => {
    const { root } = await mount({ ...FULL_CONFIG, flow: { ...FULL_CONFIG.flow, foot_items: ["power", "extras"] } });
    const foot = text(root.querySelector(".foot") as Element);
    expect(foot).toContain("1,73 kW PV");
    expect(foot).toContain("Heißgas");
    expect(foot).not.toContain("l/h");
    expect(foot).not.toContain("Vorlauf");
    const none = await mount({ ...FULL_CONFIG, flow: { foot_items: [] } });
    expect(none.root.querySelector(".foot")).toBeNull();
    const rest = await mount({ ...FULL_CONFIG, flow: { foot_items: ["ambient"] } }, idle());
    expect(text(rest.root.querySelector(".section .foot") as Element)).not.toContain("Starts");
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
    // Three named columns: electricity, ambient heat, the heat pump itself.
    const labels = [...root.querySelectorAll(".section .foot-col small")].map((s) => s.textContent);
    expect(labels).toEqual(["Strom", "Umweltwärme", "Wärmepumpe"]);
    expect(foot).toContain("Wärmepumpe 67,2 → 63,9 °C Δ 3,2 K");
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
    // Heat runs down the manifold only as far as the circuit that takes it: the second
    // branch, at 222, stays on the grey track and off the lit path.
    const lit = [...root.querySelectorAll(".section svg path.flow-dash")].map((p) => p.getAttribute("d") ?? "");
    expect(lit.some((d) => d.includes("134"))).toBe(true);
    expect(lit.some((d) => d.includes("222"))).toBe(false);
  });

  it("writes how long a discharging buffer can keep this up where its word stood, marked as the estimate it is", async () => {
    const top = "sensor.lambdawp_buff1_actual_high_temperature";
    const bottom = "sensor.lambdawp_buff1_actual_low_temperature";
    const falling = (perHour: number) => {
      const hass = makeHass({
        [IDS.mode]: { entity_id: IDS.mode, state: "STBY", attributes: {}, last_changed: new Date(2026, 8, 15, 13, 39, 46).toISOString() },
        "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} },
        [top]: { entity_id: top, state: "48.0", attributes: { unit_of_measurement: "°C" } },
        [bottom]: { entity_id: bottom, state: "47.0", attributes: { unit_of_measurement: "°C" } }
      });
      const plain = hass.callWS.bind(hass);
      hass.callWS = async <T,>(message: Record<string, unknown>): Promise<T> => {
        const ids = message.entity_ids as string[] | undefined;
        if (message.type !== "history/history_during_period" || !ids?.includes(top)) return plain(message);
        // Thirteen readings, five minutes apart, falling at the given rate for an hour.
        const now = Date.now() / 1000;
        const rows = Array.from({ length: 13 }, (_, i) => ({ lu: now - (12 - i) * 300, s: String(48 + perHour * ((12 - i) / 12)) }));
        return { [top]: rows } as T;
      };
      return hass;
    };
    const draw = await mount({ ...FULL_CONFIG, flow: { store_head: "draw" } }, falling(2));
    const slow = await mount(FULL_CONFIG, falling(0.45));
    const label = (root: ShadowRoot) => {
      const g = [...root.querySelectorAll(".section svg g")].find((x) => x.textContent?.includes("Puffer")) as Element;
      return text(g);
    };
    // The floor is what the running circuit asks for, 30,6°: 47,5° mean over it at 0,45 K/h is
    // thirty-eight hours — a day or more, not a number — and at 2 K/h eight and a half.
    expect(label(slow.root)).toContain("≈ NOCH > 1 TAG");
    const fast = await mount(FULL_CONFIG, falling(2));
    expect(label(fast.root)).toContain("≈ NOCH 8 H 30");
    expect(fast.root.querySelector(".chip")?.textContent).toContain("noch 8 h 30");
    expect([...fast.root.querySelectorAll(".section svg title")].some((t) => t.textContent?.includes("hochgerechnet"))).toBe(true);
    // 300 litres falling 2 K/h is 0,70 kW, and it goes to the storey that takes it.
    expect(label(draw.root)).toContain("0,70 KW → EG");
    const word = await mount({ ...FULL_CONFIG, flow: { store_head: "word" } }, falling(2));
    expect(label(word.root)).toContain("ENTLÄDT");
    expect(label(word.root)).not.toContain("NOCH");
  });

  it("arranges a running circuit's box six ways, the room's target in none of them, and says since when", async () => {
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": {
        entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {}, last_changed: new Date(Date.now() - 3600000).toISOString()
      }
    });
    const box = async (running: "pair" | "quiet" | "headline" | "flow" | "stack" | "spread") => {
      const { root } = await mount({ ...FULL_CONFIG, flow: { running } }, hass);
      // The words on the box, not the tooltip: the tooltip carries everything, whichever view.
      const g = [...root.querySelectorAll(".section svg g")].find((x) => x.textContent?.includes("FBH EG")) as Element;
      return [...g.querySelectorAll("text")].map((t) => t.textContent?.trim()).filter(Boolean).join(" ");
    };
    const pair = await box("pair");
    expect(pair).toMatch(/HEIZT · \d\d:\d\d/);
    expect(pair).toContain("25,8° 30,6° VL-Soll");
    expect(pair).toContain("RL 24,7° · Δ 1,1 K");
    expect(pair).not.toContain("Soll 22,5°");
    const quiet = await box("quiet");
    expect(quiet).toContain("30,6°");
    expect(quiet).not.toContain("RL");
    expect(quiet).not.toContain("Δ");
    const headline = await box("headline");
    expect(headline).toContain("VL-SOLL 30,6°");
    expect(headline).toContain("24,7°");
    expect(headline).toContain("Δ 1,1 K");
    const flow = await box("flow");
    expect(flow).toContain("Raum");
    expect(flow).toContain("VL-Soll 30,6° −4,8 K");
    const stack = await box("stack");
    expect(stack).toContain("25,8° 30,6° VL-Soll 24,7°");
    // Flow on top, the spread under it, what the curve asked for at the bottom.
    const spread = await box("spread");
    expect(spread).toContain("25,8° Δ 1,1 K 30,6° VL-Soll");
    expect(spread).not.toContain("RL");
    // A controller writes 0 for a circuit it has switched off: that is no target, so the return stands in.
    const off = makeHass({
      "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} },
      "sensor.lambdawp_hc1_heating_curve_flow_line_temperature_calc": { entity_id: "sensor.lambdawp_hc1_heating_curve_flow_line_temperature_calc", state: "0.0", attributes: {} }
    });
    const { root } = await mount({ ...FULL_CONFIG, flow: { running: "quiet" } }, off);
    const g = [...root.querySelectorAll(".section svg g")].find((x) => x.textContent?.includes("FBH EG")) as Element;
    const words = [...g.querySelectorAll("text")].map((t) => t.textContent?.trim()).join(" ");
    expect(words).not.toContain("VL-Soll");
    expect(words).toContain("24,7°");
  });

  it("does not believe a circuit that says heating while its water sits at room temperature", async () => {
    const hass = makeHass({
      "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} },
      "sensor.lambdawp_hc1_flow_line_temperature": { entity_id: "sensor.lambdawp_hc1_flow_line_temperature", state: "22.9", attributes: { unit_of_measurement: "°C" } },
      "sensor.lambdawp_hc1_return_line_temperature": { entity_id: "sensor.lambdawp_hc1_return_line_temperature", state: "23.0", attributes: { unit_of_measurement: "°C" } }
    });
    const { root } = await mount(FULL_CONFIG, hass);
    // A pump against a closed mixer: the line from the buffer stands, because the pump
    // does draw on it, but the scale does not take 22,9° for empty — that is not a floor.
    expect([...root.querySelectorAll(".chip")].some((c) => c.textContent?.includes("Puffer →"))).toBe(true);
    const titles = [...root.querySelectorAll(".section svg title")].map((t) => t.textContent ?? "");
    expect(titles.find((t) => t.startsWith("Puffer"))).toContain("leer unter 30,0 °C");
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
    const drawn = [...(root.querySelector(".section svg") as Element).querySelectorAll("text")].map((t) => t.textContent).join(" ");
    expect(drawn).not.toContain("unten");
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
    // Today's modes and the stores' last hour; a week of the circuits only for "last heated",
    // and a week of modes plus the buffer's five-minute means once for what it learns.
    const quiet = await mount({ ...FULL_CONFIG, flow: { rest_note: "target" } });
    expect((quiet.hass as ReturnType<typeof makeHass>).calls.filter((c) => c === "history/history_during_period")).toHaveLength(3);
    const { root, hass } = await mount(FULL_CONFIG);
    const calls = (hass as ReturnType<typeof makeHass>).calls;
    expect(calls.filter((c) => c === "history/history_during_period")).toHaveLength(4);
    expect(calls.filter((c) => c === "recorder/statistics_during_period")).toHaveLength(1);
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
    // The ends are round numbers and come first; PV at 57,5 is a notch of its own below 60.
    expect(text(hotWater)).toContain("60°");
    expect(text(hotWater)).not.toContain("57,5°");
    expect(text(hotWater)).toContain("40°");
    expect(text(hotWater)).toContain("Eco");
  });

  it("spreads out once the card is wide: three across at 600 units, full-size boxes, the large circle", async () => {
    const { card, root } = await mount(FULL_CONFIG);
    (card as unknown as { _wide: boolean })._wide = true;
    await card.updateComplete;
    const svg = root.querySelector(".section svg") as SVGElement;
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 600 /);
    expect(svg.classList.contains("wide")).toBe(true);
    expect(boxX(root, "Warmwasser")).toBeLessThan(10);
    expect(boxX(root, "FBH EG")).toBeGreaterThan(380);
    const rect = [...root.querySelectorAll(".section svg rect")].find((r) => r.parentElement?.textContent?.includes("FBH EG"));
    expect(Number(rect?.getAttribute("width"))).toBe(196);
    // The large type: the room figure at 16.5, as in the columns.
    const eg = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("FBH EG")) as Element;
    expect([...eg.querySelectorAll("text")].some((t) => t.getAttribute("font-size") === "16.5")).toBe(true);
    // Never, when asked never.
    expect(resolveWide({ ...FULL_CONFIG, wide_from: 0 })).toBe(0);
    expect(resolveWide(FULL_CONFIG)).toBe(560);
  });

  it("takes a set-point or a limit from the entity that reports it as readily as from a number", async () => {
    const hass = makeHass({
      "sensor.lambdawp_boil1_target_high_temperature": { entity_id: "sensor.lambdawp_boil1_target_high_temperature", state: "48.5", attributes: {} },
      "sensor.lambdawp_buff1_maximum_buffer_temp": { entity_id: "sensor.lambdawp_buff1_maximum_buffer_temp", state: "55.0", attributes: {} }
    });
    const stores = (FULL_CONFIG.stores ?? []).map((s, i) =>
      i === 0
        ? { ...s, marks: { ...s.marks, target: "sensor.lambdawp_boil1_target_high_temperature" } }
        : { ...s, usable_max: "sensor.lambdawp_buff1_maximum_buffer_temp" }
    );
    const { root } = await mount({ ...FULL_CONFIG, stores }, hass);
    const titles = [...root.querySelectorAll(".section svg title")].map((t) => t.textContent ?? "");
    expect(titles.find((t) => t.startsWith("Puffer"))).toContain("voll ab 55,0 °C");
    const hotWater = [...root.querySelectorAll(".section svg g")].find((g) => g.textContent?.includes("Warmwasser")) as Element;
    expect(text(hotWater)).toContain("Soll");
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
