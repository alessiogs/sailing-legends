/**
 * The Career's operations, each a pure function from state to state. No text (ADR 0001). Starting a Career and the
 * next Race's setup so far; later issues add recording a Race, closing a Regatta and a Season.
 */
import { DEFAULT_STARTING_AGE, MAX_STARTING_AGE, MIN_STARTING_AGE } from "./Ages";
import { seasonCalendar } from "./Calendar";
import { CAREER_VERSION, type CareerState } from "./CareerSave";
import { regattaFleet, type FleetOptions } from "./Fleets";
import { generatePool } from "./Pool";
import { raceSeed, raceWindKn } from "./Weather";
import type { Fleet } from "../race/Fleet";

/**
 * Starts a Career: Season 1 in the Optimist at `startingAge` (8..12, 10 by default), at the first Regatta with
 * nothing sailed. `seed` seeds everything generated for this Career. Throws a RangeError for an age outside 8..12 or
 * a seed that is not a whole number from 0; the menu only offers valid ones.
 */
export function startCareer({ seed, startingAge = DEFAULT_STARTING_AGE }: { seed: number; startingAge?: number }): CareerState {
  if (!Number.isInteger(seed) || seed < 0) throw new RangeError(`Career seed must be a whole number from 0, got ${seed}`);
  if (!Number.isInteger(startingAge) || startingAge < MIN_STARTING_AGE || startingAge > MAX_STARTING_AGE) {
    throw new RangeError(`Career starting age must be ${MIN_STARTING_AGE}..${MAX_STARTING_AGE}, got ${startingAge}`);
  }
  return { version: CAREER_VERSION, seed, startingAge, season: 1, classId: "optimist", regattaIndex: 0, results: [[]], pool: generatePool(seed, startingAge) };
}

/** What a Race needs to start: who sails, in what wind, from which seed (all for `RaceSession`). */
export type RaceSetup = {
  /** The Regatta in progress (`Regatta.id`). */
  regattaId: string;
  /** The Race of the Regatta, from 0. */
  raceIndex: number;
  fleet: Fleet;
  windKn: number;
  seed: number;
};

/**
 * The setup of the next Race of the Regatta in progress, or `null` when all its Races are sailed. The fleet comes from
 * the pool by the Regatta's level and is the same for every Race of the Regatta; the wind and the seed differ by Race.
 * In the 420, `options` give the player's Role, Control mode and Partner.
 */
export function nextRaceSetup(state: CareerState, options: FleetOptions = {}): RaceSetup | null {
  const regatta = seasonCalendar(state.classId)[state.regattaIndex];
  const raceIndex = state.results[state.regattaIndex].length;
  if (raceIndex >= regatta.races) return null;
  return {
    regattaId: regatta.id, raceIndex, fleet: regattaFleet(state, options),
    windKn: raceWindKn(state.seed, state.season, state.regattaIndex, raceIndex),
    seed: raceSeed(state.seed, state.season, state.regattaIndex, raceIndex),
  };
}
