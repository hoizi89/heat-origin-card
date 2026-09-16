// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "lit";
import { W, bypass, connector, dial } from "../src/flow-draw";

/** The path data of whatever the piece drew, so a shape can be checked as a shape. */
function paths(part: unknown): string[] {
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  render(part as never, host);
  return [...host.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "");
}

function points(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

const PUMP = { cx: W / 2, cy: 70, ring: 37 };

describe("the line from the heat pump to a box", () => {
  it("never folds into a bracket, however short the way", () => {
    // Past half the span the two control points swap sides and the curve doubles back.
    const d = paths(connector(PUMP.cx - 41, PUMP.cy, 117, 20, -1, {
      tone: "red", fed: false, dashed: false, dim: false, track: "grey", surface: "white"
    }))[0];
    const [start, c1, c2, end] = points(d);
    expect(start[0]).toBeGreaterThan(end[0]);
    expect(c1[0]).toBeGreaterThanOrEqual(c2[0]);
  });
});

describe("the line from a discharging buffer", () => {
  const circle = (x: number, y: number) => Math.hypot(x - PUMP.cx, y - PUMP.cy);

  it("runs straight when store and circuit stand at the same height under the heat pump", () => {
    const d = paths(bypass(117, 130, 251, [130], { ...PUMP, tone: "orange", surface: "white" }))[0];
    expect(d).toBe("M117 130 H242");
  });

  it("goes round the heat pump when it has to, and never touches it", () => {
    const d = paths(bypass(117, 130, 251, [30], { ...PUMP, tone: "orange", surface: "white" }))[0];
    expect(d).not.toBe("M117 130 H242");
    for (const [x, y] of points(d)) {
      // Every corner of the route keeps clear of the ring and the sun outside it.
      expect(circle(x, y)).toBeGreaterThan(PUMP.ring + 8);
    }
  });

  it("becomes a manifold with a spur each when the buffer carries two circuits", () => {
    const drawn = paths(bypass(117, 130, 251, [30, 130], { ...PUMP, tone: "orange", surface: "white" }));
    const spurs = (drawn[0].match(/ M/g) ?? []).length;
    expect(spurs).toBe(2);
    // One arrowhead per circuit, so both ends say which way the heat goes.
    expect(drawn.filter((d) => /^M\d+(\.\d+)? [\d.]+ L/.test(d)).length).toBeGreaterThanOrEqual(2);
  });

  it("carries the remaining time on the flow itself, not beside it", () => {
    const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    render(bypass(117, 130, 251, [130], { ...PUMP, tone: "orange", surface: "white", label: "noch 30 min", hint: "gemessen" }) as never, host);
    expect(host.querySelector("text")?.textContent).toBe("noch 30 min");
    expect(host.querySelector("title")?.textContent).toBe("gemessen");
    // The badge sits on the straight run, at its middle.
    expect(Number(host.querySelector("rect")?.getAttribute("y"))).toBe(122);
  });
});

describe("the day around the heat pump", () => {
  const tone = { ink: "black", muted: "grey", hairline: "silver", track: "whitesmoke", surface: "white", sun: "gold" };

  it("puts midnight at the bottom and noon at the top, the way the sun goes", () => {
    const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    render(dial(100, 100, 40, { segments: [], now: 12, sun: [6, 18], tone }) as never, host);
    const hand = host.querySelector("line[stroke='black']") as SVGLineElement;
    // At noon the hand stands straight up.
    expect(Number(hand.getAttribute("x1"))).toBeCloseTo(100, 1);
    expect(Number(hand.getAttribute("y1"))).toBeLessThan(100);
  });

  it("breaks the daylight arc at noon so the sun stands in the gap", () => {
    const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    render(dial(100, 100, 40, { segments: [], sun: [6, 18], tone }) as never, host);
    const arcs = [...host.querySelectorAll("path[stroke='gold']")];
    expect(arcs).toHaveLength(2);
  });
});
