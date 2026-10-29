/**
 * Closing a Season: a pure function from state to state. No text (ADR 0001). This is the ageing and growth part; the
 * end-of-Season class choice (stay or move to the 420, #92) is applied afterwards to the state returned here.
 */
import { ageInSeason } from "./Ages";
import type { CareerState } from "./CareerSave";
import { growSailor, growthSeed } from "./Growth";

/**
 * The state at the start of the next Season: one more Season (so the player and every pool sailor are a year older),
 * nothing sailed yet, and every pool sailor grown along their age curve, seeded from the Career seed.
 */
export function closeSeason(state: CareerState): CareerState {
  const pool = state.pool.map((s, i) =>
    growSailor(s, ageInSeason(s.startingAge, state.season), growthSeed(state.seed, state.season, i)));
  return { ...state, season: state.season + 1, regattaIndex: 0, results: [[]], pool };
}
