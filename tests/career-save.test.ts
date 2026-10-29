/**
 * The Career save: the pure codec (state <-> versioned JSON text) and the storage adapter. Whatever cannot be read
 * is "unreadable", never a throw. Expected texts are written out by hand.
 */
import { describe, expect, it } from "vitest";
import { CAREER_KEY, decodeCareer, encodeCareer, loadCareer, saveCareer, type CareerStorage, type CareerMigration, type CareerState } from "../src/career/CareerSave";

const STATE: CareerState = { version: 1, seed: 12345, startingAge: 10, season: 1 };

describe("career save codec", () => {
  it("saves in the stored format", () => {
    expect(encodeCareer(STATE)).toBe('{"version":1,"seed":12345,"startingAge":10,"season":1}');
  });
  it("loads what it saved", () => {
    expect(decodeCareer(encodeCareer(STATE))).toEqual({ ok: true, state: STATE });
  });

  it("is unreadable for text that is not a save, never a throw", () => {
    for (const text of ["", "{not json", "null", "42", "[]", '"career"', "{}", "true"]) {
      expect(decodeCareer(text)).toEqual({ ok: false });
    }
  });
  it("is unreadable when a field has the wrong type or is out of range", () => {
    const bad = [
      '{"version":1,"seed":"12345","startingAge":10,"season":1}',
      '{"version":1,"seed":12345,"startingAge":10}',
      '{"version":1,"seed":1.5,"startingAge":10,"season":1}',
      '{"version":1,"seed":12345,"startingAge":10,"season":0}',
      '{"version":1,"seed":12345,"startingAge":null,"season":1}',
    ];
    for (const text of bad) expect(decodeCareer(text)).toEqual({ ok: false });
  });
  it("is unreadable for a version it does not know, older than the first or newer than this game", () => {
    expect(decodeCareer('{"version":0,"seed":1,"startingAge":10,"season":1}')).toEqual({ ok: false });
    expect(decodeCareer('{"version":99,"seed":1,"startingAge":10,"season":1}')).toEqual({ ok: false });
    expect(decodeCareer('{"seed":1,"startingAge":10,"season":1}')).toEqual({ ok: false });
  });

  describe("migrations", () => {
    // A pretend history: version 1 stored `age`, version 2 calls it `startingAge`, version 3 added `season`.
    const migrations: Record<number, CareerMigration> = {
      1: ({ age, ...rest }) => ({ ...rest, startingAge: age }),
      2: saved => ({ ...saved, season: 1 }),
    };
    it("runs every step from the saved version up to the current one", () => {
      const v1 = '{"version":1,"seed":7,"age":9}';
      expect(decodeCareer(v1, migrations, 3)).toEqual({ ok: true, state: { version: 3, seed: 7, startingAge: 9, season: 1 } });
      const v2 = '{"version":2,"seed":7,"startingAge":11}';
      expect(decodeCareer(v2, migrations, 3)).toEqual({ ok: true, state: { version: 3, seed: 7, startingAge: 11, season: 1 } });
    });
    it("is unreadable when a step is missing or throws", () => {
      expect(decodeCareer('{"version":1,"seed":7,"age":9}', { 2: migrations[2] }, 3)).toEqual({ ok: false });
      expect(decodeCareer('{"version":1,"seed":7,"age":9}', { 1: () => { throw new Error("bad"); } }, 2)).toEqual({ ok: false });
    });
    it("is unreadable when the migrated save is still invalid", () => {
      expect(decodeCareer('{"version":1,"seed":7,"age":"nine"}', migrations, 3)).toEqual({ ok: false });
    });
  });
});

/** A storage holding the given values. */
function memory(values: Record<string, string> = {}) {
  const store = { ...values };
  return { store, storage: (): CareerStorage => ({ getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }) };
}
const unavailable = (): CareerStorage => { throw new Error("storage disabled"); };

describe("career save storage", () => {
  it("saves under its own key and loads it back", () => {
    const { store, storage } = memory();
    saveCareer(storage, STATE);
    expect(Object.keys(store)).toEqual([CAREER_KEY]);
    expect(CAREER_KEY).toBe("sl-career");
    expect(store["sl-career"]).toBe('{"version":1,"seed":12345,"startingAge":10,"season":1}');
    expect(loadCareer(storage)).toEqual({ ok: true, state: STATE });
  });
  it("finds no save (null) when nothing is stored or the storage is unavailable", () => {
    expect(loadCareer(memory().storage)).toBe(null);
    expect(loadCareer(unavailable)).toBe(null);
  });
  it("finds a stored value it cannot read unreadable, never a throw", () => {
    expect(loadCareer(memory({ "sl-career": "{broken" }).storage)).toEqual({ ok: false });
    expect(loadCareer(memory({ "sl-career": "null" }).storage)).toEqual({ ok: false });
  });
  it("saving does nothing when the storage is unavailable", () => {
    saveCareer(unavailable, STATE);
  });
});
