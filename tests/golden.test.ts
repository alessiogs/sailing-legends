/**
 * Golden race test: nine fixed-seed races must sail exactly as recorded in `tests/golden/races.json`
 * (positions, headings, speeds, finish times, standings, DSQs, event kinds with boats and times).
 * A difference means behaviour changed. Fix the code. Do not update the snapshot to make a refactor pass.
 *
 * This test only reads the snapshot. It is written only by `npm run golden:update`.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOLDEN_RACES, sailGoldenRace, SNAPSHOT_URL, type GoldenRecord } from "./golden/races";

const path = fileURLToPath(SNAPSHOT_URL);

describe("golden races", () => {
  it("the snapshot exists and lists exactly the golden races", () => {
    expect(existsSync(path), `missing ${path}: run npm run golden:update on unchanged code`).toBe(true);
    expect(Object.keys(load())).toEqual(GOLDEN_RACES.map(g => g.name));
  });

  for (const g of GOLDEN_RACES) {
    it(`${g.name} sails as recorded`, () => {
      const expected = load()[g.name];
      expect(expected, `no snapshot entry for "${g.name}"`).toBeDefined();
      expect(sailGoldenRace(g)).toEqual(expected);
    }, 120_000);
  }
});

let cache: Record<string, GoldenRecord> | null = null;
function load(): Record<string, GoldenRecord> {
  if (!existsSync(path)) throw new Error(`missing ${path}: run npm run golden:update on unchanged code`);
  return (cache ??= JSON.parse(readFileSync(path, "utf8")) as Record<string, GoldenRecord>);
}
