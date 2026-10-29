/**
 * Regatta and Season standings of a Career and the Rival comparison: data only (ids, places, point gaps).
 */
import { describe, expect, it } from "vitest";
import { nextRaceSetup, startCareer } from "../src/career/Career";
import type { CareerState } from "../src/career/CareerSave";
import { PLAYER_ID, recordRace } from "../src/career/RecordRace";
import { compareWithRivals, lastCompleteRegatta, regattaReport, seasonSummary } from "../src/career/Standings";
import type { RaceEntry } from "../src/career/Scoring";

/** The whole fleet of the next Race finishes in the order given by `first` ids, the rest in fleet order. */
const sail = (state: CareerState, first: string[]): CareerState => {
  const fleet = nextRaceSetup(state)!.fleet;
  const ids = [PLAYER_ID, ...fleet.opponents.map(o => o.helm.id)];
  const order = [...first, ...ids.filter(id => !first.includes(id))];
  const entries: RaceEntry[] = order.map((id, i) => ({ id, status: "finished", place: i + 1 }));
  return recordRace(state, entries);
};

/** Sails `count` Races, each won by `first` in turn. */
const sailRaces = (state: CareerState, count: number, first: string[]) => {
  for (let i = 0; i < count; i++) state = sail(state, first);
  return state;
};

describe("Regatta standings", () => {
  it("is not there until the Regatta's Races are sailed", () => {
    const state = sailRaces(startCareer({ seed: 3 }), 2, []);
    expect(regattaReport(state, 0)).toBeNull();
    expect(lastCompleteRegatta(state)).toBeNull();
  });

  it("ranks the Regatta and the Season, with points", () => {
    const state = sailRaces(startCareer({ seed: 3 }), 3, ["luca", PLAYER_ID]);
    const report = regattaReport(state, 0)!;
    expect(lastCompleteRegatta(state)).toBe(0);
    expect(report.regattaId).toBe("optimist-club");
    expect(report.regatta.map(s => s.id).slice(0, 2)).toEqual(["luca", PLAYER_ID]);
    expect(report.regatta[0].points).toBe(3);
    expect(report.regatta[1].points).toBe(6);
    expect(report.season[0].id).toBe("luca");
    expect(report.season[0].points).toBe(1);
    expect(report.regatta).toHaveLength(6);
  });

  it("leaves out the worst Race only in a Regatta whose calendar entry has the Discard", () => {
    let state = startCareer({ seed: 3 });
    state = sailRaces(state, 6, [PLAYER_ID]);
    expect(regattaReport(state, 1)!.regatta.find(s => s.id === PLAYER_ID)!.discarded).toBeNull();
    // Regatta 3 (index 2) has the Discard: the player wins two Races and is last in the third.
    state = sailRaces(state, 2, [PLAYER_ID]);
    const fleet = nextRaceSetup(state)!.fleet.opponents.map(o => o.helm.id);
    const worst: RaceEntry[] = [...fleet.map((id, i) => ({ id, status: "finished" as const, place: i + 1 })),
      { id: PLAYER_ID, status: "finished", place: fleet.length + 1 }];
    state = recordRace(state, worst);
    const me = regattaReport(state, 2)!.regatta.find(s => s.id === PLAYER_ID)!;
    expect(me.discarded).toBe(2);
    expect(me.points).toBe(2);
  });
});

describe("Rival comparison", () => {
  it("gives the point gap and who is ahead", () => {
    const state = sailRaces(startCareer({ seed: 3 }), 3, ["luca", PLAYER_ID]);
    const luca = regattaReport(state, 0)!.regattaRivals.find(r => r.rivalId === "luca")!;
    expect(luca).toEqual({ rivalId: "luca", rivalPlace: 1, playerPlace: 2, rivalAhead: true, gap: 3 });
    const giulia = regattaReport(state, 0)!.regattaRivals.find(r => r.rivalId === "giulia")!;
    expect(giulia.rivalAhead).toBe(false);
  });

  it("lists the Rivals in their usual order and skips one who did not sail", () => {
    const table = [{ id: PLAYER_ID, place: 1, points: 3 }, { id: "marco", place: 2, points: 5 }, { id: "luca", place: 3, points: 5 }];
    expect(compareWithRivals(table).map(r => r.rivalId)).toEqual(["luca", "marco"]);
    expect(compareWithRivals(table.slice(1))).toEqual([]);
  });

  it("reports a zero gap when a tie-break decided it", () => {
    const table = [{ id: "giulia", place: 1, points: 4 }, { id: PLAYER_ID, place: 2, points: 4 }];
    expect(compareWithRivals(table)[0]).toMatchObject({ rivalAhead: true, gap: 0 });
  });
});

describe("Season summary", () => {
  it("is there only after the fourth Regatta", () => {
    const state = sailRaces(startCareer({ seed: 3 }), 9, [PLAYER_ID]);
    expect(seasonSummary(state)).toBeNull();
  });

  it("ranks the Season by the sum of Regatta places", () => {
    const state = sailRaces(startCareer({ seed: 3 }), 12, [PLAYER_ID]);
    const summary = seasonSummary(state)!;
    expect(summary.standings[0].id).toBe(PLAYER_ID);
    expect(summary.player).toMatchObject({ place: 1, points: 4, regattaPlaces: [1, 1, 1, 1] });
    expect(summary.rivals.every(r => !r.rivalAhead)).toBe(true);
    expect(lastCompleteRegatta(state)).toBe(3);
  });
});
