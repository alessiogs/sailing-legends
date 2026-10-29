/**
 * Ages and the Age limit: a sailor's age follows the Season, and a class may cap the age that may race it. Nothing
 * is enforced in 0.5; the check only exists. Expected values are written out by hand.
 */
import { describe, expect, it } from "vitest";
import { ageInSeason, canRace } from "../src/career/Ages";

describe("canRace", () => {
  it("lets a 14 and a 15 year old race the Optimist, whose Age limit is 15", () => {
    expect(canRace(14, "optimist")).toBe(true);
    expect(canRace(15, "optimist")).toBe(true);
  });
  it("does not let a 16 year old race the Optimist", () => {
    expect(canRace(16, "optimist")).toBe(false);
  });
  it("has no Age limit in the 420", () => {
    expect(canRace(16, "420")).toBe(true);
    expect(canRace(40, "420")).toBe(true);
  });
});

describe("ageInSeason", () => {
  it("is the starting age plus the Seasons completed", () => {
    expect(ageInSeason(10, 1)).toBe(10);
    expect(ageInSeason(10, 2)).toBe(11);
    expect(ageInSeason(8, 6)).toBe(13);
  });
});
