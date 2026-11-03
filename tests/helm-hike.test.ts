/**
 * The Helm's hike in the physics: `helmOut` 0 (sitting in) .. 1 (fully out); unset, the Helm hikes as needed (Auto-hike).
 */
import { describe, expect, it } from "vitest";
import { DEG } from "../src/core/math";
import { I420, OPTIMIST, type BoatClass } from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

/** Holds `twa` for `secs` in steady wind with ideal sheets and Crew weight; `helmOut` undefined is Auto-hike. */
function sail(cls: BoatClass, kn: number, twa: number, helmOut: number | undefined, secs = 30) {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: kn });
  wind.shift = () => 0;
  const sim = new BoatSim(cls, createBoat(0, 0, -twa * DEG));
  const c: Controls = { rudder: 0, sheet: 0.5, jibSheet: 0.5, spiSheet: 0.5, crewOut: 0.3, spi: false };
  if (helmOut !== undefined) c.helmOut = helmOut;
  for (let i = 0; i < 60 * secs; i++) {
    sim.state.heading = -twa * DEG;
    sim.state.yawRate = 0;
    const t = sim.telemetry;
    c.sheet = t.optimalSheet;
    c.jibSheet = t.jib?.optimal ?? 0.5;
    c.crewOut = t.crew?.ideal ?? 0;
    sim.step(1 / 60, c, wind);
  }
  return sim;
}
/** Heel to leeward in degrees (negative: heeled to windward). */
const leeHeel = (sim: BoatSim) => -sim.telemetry.heelDeg * Math.sign(sim.telemetry.awa);

describe("Helm hike", () => {
  it("heels the boat to windward and slows it when over-hiking in light air", () => {
    const auto = sail(OPTIMIST, 6, 90, undefined);
    const out = sail(OPTIMIST, 6, 90, 1);
    expect(leeHeel(auto)).toBeGreaterThan(0);
    expect(leeHeel(out)).toBeLessThan(0);
    expect(out.telemetry.speed).toBeLessThan(auto.telemetry.speed * 0.95);
  });
  it("keeps the Optimist Helm's weight to windward even sitting in", () => {
    expect(leeHeel(sail(OPTIMIST, 6, 170, 0))).toBeLessThan(0);
    // and Auto-hike on a run sits at that limit
    const run = sail(OPTIMIST, 6, 170, undefined);
    expect(run.state.helmOut).toBeCloseTo(0, 2);
    expect(leeHeel(run)).toBeLessThan(0);
  });
  it("lets a Helm who hikes enough hold a puff flat, and one who does not heel over", () => {
    const flat = sail(OPTIMIST, 14, 60, 1);
    const sitting = sail(OPTIMIST, 14, 60, 0);
    expect(leeHeel(sitting)).toBeGreaterThan(leeHeel(flat));
  });
  it("puts the 420 Helm to leeward on a run with Auto-hike, and to windward in a breeze", () => {
    expect(sail(I420, 7, 175, undefined).state.helmOut).toBeLessThan(0);
    expect(sail(I420, 16, 50, undefined).state.helmOut).toBeGreaterThan(0.2);
    expect(sail(I420, 16, 130, undefined).state.helmOut).toBeGreaterThan(0);
  });
  it("lets a 420 Helm sit to leeward by hand but not an Optimist Helm", () => {
    expect(sail(I420, 7, 175, -1).state.helmOut).toBeLessThan(0);
    expect(sail(OPTIMIST, 7, 175, -1).state.helmOut).toBe(0);
  });
});
