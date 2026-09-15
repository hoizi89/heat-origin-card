import { classify, isIgnored, isRunning } from "./modes";
import type { ModeKind, ModeWords } from "./types";

export interface StatePoint {
  state: string;
  /** Epoch milliseconds. */
  at: number;
}

export interface Segment {
  kind: Exclude<ModeKind, "idle">;
  from: number;
  to: number;
}

export interface DayTimeline {
  start: number;
  /** The end of the day, or now for today. */
  end: number;
  segments: Segment[];
  starts: number;
  /** Minutes per kind. */
  minutes: Partial<Record<Segment["kind"], number>>;
  shortRuns: Array<{ from: number; to: number; kind: Segment["kind"] }>;
}

const DAY = 24 * 60 * 60 * 1000;

interface CompressedState {
  s: string;
  lc?: number;
  lu?: number;
}

/**
 * `history/history_during_period` with minimal_response answers in a compressed
 * form: `s` the state, `lc` last changed and `lu` last updated, both in epoch
 * seconds; `lc` is left out when it equals `lu`.
 */
export function parseHistory(response: unknown, entityId: string): StatePoint[] {
  const rows = (response as Record<string, CompressedState[] | undefined> | undefined)?.[entityId] ?? [];
  return rows
    .map((row) => ({ state: String(row.s), at: Math.round(((row.lc ?? row.lu) ?? 0) * 1000) }))
    .filter((p) => p.at > 0)
    .sort((a, b) => a.at - b.at);
}

export function midnight(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * The live state is newer than any history the card fetched a few minutes
 * ago; it closes the gap to now without another round trip.
 */
export function withLive(points: StatePoint[], live: StatePoint | undefined): StatePoint[] {
  if (!live) return points;
  const last = points.at(-1);
  if (last && live.at <= last.at) return points;
  if (last && last.state === live.state) return points;
  return [...points, live];
}

/** One day's segments, starts, time per kind and the runs too short to be healthy. */
export function buildDay(
  points: StatePoint[],
  words: Required<ModeWords>,
  start: number,
  end: number,
  shortRunSeconds: number
): DayTimeline {
  // The state in force at the start of the day is the last one before it.
  let carried: StatePoint | undefined;
  const inside: StatePoint[] = [];
  // A passing word continues whatever came before it.
  let lastReal: string | undefined;
  const real = points.map((p) => {
    if (isIgnored(p.state, words)) return { ...p, state: lastReal ?? p.state };
    lastReal = p.state;
    return p;
  });
  for (const p of real) {
    if (p.at <= start) carried = p;
    else if (p.at < end) inside.push(p);
  }
  const sequence = carried ? [{ state: carried.state, at: start }, ...inside] : inside;

  const raw: Array<{ kind: ModeKind; from: number; to: number }> = [];
  sequence.forEach((p, i) => {
    const to = i + 1 < sequence.length ? sequence[i + 1].at : end;
    if (to <= p.at) return;
    const kind = classify(p.state, words);
    const prev = raw.at(-1);
    if (prev && prev.kind === kind && prev.to === p.at) prev.to = to;
    else raw.push({ kind, from: p.at, to });
  });

  const segments = raw.filter((r): r is Segment => r.kind !== "idle");

  const minutes: DayTimeline["minutes"] = {};
  for (const s of segments) minutes[s.kind] = (minutes[s.kind] ?? 0) + (s.to - s.from) / 60000;

  // A start is running after not running. A run already going at midnight is not a start.
  let starts = 0;
  raw.forEach((r, i) => {
    if (!isRunning(r.kind)) return;
    const before = raw[i - 1];
    const touching = before && before.to === r.from;
    if (touching && isRunning(before.kind)) return;
    if (!before && carried && r.from === start) return;
    starts += 1;
  });

  // Runs are joined across mode changes: hot water straight into heating is one run.
  const shortRuns: DayTimeline["shortRuns"] = [];
  if (shortRunSeconds > 0) {
    let run: { from: number; to: number; kind: Segment["kind"] } | undefined;
    const close = () => {
      if (!run) return;
      const openAtEdge = run.from === start || run.to === end;
      if (!openAtEdge && run.to - run.from < shortRunSeconds * 1000) shortRuns.push(run);
      run = undefined;
    };
    for (const r of raw) {
      if (isRunning(r.kind)) {
        if (run && run.to === r.from) run.to = r.to;
        else {
          close();
          run = { from: r.from, to: r.to, kind: r.kind as Segment["kind"] };
        }
      } else close();
    }
    close();
  }

  return { start, end, segments, starts, minutes, shortRuns };
}

/** The last finished run, joined across mode changes, and what it mostly was. */
export function lastRun(day: DayTimeline | undefined): { from: number; to: number; kind: Segment["kind"] } | undefined {
  if (!day) return undefined;
  const running = day.segments.filter((s) => s.kind !== "blocked");
  const last = running.at(-1);
  if (!last) return undefined;
  let from = last.from;
  let longest = last;
  for (let i = running.length - 2; i >= 0; i -= 1) {
    if (running[i].to !== from) break;
    from = running[i].from;
    if (running[i].to - running[i].from > longest.to - longest.from) longest = running[i];
  }
  return { from, to: last.to, kind: longest.kind };
}

/** Yesterday and today, or today alone. */
export function buildDays(
  points: StatePoint[],
  words: Required<ModeWords>,
  now: Date,
  days: 1 | 2,
  shortRunSeconds: number
): DayTimeline[] {
  const today = midnight(now);
  const out: DayTimeline[] = [];
  if (days === 2) out.push(buildDay(points, words, today - DAY, today, shortRunSeconds));
  out.push(buildDay(points, words, today, now.getTime(), shortRunSeconds));
  return out;
}

/** Hourly means from `recorder/statistics_during_period`, in the unit the sensor reports. */
export function hourlyMeans(response: unknown, statisticId: string, dayStart: number, hours = 24): Array<number | undefined> {
  const rows = (response as Record<string, Array<{ start: number | string; mean?: number | null }> | undefined> | undefined)?.[statisticId] ?? [];
  const out: Array<number | undefined> = new Array(hours).fill(undefined);
  for (const row of rows) {
    const at = typeof row.start === "number" ? row.start : Date.parse(row.start);
    const index = Math.floor((at - dayStart) / 3600000);
    if (index >= 0 && index < hours && typeof row.mean === "number" && Number.isFinite(row.mean)) out[index] = row.mean;
  }
  return out;
}
