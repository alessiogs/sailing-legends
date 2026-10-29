/**
 * Starting a Career: a pure operation giving Season 1 at the chosen age, in the Optimist, at the first Regatta with
 * nothing sailed. Expected values are written out by hand.
 */
import { describe, expect, it } from "vitest";
import { ageInSeason } from "../src/career/Ages";
import { startCareer } from "../src/career/Career";
import { CAREER_VERSION } from "../src/career/CareerSave";

describe("start a Career", () => {
  it("yields Season 1 at the chosen age, in the Optimist, before the first Race", () => {
    const state = startCareer({ seed: 77, startingAge: 12 });
    expect(state).toEqual({
      version: CAREER_VERSION, seed: 77, startingAge: 12, season: 1,
      classId: "optimist", regattaIndex: 0, results: [[]],
    });
    expect(ageInSeason(state.startingAge, state.season)).toBe(12);
  });
  it("starts at age 10 when no age is chosen", () => {
    expect(startCareer({ seed: 1 }).startingAge).toBe(10);
  });
  it("accepts every age from 8 to 12", () => {
    for (const age of [8, 9, 10, 11, 12]) expect(startCareer({ seed: 1, startingAge: age }).startingAge).toBe(age);
  });
  it("refuses an age outside 8..12 or a seed that is not a whole number from 0", () => {
    expect(() => startCareer({ seed: 1, startingAge: 7 })).toThrow();
    expect(() => startCareer({ seed: 1, startingAge: 13 })).toThrow();
    expect(() => startCareer({ seed: 1, startingAge: 10.5 })).toThrow();
    expect(() => startCareer({ seed: -1 })).toThrow();
    expect(() => startCareer({ seed: 1.5 })).toThrow();
  });
  it("is pure: the same input gives equal, separate states", () => {
    const a = startCareer({ seed: 5 });
    const b = startCareer({ seed: 5 });
    expect(a).toEqual(b);
    a.results[0].push([]);
    expect(b.results).toEqual([[]]);
  });
});
