/**
 * How fast a store is cooling, read off the recorder rather than guessed. The naive
 * way to say how long a buffer still carries the house is draw-off power from flow
 * times spread — but the flow a heat pump reports is the flow through its own pump,
 * and that pump is standing still in exactly the moment the question arises. What the
 * store itself does needs no sensor nobody has.
 */

export interface TrendPoint {
  at: number;
  value: number;
}

/** Kelvin per hour, positive while the store is cooling. A straight line through the
 *  points, so a single wobbling reading cannot decide the answer on its own. */
export function slopePerHour(points: TrendPoint[]): number | undefined {
  if (points.length < 3) return undefined;
  const t0 = points[0].at;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const x = (p.at - t0) / 3600000;
    sx += x;
    sy += p.value;
    sxx += x * x;
    sxy += x * p.value;
  }
  const n = points.length;
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return undefined;
  const rise = (n * sxy - sx * sy) / denom;
  const span = (points[points.length - 1].at - t0) / 3600000;
  // Under a quarter of an hour of history the line says more about noise than about heat.
  if (span < 0.25) return undefined;
  return -rise;
}

/**
 * Hours until the store falls to `floor`, from the measured fall. Undefined when it is
 * not falling fast enough to mean anything: below the threshold the card would rather
 * say nothing than invent a number.
 */
export function hoursLeft(now: number, floor: number, fall: number | undefined, minFall: number): number | undefined {
  if (fall === undefined || fall < minFall) return undefined;
  const left = now - floor;
  if (left <= 0) return 0;
  return left / fall;
}

/** Coarse on purpose: "30 min", "1 h 50", never "34 min". */
export function coarseSpan(hours: number): { hours?: number; minutes?: number } {
  if (hours <= 0) return { minutes: 0 };
  const minutes = hours * 60;
  if (minutes < 90) return { minutes: Math.max(5, Math.round(minutes / 10) * 10) };
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes - h * 60) / 10) * 10;
  return m === 60 ? { hours: h + 1, minutes: 0 } : { hours: h, minutes: m };
}

/** Points from a recorder answer, newest last, dropping anything unreadable. */
export function parseTrend(history: unknown, entityId: string, since: number): TrendPoint[] {
  const rows = (history as Record<string, Array<Record<string, unknown>>> | undefined)?.[entityId];
  if (!Array.isArray(rows)) return [];
  const points: TrendPoint[] = [];
  for (const row of rows) {
    const at = typeof row.lu === "number" ? row.lu * 1000 : Date.parse(String(row.last_updated ?? row.last_changed ?? ""));
    const value = Number(row.s ?? row.state);
    if (!Number.isFinite(at) || !Number.isFinite(value) || at < since) continue;
    points.push({ at, value });
  }
  return points.sort((a, b) => a.at - b.at);
}
