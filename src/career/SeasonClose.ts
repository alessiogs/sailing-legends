/**
 * Closing a Season: a pure function from state to state. No text (ADR 0001). `closeSeason` is the ageing and growth
 * part; `startNextSeason` applies the end-of-Season choice (stay, or move to the 420 with a Partner) to its result.
 */
import type { PlayerChoice } from "../race/PlayerChoice";
import { ageInSeason } from "./Ages";
import type { CareerState } from "./CareerSave";
import { startingChemistry } from "./Chemistry";
import { growSailor, growthSeed } from "./Growth";
import { PLAYER_ID } from "./PlayerId";

/** The sailors the player raced with this Season: every boat they sailed against, and their Partner. */
function sailedWith(state: CareerState): Set<string> {
  const ids = new Set(state.results.flat(2).map(e => e.id));
  ids.delete(PLAYER_ID);
  if (state.partnerId !== null) ids.add(state.partnerId);
  return ids;
}

/**
 * The state at the start of the next Season: one more Season (so the player and every pool sailor are a year older),
 * nothing sailed yet, every pool sailor grown along their age curve, seeded from the Career seed, and one more Season
 * of shared history with each sailor raced with (the Chemistry history).
 */
export function closeSeason(state: CareerState): CareerState {
  const pool = state.pool.map((s, i) =>
    growSailor(s, ageInSeason(s.startingAge, state.season), growthSeed(state.seed, state.season, i)));
  const seasonsTogether = { ...state.seasonsTogether };
  for (const id of sailedWith(state)) seasonsTogether[id] = (seasonsTogether[id] ?? 0) + 1;
  return { ...state, season: state.season + 1, regattaIndex: 0, results: [[]], pool, seasonsTogether };
}

/** The end-of-Season choice: stay in the Optimist, or sail the 420 with a Partner (a pool sailor's `id`), Role and Control mode. */
export type SeasonChoice = { classId: "optimist" } | { classId: "420"; partnerId: string; choice: PlayerChoice };

/**
 * The sailors the player may pick as Partner: those raced against this Season, and the current Partner. Call it on the
 * state of the Season just sailed, before `startNextSeason`.
 */
export function partnerCandidates(state: CareerState): string[] {
  return state.pool.map(s => s.id).filter(id => sailedWith(state).has(id));
}

/** A Partner to choose and the Crew Chemistry they would start with (the current Partner keeps theirs). */
export type PartnerOffer = { id: string; chemistry: number };

/** The Partners to choose from, with the Chemistry each would start with next Season. Call it on the state of the Season just sailed. */
export function partnerOffers(state: CareerState): PartnerOffer[] {
  const closed = closeSeason(state);
  return partnerCandidates(state).map(id => {
    const kept = state.chemistry !== null && state.partnerId === id;
    return { id, chemistry: kept ? state.chemistry! : startingChemistry(closed.pool.find(s => s.id === id)!, closed.seasonsTogether[id] ?? 0) };
  });
}

/**
 * Closes the Season and applies the choice. Moving to the 420 (or changing Partner in it) starts the Pair's Chemistry
 * from the formula with the Seasons raced together; keeping the Partner keeps their Chemistry. Throws a RangeError for
 * a Partner who is not a candidate, or for going back to the Optimist from the 420. The state given is not changed.
 */
export function startNextSeason(state: CareerState, next: SeasonChoice): CareerState {
  if (next.classId === "optimist") {
    if (state.classId !== "optimist") throw new RangeError("The Optimist cannot be sailed again after the 420");
    return closeSeason(state);
  }
  if (!partnerCandidates(state).includes(next.partnerId)) throw new RangeError(`${next.partnerId} is not a sailor to choose as Partner`);
  const closed = closeSeason(state);
  const partner = closed.pool.find(s => s.id === next.partnerId)!;
  const kept = state.classId === "420" && state.partnerId === next.partnerId && state.chemistry !== null;
  return {
    ...closed, classId: "420", partnerId: partner.id, choice: next.choice,
    chemistry: kept ? state.chemistry : startingChemistry(partner, closed.seasonsTogether[partner.id] ?? 0),
  };
}
