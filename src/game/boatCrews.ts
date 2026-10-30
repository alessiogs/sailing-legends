/**
 * Who sails each boat of a race, as the boat views need them to draw the sailors: an id (their looks) and, in a
 * Career, an age (their size). Pure data, no Babylon. A sailor with no age in a Career (a quick race has none) is drawn
 * at the default height.
 */
import { ageInSeason } from "../career/Ages";
import type { CareerState } from "../career/CareerSave";
import type { Aboard, Fleet } from "../race/Fleet";
import type { BoatCrew, FigureWho } from "../world/pose/looks";

/** The id the player's figure is drawn from. */
export const PLAYER_FIGURE_ID = "player";

/** The sailors of every boat of `fleet`, by racer id; `career` gives the ages when the race is a Career Race. */
export function boatCrews(fleet: Fleet, career: CareerState | null): Map<string, BoatCrew> {
  const ageOf = (id: string): number | undefined => {
    if (!career) return undefined;
    if (id === PLAYER_FIGURE_ID) return ageInSeason(career.startingAge, career.season);
    const s = career.pool.find(p => p.id === id);
    return s && ageInSeason(s.startingAge, career.season);
  };
  const who = (a: Aboard): FigureWho => {
    const id = a === "player" ? PLAYER_FIGURE_ID : a.id;
    return { id, age: ageOf(id) };
  };
  const crews = new Map<string, BoatCrew>();
  for (const b of [...(fleet.player ? [fleet.player] : []), ...fleet.opponents]) {
    crews.set(b.id, { helm: who(b.helm), crew: b.crew && who(b.crew) });
  }
  return crews;
}
