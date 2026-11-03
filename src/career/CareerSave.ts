/**
 * The Career's saved state and its codec: pure functions between the state and versioned JSON text. No text for the
 * player here (ADR 0001): a save that cannot be read is data (`{ ok: false }`) and the menu words it.
 */
import { isClassId, type ClassId } from "../sailing/BoatClass";
import { seasonCalendar } from "./Calendar";
import { MAX_STARTING_AGE, MIN_STARTING_AGE } from "./Ages";
import { RIVALS } from "../sailors/Sailors";
import type { PlayerChoice } from "../race/PlayerChoice";
import type { PoolSailor } from "./Pool";
import type { RaceEntry } from "./Scoring";

export type CareerState = {
  /** The save format version; `CAREER_VERSION` for anything produced by this code. */
  version: number;
  /** Seeds the sailor pool and everything else generated for this Career. */
  seed: number;
  /** The player's age in Season 1 (8..12); age later is `startingAge + Seasons completed`. */
  startingAge: number;
  /** The current Season, from 1. */
  season: number;
  /** The class sailed this Season; it picks the Season's calendar. */
  classId: ClassId;
  /** The Regatta in progress, as an index into the calendar. */
  regattaIndex: number;
  /**
   * The Races sailed so far this Season, by Regatta: `results[i]` holds the Races of calendar Regatta `i`, so there
   * are `regattaIndex + 1` lists, every earlier Regatta complete and the current one possibly empty.
   */
  results: RaceEntry[][][];
  /** The sailor pool: the Rivals and the generated sailors, with the profiles they have now. Matched by `id`. */
  pool: PoolSailor[];
  /** The Partner in a two-person class (a pool sailor's `id`), or `null` in the Optimist. */
  partnerId: string | null;
  /** The player's Role and Control mode in a two-person class (Helm, Player Career in the Optimist, where they do not matter). */
  choice: PlayerChoice;
  /** Crew Chemistry 0..100 of the Pair now, or `null` without a Partner. It moves after each 420 Regatta. */
  chemistry: number | null;
  /** The Chemistry history: by sailor `id`, the Seasons the player raced in the same fleets as them, or with them as Partner. */
  seasonsTogether: Record<string, number>;
};

export const CAREER_VERSION = 2;

export type CareerLoad = { ok: true; state: CareerState } | { ok: false };

export function encodeCareer(state: CareerState): string {
  return JSON.stringify(state);
}

/** One step of a migration: a saved object of version N becomes one of version N + 1. It may throw on bad data. */
export type CareerMigration = (saved: Record<string, unknown>) => Record<string, unknown>;

/** Where each Regatta of the version 1 calendar (club, regional, national, international) sits in the version 2 one. */
const V1_REGATTA_SLOT: readonly number[] = [0, 1, 5, 6];
/** The Races of the version 1 regional Regatta that the first Zonale stage keeps. */
const ZONALE_STAGE_RACES = 2;

/**
 * Version 1 had four Regattas; version 2 has seven (the Zonale is four stages). A saved Regatta moves to the slot of its
 * level, the Races already sailed move with it (the old regional keeps its first two Races, as stage 1), and the Zonale
 * stages skipped over stay empty. A regional Regatta with two Races sailed is complete now, so the Career moves on.
 */
const migrateCalendar: CareerMigration = saved => {
  const { regattaIndex, results } = saved;
  if (!isInt(regattaIndex, 0) || regattaIndex >= V1_REGATTA_SLOT.length || !Array.isArray(results) || results.length !== regattaIndex + 1) {
    throw new RangeError("Not a version 1 save");
  }
  const moved: unknown[][] = [];
  results.forEach((races: unknown[], i) => { moved[V1_REGATTA_SLOT[i]] = i === 1 ? races.slice(0, ZONALE_STAGE_RACES) : races; });
  let index = V1_REGATTA_SLOT[regattaIndex];
  if (index === 1 && moved[1].length >= ZONALE_STAGE_RACES) { index = 2; moved[2] = []; }
  return { ...saved, regattaIndex: index, results: Array.from({ length: index + 1 }, (_, i) => moved[i] ?? []) };
};

/**
 * Migrations by the version they start from. A change to the shape raises `CAREER_VERSION` and adds the step from the
 * old version here.
 */
export const CAREER_MIGRATIONS: Readonly<Record<number, CareerMigration>> = { 1: migrateCalendar };

const STATUSES: readonly string[] = ["finished", "ocs", "dsq", "dnf"];

const isInt = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isEntry(v: unknown): v is RaceEntry {
  if (!isRecord(v) || typeof v.id !== "string" || v.id === "" || typeof v.status !== "string" || !STATUSES.includes(v.status)) return false;
  return v.status === "finished" ? isInt(v.place, 1) : v.place === undefined;
}

const ATTRIBUTES = ["technique", "tactics", "speed", "discipline"] as const;

function isPoolSailor(v: unknown): v is PoolSailor {
  if (!isRecord(v) || typeof v.id !== "string" || v.id === "" || typeof v.name !== "string" || v.name === "") return false;
  if (!isInt(v.startingAge, 5) || v.startingAge > 20) return false;
  if (v.bond !== undefined && !(typeof v.bond === "number" && v.bond >= 0 && v.bond <= 100)) return false;
  return ATTRIBUTES.every(a => typeof v[a] === "number" && v[a] >= 0 && v[a] <= 1);
}

/** The pool: sailors with distinct ids, the Rivals among them. */
function isPool(v: unknown): v is PoolSailor[] {
  return Array.isArray(v) && v.every(isPoolSailor)
    && new Set(v.map(s => s.id)).size === v.length
    && RIVALS.every(r => v.some(s => s.id === r.id));
}

function isChoice(v: unknown): v is PlayerChoice {
  if (!isRecord(v)) return false;
  return (v.role === "helm" && (v.control === "playerCareer" || v.control === "fullBoat")) || (v.role === "crew" && v.control === "playerCareer");
}

/** The Seasons raced together: whole counts by the id of a pool sailor. */
function isHistory(v: unknown, pool: PoolSailor[]): v is Record<string, number> {
  return isRecord(v) && Object.entries(v).every(([id, n]) => isInt(n, 1) && pool.some(s => s.id === id));
}

/** The Races of the Regattas begun so far: one list per Regatta up to `regattaIndex`, earlier ones complete (or empty: skipped by a migration). */
function isResults(v: unknown, classId: ClassId, regattaIndex: number): v is RaceEntry[][][] {
  const calendar = seasonCalendar(classId);
  if (regattaIndex >= calendar.length || !Array.isArray(v) || v.length !== regattaIndex + 1) return false;
  return v.every((races: unknown, i) =>
    Array.isArray(races)
    && (i < regattaIndex ? races.length === calendar[i].races || races.length === 0 : races.length <= calendar[i].races)
    && races.every(race => Array.isArray(race) && race.length > 0 && race.every(isEntry)));
}

/**
 * Reads a save, migrating older versions step by step. Anything it cannot read (not JSON, not an object, a field of
 * the wrong type, an unknown or newer version, a failing migration) is `{ ok: false }`, never a throw. `migrations`
 * and `current` default to the game's own; they are parameters so migrations can be tested.
 */
export function decodeCareer(
  text: string, migrations: Readonly<Record<number, CareerMigration>> = CAREER_MIGRATIONS, current = CAREER_VERSION,
): CareerLoad {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !isInt(parsed.version, 1) || parsed.version > current) return { ok: false };
    let saved = parsed;
    let version = parsed.version;
    while (version !== current) {
      const step = migrations[version];
      if (!step) return { ok: false };
      saved = step(saved);
      version++;
    }
    const { seed, startingAge, season, classId, regattaIndex, results, pool, partnerId, choice, chemistry, seasonsTogether } = saved;
    if (!isInt(seed, 0) || !isInt(season, 1)) return { ok: false };
    if (!isInt(startingAge, MIN_STARTING_AGE) || startingAge > MAX_STARTING_AGE) return { ok: false };
    if (typeof classId !== "string" || !isClassId(classId)) return { ok: false };
    if (!isInt(regattaIndex, 0) || !isResults(results, classId, regattaIndex)) return { ok: false };
    if (!isPool(pool) || !isChoice(choice) || !isHistory(seasonsTogether, pool)) return { ok: false };
    const paired = classId === "420";
    if (!paired && (partnerId !== null || chemistry !== null)) return { ok: false };
    if (paired && (typeof partnerId !== "string" || !pool.some(s => s.id === partnerId)
      || typeof chemistry !== "number" || chemistry < 0 || chemistry > 100)) return { ok: false };
    return {
      ok: true,
      state: { version: current, seed, startingAge, season, classId, regattaIndex, results, pool, partnerId: partnerId as string | null, choice, chemistry: chemistry as number | null, seasonsTogether },
    };
  } catch {
    return { ok: false };
  }
}

/** The own storage key of the one Career slot. */
export const CAREER_KEY = "sl-career";

/** The part of the browser's `localStorage` the save uses (same shape as the preferences' storage). */
export interface CareerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Loads the saved Career: `null` when there is none (or the storage is unavailable), `{ ok: false }` when there is one
 * that cannot be read. `storage` is a getter because merely reaching `localStorage` can throw.
 */
export function loadCareer(storage: () => CareerStorage): CareerLoad | null {
  let text: string | null;
  try { text = storage().getItem(CAREER_KEY); } catch { return null; }
  return text === null ? null : decodeCareer(text);
}

/** Saves the Career; does nothing if the storage is unavailable. */
export function saveCareer(storage: () => CareerStorage, state: CareerState) {
  try { storage().setItem(CAREER_KEY, encodeCareer(state)); } catch { /* ignore */ }
}
