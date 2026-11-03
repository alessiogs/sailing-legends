/**
 * Career weight data for the UI: the Pair's combined weight with a light / ideal / heavy hint, and whether the player
 * has outgrown the Optimist. Pure; the UI words it (ADR 0001). Nothing is enforced.
 */
import { BUILD_FACTOR, bodyWeightKg } from "../sailors/BodyWeight";
import { ageInSeason } from "./Ages";
import type { CareerState } from "./CareerSave";

/** The 420 Pair's combined weight (kg) that sails the boat best: from here ... */
export const IDEAL_PAIR_KG = { min: 110, max: 130 } as const;
/** ... and the Optimist's sweet spot ends here (it starts at about 35 kg). */
export const OPTIMIST_MAX_KG = 50;

export type PairHint = "light" | "ideal" | "heavy";

/** How a Pair's combined weight sits against the 420's ideal range. */
export function pairWeightHint(pairKg: number): PairHint {
  return pairKg < IDEAL_PAIR_KG.min ? "light" : pairKg > IDEAL_PAIR_KG.max ? "heavy" : "ideal";
}

/** Whether a sailor of this weight is past the Optimist's sweet spot. */
export function outgrownOptimist(kg: number): boolean {
  return kg > OPTIMIST_MAX_KG;
}

/** The player's body weight in kg in the Season the state is in (or in `season`, when given). */
export function playerKgNow(state: Pick<CareerState, "startingAge" | "season" | "build">, season = state.season): number {
  return bodyWeightKg(ageInSeason(state.startingAge, season), BUILD_FACTOR[state.build]);
}
