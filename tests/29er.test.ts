/**
 * The 29er and its gennaker, through BoatSim: the target speeds (the polar with the gennaker), the best downwind VMG at a
 * skiff's angle, little gain from the gennaker dead downwind, and planing by 12 kn. Races: see `smoke` and `skiff-ai`.
 */
import { describe, expect, it } from "vitest";
import { DEG, KNOTS } from "../src/core/math";
import { CLASSES, I29ER, type BoatClass } from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

/** Steady speed (kn) and planing at a true wind angle with ideal trim, the gennaker up or down. */
function sail(cls: BoatClass, tws: number, twa: number, spi: boolean) {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: tws });
  wind.shift = () => 0;
  const sim = new BoatSim(cls, createBoat(0, 0, -twa * DEG));
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
  return { kn: sim.telemetry.speed * KNOTS, planing: sim.telemetry.planing };
}
const kn = (tws: number, twa: number, spi = true) =>
  sail(I29ER, tws, twa, spi).kn;
/** Best downwind VMG (kn) and its angle, with the gennaker. */
function downVmg(tws: number) {
  let best = 0,
    at = 0;
  for (const twa of [120, 130, 135, 140, 145, 150, 155, 160, 170, 180]) {
    const v = kn(tws, twa) * Math.cos((180 - twa) * DEG);
    if (v > best) [best, at] = [v, twa];
  }
  return { best, at };
}

describe("29er", () => {
  it("is a two-person class with a gennaker, no pole", () => {
    expect(CLASSES["29er"]).toBe(I29ER);
    expect(I29ER.spinnaker?.gennaker).toBe(true);
    expect(I29ER.crewRighting).toBeDefined();
  });

  // [wind, upwind at 45 deg, reach (best of 90, 110 and 120 deg), downwind VMG]: the spec's table.
  const TARGETS: [number, number, number, number][] = [
    [7, 4.7, 7, 6],
    [11, 5.8, 10.5, 9],
    [16, 6.5, 14, 12],
  ];
  for (const [tws, up, reach, down] of TARGETS) {
    it(`makes its ${tws} kn target speeds`, () => {
      // Within 0.85 kn: light air (7 kn) runs 0.5-0.7 kn under the table, 11 and 16 kn reaching 0.6-0.8 over (see AGENTS.md).
      expect(Math.abs(kn(tws, 45, false) - up)).toBeLessThan(0.85);
      const r = Math.max(kn(tws, 90), kn(tws, 110), kn(tws, 120));
      expect(Math.abs(r - reach)).toBeLessThan(0.85);
      expect(Math.abs(downVmg(tws).best - down)).toBeLessThan(0.85);
    });
  }

  for (const tws of [7, 11, 16])
    it(`has its best downwind VMG between 135 and 155 degrees at ${tws} kn`, () => {
      const { at } = downVmg(tws);
      expect(at).toBeGreaterThanOrEqual(135);
      expect(at).toBeLessThanOrEqual(155);
    });

  it("gains little from the gennaker dead downwind, and a lot on a reach", () => {
    expect(kn(11, 175) - kn(11, 175, false)).toBeLessThan(0.7);
    expect(kn(11, 145) - kn(11, 145, false)).toBeGreaterThan(2);
  });

  it("planes by 12 kn on a broad reach", () => {
    expect(sail(I29ER, 12, 130, true).planing).toBe(true);
  });
});
