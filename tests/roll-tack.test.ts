/**
 * Roll tacks in the physics: hiking hard on the new side within about a second of the boom crossing loses less speed,
 * a late (or no) roll loses more, and the effect fades out above about 10 kn.
 */
import { describe, expect, it } from "vitest";
import { DEG, KNOTS } from "../src/core/math";
import { I420, OPTIMIST, type BoatClass } from "../src/sailing/BoatClass";
import { BoatSim, createBoat, type Controls } from "../src/sailing/BoatPhysics";
import { WindField } from "../src/sailing/Wind";

type Roll = "none" | "good" | "early" | "late" | "auto";

/**
 * Sails close-hauled on starboard tack, tacks, and returns the mean speed (kn) from 1.2 s to 9 s after the boom crossed.
 * `roll` is how the Helm hikes: not at all, hard from the instant the boom crosses ("good"), hard from the start of the turn so
 * already out at the crossing ("early"), only 1.6 s after the boom crossed ("late"), or
 * leaving the weight to Auto-hike. `override` forces the roll quality (as the AI does) while the weight stays on Auto-hike.
 */
function tack(cls: BoatClass, kn: number, roll: Roll, override?: number) {
  const wind = new WindField({ puffCount: 0, meanSpeedKn: kn });
  wind.shift = () => 0;
  const sim = new BoatSim(cls, createBoat(0, 0, -45 * DEG));
  const c: Controls = {
    rudder: 0,
    sheet: 0.5,
    jibSheet: 0.5,
    spiSheet: 0.5,
    crewOut: 0.3,
    spi: false,
  };
  const dt = 1 / 60;
  let tacking = false,
    crossed = -1,
    sum = 0,
    n = 0;
  for (let i = 0; i < 60 * 70; i++) {
    const time = i * dt;
    if (!tacking && time >= 30) tacking = true;
    const sinceCross = crossed >= 0 ? time - crossed : -1;
    const tel = sim.telemetry;
    c.sheet = tel.optimalSheet;
    c.jibSheet = tel.jib?.optimal ?? 0.5;
    c.crewOut = tel.crew?.ideal ?? 0;
    c.switchSide = sinceCross > 1.5 && sinceCross < 1.52;
    // Steer: hold the old tack, then turn through the wind with full rudder, then hold the new tack.
    const goal = (crossed >= 0 ? 1 : -1) * 45 * DEG;
    const err = goal - sim.state.heading;
    c.rudder =
      tacking && crossed < 0
        ? 1
        : Math.max(-1, Math.min(1, err * 2.6 - sim.state.yawRate * 0.6));
    if (tacking && crossed < 0 && sim.state.heading > 40 * DEG) c.rudder = 0.2;
    if (roll === "none") c.helmOut = 0;
    else if (roll === "good") c.helmOut = sinceCross >= 0 ? 0.9 : 0;
    else if (roll === "early") c.helmOut = tacking ? 0.9 : 0;
    else if (roll === "late") c.helmOut = sinceCross > 1.6 ? 0.9 : 0;
    else c.helmOut = undefined;
    if (override !== undefined) c.roll = override;
    const before = sim.state.boomSide;
    sim.step(dt, c, wind);
    if (tacking && crossed < 0 && sim.state.boomSide !== before) crossed = time;
    if (crossed >= 0 && time - crossed >= 1.2 && time - crossed <= 9) {
      sum += sim.telemetry.speed * KNOTS;
      n++;
    }
  }
  expect(crossed).toBeGreaterThan(0);
  return sum / n;
}

describe("Roll tack", () => {
  for (const cls of [OPTIMIST, I420]) {
    it(`${cls.name}: in 5 kn a good roll exits faster than none or a late one, and Auto-hike sits between`, () => {
      const good = tack(cls, 5, "good"),
        auto = tack(cls, 5, "auto"),
        late = tack(cls, 5, "late"),
        none = tack(cls, 5, "none");
      expect(good).toBeGreaterThan(none + 0.05);
      expect(late).toBeLessThan(auto);
      expect(good).toBeGreaterThan(auto);
      expect(auto).toBeGreaterThan(none);
    });
    it(`${cls.name}: holding the hike from before the crossing does not score a perfect roll`, () => {
      expect(tack(cls, 5, "early")).toBeLessThan(tack(cls, 5, "good"));
    });
    it(`${cls.name}: above 10 kn the roll hardly matters`, () => {
      const good = tack(cls, 14, "auto", 1),
        bad = tack(cls, 14, "auto", 0);
      expect(Math.abs(good - bad) / bad).toBeLessThan(0.01);
      const lightGood = tack(cls, 5, "auto", 1),
        lightBad = tack(cls, 5, "auto", 0);
      expect((lightGood - lightBad) / lightBad).toBeGreaterThan(0.03);
    });
  }
});
