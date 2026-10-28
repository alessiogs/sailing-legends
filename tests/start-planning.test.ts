/**
 * The Racing AI's start planning, on its own: holding spot and line point, the two numbers it draws,
 * and the decisions before the gun (hold, back off, run to the line) and after it (OCS return, restart).
 * Default windward-leeward course with the wind from the north: the start line runs from the pin at
 * (-24, 0) to the committee boat at (26, 0), and the course side is +Z.
 */
import { describe, expect, it } from "vitest";
import { DEG, wrapPi } from "../src/core/math";
import { CLOSE_HAULED } from "../src/ai/angles";
import { StartPlanning, type CourseSteering } from "../src/ai/StartPlanning";
import { makeWindwardLeeward, type Point } from "../src/race/Course";
import { Race, type Racer } from "../src/race/Race";
import { OPTIMIST } from "../src/sailing/BoatClass";
import { BoatSim, createBoat } from "../src/sailing/BoatPhysics";
import { RIVALS, type SailorProfile } from "../src/sailors/Sailors";

const WIND_FROM = 0, WIND_SPEED = 4;
const SAILOR: SailorProfile = RIVALS[0];
const STBD = wrapPi(WIND_FROM - CLOSE_HAULED), PORT = wrapPi(WIND_FROM + CLOSE_HAULED);

/** A fresh race with one Optimist at (x, z); `draws` are the numbers the planner gets from its RNG. */
function setup(x = -40, z = -30, heading = STBD, draws = [0.5, 0.5], slot = 0) {
  const race = new Race(makeWindwardLeeward(WIND_FROM));
  const racer = race.add("ai0", { helm: { kind: "ai", name: SAILOR.name }, crew: null }, new BoatSim(OPTIMIST, createBoat(x, z, heading)));
  let drawn = 0;
  const rand = () => draws[drawn++];
  const planning = new StartPlanning(race, SAILOR, 1, rand, slot);
  return { race, racer, planning, drawn: () => drawn };
}

/** A stand-in for the rest of the Helm: records where it was asked to steer and when a tack was decided. */
function steering(sinceTack = 99) {
  const asked: Point[] = [];
  let tacks = 0;
  const steer: CourseSteering = {
    headingToward: p => { asked.push(p); return 1.234; },
    sinceTack: () => sinceTack,
    tackNow: () => { tacks++; },
  };
  return { steer, asked, tacks: () => tacks };
}

/** Points equal to a micrometre (the course is built with sines and cosines, so "0" can be 1e-15). */
const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6;

const prestart = (planning: StartPlanning, racer: Racer, s: CourseSteering) =>
  planning.prestart(s, racer.sim.state, racer.sim.telemetry, WIND_SPEED, WIND_FROM);

describe("start planning: where the boat waits", () => {
  it("draws two numbers: the first places the line point, the second sets the start bias", () => {
    const { planning, drawn } = setup(0, -60, STBD, [0.5, 0.9], 1);
    expect(drawn()).toBe(2);
    // Slot 1 aims 45% along the line from the pin.
    expect(near(planning.linePoint, { x: -24 + 50 * 0.45, z: 0 })).toBe(true);
    expect(planning.startBias).toBe((1 - SAILOR.discipline) * 5 + (0.9 - 0.5) * 2.5);
  });

  it("waits 15 m below and 13 m to the right of its line point (scaled by boat length)", () => {
    const { planning } = setup();
    expect(near(planning.linePoint, { x: -14, z: 0 })).toBe(true);
    expect(near(planning.holdSpot, { x: -1, z: -15 })).toBe(true);
  });

  it("placeAtStart puts the boat at the holding spot, stopped, on a starboard close reach", () => {
    const { planning, racer } = setup();
    planning.placeAtStart(racer);
    const s = racer.sim.state;
    expect({ x: s.x, z: s.z }).toEqual(planning.holdSpot);
    expect(s.heading).toBe(wrapPi(WIND_FROM - 75 * DEG));
    expect(s.vx === 0 && s.vz === 0).toBe(true);
    expect({ x: racer.prevX, z: racer.prevZ }).toEqual(planning.holdSpot);
  });
});

describe("start planning: before the gun", () => {
  it("holds at the holding spot early in the countdown, luffing on a starboard close reach", () => {
    const { planning, racer } = setup();
    planning.placeAtStart(racer);
    const steer = prestart(planning, racer, steering().steer);
    expect(steer.debug).toBe("hold");
    expect(steer.desired).toBe(wrapPi(WIND_FROM - 75 * DEG));
    expect(steer.sheet).toBe(Math.min(1, racer.sim.telemetry.optimalSheet + 0.18));
  });

  it("sails to the holding spot through the rest of the Helm when away from it", () => {
    const { planning, racer } = setup(-40, -30);
    const s = steering();
    const steer = prestart(planning, racer, s.steer);
    expect(steer.debug).toBe("to hold");
    expect(s.asked).toEqual([planning.holdSpot]);
    expect(steer.desired).toBe(1.234);
  });

  it("bears away when too close to the line", () => {
    const { planning, racer } = setup(0, -1);
    const steer = prestart(planning, racer, steering().steer);
    expect(steer.debug).toBe("back off");
    expect(steer.desired).toBe(wrapPi(WIND_FROM - Math.PI * 0.75));
  });

  it("runs close-hauled on starboard for the line once it is time to go", () => {
    const { planning, race, racer } = setup();
    planning.placeAtStart(racer);
    racer.sim.state.heading = STBD;
    race.clock = -5;
    const steer = prestart(planning, racer, steering().steer);
    expect(steer.debug).toBe("go");
    expect(steer.desired).toBe(STBD);
  });
});

describe("start planning: after the gun, not started yet", () => {
  it("an OCS boat bears away below the line with the sheet eased", () => {
    const { planning, racer } = setup(0, 5);
    racer.ocs = true;
    racer.clearedBack = false;
    racer.sim.telemetry.twa = 0.5;
    const steer = planning.afterGun(steering().steer, racer, racer.sim.telemetry, WIND_FROM);
    expect(steer).toEqual({ desired: wrapPi(WIND_FROM + Math.PI - 0.35), sheet: 1, debug: "ocs return" });
  });

  it("tacks onto the tack that fetches the line, when the tack timer allows", () => {
    const { planning, racer } = setup(20, -15, PORT);
    const s = steering(10);
    const steer = planning.afterGun(s.steer, racer, racer.sim.telemetry, WIND_FROM);
    expect(steer.debug).toBe("restart");
    expect(steer.desired).toBe(STBD);
    expect(s.tacks()).toBe(1);
  });

  it("heads for the middle of the line instead of tacking again too soon", () => {
    const { planning, racer } = setup(20, -15, PORT);
    const s = steering(3);
    const steer = planning.afterGun(s.steer, racer, racer.sim.telemetry, WIND_FROM);
    expect(steer.desired).toBe(1.234);
    expect(s.asked.length === 1 && near(s.asked[0], { x: 1, z: 0 })).toBe(true);
    expect(s.tacks()).toBe(0);
  });
});
