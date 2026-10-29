/**
 * Crew Chemistry in a Career: the starting value of a Pair, the change after a 420 Regatta and its caps, the Partner as
 * the race sees them. Expected values are worked out by hand from the formula (half bond, a quarter technique, a quarter
 * reliability).
 */
import { describe, expect, it } from "vitest";
import { nextRaceSetup, startCareer } from "../src/career/Career";
import type { CareerState } from "../src/career/CareerSave";
import {
  chemistryChange, CHEMISTRY_CAP, CHEMISTRY_FLOOR, expectedPlace, moveChemistry, partnerProfile, startingChemistry,
} from "../src/career/Chemistry";
import { recordRace } from "../src/career/RecordRace";
import { crewChemistry, RIVALS } from "../src/sailors/Sailors";

const giulia = RIVALS[1];

describe("starting Chemistry", () => {
  it("is today's formula with no Seasons together", () => {
    expect(startingChemistry(giulia, 0)).toBe(crewChemistry(giulia));
    expect(startingChemistry(giulia, 0)).toBe(88);
  });
  it("rises with the Seasons raced together, through the bond", () => {
    expect(startingChemistry(giulia, 1)).toBe(91);
    expect(startingChemistry(giulia, 2)).toBe(93);
  });
  it("never goes over 100, and a sailor with no shared history starts from the default bond", () => {
    expect(startingChemistry({ ...giulia, bond: 98 }, 5)).toBe(crewChemistry({ ...giulia, bond: 100 }));
    expect(startingChemistry({ ...giulia, bond: undefined }, 0)).toBe(crewChemistry({ ...giulia, bond: 60 }));
  });
});

describe("the change after a Regatta", () => {
  it("is 0 on the expected place, +3 a place better and -2 a place worse", () => {
    expect(chemistryChange(4, 4)).toBe(0);
    expect(chemistryChange(3, 4)).toBe(3);
    expect(chemistryChange(5, 4)).toBe(-2);
  });
  it("is capped at +5 and -5 per Regatta", () => {
    expect(chemistryChange(1, 8)).toBe(CHEMISTRY_CAP);
    expect(chemistryChange(12, 2)).toBe(-CHEMISTRY_CAP);
    expect(chemistryChange(2, 4)).toBe(5);
    expect(chemistryChange(7, 4)).toBe(-5);
  });
  it("never takes Chemistry below the floor of 20, nor over 100", () => {
    expect(moveChemistry(21, -5)).toBe(CHEMISTRY_FLOOR);
    expect(moveChemistry(20, -5)).toBe(20);
    expect(moveChemistry(98, 5)).toBe(100);
    expect(moveChemistry(60, 3)).toBe(63);
  });
  it("leaves a Pair that already starts under the floor where it is", () => {
    expect(moveChemistry(15, -5)).toBe(15);
    expect(moveChemistry(15, 3)).toBe(18);
  });
  it("expects a place behind each boat rated above the Pair (Partner and player together)", () => {
    expect(expectedPlace(0.9, [0.5, 0.6, 0.8])).toBe(2);
    expect(expectedPlace(0.5, [0.3, 0.6, 0.8])).toBe(3);
    expect(expectedPlace(0.5, [])).toBe(1);
  });
});

/** A 420 Career at its first Regatta with Giulia as Partner, and a Race where the player takes `place`. */
function career420(chemistry: number): CareerState {
  return { ...startCareer({ seed: 3 }), classId: "420", partnerId: "giulia", chemistry };
}
function race(state: CareerState, place: number) {
  const others = state.pool.filter(s => s.id !== "giulia").slice(0, 5).map(s => s.id);
  const ids = [...others.slice(0, place - 1), "player", ...others.slice(place - 1)];
  return ids.map((id, i) => ({ id, status: "finished" as const, place: i + 1 }));
}
const sail = (state: CareerState, place: number) => [0, 1, 2].reduce(s => recordRace(s, race(s, place)), state);

describe("a 420 Regatta moves the Pair's Chemistry", () => {
  it("only when the Regatta's last Race is recorded", () => {
    const s = recordRace(recordRace(career420(70), race(career420(70), 1)), race(career420(70), 1));
    expect(s.chemistry).toBe(70);
  });
  it("up when the Pair wins a fleet it was not expected to, within the cap", () => {
    const after = sail(career420(70), 1);
    expect(after.chemistry).toBeGreaterThan(70);
    expect(after.chemistry! - 70).toBeLessThanOrEqual(CHEMISTRY_CAP);
    expect(after.regattaIndex).toBe(1);
  });
  it("down when the Pair finishes last, within the cap and above the floor", () => {
    const after = sail(career420(70), 6);
    expect(after.chemistry).toBeLessThan(70);
    expect(70 - after.chemistry!).toBeLessThanOrEqual(CHEMISTRY_CAP);
    expect(sail(career420(21), 6).chemistry).toBe(CHEMISTRY_FLOOR);
  });
  it("does nothing in the Optimist", () => {
    const optimist = startCareer({ seed: 3 });
    expect(sail(optimist, 1).chemistry).toBeNull();
  });
});

describe("the Partner as the race sees them", () => {
  it("has the Pair's Chemistry as their Crew Chemistry", () => {
    for (const chemistry of [30, 64, 90]) {
      const p = partnerProfile(career420(chemistry))!;
      expect(p.id).toBe("giulia");
      expect(Math.abs(crewChemistry(p) - chemistry)).toBeLessThanOrEqual(1);
    }
  });
  it("is nobody in the Optimist", () => {
    expect(partnerProfile(startCareer({ seed: 3 }))).toBeUndefined();
  });
});

describe("the next Race of a 420 Season", () => {
  it("sails with the Career's Partner, at the Pair's Chemistry, in the player's Role", () => {
    const base = career420(55);
    const ada = base.pool.find(s => !RIVALS.some(r => r.id === s.id))!.id;
    const state: CareerState = { ...base, partnerId: ada, choice: { role: "crew", control: "playerCareer" } };
    const fleet = nextRaceSetup(state)!.fleet;
    expect(fleet.partner?.id).toBe(ada);
    expect(Math.abs(crewChemistry(fleet.partner!) - 55)).toBeLessThanOrEqual(1);
    expect(fleet.choice).toEqual({ role: "crew", control: "playerCareer" });
    expect(fleet.opponents.some(o => o.helm.id === ada || o.crew?.id === ada)).toBe(false);
  });
});
