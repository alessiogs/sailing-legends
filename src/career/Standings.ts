/**
 * Regatta and Season standings of a Career, and how the player did against their Rivals. Built on `Scoring.ts` with
 * the calendar's Discard setting. Pure data, no text (ADR 0001): ids, places and point gaps, which the UI words.
 */
import { RIVALS } from "../sailors/Sailors";
import { seasonCalendar } from "./Calendar";
import type { CareerState } from "./CareerSave";
import { PLAYER_ID } from "./RecordRace";
import { scoreRegatta, scoreSeason, type RegattaStanding, type SeasonStanding } from "./Scoring";

/** One Rival against the player in one ranking. */
export interface RivalComparison {
  rivalId: string;
  rivalPlace: number;
  playerPlace: number;
  /** Whether the Rival is ranked above the player. */
  rivalAhead: boolean;
  /** The difference in points between the two, always >= 0. It is 0 when a tie-break decided the order. */
  gap: number;
}

export interface RegattaReport {
  /** Index of the Regatta in the calendar. */
  regattaIndex: number;
  regattaId: string;
  /** The Regatta's ranking, best first. */
  regatta: RegattaStanding[];
  /** The Season ranking after this Regatta, best first. */
  season: SeasonStanding[];
  /** The player against each Rival in the Regatta (Rivals who did not sail it are left out). */
  regattaRivals: RivalComparison[];
  /** The same in the Season ranking so far. */
  seasonRivals: RivalComparison[];
}

export interface SeasonSummary {
  /** The final Season ranking, best first. */
  standings: SeasonStanding[];
  /** The player's row in it. */
  player: SeasonStanding;
  rivals: RivalComparison[];
}

/** Whether Regatta `index` has all its Races sailed. */
export function isRegattaComplete(state: CareerState, index: number): boolean {
  const regatta = seasonCalendar(state.classId)[index];
  return regatta !== undefined && (state.results[index]?.length ?? 0) >= regatta.races;
}

/** The index of the latest Regatta with all its Races sailed, or null when none is. */
export function lastCompleteRegatta(state: CareerState): number | null {
  for (let i = seasonCalendar(state.classId).length - 1; i >= 0; i--) if (isRegattaComplete(state, i)) return i;
  return null;
}

/** The player against each Rival who appears in `table` (a ranking with distinct places), Rivals in their usual order. */
export function compareWithRivals(table: readonly { id: string; place: number; points: number }[]): RivalComparison[] {
  const player = table.find(r => r.id === PLAYER_ID);
  if (!player) return [];
  return RIVALS.flatMap(({ id }) => {
    const rival = table.find(r => r.id === id);
    if (!rival) return [];
    return [{
      rivalId: id, rivalPlace: rival.place, playerPlace: player.place,
      rivalAhead: rival.place < player.place, gap: Math.abs(rival.points - player.points),
    }];
  });
}

/** The Regatta rankings of Regattas `0..through`, scored with each Regatta's own Discard. */
function regattaTables(state: CareerState, through: number): RegattaStanding[][] {
  const calendar = seasonCalendar(state.classId);
  return state.results.slice(0, through + 1).map((races, i) => scoreRegatta(races, calendar[i].discard));
}

/** The standings after Regatta `regattaIndex`, or null when that Regatta is not complete yet. */
export function regattaReport(state: CareerState, regattaIndex: number): RegattaReport | null {
  if (!isRegattaComplete(state, regattaIndex)) return null;
  const tables = regattaTables(state, regattaIndex);
  const regatta = tables[regattaIndex];
  const season = scoreSeason(tables);
  return {
    regattaIndex, regattaId: seasonCalendar(state.classId)[regattaIndex].id, regatta, season,
    regattaRivals: compareWithRivals(regatta), seasonRivals: compareWithRivals(season),
  };
}

/** The Season summary, or null while a Regatta of the Season is still to be sailed (or the player is not in it). */
export function seasonSummary(state: CareerState): SeasonSummary | null {
  const last = seasonCalendar(state.classId).length - 1;
  if (!isRegattaComplete(state, last)) return null;
  const standings = scoreSeason(regattaTables(state, last));
  const player = standings.find(s => s.id === PLAYER_ID);
  return player ? { standings, player, rivals: compareWithRivals(standings) } : null;
}
