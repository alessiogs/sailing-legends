/**
 * Collision geometry on its own: hull capsules, closest points, pushing hulls apart and out of
 * course obstacles. Expected values are worked by hand: an Optimist is 2.31 m long with a 1.13 m beam,
 * so its capsule radius is 0.4972 m and its centre segment runs 0.6578 m either side of the middle.
 */
import { describe, expect, it } from "vitest";
import {
  closestPointSeg, closestSegSeg, courseObstacles, hullRadius, hullSegment, overlapObstacle, pushOut, separateHulls,
  type Body,
} from "../src/race/Collisions";
import { makeWindwardLeeward } from "../src/race/Course";
import { OPTIMIST } from "../src/sailing/BoatClass";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const body = (x: number, z: number, vx = 0, vz = 0, heading = 0): Body => ({ x, z, vx, vz, heading });

describe("hull capsule", () => {
  it("has a radius of about half the beam", () => {
    expect(near(hullRadius(OPTIMIST), 0.4972)).toBe(true);
  });

  it("lies bow-stern along the heading", () => {
    const north = hullSegment(body(0, 0), OPTIMIST);
    expect(near(north.ax, 0) && near(north.az, -0.6578) && near(north.bx, 0) && near(north.bz, 0.6578)).toBe(true);
    const east = hullSegment(body(10, 5, 0, 0, Math.PI / 2), OPTIMIST);
    expect(near(east.ax, 10 - 0.6578) && near(east.az, 5) && near(east.bx, 10 + 0.6578) && near(east.bz, 5)).toBe(true);
  });
});

describe("closest points", () => {
  const vertical = { ax: 0, az: -1, bx: 0, bz: 1 };

  it("projects a point onto a segment, clamped to its ends", () => {
    expect(closestPointSeg(1, 0.5, vertical)).toEqual({ px: 0, pz: 0.5, d: 1 });
    expect(closestPointSeg(0, 4, vertical)).toEqual({ px: 0, pz: 1, d: 3 });
  });

  it("puts crossing segments at distance zero", () => {
    expect(closestSegSeg({ ax: -1, az: 0, bx: 1, bz: 0 }, vertical).d).toBe(0);
  });

  it("finds the gap between parallel segments", () => {
    const q = closestSegSeg({ ax: 0, az: 0, bx: 0, bz: 2 }, { ax: 1, az: 1, bx: 1, bz: 3 });
    expect(q.d).toBe(1);
    expect(q.qx - q.px).toBe(1);
  });
});

describe("two hulls", () => {
  it("are pushed apart by half the overlap each and lose their closing speed", () => {
    const a = body(0, 0, 1), b = body(0.9, 0, -1);
    expect(separateHulls(a, OPTIMIST, b, OPTIMIST)).toBe(true);
    expect(near(a.x, -0.0472) && near(b.x, 0.9472)).toBe(true);
    expect(near(a.vx, 0) && near(b.vx, 0)).toBe(true);
  });

  it("keep their speed when already moving apart", () => {
    const a = body(0, 0, -1), b = body(0.9, 0, 1);
    expect(separateHulls(a, OPTIMIST, b, OPTIMIST)).toBe(true);
    expect(a.vx === -1 && b.vx === 1).toBe(true);
  });

  it("don't touch when clear of each other", () => {
    const a = body(0, 0, 1), b = body(1.2, 0, -1);
    expect(separateHulls(a, OPTIMIST, b, OPTIMIST)).toBe(false);
    expect(a).toEqual(body(0, 0, 1));
    expect(b).toEqual(body(1.2, 0, -1));
  });
});

describe("course obstacles", () => {
  it("are the marks, the pin and the committee boat lying along the wind", () => {
    const c = makeWindwardLeeward(0);
    const obstacles = courseObstacles(c);
    expect(obstacles.map(o => o.key)).toEqual(["m0", "m1", "m2", "m3", "pin", "committee"]);
    expect(obstacles.map(o => o.shape.r)).toEqual([0.75, 0.75, 0.4, 0.4, 0.45, 1.3]);
    const cb = obstacles[5].shape;
    expect(cb.kind === "capsule" && near(cb.seg.ax, c.committee.x) && near(cb.seg.bz - cb.seg.az, 6.4)).toBe(true);
  });

  it("push a hull out of a mark and stop its speed into the mark", () => {
    const boat = body(0, 0, 1);
    const overlap = overlapObstacle(hullSegment(boat, OPTIMIST), hullRadius(OPTIMIST), { kind: "disc", x: 1, z: 0, r: 0.75 });
    expect(overlap !== null && near(overlap.depth, 0.2472) && overlap.ox === 1 && overlap.px === 0).toBe(true);
    pushOut(boat, overlap!);
    expect(near(boat.x, -0.2472) && boat.z === 0 && boat.vx === 0).toBe(true);
  });

  it("leave a hull alone when it is clear", () => {
    expect(overlapObstacle(hullSegment(body(0, 0), OPTIMIST), hullRadius(OPTIMIST), { kind: "disc", x: 2, z: 0, r: 0.75 })).toBe(null);
  });
});
