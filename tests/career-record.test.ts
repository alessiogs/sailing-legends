/**
 * Recording a Race into the Career: entries read off a race (racer ids to sailor ids), and the state operation that
 * adds them, moves on to the next Regatta and stops at the Season's end. Pure; no text.
 */
import { describe, expect, it } from "vitest";
import { nextRaceSetup, startCareer } from "../src/career/Career";
import { decodeCareer, encodeCareer, type CareerState } from "../src/career/CareerSave";
import { FLEET_SIZE } from "../src/career/Fleets";
import { isSeasonOver, PLAYER_ID, raceEntries, recordRace } from "../src/career/RecordRace";
import type { RaceEntry } from "../src/career/Scoring";
import type { Racer } from "../src/race/Race";

/** A Race of `size` boats in the order given by `ids`: everyone finishes, `ids[0]` first. */
const race = (size: number, first = PLAYER_ID): RaceEntry[] => {
  const ids = [first, ...Array.from({ length: size }, (_, i) => `s${i}`).filter(id => id !== first)].slice(0, size);
  return ids.map((id, i) => ({ id, status: "finished", place: i + 1 }));
};
/** A Race entered by the fleet of the Regatta in progress. */
const sail = (state: CareerState) => race(nextRaceSetup(state)!.fleet.opponents.length + 1);

const start = () => startCareer({ seed: 5 });

describe("record a Race", () => {
  it("adds the Race to the Regatta in progress and stays there until its Races are sailed", () => {
    const one = recordRace(start(), sail(start()));
    expect(one.regattaIndex).toBe(0);
    expect(one.results).toHaveLength(1);
    expect(one.results[0]).toHaveLength(1);
    const two = recordRace(one, sail(one));
    expect(two.regattaIndex).toBe(0);
    expect(two.results[0]).toHaveLength(2);
    expect(nextRaceSetup(two)!.raceIndex).toBe(2);
  });

  it("starts the next Regatta when the third Race is recorded", () => {
    let state = start();
    for (let i = 0; i < 3; i++) state = recordRace(state, sail(state));
    expect(state.regattaIndex).toBe(1);
    expect(state.results).toHaveLength(2);
    expect(state.results[0]).toHaveLength(3);
    expect(state.results[1]).toEqual([]);
    expect(nextRaceSetup(state)!.regattaId).toBe("optimist-regional");
  });

  it("holds the Season's last Regatta when it is complete: the Season end is for closeSeason", () => {
    let state = start();
    for (let i = 0; i < 12; i++) {
      expect(isSeasonOver(state)).toBe(false);
      state = recordRace(state, sail(state));
    }
    expect(isSeasonOver(state)).toBe(true);
    expect(state.regattaIndex).toBe(3);
    expect(state.results[3]).toHaveLength(3);
    expect(nextRaceSetup(state)).toBe(null);
    expect(() => recordRace(state, race(FLEET_SIZE.international))).toThrow();
  });

  it("keeps the state valid for the save at every step of a Season", () => {
    let state = start();
    for (let i = 0; i < 12; i++) {
      state = recordRace(state, sail(state));
      expect(decodeCareer(encodeCareer(state))).toEqual({ ok: true, state });
    }
  });

  it("does not change the state it is given", () => {
    const state = start();
    const before = JSON.stringify(state);
    recordRace(state, sail(state));
    expect(JSON.stringify(state)).toBe(before);
  });

  it("refuses entries that are not the Regatta's fleet", () => {
    expect(() => recordRace(start(), race(FLEET_SIZE.club - 1))).toThrow();
    expect(() => recordRace(start(), race(FLEET_SIZE.club + 1))).toThrow();
    const twice = race(FLEET_SIZE.club);
    twice[1] = { ...twice[1], id: twice[0].id };
    expect(() => recordRace(start(), twice)).toThrow();
  });
});

/** A racer with only what `raceEntries` reads. */
const racer = (id: string, o: Partial<Pick<Racer, "finishTime" | "dsq" | "ocs">> = {}): Racer =>
  ({ id, isPlayer: id === PLAYER_ID, finishTime: null, dsq: false, ocs: false, ...o }) as Racer;

describe("entries of a race", () => {
  const fleet = nextRaceSetup(start())!.fleet;
  const helm = (i: number) => fleet.opponents[i].helm.id;

  it("name the boats by their Helm, the player as 'player'", () => {
    const entries = raceEntries(fleet, [racer("ai1", { finishTime: 100 }), racer("player", { finishTime: 90 }), racer("ai0", { finishTime: 120 })]);
    expect(entries).toEqual([
      { id: helm(1), status: "finished", place: 2 },
      { id: "player", status: "finished", place: 1 },
      { id: helm(0), status: "finished", place: 3 },
    ]);
  });

  it("give the places by finish time, leaving out the disqualified, and mark the rest", () => {
    const entries = raceEntries(fleet, [
      racer("player", { finishTime: 200, dsq: true }), racer("ai0", { finishTime: 150 }), racer("ai1"), racer("ai2", { ocs: true }), racer("ai3", { finishTime: 140 }),
    ]);
    expect(entries.map(e => e.status)).toEqual(["dsq", "finished", "dnf", "ocs", "finished"]);
    expect(entries.map(e => e.place ?? 0)).toEqual([0, 2, 0, 0, 1]);
  });

  it("refuse a boat that is not in the fleet", () => {
    expect(() => raceEntries(fleet, [racer("ai99")])).toThrow();
  });
});
