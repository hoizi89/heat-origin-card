import { describe, expect, it } from "vitest";
import { assertConfig, editorData, foldEditorData, getConfigForm, resolveConfig, stubConfig } from "../src/config";
import { FULL_CONFIG } from "./fixtures";

const bare = { type: "t", entities: { mode: "sensor.x" } };

describe("configuration", () => {
  it("needs the operating state and nothing else", () => {
    expect(() => assertConfig({ type: "custom:heat-origin-card", entities: {} as never })).toThrow();
    expect(() => assertConfig({ type: "custom:heat-origin-card", entities: { mode: "sensor.x" } })).not.toThrow();
  });

  it("reads a symbol and a storey out of every name", () => {
    const resolved = resolveConfig(FULL_CONFIG);
    expect(resolved.circuits.map((x) => x.icon)).toEqual(["floor", "radiator"]);
    expect(resolved.circuits.map((x) => x.short)).toEqual(["EG", "OG"]);
    expect(resolved.stores.map((x) => x.icon)).toEqual(["water", "buffer"]);
  });

  it("recognises hot water by name and treats the rest as buffers", () => {
    const stores = resolveConfig(FULL_CONFIG).stores;
    expect(stores.map((s) => s.kind)).toEqual(["hot_water", "buffer"]);
  });

  it("gives every choice a word, and a nonsense word falls back", () => {
    const flow = resolveConfig(bare).flow;
    expect(flow).toMatchObject({
      layout: "columns", labels: "short", circuit: "room", curve: false, gauge: "zones", scale: true, trend: "rate",
      ring: "sun", centre: "heat", foot: "full", balance: true, buffer_line: "range", rest_colour: true
    });
    expect(resolveConfig({ ...bare, flow: { gauge: "tank" as never, trend: "maybe" as never } }).flow).toMatchObject({ gauge: "zones", trend: "rate" });
  });

  it("still reads the switches earlier versions wrote, each as the word it meant", () => {
    const old = resolveConfig({
      ...bare,
      flow: { spread: false, sun: false, target: false, range: false, trend: false }
    }).flow;
    expect(old).toMatchObject({ foot: "no_spread", ring: "plain", circuit: "room_plain", buffer_line: "line", trend: "none" });
    // 1.0.0 wrote four of the switches as words for a fortnight.
    const words = resolveConfig({ ...bare, flow: { resting: "flow", idle_foot: "last", rest: "grey", scale: "hide", ring: "clock", dial: "plain" } }).flow;
    expect(words).toMatchObject({ curve: false, balance: false, rest_colour: false, scale: false, ring: "plain" });
    expect(resolveConfig({ ...bare, flow: { resting: "curve" } }).flow.curve).toBe(true);
    expect(resolveConfig({ ...bare, flow: { ring: "both" } }).flow.ring).toBe("sun");
    expect(resolveConfig({ ...bare, flow: { bypass: false } }).flow.buffer_line).toBe("none");
    expect(resolveConfig({ ...bare, flow: { origin: true } }).flow.buffer_line).toBe("range");
    expect(resolveConfig({ ...bare, flow: { buffer_line: "named" } }).flow.buffer_line).toBe("range");
    expect(resolveConfig({ ...bare, flow: { trend: true } }).flow.trend).toBe("rate");
    // 0.9 wrote the foot in full with the spread switched off beside it; that is a foot without the spread.
    expect(resolveConfig({ ...bare, flow: { foot: "full", spread: false } }).flow.foot).toBe("no_spread");
    // The sparing detail step once set three things at once.
    expect(resolveConfig({ ...bare, flow: { detail: "low" } }).flow).toMatchObject({ labels: "icon", scale: false, foot: "drive" });
    // The current key written beside an old one wins.
    expect(resolveConfig({ ...bare, flow: { sun: false, ring: "sun" } }).flow.ring).toBe("sun");
    expect(resolveConfig({ ...bare, flow: { resting: "flow", curve: true } }).flow.curve).toBe(true);
  });

  it("takes the layout at the card's root, where the editor writes it, and still under flow where 1.0 kept it", () => {
    expect(resolveConfig({ ...bare, layout: "split" }).flow.layout).toBe("split");
    expect(resolveConfig({ ...bare, flow: { layout: "split" } }).flow.layout).toBe("split");
    expect(resolveConfig({ ...bare, layout: "columns", flow: { layout: "split" } }).flow.layout).toBe("columns");
    const data = editorData({ ...bare, flow: { layout: "split" } });
    expect(data.layout).toBe("split");
    expect(data.flow).not.toHaveProperty("layout");
  });

  it("shows the editor every choice at the word the card uses, and drops what earlier versions wrote", () => {
    const data = editorData({
      ...bare,
      sections: { day: true },
      day: { days: 2 },
      flow: { sun: false, detail: "low", extras: [{ entity: "sensor.y" }] }
    } as never);
    // Every list and switch reads what is on the screen: the old switch became its word, the old dial its three keys.
    expect(data.flow).toMatchObject({ ring: "plain", labels: "icon", scale: false, foot: "drive", gauge: "zones", curve: false });
    expect(data.font).toBe("system");
    expect(data.shape).toBe("standard");
    // The switches and the sections that no longer exist do not come back to be written again.
    expect(data.flow).not.toHaveProperty("sun");
    expect(data.flow).not.toHaveProperty("detail");
    expect(data).not.toHaveProperty("sections");
    expect(data).not.toHaveProperty("day");
    // Lists stay as written, and an empty one is not invented.
    expect(data.flow?.extras).toEqual([{ entity: "sensor.y" }]);
    expect(editorData(bare).flow).not.toHaveProperty("extras");
    expect(data.modes).toBeUndefined();
  });

  it("offers three or more looks as a list, two as a switch, and says when each one shows", () => {
    const form = getConfigForm("de");
    const flat = JSON.stringify(form.schema);
    expect(flat.match(/"boolean"/g)).toHaveLength(4);
    expect(form.computeLabel({ name: "ring" })).toBe("Um den Kreis");
    expect(form.computeHelper({ name: "curve" })).toContain("curve_flow");
    expect(form.computeHelper({ name: "buffer_line" })).toContain("steht");
    expect(form.computeHelper({ name: "scale" })).toContain("usable_min");
    expect(form.computeHelper({ name: "labels" })).toBeUndefined();
    // Every word of every list has its own label.
    for (const m of flat.matchAll(/"label":"(editor\.[^"]+)"/g)) throw new Error(`no text for ${m[1]}`);
  });

  it("gives every store and circuit a group of its own, and folds them back into their lists", () => {
    const data = editorData(FULL_CONFIG);
    expect(data.store_0).toMatchObject({ name: "Warmwasser", volume: 300 });
    expect(data.circuit_1).toMatchObject({ name: "Heizkörper OG" });
    expect(data).not.toHaveProperty("stores");
    expect(data).not.toHaveProperty("circuits");
    // A field cleared in the form is dropped, not written as an empty string.
    const back = foldEditorData({ ...data, store_1: { ...(data.store_1 as object), bottom: "", marks: { eco: undefined } } });
    expect(back.stores?.[1]).toEqual({ name: "Puffer", top: "sensor.lambdawp_buff1_actual_high_temperature", volume: 300 });
    expect(back.stores?.[0]).toMatchObject({ marks: { eco: 44.5, target: 48.5, pv: 57.5 } });
    expect(back.circuits).toHaveLength(2);
    expect(back).not.toHaveProperty("store_0");
    // One empty slot after each list: nothing until somebody writes in it, then the next entry.
    expect(data.circuit_2).toEqual({});
    expect(data.store_2).toEqual({});
    const grown = foldEditorData({ ...data, circuit_2: { name: "Bad", state: "sensor.hc3", icon: "" } });
    expect(grown.circuits).toHaveLength(3);
    expect(grown.circuits?.[2]).toEqual({ name: "Bad", state: "sensor.hc3" });
    expect(grown.stores).toHaveLength(2);
    const form = getConfigForm("de", FULL_CONFIG);
    const flat = JSON.stringify(form.schema);
    expect(flat).toContain('"title":"Speicher 1 · Warmwasser"');
    expect(flat).toContain('"title":"Heizkreis hinzufügen"');
    expect(flat).toContain('"title":"Speicher hinzufügen"');
    expect(form.computeLabel({ name: "eco" })).toBe("Eco");
    expect(form.computeLabel({ name: "volume" })).toBe("Volumen");
  });

  it("guesses the heat pump's own state, not the ambient one that carries the same word", () => {
    const states = {
      "sensor.lambdawp_ambient_operating_state": {},
      "sensor.lambdawp_hc1_operating_state": {},
      "sensor.lambdawp_hp1_operating_state": {},
      "sensor.lambdawp_hp1_actual_heating_capacity": {}
    };
    expect(stubConfig(states).entities.mode).toBe("sensor.lambdawp_hp1_operating_state");
    const { "sensor.lambdawp_hp1_operating_state": _gone, ...without } = states;
    expect(stubConfig(without).entities.mode).not.toContain("ambient");
  });
});
