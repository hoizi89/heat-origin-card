/**
 * The arithmetic of the "origin" layout, kept apart from the drawing so it can be tested:
 * the colour a store wears, where its usable water ends, how many litres of shower water
 * it still holds, and how the ring splits the heat between electricity and ambient heat.
 */

import type { ElectricSource } from "./types";

/**
 * A tank's colour in clear steps. A blend between neighbours turns muddy (light blue and
 * yellow make olive), so each band is one colour. From 39 °C the water counts as shower water.
 */
export const TONE_STEPS: ReadonlyArray<[number, string]> = [
  [35, "#0A84FF"],
  [39, "#64D2FF"],
  [45, "#FFD60A"],
  [52, "#FF9F0A"]
];
export const TONE_HOT = "#FF453A";
export const TONE_NONE = "#48484A";

export function tempTone(t: number | undefined): string {
  if (t === undefined || !Number.isFinite(t)) return TONE_NONE;
  for (const [below, tone] of TONE_STEPS) if (t < below) return tone;
  return TONE_HOT;
}

/** Sensor heights as a share of the water column, 0 at the bottom and 1 at the top. */
export interface Heights {
  top: number;
  bottom: number;
}

export const HOT_WATER_HEIGHTS: Heights = { top: 0.81, bottom: 0.35 };
export const BUFFER_HEIGHTS: Heights = { top: 0.85, bottom: 0.2 };

/** The temperature at height `h` on a straight line through both sensors, the same slope carried below the bottom one. */
export function profileAt(h: number, top: number, bottom: number, heights: Heights): number {
  if (h >= heights.top) return top;
  const span = heights.top - heights.bottom;
  const slope = span > 0 ? (top - bottom) / span : 0;
  return bottom + (h - heights.bottom) * slope;
}

/** The lowest height a tank is drawn down to; below it lies the cold inlet. */
export const EDGE_MIN = 0.05;

/**
 * Where the usable water ends, as a height: above it the profile is at or over `threshold`.
 * 1 means nothing is usable, `EDGE_MIN` that all of it is.
 */
export function edgeAt(top: number | undefined, bottom: number | undefined, heights: Heights, threshold: number): number {
  if (top === undefined) return 1;
  const low = bottom ?? top;
  if (top < threshold && low < threshold) return 1;
  if (top >= threshold && low >= threshold) return EDGE_MIN;
  const span = heights.top - heights.bottom;
  const slope = span > 0 ? (top - low) / span : 0;
  if (slope === 0) return top >= threshold ? EDGE_MIN : 1;
  const h = heights.bottom + (threshold - low) / slope;
  return Math.min(1, Math.max(EDGE_MIN, h));
}

export interface ShowerInput {
  top: number | undefined;
  bottom: number | undefined;
  heights: Heights;
  /** Litres in the store. */
  volume: number | undefined;
  /** The temperature the tap mixes to. */
  mix?: number;
  /** The cold water it mixes with. */
  cold?: number;
}

/**
 * Litres of shower water at `mix` °C the store still holds: thirty slices along the
 * profile, each mixed down with cold water. A slice counts in part between a kelvin
 * under `mix` and three over it, in full above: a hard cut made a nearly uniform store
 * jump by a hundred litres when it crossed the line, and lukewarm water is half useful
 * at the tap anyway. The bottom five per cent is the cold inlet and counts for nothing.
 */
export function showerLitres({ top, bottom, heights, volume, mix = 38, cold = 10 }: ShowerInput): number | undefined {
  if (top === undefined || !volume || volume <= 0 || mix <= cold) return undefined;
  const low = bottom ?? top;
  const hottest = Math.max(top, low);
  const slices = 30;
  let litres = 0;
  for (let i = 0; i < slices; i += 1) {
    const h = (i + 0.5) / slices;
    if (h < EDGE_MIN) continue;
    const t = Math.min(Math.max(profileAt(h, top, low, heights), cold), hottest);
    const weight = Math.min(1, Math.max(0, (t - (mix - 1)) / 4));
    litres += weight * (volume / slices) * ((t - cold) / (mix - cold));
  }
  return litres;
}

/**
 * Usable heat in kWh above `floor`, layer by layer along the profile. A mean of both
 * sensors says a layered store is empty when its top third is still well above the
 * floor; the layers count what is really there.
 */
export function usableKwh(top: number | undefined, bottom: number | undefined, heights: Heights, volume: number | undefined, floor: number): number | undefined {
  if (top === undefined || !volume || volume <= 0) return undefined;
  const low = bottom ?? top;
  const hottest = Math.max(top, low);
  const slices = 30;
  let wh = 0;
  for (let i = 0; i < slices; i += 1) {
    const h = (i + 0.5) / slices;
    const t = Math.min(profileAt(h, top, low, heights), hottest);
    if (t > floor) wh += (volume / slices) * 1.163 * (t - floor);
  }
  return wh / 1000;
}

export interface RingArc {
  /** What the arc stands for: ambient heat, a source of electricity, or electricity of unknown origin. */
  part: "air" | ElectricSource | "power";
  /** Degrees clockwise from three o'clock, as SVG measures. */
  start: number;
  length: number;
}

/**
 * The ring as a sum: electricity plus ambient heat is the heat. The electricity sits
 * on the left, centred at nine o'clock where its line comes in, split by where it comes
 * from; the ambient heat fills the rest and meets its own line on the right.
 */
export function ringArcs(heat: number, electric: number, shares: Partial<Record<ElectricSource, number>> | undefined, gap = 3): RingArc[] {
  if (!(heat > 0)) return [];
  const share = Math.min(1, Math.max(0, electric / heat));
  const elDeg = 360 * share;
  const arcs: RingArc[] = [];
  const start = 180 - elDeg / 2;
  if (elDeg > gap) {
    const parts = (["solar", "battery", "grid"] as ElectricSource[])
      .map((s) => [s, shares?.[s] ?? 0] as const)
      .filter(([, v]) => v > 0.005);
    const total = parts.reduce((a, [, v]) => a + v, 0);
    let at = start;
    if (!total) arcs.push({ part: "power", start: at + gap / 2, length: elDeg - gap });
    else
      for (const [s, v] of parts) {
        const len = (elDeg * v) / total;
        if (len - gap > 0.5) arcs.push({ part: s, start: at + gap / 2, length: len - gap });
        at += len;
      }
  }
  const airDeg = 360 - elDeg;
  if (airDeg > gap) arcs.push({ part: "air", start: start + elDeg + gap / 2, length: airDeg - gap });
  return arcs;
}

/** Height of a reading's pill in the tank. */
export const PILL_H = 20;

/**
 * Where the pills go: at their sensor's height, clamped into the straight part of the
 * capsule (a pill in the round cap is cut off by it), and pushed apart so they never
 * overlap. Input and output in the same order.
 */
export function pillCentres(wanted: number[], span: { top: number; bottom: number; gap: number }): number[] {
  const clamp = (v: number) => Math.min(span.bottom, Math.max(span.top, v));
  const order = wanted.map((v, i) => ({ v: clamp(v), i })).sort((a, b) => a.v - b.v);
  // Push down from the top, then back up from the bottom if the last one ran past it.
  for (let k = 1; k < order.length; k += 1) order[k].v = Math.max(order[k].v, order[k - 1].v + span.gap);
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const limit = k === order.length - 1 ? span.bottom : order[k + 1].v - span.gap;
    order[k].v = Math.min(order[k].v, limit);
  }
  const out: number[] = new Array(wanted.length);
  for (const o of order) out[o.i] = Math.max(span.top, o.v);
  return out;
}

/**
 * Where the threshold label beside the edge goes: at the edge, unless a pill sits at that
 * height, then just above or below the pill (whichever is nearer and fits); never outside
 * the tank's span. Undefined when there is no room at all.
 */
export function edgeLabelY(edge: number, pills: number[], span: { top: number; bottom: number; clear: number }): number | undefined {
  const inSpan = (v: number) => v >= span.top && v <= span.bottom;
  const free = (v: number) => pills.every((p) => Math.abs(v - p) >= span.clear);
  const at = Math.min(span.bottom, Math.max(span.top, edge));
  if (free(at)) return at;
  const candidates = pills
    .flatMap((p) => [p - span.clear, p + span.clear])
    .filter((v) => inSpan(v) && free(v))
    .sort((a, b) => Math.abs(a - edge) - Math.abs(b - edge));
  return candidates[0];
}

/** Whole calendar days between the last time and now, as the hot water automation counts them. */
export function calendarDays(last: number, now: number): number {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((day(now) - day(last)) / 86_400_000);
}
