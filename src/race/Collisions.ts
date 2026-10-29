import { dirX, dirZ, segmentsCross } from "../core/math";
import type { BoatClass } from "../sailing/BoatClass";
import type { Course } from "./Course";

/**
 * Collision geometry: hull capsules, closest points, and pushing overlapping shapes apart.
 * Each hull is a capsule (bow-stern segment, half-beam radius); marks are discs and the committee
 * boat is a larger capsule. No rules here: callers decide what a contact means.
 */

/** A segment from (ax, az) to (bx, bz). */
export type Seg = { ax: number; az: number; bx: number; bz: number };

/** Where a boat is and how it moves: the part of the boat state that collisions read and change. */
export type Body = { x: number; z: number; vx: number; vz: number; heading: number };

/** A fixed obstacle on the course: a disc (mark, pin) or a capsule (committee boat). */
export type Obstacle =
  | { kind: "disc"; x: number; z: number; r: number }
  | { kind: "capsule"; seg: Seg; r: number };

/** A course obstacle and its key, as the race knows it for rule 31 (`m0`…`m3`, `pin`, `committee`). */
export type CourseObstacle = { key: string; shape: Obstacle };

/** How a hull overlaps an obstacle: its hull point, the obstacle point it is pushed away from, and by how much. */
export type Overlap = { px: number; pz: number; ox: number; oz: number; depth: number };

/** Hull capsule radius: about half the beam. */
export const hullRadius = (cls: BoatClass) => cls.beam * 0.44;

/** The centre segment of a hull capsule, bow-stern along the heading. */
export function hullSegment(s: { x: number; z: number; heading: number }, cls: BoatClass): Seg {
  const half = Math.max(0.3, cls.length / 2 - hullRadius(cls));
  const fx = Math.sin(s.heading) * half, fz = Math.cos(s.heading) * half;
  return { ax: s.x - fx, az: s.z - fz, bx: s.x + fx, bz: s.z + fz };
}

/** The point of segment g closest to (px, pz), and its distance. */
export function closestPointSeg(px: number, pz: number, g: Seg) {
  const ex = g.bx - g.ax, ez = g.bz - g.az;
  const t = Math.max(0, Math.min(1, ((px - g.ax) * ex + (pz - g.az) * ez) / (ex * ex + ez * ez || 1)));
  const qx = g.ax + ex * t, qz = g.az + ez * t;
  return { px: qx, pz: qz, d: Math.hypot(px - qx, pz - qz) };
}

/** Closest points between two segments (crossing segments, otherwise endpoint-to-segment). */
export function closestSegSeg(g: Seg, h: Seg) {
  if (segmentsCross(g.ax, g.az, g.bx, g.bz, h.ax, h.az, h.bx, h.bz)) {
    const mx = (g.ax + g.bx + h.ax + h.bx) / 4, mz = (g.az + g.bz + h.az + h.bz) / 4;
    return { px: mx, pz: mz, qx: mx, qz: mz, d: 0 };
  }
  let best = { px: 0, pz: 0, qx: 0, qz: 0, d: Infinity };
  const tryPair = (px: number, pz: number, qx: number, qz: number) => {
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best.d) best = { px, pz, qx, qz, d };
  };
  for (const [x, z] of [[g.ax, g.az], [g.bx, g.bz]]) { const q = closestPointSeg(x, z, h); tryPair(x, z, q.px, q.pz); }
  for (const [x, z] of [[h.ax, h.az], [h.bx, h.bz]]) { const q = closestPointSeg(x, z, g); tryPair(q.px, q.pz, x, z); }
  return best;
}

/**
 * The course's fixed obstacles, in the order they are checked: the marks (windward and leeward marks
 * larger than the finish buoys), the pin, then the committee boat lying along the wind.
 */
export function courseObstacles(c: Course): CourseObstacle[] {
  const obstacles: CourseObstacle[] = c.marks.map((m, i) => ({ key: `m${i}`, shape: { kind: "disc", x: m.x, z: m.z, r: i < 2 ? 0.75 : 0.4 } }));
  obstacles.push({ key: "pin", shape: { kind: "disc", x: c.pin.x, z: c.pin.z, r: 0.45 } });
  const cbx = dirX(c.windDir) * 3.2, cbz = dirZ(c.windDir) * 3.2;
  const seg = { ax: c.committee.x - cbx, az: c.committee.z - cbz, bx: c.committee.x + cbx, bz: c.committee.z + cbz };
  obstacles.push({ key: "committee", shape: { kind: "capsule", seg, r: 1.3 } });
  return obstacles;
}

/**
 * Two hulls: if their capsules overlap, push both apart by half the overlap each and remove the
 * closing speed. Returns whether they touched.
 */
export function separateHulls(a: Body, clsA: BoatClass, b: Body, clsB: BoatClass): boolean {
  if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) return false;
  const h = hullSegment(a, clsA), k = hullSegment(b, clsB);
  const q = closestSegSeg(h, k);
  const minD = hullRadius(clsA) + hullRadius(clsB);
  if (q.d < minD) {
    let nx = q.qx - q.px, nz = q.qz - q.pz;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len; nz /= len;
    if (q.d < 1e-4) { nx = b.x - a.x; nz = b.z - a.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
    const push = (minD - q.d) / 2;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
    const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (closing < 0) {
      a.vx += nx * closing * 0.5; a.vz += nz * closing * 0.5;
      b.vx -= nx * closing * 0.5; b.vz -= nz * closing * 0.5;
    }
    return true;
  }
  return false;
}

/** How a hull (centre segment h, radius r) overlaps an obstacle, or null when clear. */
export function overlapObstacle(h: Seg, r: number, o: Obstacle): Overlap | null {
  if (o.kind === "disc") {
    const q = closestPointSeg(o.x, o.z, h);
    const minD = o.r + r;
    return q.d < minD ? { px: q.px, pz: q.pz, ox: o.x, oz: o.z, depth: minD - q.d } : null;
  }
  const q = closestSegSeg(h, o.seg);
  const minD = o.r + r;
  return q.d < minD ? { px: q.px, pz: q.pz, ox: q.qx, oz: q.qz, depth: minD - q.d } : null;
}

/** Push a boat out of an obstacle along the overlap, and remove its speed into the obstacle. */
export function pushOut(a: Body, o: Overlap) {
  let nx = o.px - o.ox, nz = o.pz - o.oz;
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  a.x += nx * o.depth; a.z += nz * o.depth;
  const into = a.vx * nx + a.vz * nz;
  if (into < 0) { a.vx -= nx * into; a.vz -= nz * into; }
}
