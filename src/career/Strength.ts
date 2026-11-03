/**
 * How strong the sailors of each Regatta level are, by age: one curve the fleets, the generated sailors and the
 * Rivals share. Kids' fleets are weaker; the levels reach their adult strength at 16. Pure data, no text (ADR 0001).
 */
import { clamp } from "../core/math";
import type { RegattaLevel } from "./Calendar";

/** The rating each level clusters around for 13-year-olds. */
const LEVEL_AT_13: Readonly<Record<RegattaLevel, number>> = { club: 0.38, regional: 0.5, national: 0.62, international: 0.74 };

/** How much stronger a level's sailors are per year of age, from 8 to 16. */
export const STRENGTH_PER_YEAR = 0.02;

/** The rating the sailors of `level` cluster around when they are `age`. */
export function levelRating(level: RegattaLevel, age: number): number {
  return LEVEL_AT_13[level] + STRENGTH_PER_YEAR * (clamp(age, 8, 16) - 13);
}

/** How far above their age's regional level the Rivals start: talented kids, between regional and national. */
export const RIVAL_EDGE = 0.1;

/** The rating a Rival starts their Career with at `age`. */
export function rivalStartRating(age: number): number {
  return levelRating("regional", age) + RIVAL_EDGE;
}
