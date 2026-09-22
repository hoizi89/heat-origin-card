import { classify, isIgnored } from "./modes";
import type { StatePoint } from "./timeline";
import type { ModeKind, ModeWords } from "./types";

/** A five-minute mean from the recorder's statistics. */
export interface Sample {
  at: number;
  value: number;
}

/** What the card has learned about a buffer from the last days of its own history. */
export interface BufferLearning {
  /** Kelvin above the heating curve's flow target at which the heat pump starts again. */
  offset?: number;
  /** The same as a plain temperature, for circuits that report no flow target. */
  start?: number;
  /** What the house takes from the buffer while it carries the circuits alone, in kW. */
  draw?: number;
  /** The discharge `draw` was measured over, and how cold it was outside meanwhile. */
  drawFrom?: number;
  drawTo?: number;
  drawOutdoor?: number;
  /** How many starts and discharges the two figures rest on. */
  starts: number;
  discharges: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Heating resumed within this after a stop is the same run: a schedule block, not a new demand. */
const SAME_RUN = 30 * MINUTE;
/** A start this far above the flow target is the buffer being topped up with sun, not the house asking. */
const DEMAND_SPAN = 10;
/** Top and bottom this close together: the buffer is charged all the way through. */
const THROUGH = 4;
/** Shorter than this a run is a top-up, not a charge. */
const LONG_RUN = 10 * MINUTE;
/** What a house is held at. Its heat loss runs with the gap between this and the air outside. */
const INDOOR = 20;
/** Air this far below indoors is needed before a comparison of two nights says anything. */
const WEATHER_SPAN = 2;
/** How much air to average on either side of the comparison, so one warm hour cannot swing it. */
const WEATHER_WINDOW = 2 * HOUR;
/** The furthest the weather may stretch or shrink the learned draw. */
const WEATHER_LIMIT = [0.6, 1.8] as const;

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The mean of every sample inside a window, or nothing if the window holds none. */
export function meanBetween(samples: Sample[], from: number, to: number): number | undefined {
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (s.at < from) continue;
    if (s.at > to) break;
    sum += s.value;
    count += 1;
  }
  return count ? sum / count : undefined;
}

/** The mean in force at a moment: the last bucket that began before it, if recent enough to trust. */
export function valueAt(samples: Sample[], at: number, stale = 20 * MINUTE): number | undefined {
  let found: Sample | undefined;
  for (const s of samples) {
    if (s.at > at) break;
    found = s;
  }
  return found && at - found.at <= stale ? found.value : undefined;
}

/** A run of one kind, and what ended it: standing idle, or another run taking over. `open` while it still goes on. */
export interface Run {
  from: number;
  to: number;
  endedBy: ModeKind | "open";
}

/**
 * The heat pump's runs of one kind. Hot water takes priority and a schedule blocks for
 * a while; the same kind following either without the heat pump ever standing idle is
 * the same demand carrying on, so the two pieces are one run.
 */
export function runsOf(points: StatePoint[], words: Required<ModeWords>, now: number, kind: ModeKind): Run[] {
  const runs: Run[] = [];
  let from: number | undefined;
  let idleSince = true;
  for (const p of points) {
    if (isIgnored(p.state, words)) continue;
    const k = classify(p.state, words);
    if (k === kind && from === undefined) {
      const last = runs.at(-1);
      if (last && (!idleSince || p.at - last.to < SAME_RUN)) from = runs.pop()!.from;
      else from = p.at;
    }
    if (k !== kind && from !== undefined) {
      runs.push({ from, to: p.at, endedBy: k });
      from = undefined;
      idleSince = false;
    }
    if (k === "idle") idleSince = true;
  }
  if (from !== undefined) runs.push({ from, to: now, endedBy: "open" });
  return runs;
}

/** The heat pump's heating runs, as [from, to]. */
export function heatingRuns(points: StatePoint[], words: Required<ModeWords>, now: number): Array<[number, number]> {
  return runsOf(points, words, now, "heating").map((r) => [r.from, r.to]);
}

export type MarkKey = "eco" | "target" | "pv" | "max";

/** The temperatures a store has been charged to lately, each with the name it goes by. */
export interface LearnedMarks {
  marks: Partial<Record<MarkKey, number>>;
  /** How many finished charges they rest on. */
  charges: number;
}

/** Peaks this close together are the same set-point, give or take the overshoot. */
const SAME_MARK = 1.5;

/**
 * Where a store's charges have been ending. A charge the heat pump finished on its own —
 * standing idle afterwards — ends at a set-point, a little over it; one that heating took
 * over, or a block cut short, ends wherever it was. The finished ones fall into a few
 * groups, and each group seen twice is a set-point.
 *
 * A group is dropped once a lower one has been reached twice since it was last seen:
 * the setting was changed, and the old top must not hold the scale up for a week.
 *
 * Names come from the store's own target where it has one — below it is Eco, above it
 * PV — and otherwise the highest is its maximum.
 */
export function learnMarks(input: {
  modes: StatePoint[];
  words: Required<ModeWords>;
  kind: "hot_water" | "heating";
  top: Sample[];
  target: number | undefined;
  now: number;
}): LearnedMarks {
  const { modes, words, kind, top, target, now } = input;
  const peaks: Array<{ value: number; at: number }> = [];
  for (const run of runsOf(modes, words, now, kind)) {
    if (run.endedBy !== "idle" || run.to - run.from < LONG_RUN) continue;
    // The sensor lags the stop by a few minutes; the highest mean around it is the charge's top.
    const around = top.filter((s) => s.at >= run.to - 10 * MINUTE && s.at <= run.to + 20 * MINUTE).map((s) => s.value);
    if (around.length) peaks.push({ value: Math.max(...around), at: run.to });
  }
  const groups: Array<Array<{ value: number; at: number }>> = [];
  for (const peak of [...peaks].sort((a, b) => a.value - b.value)) {
    const group = groups.at(-1);
    if (group && peak.value - group[0].value <= SAME_MARK) group.push(peak);
    else groups.push([peak]);
  }
  const seen = groups.filter((g) => g.length >= 2);
  const newest = (g: typeof peaks) => Math.max(...g.map((p) => p.at));
  const standing = seen.filter((g, i) => !seen.slice(0, i).some((lower) => lower.filter((p) => p.at > newest(g)).length >= 2));
  const values = standing.map((g) => median(g.map((p) => p.value)) as number);

  const marks: Partial<Record<MarkKey, number>> = {};
  values.forEach((value, i) => {
    const key: MarkKey =
      target !== undefined
        ? Math.abs(value - target) <= SAME_MARK
          ? "target"
          : value < target
            ? "eco"
            : "pv"
        : i === values.length - 1
          ? "max"
          : i === 0
            ? "eco"
            : "target";
    // Two groups under one name: the one nearer the target keeps it.
    if (marks[key] === undefined || (target !== undefined && Math.abs(value - target) < Math.abs((marks[key] as number) - target))) marks[key] = value;
  });
  return { marks, charges: peaks.length };
}

/** The warmest flow target any circuit had at a moment; a controller writes 0 for a circuit it has switched off. */
export function curveAt(curves: Sample[][], at: number): number | undefined {
  const values = curves.map((c) => valueAt(c, at)).filter((v): v is number => v !== undefined && v > 5);
  return values.length ? Math.max(...values) : undefined;
}

/**
 * The latest moment before `before` at which the buffer stood charged through, top and
 * bottom together and well above where the heat pump starts, outside any run. From
 * there to the next start is one whole discharge, however the two sensors fell on the
 * way: in a layered buffer the bottom one drops first and the top one hours later, so
 * the fall of either says nothing about how long is left. The whole stretch does.
 */
export function chargedAt(
  top: Sample[],
  bottom: Sample[],
  runs: Array<[number, number]>,
  before: number,
  above: number,
  since: number
): { at: number; mean: number } | undefined {
  for (let i = top.length - 1; i >= 0; i -= 1) {
    const s = top[i];
    if (s.at >= before) continue;
    if (s.at < since) break;
    // A long run in between charged the buffer again; the discharge starts after it.
    if (runs.some(([from, to]) => s.at >= from && s.at < to)) return undefined;
    const low = valueAt(bottom, s.at);
    if (low === undefined) continue;
    if (Math.abs(s.value - low) < THROUGH && s.value > above + 5) return { at: s.at, mean: (s.value + low) / 2 };
  }
  return undefined;
}

/**
 * What the last days teach about one buffer. Two things, each from what the heat pump
 * actually did rather than from its settings, which the card cannot read and which an
 * installer may change:
 *
 * - where it starts again: the buffer's top temperature at each start that answered the
 *   house, taken against the heating curve's flow target at that moment, since that is
 *   what the threshold follows;
 * - how fast the house empties it: the heat stored at the last full charge, down to the
 *   temperature the next start came at, divided by the hours in between.
 */
export function learnBuffer(input: {
  modes: StatePoint[];
  words: Required<ModeWords>;
  top: Sample[];
  bottom: Sample[];
  curves: Sample[][];
  outdoor?: Sample[];
  volume: number | undefined;
  now: number;
}): BufferLearning {
  const { modes, words, top, bottom, curves, outdoor = [], volume, now } = input;
  const runs = heatingRuns(modes, words, now);
  // A run of a few minutes on a sunny afternoon hardly charges anything; only real charges end a discharge.
  const charges = runs.filter(([from, to]) => to - from > LONG_RUN);
  const offsets: number[] = [];
  const temps: number[] = [];
  const draws: Array<{ kw: number; from: number; to: number; air?: number }> = [];
  for (const [from] of runs) {
    // The five-minute bucket before the start, not the one the start already warms.
    const at = from - 5 * MINUTE;
    const t = valueAt(top, at);
    const curve = curveAt(curves, at);
    if (t === undefined || t - (curve ?? 30) >= DEMAND_SPAN) continue;
    if (curve !== undefined) offsets.push(t - curve);
    temps.push(t);
    if (!volume) continue;
    const charged = chargedAt(top, bottom, charges, from, t, from - 36 * HOUR);
    if (!charged) continue;
    const hours = (from - charged.at) / HOUR;
    const kwh = (volume * 1.163 * (charged.mean - t)) / 1000;
    if (hours >= 1 && kwh >= 0.5) draws.push({ kw: kwh / hours, from: charged.at, to: from, air: meanBetween(outdoor, charged.at, from) });
  }
  const last = draws.at(-1);
  const offset = median(offsets.slice(-7));
  return {
    offset: offsets.length >= 2 ? offset : undefined,
    start: temps.length >= 2 ? median(temps.slice(-7)) : undefined,
    // The last night, not a median of the week: in autumn every night takes more than
    // the one before (0.29, 0.61, 0.74 kW over three September nights), and a median
    // lags the season by days. Two nights are still needed before anything is said.
    draw: draws.length >= 2 ? last?.kw : undefined,
    drawFrom: last?.from,
    drawTo: last?.to,
    drawOutdoor: last?.air,
    starts: temps.length,
    discharges: draws.length
  };
}

/**
 * How much more the house will take tonight than it took in the night that was learned.
 *
 * A house loses heat roughly with the gap between the rooms and the air outside, and in
 * autumn every night is colder than the one before: the draw measured last night was
 * right last night and is already too small today. What the coming night will bring is
 * not known, but how it has started is — so the air of the last hours is compared with
 * the air at the same hour of the learned discharge, and the whole night is taken to be
 * that much colder or milder.
 *
 * One, when the two cannot be compared: the figure then stands as it was learned.
 */
export function weatherFactor(input: { learning: BufferLearning; outdoor: Sample[]; now: number }): number {
  const { learning, outdoor, now } = input;
  const { drawFrom, drawTo, drawOutdoor } = learning;
  if (drawFrom === undefined || drawTo === undefined || drawOutdoor === undefined) return 1;
  if (INDOOR - drawOutdoor < WEATHER_SPAN) return 1;
  const nowAir = meanBetween(outdoor, now - WEATHER_WINDOW, now);
  if (nowAir === undefined) return 1;
  // The same hour of the day, within the learned discharge. Whole days back, so an hour
  // lost or gained at a daylight-saving switch is the worst this can be out by.
  let at = now;
  while (at > drawTo) at -= 24 * HOUR;
  if (at - WEATHER_WINDOW < drawFrom) return 1;
  const thenAir = meanBetween(outdoor, at - WEATHER_WINDOW, at);
  if (thenAir === undefined) return 1;
  const expected = drawOutdoor + (nowAir - thenAir);
  const factor = (INDOOR - expected) / (INDOOR - drawOutdoor);
  if (!Number.isFinite(factor)) return 1;
  return Math.min(WEATHER_LIMIT[1], Math.max(WEATHER_LIMIT[0], factor));
}
