/**
 * Rule verdicts (RRS 10, 11, 12, 13) and penalty-turn tracking, through the public functions of Rules.ts.
 * Two boats are placed by hand; the wind comes from the north (bearing 0), so upwind is +Z.
 */
import { describe, expect, it } from "vitest";
import { DEG, wrapPi } from "../src/core/math";
import { judge, newPenalty, trackPenalty, type Verdict } from "../src/race/Rules";
import { OPTIMIST } from "../src/sailing/BoatClass";
import { BoatSim, createBoat } from "../src/sailing/BoatPhysics";

const WIND_FROM = 0;
/** Close-hauled headings: starboard tack points north-west, port tack north-east. */
const STBD = -45 * DEG, PORT = 45 * DEG;

/** A stationary Optimist at (x, z) on a heading, with the true wind angle it would see. */
function boat(x: number, z: number, heading: number): BoatSim {
  const sim = new BoatSim(OPTIMIST, createBoat(x, z, heading));
  sim.telemetry.twa = wrapPi(WIND_FROM - heading);
  return sim;
}

/** Offset from (x, z): `ahead` metres along the heading, `toStbd` metres abeam to starboard. */
function from(x: number, z: number, heading: number, ahead: number, toStbd: number): [number, number] {
  return [
    x + Math.sin(heading) * ahead + Math.cos(heading) * toStbd,
    z + Math.cos(heading) * ahead - Math.sin(heading) * toStbd,
  ];
}

const verdict = (v: Verdict) => v && { atFault: v.atFault, rule: v.rule };

describe("rule 13: a tacking boat keeps clear", () => {
  it("the boat head to wind is at fault against a close-hauled boat", () => {
    const tacking = boat(0, 0, 0);
    const sailing = boat(5, 0, STBD);
    expect(verdict(judge(tacking, sailing, WIND_FROM))).toEqual({ atFault: 0, rule: "13" });
    expect(verdict(judge(sailing, tacking, WIND_FROM))).toEqual({ atFault: 1, rule: "13" });
  });

  it("rule 13 applies even to a tacking boat that is clear ahead", () => {
    const tacking = boat(...from(0, 0, STBD, 10, 0), 10 * DEG);
    const astern = boat(0, 0, STBD);
    expect(verdict(judge(astern, tacking, WIND_FROM))).toEqual({ atFault: 1, rule: "13" });
  });

  it("two boats tacking at once: no verdict", () => {
    expect(judge(boat(0, 0, 10 * DEG), boat(3, 0, -10 * DEG), WIND_FROM)).toBe(null);
  });
});

describe("rule 10: port tack keeps clear of starboard tack", () => {
  it("the port-tack boat is at fault, whichever is listed first", () => {
    const port = boat(0, 0, PORT);
    const stbd = boat(4, 0, STBD);
    expect(verdict(judge(port, stbd, WIND_FROM))).toEqual({ atFault: 0, rule: "10" });
    expect(verdict(judge(stbd, port, WIND_FROM))).toEqual({ atFault: 1, rule: "10" });
  });

  it("applies off the wind too: a port-tack boat running is at fault against a starboard-tack reacher", () => {
    const port = boat(0, 0, 160 * DEG);
    const stbd = boat(3, 3, -100 * DEG);
    expect(verdict(judge(port, stbd, WIND_FROM))).toEqual({ atFault: 0, rule: "10" });
  });
});

describe("rule 12: same tack, not overlapped, the boat clear astern keeps clear", () => {
  it("the boat clear astern is at fault, whichever is listed first", () => {
    const ahead = boat(0, 0, STBD);
    const astern = boat(...from(0, 0, STBD, -3, 0), STBD);
    expect(verdict(judge(ahead, astern, WIND_FROM))).toEqual({ atFault: 1, rule: "12" });
    expect(verdict(judge(astern, ahead, WIND_FROM))).toEqual({ atFault: 0, rule: "12" });
  });

  it("a leeward boat clear astern is at fault, not the windward boat clear ahead", () => {
    const windwardAhead = boat(...from(0, 0, PORT, 3, -1), PORT);
    const leewardAstern = boat(0, 0, PORT);
    expect(verdict(judge(windwardAhead, leewardAstern, WIND_FROM))).toEqual({ atFault: 1, rule: "12" });
  });
});

describe("rule 11: same tack, overlapped, the windward boat keeps clear", () => {
  it("side by side on starboard tack: the windward boat is at fault, whichever is listed first", () => {
    const leeward = boat(0, 0, STBD);
    const windward = boat(...from(0, 0, STBD, 0, 2), STBD);
    expect(verdict(judge(leeward, windward, WIND_FROM))).toEqual({ atFault: 1, rule: "11" });
    expect(verdict(judge(windward, leeward, WIND_FROM))).toEqual({ atFault: 0, rule: "11" });
  });

  it("an overlap by part of the hull is enough: the windward boat slightly behind is at fault under 11, not 12", () => {
    const leeward = boat(0, 0, PORT);
    // Port tack: windward is to port. Bow 1 m behind the leeward boat's bow, still overlapping its stern.
    const windward = boat(...from(0, 0, PORT, -1, -1.5), PORT);
    expect(verdict(judge(leeward, windward, WIND_FROM))).toEqual({ atFault: 1, rule: "11" });
  });

  it("the boat to leeward slightly ahead has right of way over the overlapped boat to windward", () => {
    const leewardAhead = boat(...from(0, 0, STBD, 1, -1.5), STBD);
    const windward = boat(0, 0, STBD);
    expect(verdict(judge(windward, leewardAhead, WIND_FROM))).toEqual({ atFault: 0, rule: "11" });
  });
});

describe("penalty turns", () => {
  /** Turns a penalty in 10° steps; returns the step (1-based) on which it completed, or null. */
  function turn(turns: number, dir: 1 | -1, start = 0, maxSteps = 200): number | null {
    const p = newPenalty(turns, start);
    for (let i = 1; i <= maxSteps; i++) {
      if (trackPenalty(p, start + dir * i * 10 * DEG)) return i;
    }
    return null;
  }

  it("one turn completes after a full circle to starboard, not before", () => {
    expect(turn(1, 1)).toBe(36);
  });

  it("one turn completes after a full circle to port", () => {
    expect(turn(1, -1, 90 * DEG)).toBe(36);
  });

  it("two turns complete after two full circles, either direction, and not after one", () => {
    expect(turn(2, 1)).toBe(72);
    expect(turn(2, -1, -120 * DEG)).toBe(72);
  });

  it("a circle and a half is not two turns", () => {
    const p = newPenalty(2, 0);
    let done = false;
    for (let i = 1; i <= 54; i++) done = trackPenalty(p, i * 10 * DEG);
    expect(done).toBe(false);
  });

  it("turning back unwinds the turn already made", () => {
    const p = newPenalty(1, 0);
    let done = false;
    for (let i = 1; i <= 18; i++) done = trackPenalty(p, i * 10 * DEG);
    for (let i = 17; i >= 0; i--) done = trackPenalty(p, i * 10 * DEG);
    expect(done).toBe(false);
    for (let i = 1; i <= 35; i++) done = trackPenalty(p, -i * 10 * DEG);
    expect(done).toBe(false);
    done = trackPenalty(p, -360 * DEG);
    expect(done).toBe(true);
  });

  it("holding a steady course never completes a penalty", () => {
    const p = newPenalty(1, STBD);
    let done = false;
    for (let i = 0; i < 600; i++) done = trackPenalty(p, STBD + Math.sin(i / 10) * 20 * DEG);
    expect(done).toBe(false);
  });
});
