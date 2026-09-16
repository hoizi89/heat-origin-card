import { nothing, svg, type SVGTemplateResult } from "lit";
import { icon, type IconName } from "./icons";

/**
 * The drawing of the heat flow, kept apart from the card that feeds it. Everything
 * here takes plain numbers and strings: no entity, no locale, no Home Assistant. That
 * makes each shape testable on its own and keeps the card file about reading sensors.
 */

export interface Tone {
  ink: string;
  muted: string;
  hairline: string;
  track: string;
  surface: string;
  sun: string;
}

export interface BoxModel {
  name: string;
  icon: IconName;
  short: string;
  tone: string;
  /** Warm: it is taking or giving heat right now. */
  on: boolean;
  /** The word over the figure: LÄDT, ENTLÄDT, VORLAUF, RAUM, AUS. */
  label: string;
  /** The tone of that word; the muted one unless it reports a state. */
  labelTone?: string;
  /** The figure itself. */
  value: string;
  /** The word over the figure on the right, if there is one. */
  labelRight?: string;
  valueRight?: string;
  /** A store: where its level stands, and where its layering ends. */
  level?: {
    top: number;
    bottom: number;
    /** Where each set-point sits on the bar, and what it is called. */
    marks: Array<{ at: number; name: string }>;
    scale?: [string, string];
    /** The set-point that is the top of the scale, if one is; it names the right-hand end. */
    ceilingName?: string;
    /** The word before the first mark's name for the stretch under it: "below". */
    under?: string;
  };
  /**
   * A circuit: the flow above, and below it either the return — which matters while
   * heat is moving — or what the heating curve is asking for, which is the only one of
   * the two that says anything while the circuit rests.
   */
  pair?: { up: string; down?: string; curve?: string; curveLabel?: string; note?: string; spread?: string };
  /** The room this circuit was asked for, and how far it is from it. */
  target?: { text: string; off: string; tone: string };
  /** Which way a store is going, from its own measured fall. */
  trend?: { dir: "up" | "down" | "flat"; rate?: string };
  /** A circuit shown by its flow instead of its room: one line of detail. */
  sub?: string;
  /** The circulation drawing off this store: its temperature, and whether it runs. */
  loop?: { text: string; on: boolean };
  /** What the box says when the pointer rests on it. */
  hint?: string;
}

export const W = 368;
/** Four sizes, no more: labels, secondary figures, the figure, the one in the circle. */
export const T = { micro: 8, small: 10, figure: 13.5, hero: 21 };
/** The same four for the wide circle, which has the room for a step up. */
export const TL = { micro: 10, small: 12, figure: 17, hero: 24 };

/**
 * How wide a word runs, in the dashboard's face. Digits and punctuation are narrow,
 * capitals wide, and the card's rows are mostly digits, so one factor for every
 * character called a row full that had a fifth of its width to spare.
 */
const CHAR_WIDTH: Record<string, number> = {
  " ": 0.26, ".": 0.28, ",": 0.28, ":": 0.28, "·": 0.32, "°": 0.4, "+": 0.58, "−": 0.58, "-": 0.34, "/": 0.4, "→": 0.9,
  "Δ": 0.66, "K": 0.62, "W": 0.9, "M": 0.85, "m": 0.86, "w": 0.75, "i": 0.24, "l": 0.24, "j": 0.24, "t": 0.34, "f": 0.34, "r": 0.36, "I": 0.28
};
export function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += CHAR_WIDTH[ch] ?? (/\d/.test(ch) ? 0.56 : /[A-ZÄÖÜ]/.test(ch) ? 0.68 : 0.54);
  return em * size;
}

const R_BOX = 9;

/**
 * How large a box writes. A box with room to breathe takes the larger scale; the
 * narrower arrangement keeps the smaller one, where a step up would put the room
 * temperature into the arrow beside it.
 */
function scaleOf(h: number) {
  return h >= 70
    ? { micro: 10, small: 12, figure: 16.5, lab: 22, val: 46, icon: 20, short: 60, bar: 54, barH: 5.5, scale: 73, up: 28, down: 46, aUp: 25, aDown: 43, note: 71 }
    : { micro: 8, small: 10, figure: 13.5, lab: 19, val: 38, icon: 17, short: 50, bar: 45, barH: 4.5, scale: 59, up: 23, down: 38, aUp: 20, aDown: 35, note: 57 };
}

/** A box: symbol and storey on the left, two rows of figures, and a foot of its own. */
export function box(m: BoxModel, x: number, y: number, w: number, h: number, t: Tone, style: {
  labels: "short" | "icon" | "name";
  gauge: "zones" | "scale" | "bar" | "box";
  scale: boolean;
  /** A resting box keeps its symbol in its own colour, so the card keeps its order. */
  restColour: boolean;
}, uid: number, click?: () => void): SVGTemplateResult {
  const S = scaleOf(h);
  const tone = m.on ? m.tone : t.muted;
  // Only the state greys out. What a box *is* does not change when it stops working.
  const mark = m.on || style.restColour ? m.tone : t.muted;
  const fill = m.on ? `color-mix(in srgb, ${m.tone} 15%, ${t.surface})` : t.surface;
  const parts: unknown[] = [
    svg`<rect x=${x} y=${y} width=${w} height=${h} rx=${R_BOX} fill=${fill} stroke=${m.on ? m.tone : t.hairline} stroke-width="1.5"/>`
  ];

  if (style.labels === "name") {
    const mid = y + h / 2;
    // What the state word on the right leaves over is what the name may use.
    const room = w - 22 - (m.labelRight ? textWidth(m.labelRight, S.small) + 8 : 0);
    const fits = Math.max(4, Math.floor(room / (S.figure * 0.56)));
    const shown = m.name.length > fits ? `${m.name.slice(0, fits - 1)}…` : m.name;
    parts.push(svg`<text x=${x + 11} y=${mid - 5} font-size=${S.figure - 1.5} font-weight="600" fill=${t.ink}>${shown}</text>`);
    parts.push(svg`<text x=${x + 11} y=${mid + 12} font-size=${S.small} fill=${m.on ? t.ink : t.muted}>${m.value}</text>`);
    if (m.labelRight) {
      parts.push(svg`<text x=${x + w - 9} y=${mid - 5} text-anchor="end" font-size=${S.small} font-weight="700" fill=${m.labelTone ?? t.muted}>${m.labelRight}</text>`);
    }
    return group(parts, m, click);
  }

  const tx = x + 30;
  const rx = x + w - 9;

  if (m.level && style.gauge === "box") {
    const clip = `ho-fill-${uid}`;
    parts.push(svg`<defs><clipPath id=${clip}><rect x=${x} y=${y} width=${w} height=${h} rx=${R_BOX}/></clipPath></defs>
      <g clip-path=${`url(#${clip})`}>
        <rect x=${x} y=${y} width=${(w * m.level.top).toFixed(1)} height=${h} fill=${m.tone} opacity="0.2"/>
        <rect x=${x} y=${y} width=${(w * m.level.bottom).toFixed(1)} height=${h} fill=${m.tone} opacity="0.2"/>
      </g>`);
  }

  parts.push(icon(m.icon, x + 7, y + S.icon, mark));
  if (style.labels === "short" && m.short) {
    parts.push(svg`<text x=${x + 15} y=${y + S.short} text-anchor="middle" font-size=${S.micro} font-weight="700"
      letter-spacing="0.06em" fill=${mark}>${m.short}</text>`);
  }

  const label = (text: string, xx: number, anchor: string, col: string) =>
    svg`<text x=${xx} y=${y + S.lab} text-anchor=${anchor} font-size=${S.micro} font-weight="700" letter-spacing="0.09em" fill=${col}>${text}</text>`;
  // The word on the left may use what the unit on the right leaves; a name too long
  // for a narrow box is cut, not written over it.
  const spaced = (s: string) => textWidth(s, S.micro) + 0.09 * S.micro * s.length;
  const labelRoom = rx - tx - (m.labelRight ? spaced(m.labelRight) + 8 : 0);
  let shown = m.label;
  while (shown.length > 3 && spaced(shown) > labelRoom) shown = `${shown.replace(/…$/, "").slice(0, -1).trimEnd()}…`;
  parts.push(label(shown, tx, "start", m.labelTone ?? t.muted));
  if (m.labelRight) parts.push(label(m.labelRight, rx, "end", t.muted));

  parts.push(svg`<text x=${tx} y=${y + S.val} font-size=${S.figure} font-weight="600" fill=${m.on ? t.ink : t.muted}>${m.value}</text>`);
  if (m.valueRight !== undefined) {
    parts.push(svg`<text x=${rx} y=${y + S.val} text-anchor="end" font-size=${S.small} font-weight="600"
      fill=${m.level && m.on ? t.ink : t.muted}>${m.valueRight}</text>`);
  }

  // The card measures a store's fall for its forecast anyway; the arrow says which way
  // it is going for the price of seven pixels. The rate follows only where it fits,
  // because the direction is the part that is read at a glance.
  let afterValue = tx + textWidth(m.value, S.figure);
  if (m.trend) {
    const ax = afterValue + 11;
    const ay = y + S.val - 4;
    // Rising in the store's own colour, falling grey, holding a flat grey arrow.
    parts.push(
      m.trend.dir === "flat"
        ? svg`<path d=${`M${ax - 4} ${ay} H${ax + 4.5} M${ax + 1.6} ${ay - 2.6} L${ax + 4.5} ${ay} L${ax + 1.6} ${ay + 2.6}`}
            fill="none" stroke=${t.muted} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : arrow(ax, ay, m.trend.dir === "up", m.trend.dir === "up" ? m.tone : t.muted)
    );
    afterValue = ax + 5;
    const room = rx - afterValue - (m.valueRight === undefined ? 0 : textWidth(m.valueRight, S.small));
    const wide = m.loop ? 0 : 1;
    if (m.trend.rate && room > textWidth(m.trend.rate, S.micro) + 40 * wide) {
      parts.push(svg`<text x=${afterValue + 4} y=${y + S.val} font-size=${S.micro} fill=${t.muted}>${m.trend.rate}</text>`);
      afterValue += 4 + textWidth(m.trend.rate, S.micro);
    }
  }

  // Between the temperature and the usable heat is the widest free space in a wide box,
  // and the circulation is the figure that changes most often. It goes there.
  if (m.loop && w >= 150) {
    const lt = m.loop.on ? m.tone : t.muted;
    const leftEnd = afterValue;
    const rightStart = m.valueRight === undefined ? rx : rx - textWidth(m.valueRight, S.small);
    const width = 13 + textWidth(m.loop.text, S.small);
    const lx = (leftEnd + rightStart) / 2 - width / 2;
    if (lx > leftEnd + 6 && lx + width < rightStart - 6) {
      parts.push(icon("loop", lx, y + S.val - 9, lt, 0.65));
      parts.push(svg`<text x=${lx + 14} y=${y + S.val} font-size=${S.small} fill=${lt}>${m.loop.text}</text>`);
    }
  }

  const micro = (s: string) => textWidth(s, S.micro);
  if (m.pair) {
    // The arrow steps back far enough for whatever figure stands beside it.
    const ax = rx - Math.max(28, textWidth(m.pair.up, S.small) + 11);
    // The spread sits beside the figure, in the gap before the arrow, where a wide box
    // has room for it and a narrow one has not; the row below stays with the room.
    if (m.pair.spread) {
      const sx = tx + textWidth(m.value, S.figure) + 8;
      if (sx + micro(m.pair.spread) < ax - 8) {
        parts.push(svg`<text x=${sx.toFixed(1)} y=${y + S.val} font-size=${S.micro} fill=${t.muted}>${m.pair.spread}</text>`);
      }
    }
    parts.push(arrow(ax, y + S.aUp, true, tone));
    parts.push(svg`<text x=${rx} y=${y + S.up} text-anchor="end" font-size=${S.small} font-weight="600" fill=${m.on ? t.ink : t.muted}>${m.pair.up}</text>`);
    if (m.pair.curve) {
      // At rest a return line is a number with nothing behind it. What the curve wants
      // is the figure that still means something, so it takes that place and says so —
      // by name where the name fits between it and the figure on the left.
      const labelX = rx - textWidth(m.pair.curve, S.small) - 6;
      const labelW = textWidth((m.pair.curveLabel ?? ""), S.micro);
      parts.push(svg`<text x=${rx} y=${y + S.down} text-anchor="end" font-size=${S.small} fill=${t.muted}>${m.pair.curve}</text>`);
      if (m.pair.curveLabel && labelX - labelW > tx + textWidth(m.value, S.figure) + 6) {
        parts.push(svg`<text x=${labelX} y=${y + S.down} text-anchor="end" font-size=${S.micro} fill=${t.muted}>${m.pair.curveLabel}</text>`);
      }
    } else if (m.pair.down) {
      parts.push(arrow(ax, y + S.aDown, false, t.muted));
      parts.push(svg`<text x=${rx} y=${y + S.down} text-anchor="end" font-size=${S.small} fill=${t.muted}>${m.pair.down}</text>`);
    }
  } else if (m.sub) {
    parts.push(svg`<text x=${tx} y=${y + S.note} font-size=${S.micro} fill=${t.muted}>${m.sub}</text>`);
  }

  // The row under the figure: the room a circuit was asked for — which turns its own
  // figure from a reading into an answer, since twenty-five degrees is only too warm
  // once something says what was wanted — then how far off it is, else the pair's
  // note. Each goes in only where it fits; a narrow box keeps the answer and lets go.
  let noteEnd = tx;
  if (m.target && tx + micro(m.target.text) <= rx) {
    parts.push(svg`<text x=${tx} y=${y + S.note} font-size=${S.micro} fill=${t.muted}>${m.target.text}</text>`);
    noteEnd = tx + micro(m.target.text);
    if (noteEnd + 7 + micro(m.target.off) <= rx) {
      parts.push(svg`<text x=${noteEnd + 7} y=${y + S.note} font-size=${S.micro} font-weight="700" fill=${m.target.tone}>${m.target.off}</text>`);
      noteEnd += 7 + micro(m.target.off);
    }
  } else if (m.pair?.note) {
    parts.push(svg`<text x=${tx} y=${y + S.note} font-size=${S.micro} letter-spacing="0.05em" fill=${tone} opacity="0.85">${m.pair.note}</text>`);
    noteEnd = tx + micro(m.pair.note) * 1.08;
  }
  void noteEnd;

  // Stages instead of a percentage: the stretch under the first set-point, then one
  // stretch per set-point, each filling on its own. "Full" is not a thing here; what
  // the eye reads is which stage the store has reached.
  if (m.level && style.gauge === "zones") {
    const bw = rx - tx;
    const by = y + S.bar - 1;
    const bh = S.barH + 1;
    const bounds = [0, ...m.level.marks.map((k) => k.at), 1];
    const first = m.level.marks[0];
    const names = [first ? [m.level.under, first.name].filter(Boolean).join(" ") : "", ...m.level.marks.map((k) => k.name)];
    const wanted: Array<{ x: number; text: string; anchor: "middle" | "end" }> = [];
    let underLabel: { x: number; text: string; anchor: "end" } | undefined;
    const fillX = tx + bw * m.level.top;
    bounds.slice(0, -1).forEach((b, i) => {
      const last = i === bounds.length - 2;
      const x0 = tx + bw * b + (i ? 1.5 : 0);
      const x1 = tx + bw * bounds[i + 1] - (last ? 0 : 1.5);
      if (x1 - x0 < 3) return;
      parts.push(svg`<rect x=${x0.toFixed(1)} y=${by} width=${(x1 - x0).toFixed(1)} height=${bh} rx="2" fill=${t.track}/>`);
      const to = Math.min(x1, Math.max(x0, fillX));
      if (to - x0 >= 1) {
        // The stretch under the first set-point is cold water: it fills in grey, not in the store's colour.
        const cold = i === 0 && m.level!.marks.length > 0;
        parts.push(svg`<rect x=${x0.toFixed(1)} y=${by} width=${(to - x0).toFixed(1)} height=${bh} rx="2"
          fill=${cold ? t.muted : m.tone} opacity=${cold ? 0.55 : to < x1 ? 0.7 : 1}/>`);
      }
      // "Below Eco" is wider than its stretch, so it hangs off the stretch's right end
      // into the icon's column, which is empty in this row.
      if (i === 0 && names[0]) underLabel = { x: x1 - 3, text: names[0], anchor: "end" };
      else if (names[i]) wanted.push({ x: (x0 + x1) / 2, text: names[i], anchor: "middle" });
    });
    // The set-points' own names come first, the top of the scale next, "below Eco" last:
    // where the box is narrow, that is the order in which they may be dropped.
    if (m.level.ceilingName) wanted.push({ x: rx, text: m.level.ceilingName, anchor: "end" });
    if (underLabel) wanted.push(underLabel);
    parts.push(...row(wanted, y + S.scale, S.micro, t.muted, x + 4, x + w - 4));
  }

  // The bar as the scale itself, coloured from cold to the store's own tone, and a
  // pointer on the temperature the store has. Nothing fills and nothing runs over.
  if (m.level && style.gauge === "scale") {
    const bw = rx - tx;
    const by = y + S.bar - 1;
    const bh = S.barH + 1;
    const grad = `ho-scale-${uid}`;
    parts.push(svg`<defs><linearGradient id=${grad} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color=${t.muted} stop-opacity="0.4"/><stop offset="1" stop-color=${m.tone}/></linearGradient></defs>
      <rect x=${tx} y=${by} width=${bw} height=${bh} rx=${bh / 2} fill=${`url(#${grad})`}/>`);
    for (const mark of m.level.marks) {
      const mx = (tx + bw * mark.at).toFixed(1);
      parts.push(svg`<line x1=${mx} x2=${mx} y1=${by - 2} y2=${by + bh + 2} stroke=${t.surface} stroke-width="1.4"/>`);
    }
    parts.push(svg`<rect x=${(tx + bw * m.level.top - 1.2).toFixed(1)} y=${by - 4} width="2.4" height=${bh + 8} rx="1" fill=${t.ink}/>`);
    const wanted: Array<{ x: number; text: string; anchor: "start" | "middle" | "end" }> = [];
    if (style.scale && m.level.scale) wanted.push({ x: tx, text: m.level.scale[0], anchor: "start" });
    for (const mark of m.level.marks) wanted.push({ x: tx + bw * mark.at, text: mark.name, anchor: "middle" });
    const end = [m.level.ceilingName, style.scale ? m.level.scale?.[1] : undefined].filter(Boolean).join(" ");
    if (end) wanted.push({ x: rx, text: end, anchor: "end" });
    parts.push(...row(wanted, y + S.scale, S.micro, t.muted, x + 4, x + w - 4));
  }

  if (m.level && style.gauge === "bar") {
    const bw = rx - tx;
    const by = y + S.bar;
    parts.push(svg`<rect x=${tx} y=${by} width=${bw} height=${S.barH} rx=${S.barH / 2} fill=${t.track}/>`);
    parts.push(svg`<rect x=${tx} y=${by} width=${Math.max(2, bw * m.level.top).toFixed(1)} height=${S.barH} rx=${S.barH / 2} fill=${m.tone} opacity="0.45"/>`);
    if (m.level.bottom > 0.01) {
      parts.push(svg`<rect x=${tx} y=${by} width=${(bw * m.level.bottom).toFixed(1)} height=${S.barH} rx=${S.barH / 2} fill=${m.tone}/>`);
    }
    for (const mark of m.level.marks) {
      const mx = (tx + bw * mark.at).toFixed(1);
      parts.push(svg`<line x1=${mx} x2=${mx} y1=${by - 2} y2=${by + S.barH + 2} stroke=${t.ink} stroke-width="1.2" opacity="0.45"/>`);
    }
  }

  // A bar without its two ends is a riddle, so the scale is written under it; and a
  // notch without a name is a line nobody can read, so each set-point writes its own.
  if (m.level && style.scale && m.level.scale && (style.gauge === "bar" || style.gauge === "box")) {
    const bw = rx - tx;
    parts.push(svg`<text x=${tx} y=${y + S.scale} font-size=${S.micro} fill=${t.muted}>${m.level.scale[0]}</text>`);
    parts.push(svg`<text x=${rx} y=${y + S.scale} text-anchor="end" font-size=${S.micro} fill=${t.muted}>${m.level.scale[1]}</text>`);
    if (style.gauge === "bar") {
      const guardR = bw - textWidth(m.level.scale[1], S.micro) - 6;
      let taken = textWidth(m.level.scale[0], S.micro) + 6;
      for (const mark of m.level.marks) {
        const half = (textWidth(mark.name, S.micro)) / 2;
        const at = bw * mark.at;
        if (at - half < taken || at + half > guardR) continue;
        taken = at + half + 5;
        parts.push(svg`<text x=${(tx + at).toFixed(1)} y=${y + S.scale} text-anchor="middle"
          font-size=${S.micro} fill=${t.muted}>${mark.name}</text>`);
      }
    }
  }

  return group(parts, m, click);
}

/**
 * One row of small words, each where it belongs, and none on top of another: they are
 * placed in the order given, and whatever would collide with one already there, or
 * leave the box, is left out — the box's tooltip carries every name anyway.
 */
function row(
  wanted: Array<{ x: number; text: string; anchor: "start" | "middle" | "end" }>,
  y: number, size: number, tone: string, left: number, right: number
) {
  const width = (s: string) => textWidth(s, size);
  const span = (w: { x: number; text: string; anchor: string }): [number, number] => {
    const tw = width(w.text);
    return w.anchor === "start" ? [w.x, w.x + tw] : w.anchor === "end" ? [w.x - tw, w.x] : [w.x - tw / 2, w.x + tw / 2];
  };
  const placed: Array<[number, number]> = [];
  const out: typeof wanted = [];
  for (const w of wanted) {
    const s = span(w);
    if (s[0] < left || s[1] > right) continue;
    if (placed.some(([a, b]) => s[0] < b + 4 && s[1] > a - 4)) continue;
    placed.push(s);
    out.push(w);
  }
  return out.map((w) => svg`<text x=${w.x.toFixed(1)} y=${y} text-anchor=${w.anchor} font-size=${size} fill=${tone}>${w.text}</text>`);
}

function group(parts: unknown[], m: BoxModel, click?: () => void) {
  return svg`<g class=${click ? "clickable" : ""} @click=${click ?? nothing}>${parts}<title>${m.hint ?? m.name}</title></g>`;
}

function arrow(ax: number, ay: number, up: boolean, tone: string) {
  const tip = up ? ay - 4.5 : ay + 4.5;
  const tail = up ? ay + 4 : ay - 4;
  const barb = up ? tip + 3 : tip - 3;
  return svg`<path d=${`M${ax} ${tail} V${tip} M${ax - 2.6} ${barb} L${ax} ${tip} L${ax + 2.6} ${barb}`}
    fill="none" stroke=${tone} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * The line from the heat pump to a box. Past half the span the two control points of
 * the curve swap sides and it folds into a bracket, so the bend is always half of it.
 */
export function connector(fromX: number, fromY: number, edgeX: number, midY: number, side: 1 | -1, o: {
  tone: string;
  fed: boolean;
  dashed: boolean;
  dim: boolean;
  track: string;
  surface: string;
}) {
  const bend = Math.abs(edgeX - fromX) * 0.5 * side;
  const d = `M${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${edgeX - bend} ${midY}, ${edgeX} ${midY}`;
  if (o.fed) {
    return svg`<path d=${d} fill="none" stroke=${o.tone} stroke-width="5.5" stroke-linecap="round"/>
      <path d=${d} fill="none" stroke="#fff" stroke-width="3" opacity="0.85" class="flow-dash"/>`;
  }
  return svg`<path d=${d} fill="none" stroke=${o.dim ? o.track : o.tone} stroke-width="2" opacity=${o.dim ? 1 : 0.6}
    stroke-dasharray=${o.dashed ? "3 5" : ""}/>`;
}

/**
 * The line from a discharging buffer to the circuits it carries. A curve over the
 * circle always grazes it, because it has to climb exactly where the circle is widest,
 * so this is routed like a pipe: up a clear channel beside the heat pump, across above
 * the sun, down the other side. When store and circuit stand at the same height and the
 * heat pump rides above them, none of that is needed and the line runs straight.
 */
export function bypass(fromX: number, fromY: number, toX: number, ys: number[], o: {
  cx: number;
  cy: number;
  ring: number;
  tone: string;
  surface: string;
  label?: string;
  hint?: string;
}) {
  const last = ys[ys.length - 1];
  const flat = ys.every((y) => Math.abs(y - fromY) < 6) && fromY > o.cy + o.ring + 8;
  const head = (y: number) => svg`<path d=${`M${toX - 9.5} ${y - 4.4} L${toX - 0.5} ${y} L${toX - 9.5} ${y + 4.4} Z`} fill=${o.tone}/>`;

  let d: string;
  let badgeY: number;
  if (flat) {
    d = `M${fromX} ${fromY} H${toX - 9}`;
    badgeY = fromY;
  } else {
    const xa = o.cx - o.ring - 16;
    const xb = o.cx + o.ring + 16;
    const yTop = o.cy - o.ring - 24;
    const r = Math.min(6, Math.abs(fromY - yTop) / 2, Math.abs(last - yTop) / 2, (xa - fromX) / 2);
    const rEnd = Math.min(5, (toX - xb) / 3);
    d = `M${fromX} ${fromY} H${xa - r} Q${xa} ${fromY} ${xa} ${fromY - r}` +
        ` V${yTop + r} Q${xa} ${yTop} ${xa + r} ${yTop}` +
        ` H${xb - r} Q${xb} ${yTop} ${xb} ${yTop + r}`;
    if (ys.length === 1) {
      d += ` V${last - rEnd} Q${xb} ${last} ${xb + rEnd} ${last} H${toX - 9}`;
    } else {
      // Two circuits on one buffer: the drop becomes a manifold with a spur each.
      d += ` V${last}`;
      for (const y of ys) d += ` M${xb} ${y} H${toX - 9}`;
    }
    badgeY = yTop;
  }

  const dots = ys.length > 1 && !flat
    ? ys.map((y) => svg`<circle cx=${o.cx + o.ring + 16} cy=${y} r="3.2" fill=${o.tone}/>`)
    : nothing;

  // How long the flow lasts belongs on the flow, not in a chip three lines away.
  const badge = o.label
    ? (() => {
        const w = o.label!.length * 5.1 + 16;
        return svg`<rect x=${(o.cx - w / 2).toFixed(1)} y=${badgeY - 8} width=${w.toFixed(1)} height="16" rx="8"
            fill=${o.surface} stroke=${o.tone} stroke-width="1.4"/>
          <text x=${o.cx} y=${badgeY + 3.5} text-anchor="middle" font-size="9" font-weight="700" fill=${o.tone}>${o.label}</text>
          <title>${o.hint ?? ""}</title>`;
      })()
    : nothing;

  return svg`
    <path d=${d} fill="none" stroke=${o.surface} stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d=${d} fill="none" stroke=${o.tone} stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d=${d} fill="none" stroke="#fff" stroke-width="2.2" opacity="0.8" class="flow-dash"/>
    ${ys.map(head)}${dots}${badge}`;
}

/**
 * The heating group's own manifold: one upright inside the column, a spur into every
 * box hanging off it, a node where each spur leaves. Whether the heat comes from the
 * pump above or from the buffer at the head of the column, it travels the same run —
 * which is what the house does, and why this arrangement needs no special case for a
 * discharging buffer.
 */
export function spine(fromX: number, fromY: number, toX: number, ys: number[], o: {
  tone: string;
  surface: string;
  live: boolean;
  track: string;
}) {
  const sx = toX - 13;
  const last = ys[ys.length - 1];
  const r = 6;
  let d = `M${fromX} ${fromY} H${sx + r} Q${sx} ${fromY} ${sx} ${fromY + r} V${last - r} Q${sx} ${last} ${sx + r} ${last} H${toX}`;
  for (const y of ys.slice(0, -1)) d += ` M${sx} ${y} H${toX}`;

  const nodes = ys.slice(0, -1).map((y) => svg`<circle cx=${sx} cy=${y} r="3" fill=${o.live ? o.tone : o.track}/>`);
  if (!o.live) {
    return svg`<path d=${d} fill="none" stroke=${o.track} stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${nodes}`;
  }
  return svg`
    <path d=${d} fill="none" stroke=${o.surface} stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d=${d} fill="none" stroke=${o.tone} stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d=${d} fill="none" stroke="#fff" stroke-width="2.2" opacity="0.8" class="flow-dash"/>
    ${nodes}`;
}

/**
 * The line from the heat pump down to the hot water store under it. It leaves the ring
 * at about half past seven rather than straight down, because straight down is where
 * the dial puts midnight, and the moon was standing in the flow.
 */
export function branch(cx: number, cy: number, reach: number, toX: number, toY: number, o: {
  tone: string;
  surface: string;
  live: boolean;
  track: string;
}) {
  const a = (114 * Math.PI) / 180;
  const ox = cx + Math.cos(a) * reach;
  const oy = cy + Math.sin(a) * reach;
  const d = `M${ox.toFixed(1)} ${oy.toFixed(1)} C ${(ox - 6).toFixed(1)} ${(oy + 14).toFixed(1)}, ${toX} ${toY - 16}, ${toX} ${toY}`;
  if (!o.live) return svg`<path d=${d} fill="none" stroke=${o.track} stroke-width="2" stroke-linecap="round"/>`;
  return svg`
    <path d=${d} fill="none" stroke=${o.surface} stroke-width="7.5" stroke-linecap="round"/>
    <path d=${d} fill="none" stroke=${o.tone} stroke-width="4.5" stroke-linecap="round"/>
    <path d=${d} fill="none" stroke="#fff" stroke-width="2.4" opacity="0.85" class="flow-dash"/>`;
}

/**
 * The day around the heat pump, on the dial Power Origin uses: the hour angle starts
 * at the bottom, so the day climbs the left side to noon at the top and falls down the
 * right. It reads as the sun's path, which is why the sun stands at the top and the
 * moon at the bottom, and why the hours of daylight arc over the dial by themselves.
 */
export interface DialSegment { from: number; to: number; tone: string }

export function dial(cx: number, cy: number, r: number, o: {
  segments: DialSegment[];
  now?: number;
  sun?: [number, number];
  tone: Tone;
}) {
  const at = (rr: number, h: number) => {
    const a = ((90 + h * 15) * Math.PI) / 180;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const;
  };
  const arc = (rr: number, h0: number, h1: number) => {
    const [x0, y0] = at(rr, h0);
    const [x1, y1] = at(rr, Math.min(h1, h0 + 23.99));
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rr} ${rr} 0 ${h1 - h0 > 12 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const rMark = r + 9;

  const ticks = [6, 18].map((h) => {
    const [ax, ay] = at(r - 4.5, h);
    const [bx, by] = at(r + 4.5, h);
    return svg`<line x1=${ax.toFixed(1)} y1=${ay.toFixed(1)} x2=${bx.toFixed(1)} y2=${by.toFixed(1)}
      stroke=${o.tone.hairline} stroke-width="1.2"/>`;
  });

  // The arc breaks at noon so the sun stands in the gap, not on the line.
  const daylight = o.sun
    ? svg`<path d=${arc(rMark, o.sun[0], 10.85)} fill="none" stroke=${o.tone.sun} stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>
        <path d=${arc(rMark, 13.15, o.sun[1])} fill="none" stroke=${o.tone.sun} stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>`
    : nothing;

  const [sx, sy] = at(rMark, 12);
  const [mx, my] = at(rMark, 0);
  const rays = Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    return svg`<line x1=${(sx + Math.cos(a) * 3.9).toFixed(1)} y1=${(sy + Math.sin(a) * 3.9).toFixed(1)}
      x2=${(sx + Math.cos(a) * 5.3).toFixed(1)} y2=${(sy + Math.sin(a) * 5.3).toFixed(1)}
      stroke=${o.tone.sun} stroke-width="1.2" stroke-linecap="round"/>`;
  });

  const hand = o.now === undefined ? nothing : (() => {
    const [x0, y0] = at(r - 5, o.now);
    const [x1, y1] = at(r + 5, o.now);
    return svg`<line x1=${x0.toFixed(1)} y1=${y0.toFixed(1)} x2=${x1.toFixed(1)} y2=${y1.toFixed(1)}
      stroke=${o.tone.ink} stroke-width="2.2" stroke-linecap="round"/>`;
  })();

  return svg`
    <circle cx=${cx} cy=${cy} r=${r} fill="none" stroke=${o.tone.track} stroke-width="3"/>
    ${ticks}${daylight}
    <circle cx=${sx.toFixed(1)} cy=${sy.toFixed(1)} r="2.4" fill=${o.tone.sun}/>${rays}
    <path d=${`M${(mx + 1.2).toFixed(1)} ${(my - 3).toFixed(1)} a3.1 3.1 0 1 0 0 6 a3.8 3.8 0 0 1 0 -6 Z`} fill=${o.tone.muted}/>
    ${o.segments.map((s) => svg`<path d=${arc(r, s.from, s.to)} fill="none" stroke=${s.tone} stroke-width="3.6" stroke-linecap="round"/>`)}
    ${hand}`;
}
