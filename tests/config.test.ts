import { describe, expect, it } from "vitest";
import { assertConfig, editorData, getConfigForm, resolveConfig } from "../src/config";
import { FULL_CONFIG } from "./fixtures";

describe("configuration", () => {
  it("needs the operating state and nothing else", () => {
    expect(() => assertConfig({ type: "custom:heat-origin-card", entities: {} as never })).toThrow();
    expect(() => assertConfig({ type: "custom:heat-origin-card", entities: { mode: "sensor.x" } })).not.toThrow();
  });

  it("turns the storage section on only when there are stores", () => {
    expect(resolveConfig({ type: "t", entities: { mode: "sensor.x" } }).sections.stores).toBe(false);
    expect(resolveConfig(FULL_CONFIG).sections.stores).toBe(true);
  });

  it("recognises hot water by name and treats the rest as buffers", () => {
    const stores = resolveConfig(FULL_CONFIG).stores;
    expect(stores.map((s) => s.kind)).toEqual(["hot_water", "buffer"]);
  });

  it("honours a chosen order and appends the rest", () => {
    const order = resolveConfig({
      type: "t",
      entities: { mode: "sensor.x" },
      sections: { order: ["origin", "nonsense" as never] }
    }).sections.order;
    expect(order).toEqual(["origin", "flow", "day", "stores"]);
  });

  it("shows the editor the values the card uses, not blanks for what the YAML leaves out", () => {
    const data = editorData({ type: "t", entities: { mode: "sensor.x" }, stores: [{ name: "Warmwasser", top: "sensor.t" }] });
    expect(data.sections).toMatchObject({ flow: true, day: true, origin: true, stores: true });
    expect(data.font).toBe("system");
    expect(data.source).toBe("air");
    expect(data.shape).toBe("standard");
    expect(data.flow).toMatchObject({ spread: true, circuit_details: false });
    expect(data.day).toMatchObject({ days: 2, short_run: 120, cycling_from: 3 });
    // A section switched off stays off, and lists stay as written.
    const off = editorData({ type: "t", entities: { mode: "sensor.x" }, sections: { day: false }, flow: { extras: [{ entity: "sensor.y" }] } });
    expect(off.sections?.day).toBe(false);
    expect(off.flow?.extras).toEqual([{ entity: "sensor.y" }]);
    expect((off as Record<string, unknown>).modes).toBeUndefined();
  });

  it("labels the flow sensor and the flow section apart", () => {
    const form = getConfigForm("de");
    expect(form.computeLabel({ name: "flow", selector: { entity: {} } })).toBe("Vorlauf");
    expect(form.computeLabel({ name: "flow" })).toBe("Wärmefluss");
  });
});
