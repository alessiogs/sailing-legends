/**
 * The Season calendar as data: the Regattas of a Season in the order they are sailed. No text here (ADR 0001): a venue
 * is a proper name, a level and an entry rule are ids the UI words. there is one fixed calendar per class; a later
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
  /** The hosting club's proper name, or "" when it is not known (the UI then shows the town alone). */
  club: string;
  /** The town where the Regatta is sailed. */
  town: string;
  level: RegattaLevel;
  /** The stage of the Zonale (the regional championship) this Regatta is, or `null` for any other Regatta. */
  stage: { number: number; of: number } | null;
  classId: ClassId;
  /** The number of Races sailed. */
  races: number;
  /** Whether the worst Race score is left out of the Regatta total (see `scoreRegatta`). */
  discard: boolean;
  entry: EntryRule;
};

/** The venue as one proper name: the club and the town, or the town alone when the club is not known. */
export function venueName(r: Pick<Regatta, "club" | "town">): string {
  return r.club === "" ? r.town : `${r.club}, ${r.town}`;
}

type Slot = { level: RegattaLevel; club: string; town: string; races: number; discard: boolean };

/** The Sardinian Zonale's four stages. */
const ZONALE = ["LNI Olbia|Olbia", "Circolo Nautico La Caletta|La Caletta", "Yacht Club Porto Rotondo|Porto Rotondo", "Yacht Club Cagliari|Cagliari"];

const SLOTS: readonly Slot[] = [
  { level: "club", club: "Circolo del Mare Fertilia", town: "Alghero", races: 3, discard: true },
  ...ZONALE.map((z): Slot => {
    const [club, town] = z.split("|");
    return { level: "regional", club, town, races: 2, discard: false };
  }),
  { level: "national", club: "", town: "Follonica", races: 3, discard: true },
  { level: "international", club: "Fraglia Vela Riva", town: "Riva del Garda", races: 3, discard: true },
];

/** The calendar of a class: the home club, the four Zonale stages, then the national and international Regattas. */
function standardCalendar(classId: ClassId): readonly Regatta[] {
  return SLOTS.map((slot, i) => {
    const stage = slot.level === "regional" ? { number: i, of: ZONALE.length } : null;
    return {
      id: stage ? `${classId}-regional-${stage.number}` : `${classId}-${slot.level}`,
      club: slot.club, town: slot.town, level: slot.level, stage, classId, races: slot.races, discard: slot.discard, entry: "open",
    };
  });
}
const CALENDARS: Readonly<Record<ClassId, readonly Regatta[]>> = {
  optimist: standardCalendar("optimist"),
  "420": standardCalendar("420"),
};

/** The Regattas of a Season sailed in this class, in order. */
export function seasonCalendar(classId: ClassId): readonly Regatta[] {
  return CALENDARS[classId];
}
