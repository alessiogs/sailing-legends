/**
 * Closing a Season: a pure function from state to state. No text (ADR 0001). `closeSeason` is the ageing and growth
 * part; `startNextSeason` applies the end-of-Season choice (stay, or move to the 420 with a Partner) to its result.
 */
import { HELM, type PlayerChoice } from "../race/PlayerChoice";
import type { IlcaRig } from "../sailing/BoatClass";
import { ageInSeason } from "./Ages";
import type { CareerState } from "./CareerSave";
import { startingChemistry } from "./Chemistry";
import { growSailor, growthSeed } from "./Growth";
import { PLAYER_ID } from "./PlayerId";
import { bodyWeightKg, buildFactorOf } from "../sailors/BodyWeight";
import { classOffers, samePath, type PairClassId } from "./Classes";
import { pairWeightHint, playerKgNow, type PairHint } from "./Weight";

/** The sailors the player raced with this Season: every boat they sailed against, and their Partner. */
function sailedWith(state: CareerState): Set<string> {
  const ids = new Set(state.results.flat(2).map((e) => e.id));
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
    growSailor(
      s,
      ageInSeason(s.startingAge, state.season),
      growthSeed(state.seed, state.season, i),
    ),
  );
  const seasonsTogether = { ...state.seasonsTogether };
  for (const id of sailedWith(state))
    seasonsTogether[id] = (seasonsTogether[id] ?? 0) + 1;
  return {
    ...state,
    season: state.season + 1,
    regattaIndex: 0,
    results: [[]],
    pool,
    seasonsTogether,
  };
}

/**
 * The end-of-Season choice: any class the player's age allows (`classOffers`), sideways and back included. The ILCA by
 * its rig; a two-person class (420, 29er, 49er) with a Partner (a pool sailor's `id`), Role and Control mode.
 */
export type SeasonChoice =
  | { classId: "optimist" }
  | { classId: "ilca"; rig: IlcaRig }
  | { classId: PairClassId; partnerId: string; choice: PlayerChoice };

/**
 * The sailors the player may pick as Partner: those raced against this Season, and the current Partner. Call it on the
 * state of the Season just sailed, before `startNextSeason`.
 */
export function partnerCandidates(state: CareerState): string[] {
  return state.pool.map((s) => s.id).filter((id) => sailedWith(state).has(id));
}

/**
 * A Partner to choose, the Crew Chemistry they would start with (the current Partner keeps theirs), their body weight
 * next Season, the Pair's combined weight with the player's and how it sits against the 420's ideal.
 */
export type PartnerOffer = {
  id: string;
  chemistry: number;
  kg: number;
  pairKg: number;
  hint: PairHint;
};

/** The Partners to choose from, with the Chemistry each would start with next Season. Call it on the state of the Season just sailed. */
export function partnerOffers(
  state: CareerState,
  classId: PairClassId = "420",
): PartnerOffer[] {
  const closed = closeSeason(state);
  return partnerCandidates(state).map((id) => {
    const kept = state.chemistry !== null && state.partnerId === id;
    const partner = closed.pool.find((s) => s.id === id)!;
    const kg = bodyWeightKg(
      ageInSeason(partner.startingAge, closed.season),
      buildFactorOf(id),
    );
    const pairKg = kg + playerKgNow(closed);
    return {
      id,
      chemistry: kept
        ? state.chemistry!
        : startingChemistry(partner, closed.seasonsTogether[id] ?? 0),
      kg,
      pairKg,
      hint: pairWeightHint(pairKg, classId),
    };
  });
}

/**
 * Closes the Season and applies the choice. Moving to a two-person class (or changing Partner in it) starts the Pair's
 * Chemistry from the formula with the Seasons raced together; keeping the Partner keeps their Chemistry, whatever the
 * class, because Chemistry belongs to the Pair. A single-handed class has no Partner, so a Season there ends the Pair's
 * Chemistry: returning to the same Partner later starts again from the formula (the Seasons raced together still count). Throws a RangeError for a class
 * the player's age does not allow, or a Partner who is not a candidate. The state given is not changed.
 */
export function startNextSeason(
  state: CareerState,
  next: SeasonChoice,
): CareerState {
  const path = {
    classId: next.classId,
    rig: next.classId === "ilca" ? next.rig : null,
  };
  if (!classOffers(state).some((o) => samePath(o.path, path)))
    throw new RangeError(
      `${next.classId} cannot be sailed at this age, or has no such rig`,
    );
  if (!("partnerId" in next)) {
    return {
      ...closeSeason(state),
      ...path,
      partnerId: null,
      choice: HELM,
      chemistry: null,
    };
  }
  if (!partnerCandidates(state).includes(next.partnerId))
    throw new RangeError(
      `${next.partnerId} is not a sailor to choose as Partner`,
    );
  const closed = closeSeason(state);
  const partner = closed.pool.find((s) => s.id === next.partnerId)!;
  const kept = state.partnerId === next.partnerId && state.chemistry !== null;
  return {
    ...closed,
    ...path,
    partnerId: partner.id,
    choice: next.choice,
    chemistry: kept
      ? state.chemistry
      : startingChemistry(partner, closed.seasonsTogether[partner.id] ?? 0),
  };
}
