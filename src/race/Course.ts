import { bearingTo, dirX, dirZ } from "../core/math";

/**
 * A windward/leeward course, defined relative to the mean wind so it can be rotated freely.
 *
 *   start line  ->  Mark 1 (windward, leave to port)  ->  Mark 2 (leeward, leave to port)  ->  finish (upwind, through the start line again)
 */
export type Point = { x: number; z: number };
export type Line = { a: Point; b: Point };

/** Which leg of the course this is; the UI names it (`legName`), the simulation never shows it. */
export type LegId = "mark1" | "mark2" | "finish";

export type Leg =
  | {
      kind: "mark";
      id: LegId;
      mark: Point;
      rounding: "port" | "starboard";
      upwind: boolean;
    }
  | { kind: "finish"; id: LegId; line: Line; upwind: boolean };

export type Course = {
  windDir: number;
  start: Line;
  /** Committee boat sits at the starboard end of the start line, pin buoy at the port end. */
  committee: Point;
  pin: Point;
  legs: Leg[];
  marks: Point[];
};

export function makeWindwardLeeward(
  windDir: number,
  opts: { beat?: number; lineHalf?: number; run?: number } = {},
): Course {
  const beat = opts.beat ?? 75;
  const half = opts.lineHalf ?? 24;
  // Local frame: "up" = toward the wind, "right" = to starboard when sailing upwind.
  const ux = dirX(windDir),
    uz = dirZ(windDir);
  const rx = dirX(windDir + Math.PI / 2),
    rz = dirZ(windDir + Math.PI / 2);
  const P = (right: number, up: number): Point => ({
    x: rx * right + ux * up,
    z: rz * right + uz * up,
  });

  const pin = P(-half, 0);
  const committee = P(half + 2, 0);
  const m1 = P(0, beat);
  const m2 = P(-4, -(opts.run ?? 38));
  // The finish line is the start line: upwind through it, between the pin and the committee boat.
  const line: Line = { a: pin, b: committee };
  return {
    windDir,
    start: line,
    pin,
    committee,
    marks: [m1, m2],
    legs: [
      { kind: "mark", id: "mark1", mark: m1, rounding: "port", upwind: true },
      { kind: "mark", id: "mark2", mark: m2, rounding: "port", upwind: false },
      { kind: "finish", id: "finish", line, upwind: true },
    ],
  };
}

/** Point the HUD arrow and the standings aim at for a leg (the middle of a finish line). */
export function legTarget(leg: Leg): Point {
  if (leg.kind === "finish")
    return {
      x: (leg.line.a.x + leg.line.b.x) / 2,
      z: (leg.line.a.z + leg.line.b.z) / 2,
    };
  return leg.mark;
}

/**
 * Where a boat at (x, z) should aim on a leg: the mark, or on a finish line the nearest point of it, kept `inset`
 * away from both ends so the boat finishes where it arrives without touching the committee boat or the pin.
 */
export function aimPoint(leg: Leg, x: number, z: number, inset = 0): Point {
  if (leg.kind !== "finish") return leg.mark;
  const { a, b } = leg.line;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return a;
  const lo = Math.min(inset, len / 2);
  const t = Math.max(
    lo,
    Math.min(len - lo, ((x - a.x) * dx + (z - a.z) * dz) / len),
  );
  return { x: a.x + (dx * t) / len, z: a.z + (dz * t) / len };
}

export function distanceTo(p: Point, x: number, z: number) {
  return Math.hypot(p.x - x, p.z - z);
}

export { bearingTo };
