/**
 * Ages in a Career and the classes' Age limit. Pure, no text. Everybody (the player and every sailor in the pool) is a
 * year older after each Season, so one function serves them all.
 */
import { CLASSES, type ClassId } from "../sailing/BoatClass";

/** The starting ages the player may choose, and the one offered first. */
export const MIN_STARTING_AGE = 8;
export const MAX_STARTING_AGE = 12;
export const DEFAULT_STARTING_AGE = 10;

/** The age of a sailor who was `startingAge` in Season 1, during `season` (from 1): the Seasons completed are added. */
export function ageInSeason(startingAge: number, season: number): number {
  return startingAge + season - 1;
}

/** Whether a sailor of this age is still allowed to race the class. A class without an Age limit allows any age. */
export function canRace(age: number, classId: ClassId): boolean {
  const limit = CLASSES[classId].ageLimit;
  return limit === undefined || age <= limit;
}
