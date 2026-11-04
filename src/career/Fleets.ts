/**
 * A Regatta's fleet, drawn from the Career's sailor pool by the Regatta's level: bigger and stronger from club to
 * international. The Rivals are always in. The draw depends only on the Career seed, the Season and the Regatta, so the
 * Races of a Regatta share a fleet, and the same Career always gets the same one.
 */
import { rng } from "../core/math";
import {
  makeFleet,
  type Aboard,
  type Fleet,
  type OpponentSeats,
} from "../race/Fleet";
import { HELM, type PlayerChoice } from "../race/PlayerChoice";
import { isTwoPerson } from "../sailing/BoatClass";
import {
  BUILD_FACTOR,
  bodyWeightKg,
  buildFactorOf,
} from "../sailors/BodyWeight";
import { RIVALS, type SailorProfile } from "../sailors/Sailors";
import { seasonCalendar, type RegattaLevel } from "./Calendar";
import type { CareerState } from "./CareerSave";
import { ageInSeason, DEFAULT_STARTING_AGE as DEFAULT_AGE } from "./Ages";
import { sailorRating } from "./Pool";
import { boatClassOf, misfit, pathOf, samePath, sailorPath } from "./Classes";
import { levelRating } from "./Strength";
import { mixSeed } from "./Seeds";

/** The boats of a Regatta's fleet (the player's included) by level, fixed from the frame rate measured with 12 boats. */
export const FLEET_SIZE: Readonly<Record<RegattaLevel, number>> = {
  club: 6,
  regional: 8,
  national: 10,
  international: 12,
};

/** How much a sailor's draw may stray from the level's rating, so that the fleets of two Seasons differ. */
const JITTER = 0.1;

export type FleetOptions = {
  /** Two-person classes: the player's Role and Control mode (default Helm, Player Career) and Partner (default Giulia). */
  choice?: PlayerChoice;
  partner?: SailorProfile;
};

const isRival = (s: SailorProfile) => RIVALS.some((r) => r.id === s.id);

/** The fleet of the Regatta in progress: the player, then the opponent boats in a seeded order. */
export function regattaFleet(
  state: CareerState,
  options: FleetOptions = {},
): Fleet {
  const regatta = seasonCalendar(state.classId)[state.regattaIndex];
  const path = pathOf(state);
  const cls = boatClassOf(path);
  const two = isTwoPerson(cls);
  const rand = rng(mixSeed(state.seed, state.season, state.regattaIndex, 1));

  const allRivals = state.pool.filter(isRival);
  // Each Rival sails the class their age and weight call for this Season; only those in this class are in the fleet.
  const rivals = allRivals.filter((r) =>
    samePath(sailorPath(state.seed, state.season, r.id, r.startingAge), path),
  );
  const partner = two
    ? (options.partner ??
      allRivals.find((r) => r.id === "giulia") ??
      allRivals[0])
    : null;
  const boats = FLEET_SIZE[regatta.level] - 1;

  // The rest of the pool, closest to the level's rating first (with a seeded jitter): Helms, then Crews.
  const target = levelRating(
    regatta.level,
    ageInSeason(state.startingAge, state.season),
  );
  const ranked = state.pool
    .filter((s) => !isRival(s) && s.id !== partner?.id)
    .map((s) => {
      const age = ageInSeason(s.startingAge, state.season);
      const kg = bodyWeightKg(age, buildFactorOf(s.id));
      return {
        s,
        // closest to the level's rating, with the sailors of fitting age and weight first
        key:
          Math.abs(sailorRating(s) - target) +
          (rand() - 0.5) * JITTER +
          misfit(path, age, kg),
      };
    })
    .sort((a, b) => a.key - b.key || (a.s.id < b.s.id ? -1 : 1))
    .map((x) => x.s);

  const helms: SailorProfile[] = rivals.filter((r) => r.id !== partner?.id);
  const fill = boats - helms.length;
  helms.push(...ranked.slice(0, fill));
  const crews = two ? ranked.slice(fill, fill + boats) : [];

  const seats: OpponentSeats[] = helms.map((helm, i) => ({
    helm,
    crew: two ? crews[i] : null,
  }));
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const fleet = makeFleet({
    boatClass: cls,
    choice: options.choice ?? HELM,
    ...(partner ? { partner } : {}),
    opponents: seats,
  });
  return withWeights(fleet, state);
}

/** `fleet` with every boat's body weights from the sailors' ages (in the pool) and Builds (the player's own, an AI's from its id). */
function withWeights(fleet: Fleet, state: CareerState): Fleet {
  const kgOf = (a: Aboard): number => {
    if (a === "player")
      return bodyWeightKg(
        ageInSeason(state.startingAge, state.season),
        BUILD_FACTOR[state.build],
      );
    const pooled = state.pool.find((s) => s.id === a.id);
    return bodyWeightKg(
      pooled ? ageInSeason(pooled.startingAge, state.season) : DEFAULT_AGE,
      buildFactorOf(a.id),
    );
  };
  const weigh = <B extends { helm: Aboard; crew: Aboard | null }>(b: B): B => ({
    ...b,
    kg: { helmKg: kgOf(b.helm), crewKg: b.crew ? kgOf(b.crew) : 0 },
  });
  return {
    ...fleet,
    player: fleet.player && weigh(fleet.player),
    opponents: fleet.opponents.map(weigh),
  };
}
