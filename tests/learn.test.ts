import { describe, expect, it } from "vitest";
import { chargedAt, heatingRuns, learnBuffer, valueAt, type Sample } from "../src/learn";
import { resolveModes } from "../src/modes";

const words = resolveModes(undefined);
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 8, 13, 0, 0).getTime();
const h = (hours: number) => T0 + hours * HOUR;
const p = (hours: number, state: string) => ({ state, at: h(hours) });

/** A buffer that charges to 55 °C and discharges the way this one does: bottom first, top hours later. */
function day(offset: number, top: Array<[number, number]>, bottom: Array<[number, number]>) {
  const series = (knots: Array<[number, number]>): Sample[] => {
    const out: Sample[] = [];
    for (let i = 0; i < knots.length - 1; i += 1) {
      const [h0, v0] = knots[i];
      const [h1, v1] = knots[i + 1];
      for (let t = h0; t < h1; t += 5 / 60) out.push({ at: h(offset + t), value: v0 + ((v1 - v0) * (t - h0)) / (h1 - h0) });
    }
    return out;
  };
  return { top: series(top), bottom: series(bottom) };
}

describe("what a buffer teaches about itself", () => {
  it("joins heating that hot water or a schedule block interrupted, but not heating after a real rest", () => {
    const runs = heatingRuns(
      [p(8, "CH"), p(8.05, "DHW"), p(9.3, "CH"), p(9.6, "TIME-BLOCK"), p(9.9, "CH"), p(11.3, "STBY"), p(30, "CH"), p(32, "STBY")],
      words,
      h(40)
    );
    expect(runs).toEqual([
      [h(8), h(11.3)],
      [h(30), h(32)]
    ]);
  });

  it("reads a mean only while it is recent", () => {
    const s = [{ at: h(1), value: 40 }];
    expect(valueAt(s, h(1) + 10 * MIN)).toBe(40);
    expect(valueAt(s, h(2))).toBeUndefined();
  });

  it("finds the last full charge before a start, and none across a charge in between", () => {
    const { top, bottom } = day(0, [[0, 30], [10, 30], [12, 55], [20, 54], [26, 50], [30, 30]], [[0, 26], [10, 26], [12, 54], [14, 53], [17, 50], [21, 45], [23, 29], [30, 28]]);
    const runs: Array<[number, number]> = [[h(10), h(12)]];
    const charged = chargedAt(top, bottom, runs, h(30), 31, h(0));
    expect(charged?.at).toBeGreaterThanOrEqual(h(12));
    // The latest moment the two still agree, which is some hours after the run: the bottom sensor follows slowly.
    expect(charged?.at).toBeLessThan(h(18));
    expect(charged!.mean).toBeGreaterThan(50);
    // Asked from inside the charge, there is nothing before it to find.
    expect(chargedAt(top, bottom, runs, h(11), 31, h(0))).toBeUndefined();
  });

  it("learns where the heat pump starts and how fast the house empties the buffer, and ignores a sunny top-up", () => {
    const top: Sample[] = [];
    const bottom: Sample[] = [];
    const modes = [];
    for (let d = 0; d < 4; d += 1) {
      const o = d * 24;
      const day1 = day(o, [[0, 50], [5, 33], [9, 31], [11, 55], [20, 54], [24, 50]], [[0, 28], [9, 26], [11, 54], [13, 53], [18, 45], [20, 28], [24, 28]]);
      top.push(...day1.top);
      bottom.push(...day1.bottom);
      // Heating from 09:00 to 11:00 each day; the start is at 31 °C with the curve at 28.
      modes.push(p(o + 9, "CH"), p(o + 11, "STBY"));
    }
    // A five-minute run in the afternoon sun with the buffer still at 50: no demand.
    modes.splice(3, 0, p(15, "CH"), p(15.08, "STBY"));
    const curves = [[{ at: h(0), value: 28 }, ...Array.from({ length: 96 * 12 }, (_, i) => ({ at: h(i / 12), value: 28 }))]];
    const learned = learnBuffer({ modes, words, top, bottom, curves, volume: 300, now: h(96) });
    expect(learned.starts).toBe(4);
    expect(learned.offset).toBeCloseTo(3, 0);
    expect(learned.start).toBeCloseTo(31, 0);
    // About 7.5 kWh over the 18 hours from the charge to the next start: ~0.4 kW.
    expect(learned.draw).toBeGreaterThan(0.3);
    expect(learned.draw).toBeLessThan(0.45);
  });

  it("says nothing on a single example", () => {
    const learned = learnBuffer({ modes: [p(9, "CH"), p(11, "STBY")], words, top: [{ at: h(8.9), value: 31 }], bottom: [], curves: [], volume: 300, now: h(12) });
    expect(learned.start).toBeUndefined();
    expect(learned.draw).toBeUndefined();
  });
});
