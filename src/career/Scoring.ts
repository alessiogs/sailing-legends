/**
 * Low-point scoring for the Career: Race Points, a Regatta ranking (with the Discard) and the Season ranking.
 * Pure data in, data out: ids and numbers, no text (ADR 0001).
 */

export type RaceStatus = "finished" | "ocs" | "dsq" | "dnf";

/** One sailor-or-boat's outcome in a Race. `place` is 1-based and set for a finisher. */
export interface RaceEntry { id: string; status: RaceStatus; place?: number }

export interface RegattaStanding {
  id: string;
  /** 1 = winner; always distinct within a Regatta. */
  place: number;
  /** Total Points after the Discard. */
  points: number;
  /** Points of each Race in order, before the Discard. */
  scores: number[];
  /** Index of the Race left out of the total, or null. */
  discarded: number | null;
}

export interface SeasonStanding {
  id: string;
  place: number;
  /** Sum of the Regatta places (low point). */
  points: number;
  regattaPlaces: number[];
}

/** Points for one Race: the place for a finisher, otherwise (OCS, DSQ, not finished) the fleet size plus one. */
export function racePoints(entry: RaceEntry, fleetSize: number): number {
  return entry.status === "finished" && entry.place !== undefined ? entry.place : fleetSize + 1;
}

/** A ranking row before places are given: what counts toward the total, and the raw per-event scores. */
interface Row { id: string; counted: number[]; scores: number[] }

/**
 * Orders rows by lowest total, then (RRS A8) by the sorted counted scores best to worst, so most firsts, then
 * most seconds and so on, then by the better score in the last event. A complete tie keeps the input order.
 */
function rank(rows: Row[]): Row[] {
  const total = (r: Row) => r.counted.reduce((a, b) => a + b, 0);
  const sorted = (r: Row) => [...r.counted].sort((a, b) => a - b);
  return rows
    .map((row, i) => ({ row, i }))
    .sort((p, q) => {
      const dt = total(p.row) - total(q.row);
      if (dt) return dt;
      const sp = sorted(p.row), sq = sorted(q.row);
      for (let k = 0; k < sp.length; k++) if (sp[k] !== sq[k]) return sp[k] - sq[k];
      const last = p.row.scores.length - 1;
      return (p.row.scores[last] - q.row.scores[last]) || p.i - q.i;
    })
    .map(x => x.row);
}

/** Everyone who appears in any event, in order of first appearance. */
function idsOf(lists: string[][]): string[] {
  const seen = new Set<string>();
  for (const l of lists) for (const id of l) seen.add(id);
  return [...seen];
}

/**
 * Scores a Regatta from its Races. A sailor absent from a Race scores that fleet size plus one. With `discard`,
 * each sailor's worst score (the first, if equal) is left out of their total.
 */
export function scoreRegatta(races: RaceEntry[][], discard: boolean): RegattaStanding[] {
  const ids = idsOf(races.map(r => r.map(e => e.id)));
  const rows = ids.map(id => {
    const scores = races.map(race => {
      const entry = race.find(e => e.id === id);
      return entry ? racePoints(entry, race.length) : race.length + 1;
    });
    let discarded: number | null = null;
    if (discard && scores.length > 1) {
      discarded = scores.indexOf(Math.max(...scores));
    }
    return { id, scores, counted: scores.filter((_, i) => i !== discarded), discarded };
  });
  const ranked = rank(rows) as typeof rows;
  return ranked.map((r, i) => ({
    id: r.id, place: i + 1, points: r.counted.reduce((a, b) => a + b, 0), scores: r.scores, discarded: r.discarded,
  }));
}

/** The Season ranking: the low-point sum of Regatta places, with the same tie-breaks over those places. */
export function scoreSeason(regattas: RegattaStanding[][]): SeasonStanding[] {
  const ids = idsOf(regattas.map(r => r.map(s => s.id)));
  const rows = ids.map(id => {
    const scores = regattas.map(r => r.find(s => s.id === id)?.place ?? r.length + 1);
    return { id, scores, counted: scores };
  });
  return rank(rows).map((r, i) => ({
    id: r.id, place: i + 1, points: r.counted.reduce((a, b) => a + b, 0), regattaPlaces: r.scores,
  }));
}
