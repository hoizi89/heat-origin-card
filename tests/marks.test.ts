import { describe, expect, it } from "vitest";
import { learnMarks, runsOf, type Sample } from "../src/learn";
import { resolveModes } from "../src/modes";

const words = resolveModes(undefined);
const HOUR = 3600_000;
const T0 = new Date(2026, 8, 10, 0, 0).getTime();
const h = (hours: number) => T0 + hours * HOUR;

/** A charge from `from` to `to` hours, peaking at `peak` just after it stops, then the heat pump standing or taken over. */
function charges(list: Array<{ from: number; to: number; peak: number; then?: string }>, kind = "DHW") {
  const modes: Array<{ state: string; at: number }> = [];
  const top: Sample[] = [];
  for (const c of list) {
    modes.push({ state: kind, at: h(c.from) }, { state: c.then ?? "STBY", at: h(c.to) });
    if (c.then && c.then !== "STBY") modes.push({ state: "STBY", at: h(c.to + 1) });
    top.push({ at: h(c.to) + 5 * 60_000, value: c.peak - 0.3 }, { at: h(c.to) + 10 * 60_000, value: c.peak });
  }
  return { modes, top: top.sort((a, b) => a.at - b.at) };
}

describe("where a store's charges end", () => {
  it("knows what ended a run", () => {
    const runs = runsOf(
      [
        { state: "DHW", at: h(1) },
        { state: "CH", at: h(2) },
        { state: "STBY", at: h(3) },
        { state: "DHW", at: h(5) },
        { state: "STBY", at: h(6) }
      ],
      words,
      h(10),
      "hot_water"
    );
    expect(runs.map((r) => r.endedBy)).toEqual(["heating", "idle"]);
  });

  it("finds Eco and PV around the target from the charges the heat pump finished itself", () => {
    const { modes, top } = charges([
      { from: 5, to: 6, peak: 45.0 },
      { from: 13, to: 14, peak: 57.9 },
      { from: 29, to: 30, peak: 44.9 },
      { from: 37, to: 38, peak: 57.8 },
      // Heating took over: this one ended wherever it was.
      { from: 50, to: 51, peak: 54.1, then: "CH" },
      { from: 74, to: 75, peak: 54.0, then: "CH" }
    ]);
    const learned = learnMarks({ modes, words, kind: "hot_water", top, target: 48.5, now: h(100) });
    expect(learned.marks.eco).toBeCloseTo(44.95, 1);
    expect(learned.marks.pv).toBeCloseTo(57.85, 1);
    expect(learned.marks.target).toBeUndefined();
  });

  it("forgets a top that a new, lower setting has replaced, and names the highest a maximum without a target", () => {
    const { modes, top } = charges(
      [
        { from: 10, to: 12, peak: 55.7 },
        { from: 34, to: 36, peak: 55.6 },
        { from: 58, to: 60, peak: 50.8 },
        { from: 82, to: 84, peak: 50.1 }
      ],
      "CH"
    );
    const learned = learnMarks({ modes, words, kind: "heating", top, target: undefined, now: h(100) });
    expect(learned.marks.max).toBeCloseTo(50.45, 1);
    expect(Object.keys(learned.marks)).toEqual(["max"]);
  });

  it("takes nothing from a single charge", () => {
    const { modes, top } = charges([{ from: 5, to: 6, peak: 45 }]);
    expect(learnMarks({ modes, words, kind: "hot_water", top, target: 48.5, now: h(10) }).marks).toEqual({});
  });
});
