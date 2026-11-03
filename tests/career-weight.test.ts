/**
 * Career weight data for the UI: the Pair's combined weight with a light / ideal / heavy hint (ideal about 110-130 kg),
 * the weight shown for each Partner offer, and the note for a player who has outgrown the Optimist (above about 50 kg).
 * Pure; no text.
 */
import { describe, expect, it } from "vitest";
import { startCareer } from "../src/career/Career";
import { outgrownOptimist, pairWeightHint, playerKgNow } from "../src/career/Weight";
import { partnerOffers } from "../src/career/SeasonClose";
import { BUILD_FACTOR, bodyWeightKg } from "../src/sailors/BodyWeight";

describe("Pair weight hint", () => {
  it("is ideal from 110 to 130 kg, light below and heavy above", () => {
    expect(pairWeightHint(109)).toBe("light");
    expect(pairWeightHint(110)).toBe("ideal");
    expect(pairWeightHint(120)).toBe("ideal");
    expect(pairWeightHint(130)).toBe("ideal");
    expect(pairWeightHint(131)).toBe("heavy");
  });
});

describe("outgrown the Optimist", () => {
  it("is true only above 50 kg", () => {
    expect(outgrownOptimist(50)).toBe(false);
    expect(outgrownOptimist(50.5)).toBe(true);
    expect(outgrownOptimist(35)).toBe(false);
  });
  it("follows the player's age and Build", () => {
    // average at 14 (age 12 in Season 3) is 52 kg; at 11 it is 42 kg; a heavy 11-year-old is 48.3 kg
    expect(outgrownOptimist(playerKgNow({ ...startCareer({ seed: 1, startingAge: 12 }), season: 3 }))).toBe(true);
    expect(outgrownOptimist(playerKgNow(startCareer({ seed: 1, startingAge: 11 })))).toBe(false);
    expect(playerKgNow({ ...startCareer({ seed: 1, startingAge: 11 }), build: "heavy" })).toBeCloseTo(42 * BUILD_FACTOR.heavy, 5);
  });
});

describe("Partner offers carry weights", () => {
  it("give the Partner's weight next Season, the Pair's, and the hint", () => {
    const state = { ...startCareer({ seed: 5, startingAge: 11 }), build: "average" as const };
    // the offers are for next Season, when the player is 12
    const me = bodyWeightKg(12);
    const offers = partnerOffers(withAllRaced(state));
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.pairKg).toBeCloseTo(me + o.kg, 5);
      expect(o.hint).toBe(pairWeightHint(o.pairKg));
      expect(o.kg).toBeGreaterThan(25);
    }
  });
});

/** A state whose Season raced against every pool sailor, so each is on offer. */
function withAllRaced(state: ReturnType<typeof startCareer>) {
  return { ...state, results: [[state.pool.map(s => ({ id: s.id })) as never]] as never };
}
