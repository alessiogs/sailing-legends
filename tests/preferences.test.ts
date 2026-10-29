/**
 * The player's preferences (controls and mute) are stored under "sl-prefs" as
 * `{ controls: { steering, autoCenter, tillerSpeed, sheetSpeed }, muted, language? }`. Preferences saved by earlier
 * versions of the game must still load, and saving must keep writing that same format.
 */
import { describe, expect, it } from "vitest";
import { loadPrefs, savePrefs, type Preferences, type PrefsStorage } from "../src/game/Preferences";

/** A storage holding the given values, recording what is written to it. */
function memory(values: Record<string, string> = {}) {
  const store = { ...values };
  return { store, storage: (): PrefsStorage => ({ getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }) };
}

const unavailable = (): PrefsStorage => { throw new Error("storage disabled"); };

const DEFAULTS: Preferences = { controls: { steering: "tiller", autoCenter: true, tillerSpeed: 1, sheetSpeed: 1 }, muted: false };

describe("preferences", () => {
  it("loads preferences saved by the current game", () => {
    const saved = '{"controls":{"steering":"boat","autoCenter":false,"tillerSpeed":1.5,"sheetSpeed":0.7},"muted":true}';
    const { storage } = memory({ "sl-prefs": saved });
    expect(loadPrefs(storage)).toEqual({
      controls: { steering: "boat", autoCenter: false, tillerSpeed: 1.5, sheetSpeed: 0.7 }, muted: true,
    });
  });

  it("falls back to the defaults when nothing is saved, the storage is unavailable or the value is broken", () => {
    expect(loadPrefs(memory().storage)).toEqual(DEFAULTS);
    expect(loadPrefs(unavailable)).toEqual(DEFAULTS);
    expect(loadPrefs(memory({ "sl-prefs": "{not json" }).storage)).toEqual(DEFAULTS);
  });

  it("fills each missing or invalid setting with its default", () => {
    const saved = '{"controls":{"steering":"rudder","tillerSpeed":"fast","sheetSpeed":2}}';
    expect(loadPrefs(memory({ "sl-prefs": saved }).storage)).toEqual({
      controls: { steering: "tiller", autoCenter: true, tillerSpeed: 1, sheetSpeed: 2 }, muted: false,
    });
  });

  it("saves in the stored format", () => {
    const { store, storage } = memory();
    savePrefs(storage, { controls: { steering: "boat", autoCenter: true, tillerSpeed: 0.6, sheetSpeed: 1 }, muted: true });
    expect(store["sl-prefs"]).toBe('{"controls":{"steering":"boat","autoCenter":true,"tillerSpeed":0.6,"sheetSpeed":1},"muted":true}');
  });

  it("loads preferences saved before the language existed, with no language chosen", () => {
    const saved = '{"controls":{"steering":"boat","autoCenter":true,"tillerSpeed":1,"sheetSpeed":1},"muted":false}';
    expect(loadPrefs(memory({ "sl-prefs": saved }).storage).language).toBeUndefined();
  });

  it("loads and saves the chosen language, next to the other settings", () => {
    const { store, storage } = memory();
    savePrefs(storage, { ...DEFAULTS, language: "en" });
    expect(store["sl-prefs"]).toBe('{"controls":{"steering":"tiller","autoCenter":true,"tillerSpeed":1,"sheetSpeed":1},"muted":false,"language":"en"}');
    expect(loadPrefs(storage)).toEqual({ ...DEFAULTS, language: "en" });
  });

  it("ignores a saved language that is not one of the game's", () => {
    expect(loadPrefs(memory({ "sl-prefs": '{"language":"de","muted":true}' }).storage).language).toBeUndefined();
  });

  it("ignores an unavailable storage when saving", () => {
    expect(() => savePrefs(unavailable, DEFAULTS)).not.toThrow();
  });
});
