/**
 * AI skiffs on the run, through RaceSession: they hoist the gennaker, sail at a downwind VMG angle, gybe, and drop before the
 * leeward mark; and a sailor of better technique gets down the run faster. Physics: see `29er`; finishing: see `smoke`.
 */
import { describe, expect, it } from "vitest";
import { DEG } from "../src/core/math";
import { makeFleet } from "../src/race/Fleet";
import { distanceTo, legTarget } from "../src/race/Course";
import { RaceSession } from "../src/race/RaceSession";
import { I29ER } from "../src/sailing/BoatClass";
import { RIVALS, type SailorProfile } from "../src/sailors/Sailors";

const DT = 1 / 60;

/** Leg index of the run (mark 2); the sailors' state is sampled while sailing it. */
const RUN = 1;

type RunLog = { gybes: number; seconds: number; inZone: number };

/** Sails an AI-only 29er race and logs each boat's run: gybes, time spent between 130 and 160 degrees TWA, and the run's time. */
function sailRun(
  seed: number,
  windKn: number,
  rivals?: readonly SailorProfile[],
) {
  const s = new RaceSession({
    seed,
    windKn,
    fleet: makeFleet({ boatClass: I29ER, withPlayer: false, rivals }),
  });
  const logs = new Map<string, RunLog>();
  const boomSide = new Map<string, number>();
  const runStart = new Map<string, number>();
  const runTime: number[] = [];
  let t = 0;
  while (s.race.phase !== "done" && t < 1500) {
    s.step(DT);
    t += DT;
    for (const e of s.race.drainEvents()) {
      if (e.kind !== "rounded") continue;
      if (e.rounded.id === "mark1") runStart.set(e.racer.id, t);
      if (e.rounded.id === "mark2" && runStart.has(e.racer.id))
        runTime.push(t - runStart.get(e.racer.id)!);
    }
    for (const r of s.race.racers) {
      if (r.leg !== RUN || r.finishTime !== null) continue;
      const leg = s.race.course.legs[RUN];
      const st = r.sim.state;
      // Judge the open water of the run: not the rounding of the windward mark, nor the approach to the leeward one.
      const start = runStart.get(r.id) ?? t;
      if (t - start < 20 || distanceTo(legTarget(leg), st.x, st.z) < 45)
        continue;
      const log = logs.get(r.id) ?? { gybes: 0, seconds: 0, inZone: 0 };
      const twa = Math.abs(r.sim.telemetry.twa) / DEG;
      log.seconds += DT;
      if (twa >= 130 && twa <= 160) log.inZone += DT;
      if (boomSide.has(r.id) && boomSide.get(r.id) !== st.boomSide) log.gybes++;
      boomSide.set(r.id, st.boomSide);
      logs.set(r.id, log);
    }
  }
  return { logs, runTime, finished: s.race.phase === "done" };
}

describe("AI skiffs downwind", () => {
  for (const [seed, windKn] of [
    [11, 11],
    [3, 7],
    [5, 16],
  ]) {
    it(`gybe at least once and sail most of the run between 130 and 160 degrees (seed ${seed}, ${windKn} kn)`, () => {
      const { logs } = sailRun(seed, windKn);
      expect(logs.size).toBeGreaterThan(0);
      for (const [id, log] of logs) {
        expect(log.gybes, `${id} gybes`).toBeGreaterThanOrEqual(1);
        expect(log.inZone / log.seconds, `${id} in the zone`).toBeGreaterThan(
          0.5,
        );
      }
    }, 60_000);
  }

  it("get down the run faster with better technique", () => {
    const fleet = (technique: number) =>
      RIVALS.map((r) => ({ ...r, technique, tactics: 0.7, speed: 0.7 }));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const times = (technique: number) =>
      [2, 4, 6].flatMap((seed) => sailRun(seed, 11, fleet(technique)).runTime);
    const good = mean(times(0.95));
    const poor = mean(times(0.3));
    expect(good).toBeLessThan(poor);
  }, 120_000);
});
