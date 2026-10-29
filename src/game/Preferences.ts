import type { ControlSettings } from "../core/ControlSettings";
import { isLanguage, type Language } from "../i18n";

/**
 * The player's preferences: control settings, mute and the language. Stored per viewer as JSON under `PREFS_KEY`:
 * `{ controls: { steering, autoCenter, tillerSpeed, sheetSpeed }, muted, language? }`;
 * `language` is absent until the player picks one (then the browser's language decides). Keep that format, or preferences
 * saved by earlier versions stop loading. Storage is best effort: it may be unavailable, and then the
 * defaults load and saving does nothing.
 */
export type Preferences = { controls: ControlSettings; muted: boolean; language?: Language };

export const PREFS_KEY = "sl-prefs";

/** The part of the browser's `localStorage` the preferences use. */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What may be stored: anything an earlier version wrote, or nothing. */
type StoredPrefs = { controls?: Partial<ControlSettings>; muted?: boolean; language?: unknown };

/** A plain object, or an empty one for anything else (`null`, a number, an array, ...): stored JSON may be any value. */
const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function readJson(storage: () => PrefsStorage): unknown {
  try { return JSON.parse(storage().getItem(PREFS_KEY) || "{}"); } catch { return {}; }
}

/**
 * Loads the saved preferences, each missing or invalid setting falling back to its default. `storage` is a
 * getter because merely reaching `localStorage` can throw (e.g. with site data blocked).
 */
export function loadPrefs(storage: () => PrefsStorage): Preferences {
  const prefs = asObject(readJson(storage)) as StoredPrefs;
  const c = asObject(prefs.controls) as Partial<ControlSettings>;
  return {
    controls: {
      steering: c.steering === "boat" ? "boat" : "tiller",
      autoCenter: c.autoCenter !== false,
      tillerSpeed: typeof c.tillerSpeed === "number" ? c.tillerSpeed : 1,
      sheetSpeed: typeof c.sheetSpeed === "number" ? c.sheetSpeed : 1,
    },
    muted: !!prefs.muted,
    ...(isLanguage(prefs.language) ? { language: prefs.language } : {}),
  };
}

/** Saves the preferences; does nothing if the storage is unavailable. */
export function savePrefs(storage: () => PrefsStorage, prefs: Preferences) {
  try { storage().setItem(PREFS_KEY, JSON.stringify({ controls: prefs.controls, muted: prefs.muted, language: prefs.language })); } catch { /* ignore */ }
}
