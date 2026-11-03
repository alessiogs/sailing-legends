/**
 * AI hiking: the Helm and Crew hike to the ideal with an error scaled by (1 - technique) and a lag on puffs, and roll
 * tacks by technique. Their draws come from their own streams, so the start plan keeps its two numbers first.
 */
import { describe, expect, it } from "vitest";
import { rng } from "../src/core/math";
import { hikeError, rollQuality } from "../src/ai/hiking";
import { I420 } from "../src/sailing/BoatClass";
import { makeFleet } from "../src/race/Fleet";
import { RaceSession } from "../src/race/RaceSession";
import { RIVALS } from "../src/sailors/Sailors";

const draws = (n: number, seed: number) => { const r = rng(seed); return Array.from({ length: n }, () => r()); };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rms = (xs: number[]) => Math.sqrt(mean(xs.map(x => x * x)));

describe("AI hiking", () => {
  it("rolls better the higher the technique", () => {
    const at = (tq: number) => draws(400, 1).map(u => rollQuality(tq, u));
    expect(mean(at(0.9))).toBeGreaterThan(mean(at(0.5)) + 0.1);
    expect(mean(at(0.5))).toBeGreaterThan(mean(at(0.1)) + 0.1);
    // Auto-hike's average roll (0.5) is beaten by a good sailor and not by a poor one
    expect(mean(at(0.9))).toBeGreaterThan(0.5);
    expect(mean(at(0.1))).toBeLessThan(0.5);
    for (const q of at(0.3).concat(at(1))) expect(q >= 0 && q <= 1).toBe(true);
  });

  it("makes a hiking error that shrinks with technique and vanishes at 1", () => {
    const at = (tq: number) => draws(400, 2).map(u => hikeError(tq, u));
    expect(rms(at(0.2))).toBeGreaterThan(rms(at(0.6)) * 1.8);
    expect(rms(at(0.6))).toBeGreaterThan(rms(at(0.9)) * 3);
    expect(rms(at(1))).toBe(0);
  });
});

/** Two 420s, identical but for technique, sailed in the same gusty 15 kn breeze: mean speed and mean hiking miss of each. */
function gusty() {
  const crew = (technique: number) => ({ ...RIVALS[1], technique });
  const seat = (technique: number) => ({ helm: { ...RIVALS[0], technique }, crew: crew(technique) });
  const fleet = makeFleet({ boatClass: I420, withPlayer: false, opponents: [seat(0.1), seat(0.95)] });
  const session = new RaceSession({ fleet, seed: 21, windKn: 15, countdown: 0 });
  const stats = [0, 1].map(() => ({ speed: 0, miss: 0, n: 0 }));
  for (let i = 0; i < 60 * 150; i++) {
    session.step(1 / 60);
    if (i < 60 * 15 || i % 6) continue;
    session.race.racers.forEach((r, k) => {
      const t = r.sim.telemetry;
      stats[k].speed += t.speed; stats[k].miss += Math.abs(r.sim.state.helmOut - t.helm!.ideal); stats[k].n++;
    });
  }
  return stats.map(x => ({ speed: x.speed / x.n, miss: x.miss / x.n }));
}

describe("AI hiking in gusts", () => {
  it("makes a low-technique boat miss the ideal more and sail slower than a high-technique one", () => {
    const [poor, good] = gusty();
    expect(poor.miss).toBeGreaterThan(good.miss * 1.5);
    expect(good.speed).toBeGreaterThan(poor.speed);
  });
});
