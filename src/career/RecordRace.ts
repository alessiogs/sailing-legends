/**
 * Recording a sailed Race into the Career: the Race's outcome read off the race (`raceEntries`) and added to the state
 * (`recordRace`). Pure, no text (ADR 0001).
 */
import type { Fleet } from "../race/Fleet";
import type { Racer } from "../race/Race";
import { seasonCalendar } from "./Calendar";
import type { CareerState } from "./CareerSave";
import { applyRegattaChemistry } from "./Chemistry";
import { FLEET_SIZE } from "./Fleets";
import { PLAYER_ID } from "./PlayerId";
import type { RaceEntry } from "./Scoring";

export { PLAYER_ID };

/**
 * The outcome of a finished (or stopped) race as Career entries, one per boat. A boat is named by its Helm: the player
 * is `player`, and opponent boat `aiN` is the Helm `fleet.opponents[N].helm.id`, since racer ids are not sailor ids.
 * Finishers take places by finish time; a boat that finished owing a penalty is `dsq`; one that never finished is `ocs`
 * if it was still over the line at the start, else `dnf`.
 */
export function raceEntries(fleet: Fleet, racers: readonly Racer[]): RaceEntry[] {
  const sailorId = (r: Racer): string => {
    if (r.isPlayer) return PLAYER_ID;
    const seat = fleet.opponents[Number(r.id.slice(2))];
    if (!r.id.startsWith("ai") || !seat) throw new RangeError(`Racer ${r.id} is not a boat of the fleet`);
    return seat.helm.id;
  };
  const finishers = racers.filter(r => r.finishTime !== null && !r.dsq).sort((a, b) => a.finishTime! - b.finishTime!);
  return racers.map((r): RaceEntry => {
    const id = sailorId(r);
    if (r.dsq) return { id, status: "dsq" };
    if (r.finishTime === null) return { id, status: r.ocs ? "ocs" : "dnf" };
    return { id, status: "finished", place: finishers.indexOf(r) + 1 };
  });
}

/** Whether every Race of the Season is sailed: the last Regatta is complete (there is no Regatta after it to move to). */
export function isSeasonOver(state: CareerState): boolean {
  const calendar = seasonCalendar(state.classId);
  return state.regattaIndex === calendar.length - 1 && state.results[state.regattaIndex].length >= calendar[state.regattaIndex].races;
}

/**
 * The state after one more Race of the Regatta in progress. When that was the Regatta's last Race the next Regatta
 * begins; after the Season's last Regatta the state stays there (see `isSeasonOver`) until the Season is closed.
 * Throws a RangeError when the Season is over or `entries` is not exactly the Regatta's fleet (one entry per boat, no
 * sailor twice). The state given is not changed.
 */
export function recordRace(state: CareerState, entries: readonly RaceEntry[]): CareerState {
  if (isSeasonOver(state)) throw new RangeError("The Season is over: no Race left to record");
  const calendar = seasonCalendar(state.classId);
  const regatta = calendar[state.regattaIndex];
  if (entries.length !== FLEET_SIZE[regatta.level]) {
    throw new RangeError(`A ${regatta.level} Race has ${FLEET_SIZE[regatta.level]} entries, got ${entries.length}`);
  }
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new RangeError("A sailor is entered twice in the Race");
  const results = state.results.map((races, i) => i === state.regattaIndex ? [...races, entries.map(e => ({ ...e }))] : races);
  const regattaDone = results[state.regattaIndex].length >= regatta.races;
  if (!regattaDone) return { ...state, results };
  // A 420 Regatta just sailed moves the Pair's Crew Chemistry (a no-op in the Optimist).
  const scored = applyRegattaChemistry({ ...state, results }, state.regattaIndex);
  if (state.regattaIndex === calendar.length - 1) return scored;
  return { ...scored, regattaIndex: state.regattaIndex + 1, results: [...results, []] };
}
