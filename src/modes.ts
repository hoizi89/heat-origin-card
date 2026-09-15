import type { ModeKind, ModeWords } from "./types";

/**
 * Every integration words the same four activities differently. The defaults
 * cover Lambda's Modbus words and the plain English and German ones; anything
 * else is added per card under `modes:`.
 */
export const DEFAULT_MODE_WORDS: Required<ModeWords> = {
  heating: ["CH", "heating", "heat", "heizen", "heizbetrieb"],
  hot_water: ["DHW", "hot_water", "hot water", "warmwasser", "domestic_hot_water"],
  cooling: ["CC", "cooling", "cool", "kühlen", "kühlbetrieb"],
  defrost: ["DEFROST", "defrosting", "abtauen"],
  blocked: ["TIME-BLOCK", "RESTART-BLOCK", "RELEASE-BLOCK", "MINTEMP-BLOCK", "blocked", "sperrzeit"],
  // Lambda reports an info message for a few seconds in the middle of a run; the recorder
  // writes unknown for a moment after a restart. Neither is the heat pump stopping.
  ignore: ["INFO-MESSAGE", "unknown", "unavailable"]
};

const ORDER: Array<Exclude<ModeKind, "idle">> = ["hot_water", "heating", "cooling", "defrost", "blocked"];

export function isIgnored(state: string | undefined, words: Required<ModeWords>): boolean {
  if (state === undefined) return false;
  const s = norm(state);
  return words.ignore.some((w) => norm(w) === s);
}

const norm = (word: string) => word.trim().toLowerCase();

/** Configured words extend the defaults; they never replace them. */
export function resolveModes(words: ModeWords | undefined): Required<ModeWords> {
  const out = {} as Required<ModeWords>;
  for (const kind of ORDER) {
    out[kind] = [...DEFAULT_MODE_WORDS[kind], ...(words?.[kind] ?? [])];
  }
  out.ignore = [...DEFAULT_MODE_WORDS.ignore, ...(words?.ignore ?? [])];
  return out;
}

export function classify(state: string | undefined, words: Required<ModeWords>): ModeKind {
  if (state === undefined) return "idle";
  const s = norm(state);
  for (const kind of ORDER) {
    if (words[kind].some((w) => norm(w) === s)) return kind;
  }
  return "idle";
}

/** Heat moves in these; a block or standby is not a run. */
export function isRunning(kind: ModeKind): boolean {
  return kind === "heating" || kind === "hot_water" || kind === "cooling" || kind === "defrost";
}

/** Words of a circuit's own state that mean it is taking heat (or cold). */
export const DEFAULT_CIRCUIT_ACTIVE = ["HEATING", "ECO", "COOLING", "FROST", "FLOOR-DRY", "MAX-TEMP", "heating", "cooling", "on"];

export function circuitActive(state: string | undefined, active: string[] | undefined): boolean {
  if (!state) return false;
  const s = norm(state);
  return (active ?? DEFAULT_CIRCUIT_ACTIVE).some((w) => norm(w) === s);
}

/**
 * Known raw words turned into something a person says. Keys are lower case;
 * the table is looked up in the card's language, unknown words are shown
 * tidied but untranslated.
 */
export const WORD_LABELS: Record<string, Record<string, string>> = {
  en: {
    stby: "Ready", ch: "Heating", dhw: "Hot water", cc: "Cooling", defrost: "Defrosting",
    "time-block": "Blocked by schedule", "restart-block": "Restart lock", "release-block": "Not released",
    "mintemp-block": "Too cold to start", off: "Off", error: "Fault", frost: "Frost protection",
    heating: "Heating", eco: "Eco", cooling: "Cooling", "ch-summer": "Summer", "cc-winter": "Winter",
    "prio-stop": "Hot water first", "release-off": "Not released", "time-off": "Off by schedule",
    "stby-heating": "Ready", "stby-eco": "Ready", "stby-cooling": "Ready", "stby-frost": "Ready",
    summer: "Summer", holiday: "Holiday", circulate: "Circulating", "floor-dry": "Screed drying"
  },
  de: {
    stby: "Bereit", ch: "Heizen", dhw: "Warmwasser", cc: "Kühlen", defrost: "Abtauen",
    "time-block": "Sperrzeit", "restart-block": "Wiederanlaufsperre", "release-block": "Nicht freigegeben",
    "mintemp-block": "Zu kalt zum Start", off: "Aus", error: "Störung", frost: "Frostschutz",
    heating: "Heizt", eco: "Eco", cooling: "Kühlt", "ch-summer": "Sommer", "cc-winter": "Winter",
    "prio-stop": "Vorrang Warmwasser", "release-off": "Nicht freigegeben", "time-off": "Zeitprogramm aus",
    "stby-heating": "Bereit", "stby-eco": "Bereit", "stby-cooling": "Bereit", "stby-frost": "Bereit",
    summer: "Sommer", holiday: "Urlaub", circulate: "Umwälzen", "floor-dry": "Estrichtrocknung"
  }
};

/** Shorter words for tight boxes; anything longer is cut with an ellipsis. */
const SHORT: Record<string, Record<string, string>> = {
  en: { "prio-stop": "HW first", "release-off": "Not released", "time-off": "Scheduled off", "stby-heating": "Ready" },
  de: { "prio-stop": "Vorrang", "release-off": "Gesperrt", "time-off": "Zeit aus", "mintemp-block": "Zu kalt" }
};

export function shortWordLabel(state: string | undefined, locale: string, max: number): string {
  const lang = locale.split("-")[0];
  const short = state ? (SHORT[lang] ?? SHORT.en)[norm(state)] : undefined;
  const text = short ?? wordLabel(state, locale);
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

export function wordLabel(state: string | undefined, locale: string): string {
  if (!state) return "–";
  const table = WORD_LABELS[locale.split("-")[0]] ?? WORD_LABELS.en;
  const hit = table[norm(state)];
  if (hit) return hit;
  const tidy = state.replace(/[_-]+/g, " ").toLowerCase();
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}
