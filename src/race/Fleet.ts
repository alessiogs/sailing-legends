import { DEG } from "../core/math";
import { isTwoPerson, OPTIMIST, type BoatClass } from "../sailing/BoatClass";
import { opponentCrew, opponentHelms, RIVALS, type SailorProfile } from "../sailors/Sailors";
import { HELM, type PlayerChoice } from "./PlayerChoice";

/**
 * A race's fleet: the boat class, the player's boat with their Partner, the opponents with their Crews, and where
 * every boat starts. It is plain data with no race attached, so anything can build one (the quick race here, later
 * a career season with its own fleets) and hand it to a `RaceSession`, which puts the boats on the water.
 */

/** Who sails in a seat of a boat: the player or an AI sailor. */
export type Aboard = "player" | SailorProfile;

/**
 * Where a boat is placed when the session is created, relative to the course: `downwind` metres down the course's
 * wind direction from the origin, then `across` metres along +X (east); heading = the course's wind direction plus
 * `heading`. An AI Helm then moves its boat to its own holding spot before the start.
 */
export type StartSpot = { downwind: number; across: number; heading: number };

/** A boat of the fleet: its racer id, who sails it and where it starts. */
type FleetBoat<Seat> = {
  id: string;
  helm: Seat;
  /** `null` in a single-handed class. */
  crew: Seat | null;
  start: StartSpot;
};

/** The player's boat (id `player`): the player in their Role, the Partner in the other seat. */
export type PlayerBoat = FleetBoat<Aboard>;
/** An opponent's boat (ids `ai0`, `ai1`, … in order), sailed by AI sailors only. */
export type OpponentBoat = FleetBoat<SailorProfile>;

export type Fleet = {
  boatClass: BoatClass;
  /** The player's Role and Control mode (Helm, Player Career when there is no player or the class is single-handed). */
  choice: PlayerChoice;
  /** The player's Partner, on the player's boat (two-person classes with a player only). */
  partner: SailorProfile | null;
  player: PlayerBoat | null;
  opponents: OpponentBoat[];
};

export type FleetOptions = {
  boatClass?: BoatClass;
  /** Include the player's boat (false for AI-only test races). */
  withPlayer?: boolean;
  /** Two-person classes: the player's Role and Control mode (default: Helm, Player Career), and their Partner. */
  choice?: PlayerChoice;
  partner?: SailorProfile;
  /** The Rivals to race against (default: the Rival roster). In two-person classes the Partner leaves them for the
   *  player's boat and the extra Helm takes their place; each opponent Helm gets a Crew from the Crew roster. */
  rivals?: readonly SailorProfile[];
};

/** The quick race's fleet: the player (if any) and three opponents, spread out below the start line. */
export function makeFleet(opts: FleetOptions = {}): Fleet {
  const cls = opts.boatClass ?? OPTIMIST;
  const two = isTwoPerson(cls);
  // Two-person boats are bigger, and so is their course: spread them further apart.
  const scale = two ? 1.4 : 1;
  let rivals: readonly SailorProfile[] = opts.rivals ?? RIVALS;
  let choice = HELM;
  let partner: SailorProfile | null = null;
  let player: PlayerBoat | null = null;
  if (opts.withPlayer !== false) {
    const start = { downwind: 30 * scale, across: 6 * scale, heading: -70 * DEG };
    if (two) {
      choice = opts.choice ?? HELM;
      partner = opts.partner ?? rivals[1];
      player = choice.role === "crew"
        ? { id: "player", helm: partner, crew: "player", start }
        : { id: "player", helm: "player", crew: partner, start };
      // The Partner is on the player's boat, so race against the other Rivals plus the extra Helm.
      rivals = opponentHelms(rivals, partner);
    } else {
      player = { id: "player", helm: "player", crew: null, start };
    }
  }
  const opponents = rivals.map((helm, i): OpponentBoat => ({
    id: `ai${i}`,
    helm,
    crew: two ? opponentCrew(i) : null,
    start: { downwind: (24 + i * 2) * scale, across: (-16 + i * 14) * scale, heading: -80 * DEG },
  }));
  return { boatClass: cls, choice, partner, player, opponents };
}
