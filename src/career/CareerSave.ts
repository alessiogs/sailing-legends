/**
 * The Career's saved state and its codec: pure functions between the state and versioned JSON text. No text for the
 * player here (ADR 0001): a save that cannot be read is data (`{ ok: false }`) and the menu words it.
 */
export type CareerState = {
  /** The save format version; `CAREER_VERSION` for anything produced by this code. */
  version: number;
  /** Seeds the sailor pool and everything else generated for this Career. */
  seed: number;
  /** The player's age in Season 1 (8..12); age later is `startingAge + Seasons completed`. */
  startingAge: number;
  /** The current Season, from 1. */
  season: number;
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

const isInt = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
    const { seed, startingAge, season } = saved;
    if (!isInt(seed, 0) || !isInt(startingAge, 1) || !isInt(season, 1)) return { ok: false };
    return { ok: true, state: { version: current, seed, startingAge, season } };
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
