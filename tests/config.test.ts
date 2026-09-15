import { describe, expect, it } from "vitest";
import { assertConfig, getConfigForm, resolveConfig } from "../src/config";
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

  it("labels the flow sensor and the flow section apart", () => {
    const form = getConfigForm("de");
    expect(form.computeLabel({ name: "flow", selector: { entity: {} } })).toBe("Vorlauf");
    expect(form.computeLabel({ name: "flow" })).toBe("Wärmefluss");
  });
});
