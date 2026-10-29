/**
 * Crew Chemistry in a Career: the starting value of a new Pair, and how it moves after each 420 Regatta. Pure, no text
 * (ADR 0001). The values are the spec owner's to tune.
 */
import { clamp } from "../core/math";
import { crewChemistry, type SailorProfile } from "../sailors/Sailors";
import { seasonCalendar } from "./Calendar";
import type { CareerState } from "./CareerSave";
import { PLAYER_ID } from "./PlayerId";
import { sailorRating } from "./Pool";
import { scoreRegatta } from "./Scoring";

/** Chemistry never falls below this because of results (a Pair that starts lower stays where it is). */
export const CHEMISTRY_FLOOR = 20;
/** The most Chemistry moves after one Regatta, up or down. */
export const CHEMISTRY_CAP = 5;
/** Chemistry gained per place the Pair finishes better than expected, and lost per place worse. */
export const CHEMISTRY_GAIN = 3;
export const CHEMISTRY_LOSS = 2;
/** The bond points a Season raced in the same fleets adds to a sailor's shared history with the player. */
export const BOND_PER_SEASON = 5;
/** The player's own level when working out the Pair's expected place: the middle of the scale. */
export const PLAYER_RATING = 0.5;

const DEFAULT_BOND = 60;

/** Chemistry of a new Pair with `partner`: today's formula, the bond raised by the Seasons raced together. */
export function startingChemistry(partner: SailorProfile, seasonsTogether: number): number {
  const bond = clamp((partner.bond ?? DEFAULT_BOND) + BOND_PER_SEASON * seasonsTogether, 0, 100);
  return crewChemistry({ ...partner, bond });
}

/** The place the Pair is expected to take: behind each opponent boat rated above the Pair, whose rating is that of the Partner and the player. */
export function expectedPlace(partnerRating: number, opponentRatings: readonly number[]): number {
  const pair = (partnerRating + PLAYER_RATING) / 2;
  return 1 + opponentRatings.filter(r => r > pair).length;
}

/** How much Chemistry moves for a Regatta place against the expected one: +3 a place better, -2 a place worse, at most 5 either way. */
export function chemistryChange(place: number, expected: number): number {
  if (place < expected) return Math.min(CHEMISTRY_CAP, CHEMISTRY_GAIN * (expected - place));
  if (place > expected) return -Math.min(CHEMISTRY_CAP, CHEMISTRY_LOSS * (place - expected));
  return 0;
}

/** Chemistry after a change: within 0..100, and not pushed below the floor (nor, if already lower, below where it was). */
export function moveChemistry(chemistry: number, change: number): number {
  return clamp(chemistry + change, Math.min(chemistry, CHEMISTRY_FLOOR), 100);
}

/**
 * The state with Chemistry moved by the 420 Regatta `index`, which must be complete: by the Pair's place in the Regatta
 * against the place expected from the ratings of the boats they sailed against. Unchanged in the Optimist.
 */
export function applyRegattaChemistry(state: CareerState, index: number): CareerState {
  const partner = state.pool.find(s => s.id === state.partnerId);
  if (!partner || state.chemistry === null) return state;
  const table = scoreRegatta(state.results[index], seasonCalendar(state.classId)[index].discard);
  const me = table.find(s => s.id === PLAYER_ID);
  if (!me) return state;
  const ratings = table.flatMap(s => {
    const sailor = state.pool.find(p => p.id === s.id);
    return sailor ? [sailorRating(sailor)] : [];
  });
  const change = chemistryChange(me.place, expectedPlace(sailorRating(partner), ratings));
  return { ...state, chemistry: moveChemistry(state.chemistry, change) };
}

/**
 * The Partner as they sail: their pool profile with the bond set so that Crew Chemistry is the Pair's current value
 * (the profile the race and the HUD read it from; the bond can fall outside 0..100 to reach it, as the technique and
 * reliability terms alone may weigh more or less than the Chemistry). `undefined` without a Partner.
 */
export function partnerProfile(state: CareerState): SailorProfile | undefined {
  const partner = state.pool.find(s => s.id === state.partnerId);
  if (!partner || state.chemistry === null) return undefined;
  const base = crewChemistry({ ...partner, bond: 0 });
  return { ...partner, bond: (state.chemistry - base) / 0.5 };
}
