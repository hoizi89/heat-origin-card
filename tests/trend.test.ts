import { describe, expect, it } from "vitest";
import { coarseSpan, hoursLeft, parseTrend, slopePerHour } from "../src/trend";

const at = (minutesAgo: number, value: number) => ({ at: Date.now() - minutesAgo * 60000, value });

describe("how fast a store is cooling", () => {
  it("reads the fall per hour off a straight line through the readings", () => {
    const fall = slopePerHour([at(20, 30.0), at(15, 29.7), at(10, 29.4), at(5, 29.1), at(0, 28.8)]);
    expect(fall).toBeCloseTo(3.6, 1);
  });

  it("is not thrown by one reading out of line", () => {
    const clean = slopePerHour([at(20, 30.0), at(15, 29.5), at(10, 29.0), at(5, 28.5), at(0, 28.0)]);
    const noisy = slopePerHour([at(20, 30.0), at(15, 29.5), at(10, 31.2), at(5, 28.5), at(0, 28.0)]);
    expect(noisy).toBeDefined();
    expect(Math.abs((noisy as number) - (clean as number))).toBeLessThan(0.6);
  });

  it("says nothing when there is too little history to say anything", () => {
    expect(slopePerHour([])).toBeUndefined();
    expect(slopePerHour([at(5, 30), at(0, 29)])).toBeUndefined();
    // Ten minutes of readings is a mood, not a trend.
    expect(slopePerHour([at(10, 30), at(6, 29.9), at(2, 29.8)])).toBeUndefined();
  });

  it("counts a warming store as no fall at all", () => {
    const rising = slopePerHour([at(20, 28), at(15, 28.8), at(10, 29.6), at(5, 30.4), at(0, 31.2)]);
    expect(rising).toBeLessThan(0);
  });
});

describe("how long a store lasts", () => {
  it("divides what is left by how fast it goes", () => {
    expect(hoursLeft(30, 26.4, 1.8, 0.4)).toBeCloseTo(2, 5);
  });

  it("would rather say nothing than invent a number", () => {
    expect(hoursLeft(30, 26.4, 0.2, 0.4)).toBeUndefined();
    expect(hoursLeft(30, 26.4, undefined, 0.4)).toBeUndefined();
  });

  it("is already out when the store is at or below the floor", () => {
    expect(hoursLeft(26, 26.4, 2, 0.4)).toBe(0);
  });

  it("rounds coarsely, because the tenth of a minute is fiction", () => {
    expect(coarseSpan(0.5)).toEqual({ minutes: 30 });
    expect(coarseSpan(0.56)).toEqual({ minutes: 30 });
    expect(coarseSpan(1.85)).toEqual({ hours: 1, minutes: 50 });
    expect(coarseSpan(2.0)).toEqual({ hours: 2, minutes: 0 });
    // Never zero minutes while anything is left.
    expect(coarseSpan(0.02)).toEqual({ minutes: 5 });
  });
});

describe("reading the recorder", () => {
  const since = Date.UTC(2026, 8, 16, 10, 0, 0);
  const rows = {
    "sensor.buffer": [
      { lu: since / 1000 - 600, s: "31.0" },
      { lu: since / 1000 + 300, s: "30.4" },
      { lu: since / 1000 + 900, s: "unavailable" },
      { lu: since / 1000 + 1200, s: "29.8" }
    ]
  };

  it("keeps the readable points inside the window, in order", () => {
    const points = parseTrend(rows, "sensor.buffer", since);
    expect(points.map((p) => p.value)).toEqual([30.4, 29.8]);
  });

  it("shrugs at an answer it does not recognise", () => {
    expect(parseTrend(undefined, "sensor.buffer", since)).toEqual([]);
    expect(parseTrend({ other: [] }, "sensor.buffer", since)).toEqual([]);
  });
});
