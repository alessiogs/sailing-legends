/** Words a Rival comparison from `career` (ADR 0001: the data has ids and point gaps, the catalogs have the sentences). */
import { t } from "../i18n";
import type { RivalComparison } from "../career/Standings";

/** "Luca beat you by 2 points" / "You beat Luca by 2 points", or the tie-break forms when the gap is 0. */
export function rivalLine(c: RivalComparison, name: string): string {
  if (c.gap === 0) return t(c.rivalAhead ? "career.rival.tieBeatYou" : "career.rival.youTie", { name });
  return t(c.rivalAhead ? "career.rival.beatYou" : "career.rival.youBeat", { name, gap: c.gap });
}
