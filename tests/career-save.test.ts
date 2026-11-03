/**
 * The Career save: the pure codec (state <-> versioned JSON text) and the storage adapter. Whatever cannot be read
 * is "unreadable", never a throw. Expected texts are written out by hand.
 */
import { describe, expect, it } from "vitest";
import { CAREER_KEY, decodeCareer, encodeCareer, loadCareer, saveCareer, type CareerStorage, type CareerMigration, type CareerState } from "../src/career/CareerSave";

/** A small pool: the three Rivals (a save needs them) and one more sailor, as stored. */
const sailor = (id: string, startingAge: number) => ({ id, name: id[0].toUpperCase() + id.slice(1), technique: 0.5, tactics: 0.6, speed: 0.7, discipline: 0.8, startingAge });
const POOL = [sailor("luca", 11), sailor("giulia", 10), sailor("marco", 9), sailor("ada", 10)];
const POOL_TEXT = '[' + POOL.map(p => `{"id":"${p.id}","name":"${p.name}","technique":0.5,"tactics":0.6,"speed":0.7,"discipline":0.8,"startingAge":${p.startingAge}}`).join(',') + ']';

const NO_PARTNER = { partnerId: null, choice: { role: "helm", control: "playerCareer" }, chemistry: null, seasonsTogether: {} };
const STATE: CareerState = {
  version: 2, seed: 12345, startingAge: 10, season: 2, classId: "optimist", regattaIndex: 1,
  results: [
    [[{ id: "me", status: "finished", place: 2 }, { id: "luca", status: "finished", place: 1 }],
     [{ id: "me", status: "dnf" }, { id: "luca", status: "finished", place: 1 }],
     [{ id: "me", status: "ocs" }, { id: "luca", status: "finished", place: 1 }]],
    [[{ id: "me", status: "dsq" }, { id: "luca", status: "finished", place: 1 }]],
  ],
  pool: POOL,
  partnerId: null, choice: { role: "helm", control: "playerCareer" }, chemistry: null, seasonsTogether: { luca: 1 },
};
/** The same fields as text, written out by hand. */
const STATE_TEXT = '{"version":2,"seed":12345,"startingAge":10,"season":2,"classId":"optimist","regattaIndex":1,"results":['
  + '[[{"id":"me","status":"finished","place":2},{"id":"luca","status":"finished","place":1}],'
  + '[{"id":"me","status":"dnf"},{"id":"luca","status":"finished","place":1}],'
  + '[{"id":"me","status":"ocs"},{"id":"luca","status":"finished","place":1}]],'
  + '[[{"id":"me","status":"dsq"},{"id":"luca","status":"finished","place":1}]]],"pool":' + POOL_TEXT
  + ',"partnerId":null,"choice":{"role":"helm","control":"playerCareer"},"chemistry":null,"seasonsTogether":{"luca":1}}';
/** A fresh Career's text, for the cases that vary one field. */
const field = (name: string, value: string) => {
  const fields: Record<string, string> = {
    version: "2", seed: "12345", startingAge: "10", season: "1", classId: '"optimist"', regattaIndex: "0", results: "[[]]", pool: POOL_TEXT,
    partnerId: "null", choice: '{"role":"helm","control":"playerCareer"}', chemistry: "null", seasonsTogether: "{}",
  };
  fields[name] = value;
  return "{" + Object.entries(fields).filter(([, v]) => v !== "").map(([k, v]) => `"${k}":${v}`).join(",") + "}";
};

describe("career save codec", () => {
  it("saves in the stored format", () => {
    expect(encodeCareer(STATE)).toBe(STATE_TEXT);
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
      field("seed", '"12345"'), field("seed", "1.5"), field("seed", "-1"),
      field("startingAge", "null"), field("startingAge", "7"), field("startingAge", "13"), field("startingAge", "10.5"),
      field("season", ""), field("season", "0"),
      field("classId", ""), field("classId", '"ilca"'), field("classId", "420"),
      field("regattaIndex", ""), field("regattaIndex", "-1"), field("regattaIndex", "4"), field("regattaIndex", "1"),
      field("pool", ""), field("pool", "{}"), field("pool", "[]"), field("pool", "null"),
      // no Rivals, a repeated id, a profile value over 1, a missing name, a bad age, a bad bond
      field("pool", POOL_TEXT.replace('"id":"marco"', '"id":"nico"')),
      field("pool", POOL_TEXT.replace('"id":"ada"', '"id":"luca"')),
      field("pool", POOL_TEXT.replace('"speed":0.7', '"speed":1.5')),
      field("pool", POOL_TEXT.replace('"name":"Ada",', "")),
      field("pool", POOL_TEXT.replace('"startingAge":10}]', '"startingAge":"ten"}]')),
      field("pool", POOL_TEXT.replace('"startingAge":10}]', '"startingAge":10,"bond":120}]')),
      // Partner, Role and Control mode, Chemistry and its history
      field("partnerId", ""), field("partnerId", '"ada"'), field("chemistry", "70"),
      field("choice", ""), field("choice", '{"role":"crew","control":"fullBoat"}'), field("choice", '{"role":"skipper","control":"playerCareer"}'),
      field("seasonsTogether", ""), field("seasonsTogether", "[]"), field("seasonsTogether", '{"nobody":1}'), field("seasonsTogether", '{"ada":0}'),
      field("classId", '"420"'), field("classId", '"420"').replace('"partnerId":null', '"partnerId":"zed"').replace('"chemistry":null', '"chemistry":60'),
      field("classId", '"420"').replace('"partnerId":null', '"partnerId":"ada"').replace('"chemistry":null', '"chemistry":160'),
      field("classId", '"420"').replace('"partnerId":null', '"partnerId":"ada"'),
      field("results", ""), field("results", "{}"), field("results", "[]"), field("results", "[[],[]]"),
      field("results", "[[1]]"),
      field("results", "[[[]]]"),
      field("results", "[[[1]]]"),
      field("results", '[[[{"id":"me","status":"finished"}]]]'),
      field("results", '[[[{"id":"me","status":"finished","place":0}]]]'),
      field("results", '[[[{"id":"me","status":"won","place":1}]]]'),
      field("results", '[[[{"id":7,"status":"finished","place":1}]]]'),
      field("results", '[[[{"id":"me","status":"ocs","place":1}]]]'),
      // four Races in a Regatta of three
      field("results", "[[[{\"id\":\"me\",\"status\":\"dnf\"}],[{\"id\":\"me\",\"status\":\"dnf\"}],[{\"id\":\"me\",\"status\":\"dnf\"}],[{\"id\":\"me\",\"status\":\"dnf\"}]]]"),
    ];
    for (const text of bad) expect(decodeCareer(text)).toEqual({ ok: false });
  });
  it("reads a 420 Career with its Partner, Role, Control mode, Chemistry and history", () => {
    const text = field("classId", '"420"').replace('"partnerId":null', '"partnerId":"ada"').replace('"chemistry":null', '"chemistry":64.5')
      .replace('{"role":"helm","control":"playerCareer"}', '{"role":"helm","control":"fullBoat"}').replace('"seasonsTogether":{}', '"seasonsTogether":{"ada":2}');
    expect(decodeCareer(text)).toEqual({ ok: true, state: {
      version: 2, seed: 12345, startingAge: 10, season: 1, classId: "420", regattaIndex: 0, results: [[]], pool: POOL,
      partnerId: "ada", choice: { role: "helm", control: "fullBoat" }, chemistry: 64.5, seasonsTogether: { ada: 2 },
    } });
  });
  it("is unreadable for a version it does not know, older than the first or newer than this game", () => {
    expect(decodeCareer(field("version", "0"))).toEqual({ ok: false });
    expect(decodeCareer(field("version", "99"))).toEqual({ ok: false });
    expect(decodeCareer(field("version", ""))).toEqual({ ok: false });
  });

  describe("migrations", () => {
    // A pretend history: version 1 stored `age`, version 2 calls it `startingAge`, version 3 added the rest.
    const migrations: Record<number, CareerMigration> = {
      1: ({ age, ...rest }) => ({ ...rest, startingAge: age }),
      2: saved => ({ ...saved, season: 1, classId: "optimist", regattaIndex: 0, results: [[]], pool: POOL, ...NO_PARTNER }),
    };
    it("runs every step from the saved version up to the current one", () => {
      const v1 = '{"version":1,"seed":7,"age":9}';
      expect(decodeCareer(v1, migrations, 3)).toEqual({ ok: true, state: { version: 3, seed: 7, startingAge: 9, season: 1, classId: "optimist", regattaIndex: 0, results: [[]], pool: POOL, ...NO_PARTNER } });
      const v2 = '{"version":2,"seed":7,"startingAge":11}';
      expect(decodeCareer(v2, migrations, 3)).toEqual({ ok: true, state: { version: 3, seed: 7, startingAge: 11, season: 1, classId: "optimist", regattaIndex: 0, results: [[]], pool: POOL, ...NO_PARTNER } });
    });
    it("is unreadable when a step is missing or throws", () => {
      expect(decodeCareer('{"version":1,"seed":7,"age":9}', { 2: migrations[2] }, 3)).toEqual({ ok: false });
      expect(decodeCareer('{"version":1,"seed":7,"age":9}', { 1: () => { throw new Error("bad"); } }, 2)).toEqual({ ok: false });
    });
    it("is unreadable when the migrated save is still invalid", () => {
      expect(decodeCareer('{"version":1,"seed":7,"age":"nine"}', migrations, 3)).toEqual({ ok: false });
    });

    it("moves a version 1 Career to the Zonale calendar by level, keeping the Races sailed", () => {
      const race = [{ id: "me", status: "dnf" }, { id: "luca", status: "finished", place: 1 }];
      const v1 = (regattaIndex: number, results: unknown) => JSON.stringify({ ...STATE, version: 1, regattaIndex, results });
      // National Regatta (old index 2) in progress: it becomes index 5, the old regional keeps two Races as stage 1.
      const national = decodeCareer(v1(2, [[race, race, race], [race, race, race], [race]]));
      expect(national.ok && national.state.regattaIndex).toBe(5);
      expect(national.ok && national.state.results.map(r => r.length)).toEqual([3, 2, 0, 0, 0, 1]);
      // Two of the three old regional Races sailed: stage 1 is complete, so the Career moves on to stage 2.
      const regional = decodeCareer(v1(1, [[race, race, race], [race, race]]));
      expect(regional.ok && regional.state.regattaIndex).toBe(2);
      expect(regional.ok && regional.state.results.map(r => r.length)).toEqual([3, 2, 0]);
      // The last Regatta becomes the last one of the new calendar.
      const done = decodeCareer(v1(3, [[race, race, race], [race, race, race], [race, race, race], [race, race, race]]));
      expect(done.ok && done.state.regattaIndex).toBe(6);
      expect(done.ok && done.state.version).toBe(2);
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
    expect(store["sl-career"]).toBe(STATE_TEXT);
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
