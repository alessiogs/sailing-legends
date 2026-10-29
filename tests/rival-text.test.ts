/** The wording of Rival comparisons, in both languages. */
import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import type { RivalComparison } from "../src/career/Standings";
import { rivalLine } from "../src/ui/rivalText";

const cmp = (rivalAhead: boolean, gap: number): RivalComparison => ({ rivalId: "luca", rivalPlace: 1, playerPlace: 2, rivalAhead, gap });

describe("Rival line", () => {
  afterEach(() => setLanguage("it"));

  it("words it in Italian with plurals", () => {
    expect(rivalLine(cmp(true, 2), "Luca")).toBe("Luca ti ha battuto di 2 punti");
    expect(rivalLine(cmp(false, 1), "Luca")).toBe("Hai battuto Luca di 1 punto");
    expect(rivalLine(cmp(true, 0), "Luca")).toBe("Luca ti ha preceduto a pari punti");
    expect(rivalLine(cmp(false, 0), "Luca")).toBe("Hai preceduto Luca a pari punti");
  });

  it("words it in English with plurals", () => {
    setLanguage("en");
    expect(rivalLine(cmp(true, 2), "Luca")).toBe("Luca beat you by 2 points");
    expect(rivalLine(cmp(false, 1), "Luca")).toBe("You beat Luca by 1 point");
    expect(rivalLine(cmp(true, 0), "Luca")).toBe("Luca finished ahead of you on a tie-break");
  });
});
