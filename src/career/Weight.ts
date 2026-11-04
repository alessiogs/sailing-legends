/**
 * Career weight data for the UI: the Pair's combined weight with a light / ideal / heavy hint, and whether the player
 * has outgrown the Optimist. Pure; the UI words it (ADR 0001). Nothing is enforced.
 */
import type { ClassId, IlcaRig } from "../sailing/BoatClass";
import {
  BUILD_FACTOR,
  bodyWeightKg,
  buildFactorOf,
} from "../sailors/BodyWeight";
import { ageInSeason, DEFAULT_STARTING_AGE } from "./Ages";
import type { CareerState } from "./CareerSave";
import { PLAYER_ID } from "./PlayerId";

/** The combined Pair weight (kg) each two-person class sails best at: the 420 from 110 to 130 kg ... */
export const IDEAL_PAIR_KG = { min: 110, max: 130 } as const;
/** ... and the skiffs (29er and 49er) by the Pair's weight; the 49er's racks make up for a heavy Pair. */
export const PAIR_IDEAL_KG: Readonly<
  Record<"420" | "29er" | "49er", { min: number; max: number }>
> = {
  "420": IDEAL_PAIR_KG,
  "29er": { min: 120, max: 130 },
  "49er": { min: 150, max: 170 },
};
/** The sailor weight (kg) each ILCA rig suits: its competitive range (the ideal is in the middle of it). */
export const RIG_IDEAL_KG: Readonly<
  Record<IlcaRig, { min: number; max: number }>
> = {
  4: { min: 50, max: 65 },
  6: { min: 60, max: 78 },
  7: { min: 73, max: 90 },
};
/** ... and the Optimist's sweet spot ends here (it starts at about 35 kg). */
export const OPTIMIST_MAX_KG = 50;

export type PairHint = "light" | "ideal" | "heavy";

const hintOf = (kg: number, range: { min: number; max: number }): PairHint =>
  kg < range.min ? "light" : kg > range.max ? "heavy" : "ideal";

/** How a Pair's combined weight sits against a two-person class's ideal range (the 420's by default). */
export function pairWeightHint(
  pairKg: number,
  classId: keyof typeof PAIR_IDEAL_KG = "420",
): PairHint {
  return hintOf(pairKg, PAIR_IDEAL_KG[classId]);
}

/** How a sailor's weight sits against an ILCA rig's ideal range. */
export function rigWeightHint(kg: number, rig: IlcaRig): PairHint {
  return hintOf(kg, RIG_IDEAL_KG[rig]);
}

/** The rig that suits a sailor of this weight best: the one whose ideal weight (53, 68, 82 kg) is nearest. */
export function suggestedRig(kg: number): IlcaRig {
  return kg < 60.5 ? 4 : kg < 75 ? 6 : 7;
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
