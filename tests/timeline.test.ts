import { describe, expect, it } from "vitest";
import { resolveModes } from "../src/modes";
import { buildDays, hourlyMeans, midnight, parseHistory, withLive } from "../src/timeline";
import { IDS, historyResponse, statisticsResponse } from "./fixtures";

const words = resolveModes(undefined);
const points = parseHistory(historyResponse(IDS.mode), IDS.mode);
const now = new Date(2026, 8, 15, 13, 40, 0);
const t = (day: number, h: number, m: number, s = 0) => new Date(2026, 8, day, h, m, s).getTime();

describe("the day band from the real Lambda history", () => {
  const [yesterday, today] = buildDays(points, words, now, 2, 120);

  it("splits yesterday and today at midnight", () => {
    expect(yesterday.start).toBe(t(14, 0, 0));
    expect(yesterday.end).toBe(t(15, 0, 0));
    expect(today.start).toBe(t(15, 0, 0));
    expect(today.end).toBe(now.getTime());
  });

  it("keeps hot water flowing straight into heating as two segments but one start", () => {
    expect(today.segments.map((s) => s.kind)).toEqual(["hot_water", "heating", "blocked", "heating", "blocked", "hot_water"]);
    // 08:04 hot water, 10:00 heating after the block, 13:00 hot water.
    expect(today.starts).toBe(3);
  });

  it("adds up the minutes per mode", () => {
    expect(Math.round(today.minutes.hot_water!)).toBe(119);
    expect(Math.round(today.minutes.heating!)).toBe(136);
  });

  it("flags yesterday's heating run of thirty seconds and nothing else", () => {
    expect(yesterday.shortRuns).toHaveLength(1);
    expect(yesterday.shortRuns[0].kind).toBe("heating");
    expect((yesterday.shortRuns[0].to - yesterday.shortRuns[0].from) / 1000).toBe(30);
    expect(today.shortRuns).toHaveLength(0);
    expect(yesterday.starts).toBe(4);
  });

  it("does not count a run already going at midnight as a start", () => {
    const night = [
      { state: "CH", at: t(14, 23, 0) },
      { state: "STBY", at: t(15, 1, 0) }
    ];
    const [, todayOnly] = buildDays(night, words, now, 2, 120);
    expect(todayOnly.segments[0]).toMatchObject({ kind: "heating", from: t(15, 0, 0), to: t(15, 1, 0) });
    expect(todayOnly.starts).toBe(0);
    expect(todayOnly.shortRuns).toHaveLength(0);
  });

  it("closes the gap to now with the live state", () => {
    const live = withLive(points, { state: "STBY", at: t(15, 13, 35) });
    const [, day] = buildDays(live, words, now, 2, 120);
    expect(day.segments.at(-1)).toMatchObject({ kind: "hot_water", to: t(15, 13, 35) });
    expect(withLive(points, { state: "DHW", at: t(15, 13, 30) })).toHaveLength(points.length);
  });

  it("lets a passing info message continue the run instead of stopping it", () => {
    const run = [
      { state: "STBY", at: t(15, 12, 20) },
      { state: "DHW", at: t(15, 13, 0, 13) },
      { state: "INFO-MESSAGE", at: t(15, 13, 38, 43) },
      { state: "DHW", at: t(15, 13, 38, 59) },
      { state: "STBY", at: t(15, 13, 39, 46) }
    ];
    const [, day] = buildDays(run, words, now, 2, 120);
    expect(day.segments).toHaveLength(1);
    expect(day.starts).toBe(1);
    expect(day.shortRuns).toHaveLength(0);
  });

  it("reads hourly PV means onto the hours of the day", () => {
    const means = hourlyMeans(statisticsResponse(IDS.solar), IDS.solar, midnight(now));
    expect(means[12]).toBe(8975);
    expect(means[13]).toBeUndefined();
  });
});
