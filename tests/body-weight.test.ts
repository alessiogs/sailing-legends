/**
 * Body weight: kg from age and build. Expected values are the spec's, written out by hand.
 */
import { describe, expect, it } from "vitest";
import {
  BUILD_FACTOR,
  bodyWeightKg,
  buildFactorOf,
} from "../src/sailors/BodyWeight";

describe("bodyWeightKg", () => {
  it("follows the age curve for an average build", () => {
    expect(bodyWeightKg(8, 1)).toBe(30);
    expect(bodyWeightKg(11, 1)).toBe(42);
    expect(bodyWeightKg(14, 1)).toBe(52);
    expect(bodyWeightKg(16, 1)).toBe(60);
  });
  it("interpolates between the points and is flat outside them", () => {
    expect(bodyWeightKg(12.5, 1)).toBeCloseTo(47, 5);
    expect(bodyWeightKg(5, 1)).toBe(30);
    expect(bodyWeightKg(30, 1)).toBe(60);
  });
  it("scales with the build factor", () => {
    expect(bodyWeightKg(16, 1.15)).toBeCloseTo(69, 5);
    expect(bodyWeightKg(16, 0.85)).toBeCloseTo(51, 5);
  });
});

describe("builds", () => {
  it("the player's three builds span 0.85 to 1.15", () => {
    expect(BUILD_FACTOR).toEqual({ light: 0.85, average: 1, heavy: 1.15 });
  });
  it("an AI sailor's build comes from the id, within range and always the same", () => {
    const f = buildFactorOf("luca");
    expect(f).toBe(buildFactorOf("luca"));
    for (const id of [
      "luca",
      "giulia",
      "marco",
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]) {
      expect(buildFactorOf(id)).toBeGreaterThanOrEqual(0.85);
      expect(buildFactorOf(id)).toBeLessThanOrEqual(1.15);
    }
    expect(
      new Set(["s1", "s2", "s3", "s4", "s5"].map(buildFactorOf)).size,
    ).toBeGreaterThan(1);
  });
});
