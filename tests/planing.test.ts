/**
 * Fore-aft weight and planing: the 420 planes on a breezy reach with its weight aft and the boat flat; the Optimist gains a
 * little downwind with its bow up. The Helm's fore-aft position is automatic (ideal).
 */
import { describe, expect, it } from "vitest";
import { DEG, KNOTS } from "../src/core/math";
import { I420, OPTIMIST, type BoatClass } from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

/** Holds `twa` for 40 s in steady wind with ideal sheets and weight. `crewOut` overrides the Crew's weight (to heel the boat). */
function sail(cls: BoatClass, kn: number, twa: number, opts: { spi?: boolean; crewOut?: number } = {}) {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: kn });
  wind.shift = () => 0;
  const sim = new BoatSim(cls, createBoat(0, 0, -twa * DEG));
  const c: Controls = { rudder: 0, sheet: 0.5, jibSheet: 0.5, spiSheet: 0.5, crewOut: 0.3, spi: opts.spi ?? false };
  for (let i = 0; i < 60 * 40; i++) {
    sim.state.heading = -twa * DEG;
    sim.state.yawRate = 0;
    const t = sim.telemetry;
    c.sheet = t.optimalSheet;
    c.jibSheet = t.jib?.optimal ?? 0.5;
    c.spiSheet = t.spi?.optimal ?? 0.5;
    c.crewOut = opts.crewOut ?? t.crew?.ideal ?? 0;
    sim.step(1 / 60, c, wind);
  }
  return sim;
}
const knots = (sim: BoatSim) => sim.telemetry.speed * KNOTS;

describe("Planing", () => {
  it("has a 420 plane on a 16 kn reach, not at 9 or 11 kn, and not close-hauled", () => {
    expect(sail(I420, 16, 100).telemetry.planing).toBe(true);
    expect(sail(I420, 9, 100).telemetry.planing).toBe(false);
    expect(sail(I420, 11, 100).telemetry.planing).toBe(false);
    expect(sail(I420, 16, 45).telemetry.planing).toBe(false);
  });

  it("does not plane a 420 that is heeled over", () => {
    const heeled = sail(I420, 16, 100, { crewOut: 0 });
    expect(Math.abs(heeled.telemetry.heelDeg)).toBeGreaterThan(6);
    expect(heeled.telemetry.planing).toBe(false);
  });

  it("keeps the 420 at 16 kn within target: 8-9 kn reaching, 9-10 with the spinnaker", () => {
    expect(knots(sail(I420, 16, 120))).toBeGreaterThanOrEqual(8);
    expect(knots(sail(I420, 16, 120))).toBeLessThanOrEqual(9);
    expect(knots(sail(I420, 16, 120, { spi: true }))).toBeGreaterThanOrEqual(9);
    expect(knots(sail(I420, 16, 120, { spi: true }))).toBeLessThanOrEqual(10);
  });

  it("leaves the 420 upwind speed alone", () => {
    expect(knots(sail(I420, 16, 45))).toBeCloseTo(5.6, 1);
    expect(knots(sail(I420, 11, 45))).toBeCloseTo(3.7, 1);
  });

  it("gives the Optimist 3-5% downwind above 12 kn, none at 11 kn, and never reports planing", () => {
    // Speeds at 16 kn before bow-up: 4.6 at 120 degrees, 4.2 at 180.
    const gain120 = knots(sail(OPTIMIST, 16, 120)) / 4.6 - 1;
    const gain180 = knots(sail(OPTIMIST, 16, 180)) / 4.2 - 1;
    for (const g of [gain120, gain180]) {
      expect(g).toBeGreaterThanOrEqual(0.03);
      expect(g).toBeLessThanOrEqual(0.05);
    }
    expect(knots(sail(OPTIMIST, 11, 120))).toBeCloseTo(3.9, 1);
    expect(sail(OPTIMIST, 16, 120).telemetry.planing).toBe(false);
  });
});
