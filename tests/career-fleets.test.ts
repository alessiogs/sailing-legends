/**
 * A Regatta's fleet is drawn from the pool by level, and the next Race's setup is fleet, wind and seed. Same seed,
 * same fleets. Expected sizes are the issue's: about 6 boats at club level up to about 12 at international.
 */
import { describe, expect, it } from "vitest";
import { nextRaceSetup, startCareer } from "../src/career/Career";
import type { CareerState } from "../src/career/CareerSave";
import { seasonCalendar } from "../src/career/Calendar";
import { sailorRating } from "../src/career/Pool";
import { CREW, HELM } from "../src/race/PlayerChoice";
import { RaceSession } from "../src/race/RaceSession";
import { RIVALS } from "../src/sailors/Sailors";

/** The Career at Regatta `i` of Season 1 with `races` Races of it sailed (the results' entries do not matter here). */
function at(i: number, races = 0, seed = 321): CareerState {
  const state = startCareer({ seed });
  const full = seasonCalendar("optimist").map(r => Array.from({ length: r.races }, () => [{ id: "player", status: "dnf" as const }]));
  return { ...state, regattaIndex: i, results: [...full.slice(0, i), full[i].slice(0, races)] };
}
/** The calendar index of the first club, Zonale, national and international Regattas. */
const LEVELS = [0, 1, 5, 6];
const setup = (i: number, races = 0, seed = 321) => nextRaceSetup(at(i, races, seed))!;
const helmIds = (i: number, races = 0, seed = 321) => setup(i, races, seed).fleet.opponents.map(b => b.helm.id);

describe("next Race setup", () => {
  it("is the Regatta's next Race: a fleet, a wind and a seed", () => {
    const s = setup(0);
    expect(s.regattaId).toBe("optimist-club");
    expect(s.raceIndex).toBe(0);
    expect(s.fleet.player?.id).toBe("player");
    expect(typeof s.windKn).toBe("number");
    expect(Number.isInteger(s.seed) && s.seed >= 0).toBe(true);
    expect(setup(0, 2).raceIndex).toBe(2);
  });

  it("is none once the Regatta's Races are all sailed", () => {
    expect(nextRaceSetup(at(1, 3))).toBe(null);
  });

  it("does not change the state", () => {
    const state = at(2, 1);
    const copy = JSON.stringify(state);
    nextRaceSetup(state);
    expect(JSON.stringify(state)).toBe(copy);
  });

  it("is the same for the same state, and another Career has another one", () => {
    expect(nextRaceSetup(at(3, 1))).toEqual(nextRaceSetup(at(3, 1)));
    expect(helmIds(3, 0, 322)).not.toEqual(helmIds(3, 0, 321));
  });

  it("varies the wind and the seed over the Races of a Regatta, within 6 and 16 knots", () => {
    for (let i = 0; i < 7; i++) {
      const races = Array.from({ length: seasonCalendar("optimist")[i].races }, (_, r) => setup(i, r));
      expect(new Set(races.map(r => r.windKn)).size).toBe(races.length);
      expect(new Set(races.map(r => r.seed)).size).toBe(races.length);
      for (const r of races) {
        expect(r.windKn).toBeGreaterThanOrEqual(6);
        expect(r.windKn).toBeLessThanOrEqual(16);
      }
    }
  });
});

describe("fleets by Regatta level", () => {
  it("grow from 6 boats at club level to 12 at international, the player included", () => {
    const sizes = LEVELS.map(i => 1 + setup(i).fleet.opponents.length);
    expect(sizes).toEqual([6, 8, 10, 12]);
  });

  it("always include the Rivals", () => {
    for (let i = 0; i < 7; i++) {
      const ids = helmIds(i);
      for (const r of RIVALS) expect(ids.includes(r.id), `${r.id} at Regatta ${i}`).toBe(true);
    }
  });

  it("stay the same over the Races of a Regatta, and use each sailor once", () => {
    for (let i = 0; i < 7; i++) {
      expect(helmIds(i, seasonCalendar("optimist")[i].races - 1)).toEqual(helmIds(i, 0));
      expect(new Set(helmIds(i)).size).toBe(helmIds(i).length);
    }
  });

  it("are stronger with the level: the generated sailors' average rating rises", () => {
    const strength = (i: number) => {
      const generated = setup(i).fleet.opponents.map(b => b.helm).filter(h => !RIVALS.some(r => r.id === h.id));
      return generated.reduce((sum, h) => sum + sailorRating(h), 0) / generated.length;
    };
    const s = LEVELS.map(strength);
    expect(s[0]).toBeLessThan(s[1]);
    expect(s[1]).toBeLessThan(s[2]);
    expect(s[2]).toBeLessThan(s[3]);
  });

  it("race the pool's own sailors, with the profiles stored in the state", () => {
    const state = at(2);
    const s = nextRaceSetup(state)!;
    for (const b of s.fleet.opponents) {
      expect(b.helm).toEqual(state.pool.find(p => p.id === b.helm.id));
    }
  });

  it("start in a RaceSession without overlaps, 12 boats at the international Regatta", () => {
    for (const [n, i] of LEVELS.entries()) {
      const { fleet, seed, windKn } = setup(i);
      expect(new RaceSession({ fleet, seed, windKn }).race.racers.length).toBe([6, 8, 10, 12][n]);
    }
  });
});

describe("fleets in the 420", () => {
  const state420 = (): CareerState => {
    const s = at(6);
    return { ...s, classId: "420", results: s.results };
  };
  const partner = (id: string, state = state420()) => state.pool.find(p => p.id === id)!;

  it("give every opponent boat a Helm and a Crew, none sailing twice, the Partner aboard the player's boat", () => {
    const state = state420();
    const p = partner("giulia", state);
    const s = nextRaceSetup(state, { choice: CREW, partner: p })!;
    expect(s.fleet.boatClass.name).toBe("420");
    expect(s.fleet.opponents.length).toBe(11);
    expect(s.fleet.choice).toEqual(CREW);
    expect(s.fleet.partner?.id).toBe("giulia");
    const ids = [p.id, ...s.fleet.opponents.flatMap(b => [b.helm.id, b.crew!.id])];
    expect(new Set(ids).size).toBe(ids.length);
    const helms = s.fleet.opponents.map(b => b.helm.id);
    expect(helms.includes("luca") && helms.includes("marco")).toBe(true);
  });

  it("keep all three Rivals among the Helms when the Partner is not one of them", () => {
    const state = state420();
    const generated = state.pool[5];
    expect(RIVALS.some(r => r.id === generated.id)).toBe(false);
    const s = nextRaceSetup(state, { choice: HELM, partner: generated })!;
    expect(s.fleet.partner?.id).toBe(generated.id);
    const helms = s.fleet.opponents.map(b => b.helm.id);
    for (const r of RIVALS) expect(helms.includes(r.id)).toBe(true);
  });
});
