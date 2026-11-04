/**
 * The 49er through BoatSim: both sailors on the trapeze (the Helm's weight spans in / hiking / trapeze), planing from about 8 kn,
 * the target speeds (see AGENTS.md for how close they come) and a skiff's downwind angle. Races: see `smoke` and `golden`.
 */
import { describe, expect, it } from "vitest";
import { DEG, KNOTS } from "../src/core/math";
import { CLASSES, I49ER, isTwoPerson } from "../src/sailing/BoatClass";
import {
  BoatSim,
  createBoat,
  helmForce,
  helmOutFor,
  type Controls,
} from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

/** Steady speed (kn), planing and heel at a true wind angle with ideal trim; the Helm is on Auto-hike. */
function sail(tws: number, twa: number, spi: boolean) {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: tws });
  wind.shift = () => 0;
  const sim = new BoatSim(I49ER, createBoat(0, 0, -twa * DEG));
  const c: Controls = { rudder: 0, sheet: 0.5, crewOut: 0.3, spi };
  for (let i = 0; i < 60 * 40; i++) {
    sim.state.heading = -twa * DEG;
    sim.state.yawRate = 0;
    const t = sim.telemetry;
    c.sheet = t.optimalSheet;
    c.jibSheet = t.jib?.optimal ?? 0.5;
    c.spiSheet = t.spi?.optimal ?? 0.5;
    c.crewOut = t.crew?.ideal ?? 0;
    sim.step(1 / 60, c, wind);
  }
  const t = sim.telemetry;
  return {
    kn: t.speed * KNOTS,
    planing: t.planing,
    heel: Math.abs(t.heelDeg),
    overpowered: t.overpowered,
    helmOut: sim.state.helmOut,
  };
}

describe("49er", () => {
  it("is a two-person gennaker skiff whose Helm trapezes too", () => {
    expect(CLASSES["49er"]).toBe(I49ER);
    expect(isTwoPerson(I49ER)).toBe(true);
    expect(I49ER.spinnaker?.gennaker).toBe(true);
    expect(I49ER.helmRighting.trapeze).toBeGreaterThan(1);
  });

  it("rights the boat more with the Helm on the trapeze than hiking", () => {
    const hike = I49ER.hikeForce;
    const sitting = helmForce(I49ER, 0, hike);
    const hiking = helmForce(I49ER, 0.5, hike);
    const trapeze = helmForce(I49ER, 1, hike);
    expect(sitting).toBeLessThan(hiking);
    expect(hiking).toBeCloseTo(hike, 5);
    expect(trapeze).toBeGreaterThan(hiking * 2);
    for (const out of [0, 0.25, 0.5, 0.75, 1])
      expect(helmOutFor(I49ER, helmForce(I49ER, out, hike), hike)).toBeCloseTo(
        out,
        5,
      );
  });

  it("Auto-hike puts the Helm on the trapeze and keeps the boat flat in a breeze", () => {
    const r = sail(16, 45, false);
    expect(r.helmOut).toBeGreaterThan(0.6);
    expect(r.heel).toBeLessThan(12);
    const m = sail(11, 45, false);
    expect(m.helmOut).toBeGreaterThan(0.4);
    expect(m.overpowered).toBe(false);
    expect(m.heel).toBeLessThan(8);
  });

  it("planes at 11 kn on a reach", () => {
    expect(sail(11, 100, true).planing).toBe(true);
  });

  // [wind, upwind at 45 deg, reach (best of 90 and 120 deg), downwind VMG]: the spec's table, 42 deg upwind and a skiff's angle.
  const TARGETS: [number, number, number, number][] = [
    [7, 5.4, 8, 6.9],
    [11, 6.7, 13.5, 10.9],
    [16, 8.1, 18, 14.2],
  ];
  for (const [tws, up, reach, down] of TARGETS) {
    it(`makes its ${tws} kn target speeds`, () => {
      // Within 1.2 kn: the table is a guess and the game's 49er runs 0.2-0.8 kn off it (see AGENTS.md).
      expect(Math.abs(sail(tws, 45, false).kn - up)).toBeLessThan(1.2);
      const r = Math.max(
        ...[90, 120].flatMap((twa) => [
          sail(tws, twa, false).kn,
          sail(tws, twa, true).kn,
        ]),
      );
      expect(Math.abs(r - reach)).toBeLessThan(1.2);
      let best = 0,
        at = 0;
      for (const twa of [120, 130, 140, 150, 160, 170, 180]) {
        const v = sail(tws, twa, true).kn * Math.cos((180 - twa) * DEG);
        if (v > best) [best, at] = [v, twa];
      }
      expect(Math.abs(best - down)).toBeLessThan(1.2);
      expect(at).toBeGreaterThanOrEqual(135);
      expect(at).toBeLessThanOrEqual(155);
    });
  }
});
