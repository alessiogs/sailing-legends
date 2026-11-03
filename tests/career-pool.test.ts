/**
 * The Career's sailor pool: the named Rivals plus seeded generated sailors, matched by id. Same seed, same pool.
 */
import { describe, expect, it } from "vitest";
import { ageInSeason } from "../src/career/Ages";
import { generatePool, sailorRating } from "../src/career/Pool";
import { rivalStartRating } from "../src/career/Strength";
import { CREWS, EXTRA_HELM, RIVALS } from "../src/sailors/Sailors";

const ATTRIBUTES = ["technique", "tactics", "speed", "discipline"] as const;

describe("sailor pool", () => {
  const pool = generatePool(2024, 10);

  it("is the same for the same seed and age, and differs with the seed", () => {
    expect(generatePool(2024, 10)).toEqual(pool);
    expect(generatePool(2025, 10).map(s => s.name)).not.toEqual(pool.map(s => s.name));
  });

  it("starts with the three Rivals in character but as talented kids of their age", () => {
    pool.slice(0, 3).forEach((r, i) => {
      const adult = RIVALS[i];
      expect(r.id).toBe(adult.id);
      expect(sailorRating(r)).toBeCloseTo(rivalStartRating(r.startingAge), 1);
      // The same shape: each attribute moved by the same amount.
      expect(r.tactics - r.speed).toBeCloseTo(adult.tactics - adult.speed, 1);
    });
  });

  it("adds 27 generated sailors with Italian names that no roster sailor has, and unique ids", () => {
    const generated = pool.slice(3);
    expect(generated.length).toBe(27);
    const taken = [...RIVALS, ...CREWS, EXTRA_HELM].flatMap(s => [s.id, s.name.toLowerCase()]);
    for (const s of generated) {
      expect(s.name).toMatch(/^[A-Z][a-z]+$/);
      expect(s.id).toBe(s.name.toLowerCase());
      expect(taken.includes(s.id)).toBe(false);
    }
    expect(new Set(pool.map(s => s.id)).size).toBe(30);
    expect(new Set(pool.map(s => s.name)).size).toBe(30);
  });

  it("keeps every attribute within 0..1 and gives generated sailors no shared history yet", () => {
    for (const s of pool) for (const a of ATTRIBUTES) {
      expect(s[a]).toBeGreaterThanOrEqual(0);
      expect(s[a]).toBeLessThanOrEqual(1);
    }
    expect(pool.slice(3).every(s => s.bond === undefined)).toBe(true);
  });

  it("draws sailors of every level, from club to international", () => {
    const ratings = pool.slice(3).map(sailorRating);
    expect(Math.min(...ratings)).toBeLessThan(0.45);
    expect(Math.max(...ratings)).toBeGreaterThan(0.65);
  });

  it("puts every sailor within two years of the player's age", () => {
    for (const age of [8, 10, 12]) {
      for (const s of generatePool(7, age)) {
        expect(Math.abs(s.startingAge - age)).toBeLessThanOrEqual(2);
        expect(s.startingAge).toBeGreaterThanOrEqual(7);
      }
    }
    const first = generatePool(7, 8)[0];
    expect(ageInSeason(first.startingAge, 3)).toBe(first.startingAge + 2);
  });
});
