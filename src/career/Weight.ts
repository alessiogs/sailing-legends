/**
 * Career weight data for the UI: the Pair's combined weight with a light / ideal / heavy hint, and whether the player
 * has outgrown the Optimist. Pure; the UI words it (ADR 0001). Nothing is enforced.
 */
import {
  BUILD_FACTOR,
  bodyWeightKg,
  buildFactorOf,
} from "../sailors/BodyWeight";
import { ageInSeason, DEFAULT_STARTING_AGE } from "./Ages";
import type { CareerState } from "./CareerSave";
import { PLAYER_ID } from "./PlayerId";

/** The 420 Pair's combined weight (kg) that sails the boat best: from here ... */
export const IDEAL_PAIR_KG = { min: 110, max: 130 } as const;
/** ... and the Optimist's sweet spot ends here (it starts at about 35 kg). */
export const OPTIMIST_MAX_KG = 50;

export type PairHint = "light" | "ideal" | "heavy";

/** How a Pair's combined weight sits against the 420's ideal range. */
export function pairWeightHint(pairKg: number): PairHint {
  return pairKg < IDEAL_PAIR_KG.min
    ? "light"
    : pairKg > IDEAL_PAIR_KG.max
      ? "heavy"
      : "ideal";
}

/** Whether a sailor of this weight is past the Optimist's sweet spot. */
export function outgrownOptimist(kg: number): boolean {
  return kg > OPTIMIST_MAX_KG;
}

/** The player's body weight in kg in the Season the state is in (or in `season`, when given). */
export function playerKgNow(
  state: Pick<CareerState, "startingAge" | "season" | "build">,
  season = state.season,
): number {
  return bodyWeightKg(
    ageInSeason(state.startingAge, season),
    BUILD_FACTOR[state.build],
  );
}

/** The body weight in kg of a sailor of the Career in this Season: the player ("player") or one in the pool (an AI's Build comes from its id). */
export function sailorKgNow(state: CareerState, id: string): number {
  if (id === PLAYER_ID) return playerKgNow(state);
  const pooled = state.pool.find((s) => s.id === id);
  return bodyWeightKg(
    pooled
      ? ageInSeason(pooled.startingAge, state.season)
      : DEFAULT_STARTING_AGE,
    buildFactorOf(id),
  );
}
