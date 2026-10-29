/**
 * A Regatta's fleet, drawn from the Career's sailor pool by the Regatta's level: bigger and stronger from club to
 * international. The Rivals are always in. The draw depends only on the Career seed, the Season and the Regatta, so the
 * Races of a Regatta share a fleet, and the same Career always gets the same one.
 */
import { rng } from "../core/math";
import { makeFleet, type Fleet, type OpponentSeats } from "../race/Fleet";
import { HELM, type PlayerChoice } from "../race/PlayerChoice";
import { CLASSES, isTwoPerson } from "../sailing/BoatClass";
import { RIVALS, type SailorProfile } from "../sailors/Sailors";
import { seasonCalendar, type RegattaLevel } from "./Calendar";
import type { CareerState } from "./CareerSave";
import { sailorRating } from "./Pool";
import { mixSeed } from "./Seeds";

/** The boats of a Regatta's fleet (the player's included) by level, fixed from the frame rate measured with 12 boats. */
export const FLEET_SIZE: Readonly<Record<RegattaLevel, number>> = { club: 6, regional: 8, national: 10, international: 12 };

/** The rating the generated sailors of a fleet cluster around, by level. */
const TARGET_RATING: Readonly<Record<RegattaLevel, number>> = { club: 0.38, regional: 0.5, national: 0.62, international: 0.74 };

/** How much a sailor's draw may stray from the level's rating, so that the fleets of two Seasons differ. */
const JITTER = 0.1;

export type FleetOptions = {
  /** Two-person classes: the player's Role and Control mode (default Helm, Player Career) and Partner (default Giulia). */
  choice?: PlayerChoice;
  partner?: SailorProfile;
};

const isRival = (s: SailorProfile) => RIVALS.some(r => r.id === s.id);

/** The fleet of the Regatta in progress: the player, then the opponent boats in a seeded order. */
export function regattaFleet(state: CareerState, options: FleetOptions = {}): Fleet {
  const regatta = seasonCalendar(state.classId)[state.regattaIndex];
  const cls = CLASSES[state.classId];
  const two = isTwoPerson(cls);
  const rand = rng(mixSeed(state.seed, state.season, state.regattaIndex, 1));

  const rivals = state.pool.filter(isRival);
  const partner = two ? options.partner ?? rivals.find(r => r.id === "giulia") ?? rivals[0] : null;
  const boats = FLEET_SIZE[regatta.level] - 1;

  // The rest of the pool, closest to the level's rating first (with a seeded jitter): Helms, then Crews.
  const target = TARGET_RATING[regatta.level];
  const ranked = state.pool
    .filter(s => !isRival(s) && s.id !== partner?.id)
    .map(s => ({ s, key: Math.abs(sailorRating(s) - target) + (rand() - 0.5) * JITTER }))
    .sort((a, b) => a.key - b.key || (a.s.id < b.s.id ? -1 : 1))
    .map(x => x.s);

  const helms: SailorProfile[] = rivals.filter(r => r.id !== partner?.id);
  const fill = boats - helms.length;
  helms.push(...ranked.slice(0, fill));
  const crews = two ? ranked.slice(fill, fill + boats) : [];

  const seats: OpponentSeats[] = helms.map((helm, i) => ({ helm, crew: two ? crews[i] : null }));
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  return makeFleet({
    boatClass: cls, choice: options.choice ?? HELM, ...(partner ? { partner } : {}), opponents: seats,
  });
}
