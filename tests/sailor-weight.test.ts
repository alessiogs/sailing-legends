/**
 * Body weight in the physics: a light sailor is quicker in light air, a heavy one in a breeze.
 */
import { describe, expect, it } from "vitest";
import { DEG } from "../src/core/math";
import { OPTIMIST } from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

/** Speed (m/s) of a boat holding `twa` for 40 s at `kn` of steady wind, with ideal sheet. */
function speed(kg: number, kn: number, twa: number) {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: kn });
  wind.shift = () => 0;
  const sim = new BoatSim(OPTIMIST, createBoat(0, 0, -twa * DEG), { helmKg: kg, crewKg: 0 });
  const c: Controls = { rudder: 0, sheet: 0.5 };
  for (let i = 0; i < 60 * 40; i++) {
    sim.state.heading = -twa * DEG;
    sim.state.yawRate = 0;
    c.sheet = sim.telemetry.optimalSheet;
    sim.step(1 / 60, c, wind);
  }
  return sim.telemetry.speed;
}

describe("body weight in the Optimist", () => {
  it("makes a light sailor quicker at 6 kn", () => {
    expect(speed(32, 6, 90)).toBeGreaterThan(speed(52, 6, 90) * 1.02);
  });
  it("makes a heavy sailor quicker at 14 kn", () => {
    expect(speed(52, 14, 90)).toBeGreaterThan(speed(32, 14, 90) * 1.02);
  });
});
