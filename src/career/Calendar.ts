/**
 * The Season calendar as data: the Regattas of a Season in the order they are sailed. No text here (ADR 0001): a venue
 * is a proper name, a level and an entry rule are ids the UI words. 0.5 has one fixed calendar per class; a later
 * version can give a Season several championships (each a list of `Regatta`s) and entry rules that depend on earlier
 * results, by adding to `EntryRule` and to these constants, without touching the shape of a `Regatta`.
 */
import type { ClassId } from "../sailing/BoatClass";

export type RegattaLevel = "club" | "regional" | "national" | "international";

/** Who may enter a Regatta. Only `open` (everyone) exists in 0.5; qualification rules come later. */
export type EntryRule = "open";

export type Regatta = {
  /** Unique within the calendar. */
  id: string;
  /** The venue's name; a name only until real venues arrive (0.8). */
  venue: string;
  level: RegattaLevel;
  classId: ClassId;
  /** The number of Races sailed. */
  races: number;
  /** Whether the worst Race score is left out of the Regatta total (see `scoreRegatta`). */
  discard: boolean;
  entry: EntryRule;
};

const LEVELS: readonly { level: RegattaLevel; venue: string }[] = [
  { level: "club", venue: "Torbole" },
  { level: "regional", venue: "Cervia" },
  { level: "national", venue: "Follonica" },
  { level: "international", venue: "Riva del Garda" },
];

/** The 0.5 calendar of a class: four Regattas of three Races, the Discard from the third Regatta. */
function standardCalendar(classId: ClassId): readonly Regatta[] {
  return LEVELS.map(({ level, venue }, i) => ({
    id: `${classId}-${level}`, venue, level, classId, races: 3, discard: i >= 2, entry: "open",
  }));
}

const CALENDARS: Readonly<Record<ClassId, readonly Regatta[]>> = {
  optimist: standardCalendar("optimist"),
  "420": standardCalendar("420"),
};

/** The Regattas of a Season sailed in this class, in order. */
export function seasonCalendar(classId: ClassId): readonly Regatta[] {
  return CALENDARS[classId];
}
