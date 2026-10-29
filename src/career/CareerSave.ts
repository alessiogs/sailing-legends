/**
 * The Career's saved state and its codec: pure functions between the state and versioned JSON text. No text for the
 * player here (ADR 0001): a save that cannot be read is data (`{ ok: false }`) and the menu words it.
 */
import { isClassId, type ClassId } from "../sailing/BoatClass";
import { seasonCalendar } from "./Calendar";
import { MAX_STARTING_AGE, MIN_STARTING_AGE } from "./Ages";
import { RIVALS } from "../sailors/Sailors";
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
};

export const CAREER_VERSION = 1;

export type CareerLoad = { ok: true; state: CareerState } | { ok: false };

export function encodeCareer(state: CareerState): string {
  return JSON.stringify(state);
}

/** One step of a migration: a saved object of version N becomes one of version N + 1. It may throw on bad data. */
export type CareerMigration = (saved: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations by the version they start from. Empty while 0.5 is unreleased: a field added meanwhile bumps nothing.
 * After the release, a change to the shape raises `CAREER_VERSION` and adds the step from the old version here.
 */
export const CAREER_MIGRATIONS: Readonly<Record<number, CareerMigration>> = {};

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

/** The Races of the Regattas begun so far: one list per Regatta up to `regattaIndex`, earlier ones complete. */
function isResults(v: unknown, classId: ClassId, regattaIndex: number): v is RaceEntry[][][] {
  const calendar = seasonCalendar(classId);
  if (regattaIndex >= calendar.length || !Array.isArray(v) || v.length !== regattaIndex + 1) return false;
  return v.every((races: unknown, i) =>
    Array.isArray(races)
    && (i < regattaIndex ? races.length === calendar[i].races : races.length <= calendar[i].races)
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
    const { seed, startingAge, season, classId, regattaIndex, results, pool } = saved;
    if (!isInt(seed, 0) || !isInt(season, 1)) return { ok: false };
    if (!isInt(startingAge, MIN_STARTING_AGE) || startingAge > MAX_STARTING_AGE) return { ok: false };
    if (typeof classId !== "string" || !isClassId(classId)) return { ok: false };
    if (!isInt(regattaIndex, 0) || !isResults(results, classId, regattaIndex)) return { ok: false };
    if (!isPool(pool)) return { ok: false };
    return { ok: true, state: { version: current, seed, startingAge, season, classId, regattaIndex, results, pool } };
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
