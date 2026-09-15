import { describe, expect, it } from "vitest";
import { circuitActive, classify, resolveModes, wordLabel } from "../src/modes";

describe("state words", () => {
  const words = resolveModes({ heating: ["Heizbetrieb läuft"] });

  it("classifies Lambda's words and plain ones, ignoring case", () => {
    expect(classify("CH", words)).toBe("heating");
    expect(classify("dhw", words)).toBe("hot_water");
    expect(classify("TIME-BLOCK", words)).toBe("blocked");
    expect(classify("STBY", words)).toBe("idle");
    expect(classify("Heizbetrieb läuft", words)).toBe("heating");
    expect(classify(undefined, words)).toBe("idle");
  });

  it("keeps the defaults when words are added", () => {
    expect(words.heating).toContain("CH");
  });

  it("knows when a circuit takes heat", () => {
    expect(circuitActive("HEATING", undefined)).toBe(true);
    expect(circuitActive("CH-SUMMER", undefined)).toBe(false);
    expect(circuitActive("PRIO-STOP", undefined)).toBe(false);
    expect(circuitActive("läuft", ["läuft"])).toBe(true);
  });

  it("says the words the way people do", () => {
    expect(wordLabel("CH-SUMMER", "de")).toBe("Sommer");
    expect(wordLabel("PRIO-STOP", "de-AT")).toBe("Vorrang Warmwasser");
    expect(wordLabel("OFF", "en")).toBe("Off");
    expect(wordLabel("SOME_NEW-WORD", "de")).toBe("Some new word");
  });
});
