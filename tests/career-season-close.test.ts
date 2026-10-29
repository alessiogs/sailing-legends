/**
 * Closing a Season, ageing and growth part: the Season advances, the Regatta index and results reset, every pool
 * sailor grows along a seeded age curve shaped by personality. Pure; no text.
 */
import { describe, expect, it } from "vitest";
import { ageInSeason } from "../src/career/Ages";
import { startCareer } from "../src/career/Career";
import type { CareerState } from "../src/career/CareerSave";
import { startingChemistry } from "../src/career/Chemistry";
import { closeSeason, partnerCandidates, startNextSeason } from "../src/career/SeasonClose";

describe("close a Season", () => {
  it("advances the Season and starts the next one at the first Regatta with nothing sailed", () => {
    const sailed = { ...startCareer({ seed: 9 }), regattaIndex: 3, results: [[], [], [], []] };
    const next = closeSeason(sailed);
    expect(next.season).toBe(2);
    expect(next.regattaIndex).toBe(0);
    expect(next.results).toEqual([[]]);
    expect(next.classId).toBe("optimist");
    expect(next.seed).toBe(9);
  });
  it("does not change the state it is given", () => {
    const state = startCareer({ seed: 9 });
    const before = JSON.stringify(state);
    closeSeason(state);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("makes the player and every pool sailor a year older", () => {
    const state = startCareer({ seed: 4, startingAge: 9 });
    const next = closeSeason(state);
    expect(ageInSeason(next.startingAge, next.season)).toBe(10);
    for (const s of next.pool) {
      expect(ageInSeason(s.startingAge, next.season)).toBe(ageInSeason(s.startingAge, state.season) + 1);
    }
  });
});

const ATTRS = ["technique", "tactics", "speed", "discipline"] as const;
const sailor = (state: CareerState, id: string) => state.pool.find(s => s.id === id)!;
const seeds = Array.from({ length: 60 }, (_, i) => i);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => mean(xs.map(x => (x - mean(xs)) ** 2));
/** The change of one attribute of a sailor over one Season, for each seed. */
const gains = (id: string, attr: (typeof ATTRS)[number]) =>
  seeds.map(seed => {
    const s = startCareer({ seed });
    return sailor(closeSeason(s), id)[attr] - sailor(s, id)[attr];
  });

describe("Rival growth between Seasons", () => {
  it("is deterministic from the Career seed", () => {
    const state = startCareer({ seed: 31 });
    expect(closeSeason(state)).toEqual(closeSeason(startCareer({ seed: 31 })));
    expect(closeSeason(state).pool).not.toEqual(closeSeason(startCareer({ seed: 32 })).pool);
  });
  it("changes only the attributes: id, name, bond and starting age stay", () => {
    const state = startCareer({ seed: 5 });
    const attributes = (s: object) => Object.fromEntries(Object.entries(s).filter(([k]) => !(ATTRS as readonly string[]).includes(k)));
    closeSeason(state).pool.forEach((s, i) => expect(attributes(s)).toEqual(attributes(state.pool[i])));
  });
  it("keeps every attribute within 0..1 over a whole career, whoever it is", () => {
    for (const seed of [0, 1, 2, 3]) {
      let state = startCareer({ seed, startingAge: 8 });
      for (let i = 0; i < 15; i++) {
        state = closeSeason(state);
        for (const s of state.pool) for (const a of ATTRS) {
          expect(s[a]).toBeGreaterThanOrEqual(0);
          expect(s[a]).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it("lets Marco gain speed fast and erratically, Giulia steadily", () => {
    expect(mean(gains("marco", "speed"))).toBeGreaterThan(mean(gains("giulia", "speed")));
    expect(variance(gains("marco", "speed"))).toBeGreaterThan(3 * variance(gains("giulia", "speed")));
  });
  it("lets Giulia improve a little in every attribute, every time", () => {
    for (const a of ATTRS) for (const g of gains("giulia", a)) expect(g).toBeGreaterThan(0);
  });
  it("lets Luca improve in tactics most of all", () => {
    const tactics = mean(gains("luca", "tactics"));
    for (const a of ["technique", "speed", "discipline"] as const) expect(tactics).toBeGreaterThan(mean(gains("luca", a)));
  });
  it("pins Marco and Luca over three Seasons (seed 1, starting age 10)", () => {
    // Values recorded from the first run once they looked right: Marco's speed climbs unevenly towards the cap while
    // the rest of him barely moves; Luca's tactics climb fastest and reach the cap.
    const states = [startCareer({ seed: 1 })];
    for (let i = 0; i < 3; i++) states.push(closeSeason(states[i]));
    const marco = states.map(st => sailor(st, "marco"));
    const luca = states.map(st => sailor(st, "luca"));
    expect(marco.map(m => m.speed)).toEqual([0.95, 0.965, 0.967, 0.984]);
    expect(marco.map(m => m.technique)).toEqual([0.81, 0.826, 0.824, 0.826]);
    expect(marco.map(m => m.tactics)).toEqual([0.6, 0.611, 0.619, 0.633]);
    expect(marco.map(m => m.discipline)).toEqual([0.62, 0.634, 0.639, 0.648]);
    expect(luca.map(l => l.tactics)).toEqual([0.9, 0.93, 0.966, 0.99]);
  });
});

describe("the end-of-Season choice", () => {
  const entry = (id: string, place: number) => ({ id, status: "finished" as const, place });
  /** An Optimist Season over, raced against Luca and Ada only. */
  const sailed = (): CareerState => {
    const state = startCareer({ seed: 8 });
    const race = [entry("player", 1), entry("luca", 2), entry("ada", 3)];
    return { ...state, pool: [...state.pool.filter(s => s.id !== "ada"), { ...state.pool[3], id: "ada", name: "Ada" }], regattaIndex: 3, results: [[race], [race], [race], [race]] };
  };
  const helm = { role: "helm", control: "playerCareer" } as const;

  it("offers as Partners only the sailors raced against", () => {
    expect(partnerCandidates(sailed()).sort()).toEqual(["ada", "luca"]);
  });
  it("counts a Season raced together with each of them", () => {
    expect(closeSeason(sailed()).seasonsTogether).toEqual({ luca: 1, ada: 1 });
  });
  it("stays in the Optimist: no Partner, no Chemistry", () => {
    const next = startNextSeason(sailed(), { classId: "optimist" });
    expect(next.classId).toBe("optimist");
    expect(next.partnerId).toBeNull();
    expect(next.chemistry).toBeNull();
    expect(next.season).toBe(2);
  });
  it("moves to the 420 with the chosen Partner, Role and Control mode, Chemistry from the formula with the shared Season", () => {
    const state = sailed();
    const next = startNextSeason(state, { classId: "420", partnerId: "luca", choice: { role: "helm", control: "fullBoat" } });
    const luca = next.pool.find(s => s.id === "luca")!;
    expect(next.classId).toBe("420");
    expect(next.partnerId).toBe("luca");
    expect(next.choice).toEqual({ role: "helm", control: "fullBoat" });
    expect(next.chemistry).toBe(startingChemistry(luca, 1));
    expect(next.chemistry).toBeGreaterThan(startingChemistry(luca, 0));
    expect(next.season).toBe(2);
    expect(next.results).toEqual([[]]);
  });
  it("refuses a Partner not raced against, and the Optimist after the 420", () => {
    expect(() => startNextSeason(sailed(), { classId: "420", partnerId: "marco", choice: helm })).toThrow();
    const in420 = startNextSeason(sailed(), { classId: "420", partnerId: "luca", choice: helm });
    expect(() => startNextSeason(in420, { classId: "optimist" })).toThrow();
  });
  it("keeps the Chemistry of a Partner kept, and restarts it from the formula for a new one", () => {
    const in420 = { ...startNextSeason(sailed(), { classId: "420", partnerId: "luca", choice: helm }), chemistry: 41 };
    const kept = startNextSeason(in420, { classId: "420", partnerId: "luca", choice: { role: "crew", control: "playerCareer" } });
    expect(kept.chemistry).toBe(41);
    expect(kept.choice.role).toBe("crew");
    const raced = { ...in420, results: [[[entry("player", 1), entry("ada", 2)]]] };
    const changed = startNextSeason(raced, { classId: "420", partnerId: "ada", choice: helm });
    expect(changed.partnerId).toBe("ada");
    expect(changed.chemistry).toBe(startingChemistry(changed.pool.find(s => s.id === "ada")!, changed.seasonsTogether.ada));
  });
  it("does not change the state it is given", () => {
    const state = sailed();
    const before = JSON.stringify(state);
    startNextSeason(state, { classId: "420", partnerId: "ada", choice: helm });
    expect(JSON.stringify(state)).toBe(before);
  });
});
