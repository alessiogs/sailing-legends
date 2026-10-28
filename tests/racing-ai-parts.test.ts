/**
 * The Racing AI's parts on their own: right-of-way avoidance, beat tactics and the tack state machine.
 * The wind comes from the north (bearing 0), so upwind is +Z; starboard tack heads north-west.
 */
import { describe, expect, it } from "vitest";
import { DEG, wrapPi } from "../src/core/math";
import { CLOSE_HAULED } from "../src/ai/angles";
import { boatWithin, giveWay } from "../src/ai/Avoidance";
import { BeatTactics } from "../src/ai/BeatTactics";
import { TackStateMachine, type TackSituation } from "../src/ai/TackStateMachine";
import { makeWindwardLeeward } from "../src/race/Course";
import { Race } from "../src/race/Race";
import { OPTIMIST } from "../src/sailing/BoatClass";
import { BoatSim, createBoat } from "../src/sailing/BoatPhysics";
import { RIVALS } from "../src/sailors/Sailors";

const WIND_FROM = 0;
const STBD = wrapPi(WIND_FROM - CLOSE_HAULED), PORT = wrapPi(WIND_FROM + CLOSE_HAULED);
const close = (a: number, b: number) => Math.abs(wrapPi(a - b)) < 1e-9;

/** A race with stationary Optimists placed by hand: [x, z, heading] each. */
function fleet(...boats: [number, number, number][]) {
  const race = new Race(makeWindwardLeeward(WIND_FROM));
  const racers = boats.map(([x, z, heading], i) => {
    const sim = new BoatSim(OPTIMIST, createBoat(x, z, heading));
    sim.telemetry.twa = wrapPi(WIND_FROM - heading);
    return race.add(`ai${i}`, { helm: { kind: "ai", name: RIVALS[i].name }, crew: null }, sim);
  });
  return { race, racers };
}

/** Offset from (x, z): `ahead` metres along the heading, `toStbd` metres abeam to starboard. */
function from(x: number, z: number, heading: number, ahead: number, toStbd: number): [number, number] {
  return [
    x + Math.sin(heading) * ahead + Math.cos(heading) * toStbd,
    z + Math.cos(heading) * ahead - Math.sin(heading) * toStbd,
  ];
}

describe("avoidance: the give-way boat keeps clear", () => {
  it("rule 10: the port-tacker ducks at least 30° below its course; the starboard-tacker holds on", () => {
    const { race, racers: [port, stbd] } = fleet([0, 0, PORT], [3, 0, STBD]);
    const ducking = giveWay(port, race, 1, PORT, 0.2, WIND_FROM);
    expect(ducking.rule).toBe("10");
    expect(ducking.desired >= PORT + 30 * DEG - 1e-9).toBe(true);
    expect(ducking.sheet).toBe(0.2);
    expect(giveWay(stbd, race, 1, STBD, 0.2, WIND_FROM)).toEqual({ desired: STBD, sheet: 0.2, rule: null });
  });

  it("rule 11: the windward boat heads up, but not inside 42° of the wind", () => {
    const leeward: [number, number, number] = [0, 0, STBD];
    const { race, racers: [, windward] } = fleet(leeward, [...from(0, 0, STBD, 0, 3), STBD]);
    const way = giveWay(windward, race, 1, STBD, 0.2, WIND_FROM);
    expect(way.rule).toBe("11");
    expect(close(way.desired, WIND_FROM - 42 * DEG)).toBe(true);
  });

  it("rule 12: the boat clear astern eases its sheet to slow down", () => {
    const { race, racers: [astern] } = fleet([0, 0, STBD], [...from(0, 0, STBD, 3, 0), STBD]);
    const way = giveWay(astern, race, 1, STBD, 0.2, WIND_FROM);
    expect(way.rule).toBe("12");
    expect(close(way.desired, STBD)).toBe(true);
    expect(Math.abs(way.sheet - 0.6) < 1e-12).toBe(true);
  });

  it("a boat further than 4 m (times the size factor) at the closest approach is ignored", () => {
    const { race, racers: [port] } = fleet([0, 0, PORT], [5, 0, STBD]);
    expect(giveWay(port, race, 1, PORT, 0.2, WIND_FROM).rule).toBe(null);
    expect(giveWay(port, race, 1.5, PORT, 0.2, WIND_FROM).rule).toBe("10");
  });

  it("boatWithin finds other racing boats only", () => {
    const { race, racers: [me, other] } = fleet([0, 0, STBD], [6, 0, STBD]);
    expect(boatWithin(me, race, 7)).toBe(true);
    expect(boatWithin(me, race, 5)).toBe(false);
    other.finishTime = 100;
    expect(boatWithin(me, race, 7)).toBe(false);
  });
});

describe("beat tactics: steering toward a point", () => {
  const setup = () => {
    let time = 20;
    const beat = new BeatTactics(RIVALS[0], () => time);
    return { beat, advance: (s: number) => { time += s; } };
  };

  it("sails straight at a point outside the no-go zone", () => {
    const { beat } = setup();
    expect(close(beat.headingToward({ x: 100, z: 0 }, WIND_FROM, 0, 0, STBD), 90 * DEG)).toBe(true);
    expect(beat.label).toBe("direct");
  });

  it("beats on the tack the boat is on while the other is not better by the hysteresis margin", () => {
    const { beat } = setup();
    // Target 5° right of the wind: port tack points 10° closer, less than the margin.
    const target = { x: Math.sin(5 * DEG) * 100, z: Math.cos(5 * DEG) * 100 };
    expect(close(beat.headingToward(target, WIND_FROM, 0, 0, STBD), STBD)).toBe(true);
    expect(beat.label).toBe("beat stbd");
  });

  it("tacks when the other tack is clearly better, then not again for 11 s", () => {
    const { beat, advance } = setup();
    const right = { x: Math.sin(30 * DEG) * 100, z: Math.cos(30 * DEG) * 100 };
    const left = { x: -Math.sin(30 * DEG) * 100, z: Math.cos(30 * DEG) * 100 };
    expect(close(beat.headingToward(right, WIND_FROM, 0, 0, STBD), PORT)).toBe(true);
    expect(beat.sinceTack()).toBe(0);
    advance(1);
    expect(close(beat.headingToward(left, WIND_FROM, 0, 0, PORT), PORT)).toBe(true);
    advance(11);
    expect(close(beat.headingToward(left, WIND_FROM, 0, 0, PORT), STBD)).toBe(true);
  });

  it("a committed tack sets the beat's tack and restarts the tack timer", () => {
    const { beat, advance } = setup();
    const upwind = { x: 0, z: 100 };
    expect(close(beat.headingToward(upwind, WIND_FROM, 0, 0, STBD), STBD)).toBe(true);
    advance(1);
    beat.tackedOnto(false);
    expect(beat.sinceTack()).toBe(0);
    // Still pointing at starboard, but committed to port during the beat: the beat goes on on port.
    advance(1);
    expect(close(beat.headingToward(upwind, WIND_FROM, 0, 0, STBD), PORT)).toBe(true);
  });

  it("after more than 2 s off the beat, or leaving it, the tack is chosen afresh from the heading", () => {
    const { beat, advance } = setup();
    const upwind = { x: 0, z: 100 };
    beat.headingToward(upwind, WIND_FROM, 0, 0, STBD);
    beat.tackedOnto(false);
    advance(3);
    expect(close(beat.headingToward(upwind, WIND_FROM, 0, 0, STBD), STBD)).toBe(true);
    beat.tackedOnto(false);
    beat.leaveBeat();
    expect(close(beat.headingToward(upwind, WIND_FROM, 0, 0, STBD), STBD)).toBe(true);
  });
});

describe("tack state machine", () => {
  const setup = () => {
    const calls: string[] = [];
    const machine = new TackStateMachine({
      tackedOnto: stbd => { calls.push(stbd ? "onto stbd" : "onto port"); },
      leaveBeat: () => { calls.push("leave beat"); },
    }, 1);
    return { machine, calls };
  };
  const at = (over: Partial<TackSituation>): TackSituation => ({
    time: 10, dt: 1 / 60, heading: STBD, speed: 1, desired: PORT, fromDir: WIND_FROM, boatWithin: () => false, ...over,
  });

  it("commits to a tack through the wind when the boat has way on", () => {
    const { machine, calls } = setup();
    const steer = machine.steer(at({}));
    expect(machine.mode).toBe("tack");
    expect(close(steer.desired, PORT)).toBe(true);
    expect(calls).toEqual(["onto port"]);
    // Halfway through the turn it keeps going, even if the wanted course swings back.
    expect(close(machine.steer(at({ time: 11, heading: 0, desired: STBD })).desired, PORT)).toBe(true);
    machine.steer(at({ time: 12, heading: PORT }));
    expect(machine.mode).toBe("sail");
  });

  it("too slow to tack, it gybes round instead", () => {
    const { machine } = setup();
    const steer = machine.steer(at({ speed: 0.3 }));
    expect(machine.mode).toBe("sail");
    expect(steer.gybeRound).toBe(true);
    expect(close(steer.desired, Math.PI - 0.2)).toBe(true);
  });

  it("waits to tack near another boat (rule 13), but no more than 6 s", () => {
    const { machine } = setup();
    let asked = 0;
    const busy = at({ dt: 1, boatWithin: d => { asked = d; return true; } });
    for (let i = 0; i < 6; i++) machine.steer(busy);
    expect(asked).toBe(7);
    expect(machine.mode).toBe("sail");
    machine.steer(busy);
    expect(machine.mode).toBe("tack");
  });

  it("stuck head to wind, it eases the sheet and bears away to recover", () => {
    const { machine, calls } = setup();
    const steer = machine.steer(at({ heading: 0, desired: 0, speed: 0.1 }));
    expect(machine.mode).toBe("recover");
    expect(steer.easeSheet).toBe(true);
    expect(close(steer.desired, -75 * DEG)).toBe(true);
    expect(calls).toEqual(["leave beat"]);
  });

  it("a tack not finished in 7 s turns into a recovery", () => {
    const { machine } = setup();
    machine.steer(at({}));
    machine.steer(at({ time: 17.5, heading: -10 * DEG, desired: PORT }));
    expect(machine.mode).toBe("recover");
  });

  it("breakOff drops the tack and leaves the beat", () => {
    const { machine, calls } = setup();
    machine.steer(at({}));
    machine.breakOff();
    expect(machine.mode).toBe("sail");
    expect(calls).toEqual(["onto port", "leave beat"]);
  });
});
