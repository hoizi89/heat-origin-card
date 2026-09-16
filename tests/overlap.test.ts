// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { textWidth } from "../src/flow-draw";
import type { HeatOriginCardConfig, HomeAssistant } from "../src/types";
import { FULL_CONFIG, IDS, makeHass } from "./fixtures";

/**
 * No two words on top of each other, in any state the card can be in. Text widths are
 * measured the way the drawing measures them, a twentieth wider, so this guards the
 * drawing's own arithmetic with a margin for a font that runs wide.
 */

type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: HeatOriginCardConfig): void; updateComplete: Promise<boolean> };

beforeAll(async () => {
  await import("../src/heat-origin-card");
});

async function mount(config: HeatOriginCardConfig, hass: HomeAssistant = makeHass(), wide = false) {
  const card = document.createElement(CARD_TYPE) as Card;
  card.setConfig(config);
  card.hass = hass;
  (card as unknown as { _wide: boolean })._wide = wide;
  document.body.append(card);
  for (let i = 0; i < 3; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await card.updateComplete;
  }
  return card.shadowRoot as ShadowRoot;
}

interface Word { text: string; x0: number; x1: number; y: number; size: number }

function words(root: ShadowRoot): Word[] {
  const out: Word[] = [];
  for (const el of root.querySelectorAll(".section svg text")) {
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const x = Number(el.getAttribute("x"));
    const y = Number(el.getAttribute("y"));
    const size = Number(el.getAttribute("font-size") ?? 11);
    const spacing = el.getAttribute("letter-spacing") ? 0.08 * size * text.length : 0;
    const w = textWidth(text, size) * 1.05 + spacing;
    const anchor = el.getAttribute("text-anchor") ?? "start";
    const x0 = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    out.push({ text, x0, x1: x0 + w, y, size });
  }
  return out;
}

function collisions(ws: Word[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < ws.length; i += 1) {
    for (let k = i + 1; k < ws.length; k += 1) {
      const a = ws[i], b = ws[k];
      const sameLine = Math.abs(a.y - b.y) < Math.min(a.size, b.size) * 0.8;
      if (sameLine && a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1) hits.push(`"${a.text}" × "${b.text}" at y ${a.y}`);
    }
  }
  return hits;
}

const running = () => makeHass();
const idle = () => makeHass({ [IDS.mode]: { entity_id: IDS.mode, state: "STBY", attributes: {}, last_changed: new Date(2026, 8, 15, 13, 39, 46).toISOString() } });
const carrying = () =>
  makeHass({
    [IDS.mode]: { entity_id: IDS.mode, state: "STBY", attributes: {}, last_changed: new Date(2026, 8, 15, 13, 39, 46).toISOString() },
    "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} }
  });
const heating = () =>
  makeHass({
    [IDS.mode]: { entity_id: IDS.mode, state: "CH", attributes: {} },
    "sensor.lambdawp_hc1_operating_state": { entity_id: "sensor.lambdawp_hc1_operating_state", state: "HEATING", attributes: {} },
    "sensor.lambdawp_hc2_operating_state": { entity_id: "sensor.lambdawp_hc2_operating_state", state: "HEATING", attributes: {} }
  });

const states: Array<[string, () => HomeAssistant]> = [["running", running], ["idle", idle], ["buffer carrying", carrying], ["heating both", heating]];
const looks: Array<[string, Partial<HeatOriginCardConfig>]> = [
  ["default", {}],
  ["thermometer, curve, names", { flow: { gauge: "scale", curve: true, labels: "name" } }],
  ["bar, box", { flow: { gauge: "bar" } }],
  ["split", { layout: "split" }],
  ["split thermometer", { layout: "split", flow: { gauge: "scale", curve: true } }],
  ["wide", { wide_from: 1 }],
  ["wide thermometer, curve", { wide_from: 1, flow: { gauge: "scale", curve: true } }]
];

describe("nothing is written over anything else", () => {
  for (const [state, hass] of states) {
    for (const [look, extra] of looks) {
      it(`${state}, ${look}`, async () => {
        const root = await mount({ ...FULL_CONFIG, ...extra, flow: { ...FULL_CONFIG.flow, ...(extra.flow ?? {}) } }, hass(), extra.wide_from === 1);
        const ws = words(root);
        expect(ws.length).toBeGreaterThan(10);
        expect(collisions(ws)).toEqual([]);
      });
    }
  }
});
