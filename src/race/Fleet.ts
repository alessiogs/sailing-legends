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
  /**
   * Half the start line's length in metres, when the fleet is too big for the class's usual line (more than
   * `SMALL_FLEET` boats); unset means the usual line.
   */
  lineHalf?: number;
};

/** Who sails an opponent's boat: a Helm and, in two-person classes, a Crew. */
export type OpponentSeats = { helm: SailorProfile; crew: SailorProfile | null };

/** Up to this many boats keep the quick race's start spots and line; bigger fleets (a Career's) get a grid and a longer line. */
export const SMALL_FLEET = 4;

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
  /** Instead of `rivals`: exactly these opponent boats, in order (a Career's fleet). The Partner still sails with the player. */
  opponents?: readonly OpponentSeats[];
};

/**
 * The slot (0..3) along the start line that the AI of boat `index` of `boats` aims for: the boat's own index in a small
 * fleet, spread over the same 0..3 range in a bigger one. The player's boat has index `opponents.length`.
 */
export function startSlot(index: number, boats: number): number {
  return boats <= SMALL_FLEET ? index : index * 3 / (boats - 1);
}

const PER_ROW = 6;
/** The boats the usual start line holds; a bigger fleet's line grows in proportion. */
const LINE_BOATS = 5;

/** The start spot of boat `index` of a big fleet: rows of `PER_ROW` boats, each row below the last, staggered. */
function gridSpot(index: number, scale: number): StartSpot {
  const row = Math.floor(index / PER_ROW), col = index % PER_ROW;
  return {
    downwind: (24 + row * 12 + col * 2) * scale,
    across: ((col - (PER_ROW - 1) / 2) * 14 + (row % 2) * 7) * scale,
    heading: -80 * DEG,
  };
}

/** The quick race's fleet: the player (if any) and three opponents, spread out below the start line. */
export function makeFleet(opts: FleetOptions = {}): Fleet {
  const cls = opts.boatClass ?? OPTIMIST;
  const two = isTwoPerson(cls);
  // Two-person boats are bigger, and so is their course: spread them further apart.
  const scale = two ? 1.4 : 1;
  let rivals: readonly SailorProfile[] = opts.rivals ?? RIVALS;
  const given = opts.opponents;
  const withPlayer = opts.withPlayer !== false;
  const boats = given ? given.length + (withPlayer ? 1 : 0) : 0;
  const big = boats > SMALL_FLEET;
  let choice = HELM;
  let partner: SailorProfile | null = null;
  let player: PlayerBoat | null = null;
  if (withPlayer) {
    const start = big ? { ...gridSpot(given!.length, scale), heading: -70 * DEG } : { downwind: 30 * scale, across: 6 * scale, heading: -70 * DEG };
    if (two) {
      choice = opts.choice ?? HELM;
      partner = opts.partner ?? rivals[1];
      player = choice.role === "crew"
        ? { id: "player", helm: partner, crew: "player", start }
        : { id: "player", helm: "player", crew: partner, start };
      // The Partner is on the player's boat, so race against the other Rivals plus the extra Helm.
      if (!given) rivals = opponentHelms(rivals, partner);
    } else {
      player = { id: "player", helm: "player", crew: null, start };
    }
  }
  const seats: readonly OpponentSeats[] = given ?? rivals.map((helm, i) => ({ helm, crew: two ? opponentCrew(i) : null }));
  const opponents = seats.map(({ helm, crew }, i): OpponentBoat => ({
    id: `ai${i}`,
    helm,
    crew,
    start: big ? gridSpot(i, scale) : { downwind: (24 + i * 2) * scale, across: (-16 + i * 14) * scale, heading: -80 * DEG },
  }));
  // A bigger fleet needs a longer line: the usual half-length (24 m, 34 m in two-person classes) per five boats.
  const lineHalf = big ? (two ? 34 : 24) * Math.max(1, boats / LINE_BOATS) : undefined;
  return { boatClass: cls, choice, partner, player, opponents, ...(lineHalf === undefined ? {} : { lineHalf }) };
}
