/**
 * Headless smoke test of the simulation (no browser): AI-only races must finish for both classes,
 * and every penalty given must be served. Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";

const DT = 1 / 60;
/** A race still running after this many simulated seconds counts as not finishing. */
const MAX_RACE_S = 900;

/** [seed, wind in knots]: medium, light and strong wind. */
const RACES: [number, number][] = [[11, 11], [3, 7], [5, 16]];

describe("AI-only races", () => {
  for (const cls of [OPTIMIST, I420]) {
    for (const [seed, windKn] of RACES) {
      it(`${cls.name} seed ${seed} ${windKn} kn: every boat finishes and serves every penalty`, () => {
        const s = new RaceSession({ seed, windKn, boatClass: cls, withPlayer: false });
        let t = 0, given = 0, served = 0;
        while (s.race.phase !== "done" && t < MAX_RACE_S) {
          s.step(DT);
          t += DT;
          for (const e of s.race.drainEvents()) {
            if (e.kind === "penalty") given++;
            if (e.kind === "penalty-done") served++;
          }
        }
        const finished = s.race.racers.filter(r => r.finishTime !== null).length;
        console.log(`${cls.name.padEnd(8)} seed ${seed} ${windKn} kn: ${finished}/${s.race.racers.length} finished in ${t.toFixed(0)} s, penalties ${served}/${given} served`);

        expect(s.race.phase).toBe("done");
        expect(finished).toBe(s.race.racers.length);
        expect(served).toBe(given);
      }, 60_000);
    }
  }
});
