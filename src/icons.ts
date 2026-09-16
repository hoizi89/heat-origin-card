import { svg, type SVGTemplateResult } from "lit";

/**
 * One symbol per kind of store and circuit, drawn on a 16×16 field. A symbol says
 * what a box is in less room than its name, which leaves the box a line for the
 * figures that change. Everything is stroked, so one colour dresses the whole set.
 */
export type IconName = "floor" | "radiator" | "fancoil" | "pipe" | "water" | "buffer" | "loop" | "flame";

const PATHS: Record<IconName, (tone: string) => SVGTemplateResult> = {
  // Screed over a serpentine loop: what underfloor heating looks like in section.
  floor: (t) => svg`
    <path d="M1 2.6 H15" stroke=${t} stroke-width="1.7" stroke-linecap="round"/>
    <path d="M2.6 6.2 H11.6 A2.1 2.1 0 0 1 11.6 10.4 H4.4 A2.1 2.1 0 0 0 4.4 14.6 H13.6"
      fill="none" stroke=${t} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  radiator: (t) => svg`
    <rect x="2" y="2.8" width="12" height="9.4" rx="1.6" fill="none" stroke=${t} stroke-width="1.6"/>
    <path d="M5.2 4.6 V10.4 M8 4.6 V10.4 M10.8 4.6 V10.4" stroke=${t} stroke-width="1.4" stroke-linecap="round"/>
    <path d="M4 12.2 V14.4 M12 12.2 V14.4" stroke=${t} stroke-width="1.5" stroke-linecap="round"/>`,
  fancoil: (t) => svg`
    <rect x="1.2" y="4" width="8.6" height="8.2" rx="1.5" fill="none" stroke=${t} stroke-width="1.6"/>
    <path d="M4 5.6 V10.6 M7 5.6 V10.6" stroke=${t} stroke-width="1.4" stroke-linecap="round"/>
    <path d="M11.8 5.6 q2.2 2.5 0 5 M14.2 4.2 q3.2 3.9 0 7.8" fill="none" stroke=${t} stroke-width="1.4" stroke-linecap="round"/>`,
  pipe: (t) => svg`
    <path d="M1.5 11 H5.5 A3 3 0 0 0 5.5 5 H10.5 A3 3 0 0 1 10.5 11 H14.5"
      fill="none" stroke=${t} stroke-width="1.6" stroke-linecap="round"/>`,
  water: (t) => svg`
    <path d="M8 1.4 C11.4 5.9, 12.9 8.4, 12.9 11.1 A4.9 4.9 0 0 1 3.1 11.1 C3.1 8.4, 4.6 5.9, 8 1.4 Z"
      fill="none" stroke=${t} stroke-width="1.7" stroke-linejoin="round"/>`,
  // A tall tank with rounded ends and its layering drawn in.
  buffer: (t) => svg`
    <rect x="3.4" y="1.6" width="9.2" height="12.8" rx="3.4" fill="none" stroke=${t} stroke-width="1.6"/>
    <path d="M4.2 6.2 H11.8 M4.2 9.6 H11.8" stroke=${t} stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>
    <path d="M8 14.4 V15.2" stroke=${t} stroke-width="1.5" stroke-linecap="round"/>`,
  loop: (t) => svg`
    <path d="M4 8 A4 4 0 1 1 8 12" fill="none" stroke=${t} stroke-width="1.6" stroke-linecap="round"/>
    <path d="M5.4 12 H8 V9.4" fill="none" stroke=${t} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  flame: (t) => svg`
    <path d="M6.4 14.6 C2.6 12.4, 4.4 8.6, 5.6 4.2 C7.8 6.4, 8.4 8, 8.4 9.4 C9.2 7.6, 10 6.2, 10 4 C13.2 7.2, 14 11.2, 10.6 14.6 Z"
      fill="none" stroke=${t} stroke-width="1.6" stroke-linejoin="round"/>`
};

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function isIconName(value: string | undefined): value is IconName {
  return value !== undefined && value in PATHS;
}

/** The symbol placed at x, y in the surrounding drawing's own coordinates. */
export function icon(name: IconName, x: number, y: number, tone: string, scale = 1) {
  return svg`<g transform="translate(${x} ${y}) scale(${scale})">${PATHS[name](tone)}</g>`;
}

/** The same symbol as a standalone element, for a foot line or a form. */
export function glyph(name: IconName, tone: string, size: number) {
  return svg`<svg viewBox="0 0 16 16" width=${size} height=${size} aria-hidden="true">${PATHS[name](tone)}</svg>`;
}

const ROOM_WORDS: Array<[RegExp, IconName]> = [
  [/fu(ss|ß)boden|fbh|underfloor|floor|estrich/i, "floor"],
  [/heizk(ö|oe)rper|radiator|hk\b/i, "radiator"],
  [/gebl(ä|ae)se|konvektor|fan.?coil|ventilator/i, "fancoil"],
  [/zirkulation|circulation/i, "loop"]
];

/** What a circuit is, guessed from its name, so nobody has to write `icon:` by hand. */
export function guessCircuitIcon(name: string): IconName {
  for (const [re, found] of ROOM_WORDS) if (re.test(name)) return found;
  return "pipe";
}

export function guessStoreIcon(kind: "hot_water" | "buffer"): IconName {
  return kind === "hot_water" ? "water" : "buffer";
}

/**
 * The floor a name ends in — "FBH EG" is the ground floor, "Heizkörper OG" the upper
 * one. Two or three capitals at the end are a storey, not a word; anything else gives
 * the first letters instead, so every box carries some mark of its own.
 */
export function guessShort(name: string): string {
  const tail = name.trim().split(/\s+/).pop() ?? "";
  if (/^[A-ZÄÖÜ]{2,3}$/.test(tail)) return tail;
  const words = name.trim().split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}
