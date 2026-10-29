import type { ControlSettings } from "../core/ControlSettings";

/**
 * The player's preferences: control settings and mute. Stored per viewer as JSON under `PREFS_KEY`:
 * `{ controls: { steering, autoCenter, tillerSpeed, sheetSpeed }, muted }`. Keep that format, or preferences
 * saved by earlier versions stop loading. Storage is best effort: it may be unavailable, and then the
 * defaults load and saving does nothing.
 */
export type Preferences = { controls: ControlSettings; muted: boolean };

export const PREFS_KEY = "sl-prefs";

/** The part of the browser's `localStorage` the preferences use. */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What may be stored: anything an earlier version wrote, or nothing. */
type StoredPrefs = { controls?: Partial<ControlSettings>; muted?: boolean };

/**
 * Loads the saved preferences, each missing or invalid setting falling back to its default. `storage` is a
 * getter because merely reaching `localStorage` can throw (e.g. with site data blocked).
 */
export function loadPrefs(storage: () => PrefsStorage): Preferences {
  const prefs = (() => {
    try { return JSON.parse(storage().getItem(PREFS_KEY) || "{}") as StoredPrefs; } catch { return {}; }
  })();
  const c = prefs.controls ?? {};
  return {
    controls: {
      steering: c.steering === "boat" ? "boat" : "tiller",
      autoCenter: c.autoCenter !== false,
      tillerSpeed: typeof c.tillerSpeed === "number" ? c.tillerSpeed : 1,
      sheetSpeed: typeof c.sheetSpeed === "number" ? c.sheetSpeed : 1,
    },
    muted: !!prefs.muted,
  };
}

/** Saves the preferences; does nothing if the storage is unavailable. */
export function savePrefs(storage: () => PrefsStorage, prefs: Preferences) {
  try { storage().setItem(PREFS_KEY, JSON.stringify({ controls: prefs.controls, muted: prefs.muted })); } catch { /* ignore */ }
}
