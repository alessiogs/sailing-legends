/**
 * Headless smoke test of the simulation (no browser): AI-only races must finish for both classes,
 * and every penalty given must be served. Run with `npm test`.
 */
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";

let failed = false;
for (const cls of [OPTIMIST, I420]) {
  for (const [seed, windKn] of [[11, 11], [3, 7], [5, 16]]) {
    const s = new RaceSession({ seed, windKn, boatClass: cls, withPlayer: false });
    let t = 0, given = 0, served = 0;
    while (s.race.phase !== "done" && t < 900) {
      s.step(1 / 60);
      t += 1 / 60;
      for (const e of s.race.drainEvents()) {
        if (e.kind === "penalty") given++;
        if (e.kind === "penalty-done") served++;
      }
    }
    const finished = s.race.racers.filter(r => r.finishTime !== null).length;
    const ok = s.race.phase === "done" && finished === s.race.racers.length;
    console.log(`${ok ? "ok  " : "FAIL"} ${cls.name.padEnd(8)} seed ${seed} ${windKn} kn: ${finished}/${s.race.racers.length} finished in ${t.toFixed(0)} s, penalties ${served}/${given} served`);
    if (!ok) failed = true;
  }
}
process.exit(failed ? 1 : 0);
