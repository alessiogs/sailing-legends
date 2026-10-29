/**
 * The Career's operations, each a pure function from state to state. No text (ADR 0001). Starting a Career is the
 * first; later issues add recording a Race, closing a Regatta and a Season.
 */
import { DEFAULT_STARTING_AGE, MAX_STARTING_AGE, MIN_STARTING_AGE } from "./Ages";
import { CAREER_VERSION, type CareerState } from "./CareerSave";

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
  return { version: CAREER_VERSION, seed, startingAge, season: 1, classId: "optimist", regattaIndex: 0, results: [[]] };
}
