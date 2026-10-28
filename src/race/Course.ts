import { bearingTo, dirX, dirZ } from "../core/math";

/**
 * A windward/leeward course, defined relative to the mean wind so it can be rotated freely.
 *
 *   start line  ->  Mark 1 (windward, leave to port)  ->  Mark 2 (leeward, leave to port)  ->  finish line (upwind)
 */
export type Point = { x: number; z: number };
export type Line = { a: Point; b: Point };

export type Leg =
  | { kind: "mark"; name: string; mark: Point; rounding: "port" | "starboard"; upwind: boolean }
  | { kind: "finish"; name: string; line: Line; upwind: boolean };

export type Course = {
  windDir: number;
  start: Line;
  /** Committee boat sits at the starboard end of the start line, pin buoy at the port end. */
  committee: Point;
  pin: Point;
  legs: Leg[];
  marks: Point[];
};

export function makeWindwardLeeward(windDir: number, opts: { beat?: number; lineHalf?: number; run?: number } = {}): Course {
  const beat = opts.beat ?? 75;
  const half = opts.lineHalf ?? 24;
  // Local frame: "up" = toward the wind, "right" = to starboard when sailing upwind.
  const ux = dirX(windDir), uz = dirZ(windDir);
  const rx = dirX(windDir + Math.PI / 2), rz = dirZ(windDir + Math.PI / 2);
  const P = (right: number, up: number): Point => ({ x: rx * right + ux * up, z: rz * right + uz * up });

  const pin = P(-half, 0);
  const committee = P(half + 2, 0);
  const m1 = P(0, beat);
  const m2 = P(-4, -(opts.run ?? 38));
  const finish: Line = { a: P(-12, beat * 0.62), b: P(12, beat * 0.62) };
  return {
    windDir,
    start: { a: pin, b: committee },
    pin,
    committee,
    marks: [m1, m2, finish.a, finish.b],
    legs: [
      { kind: "mark", name: "Boa 1", mark: m1, rounding: "port", upwind: true },
      { kind: "mark", name: "Boa 2", mark: m2, rounding: "port", upwind: false },
      { kind: "finish", name: "Arrivo", line: finish, upwind: true },
    ],
  };
}

/** Point the AI (and the HUD arrow) should aim at for a leg. */
export function legTarget(leg: Leg): Point {
  if (leg.kind === "finish") return { x: (leg.line.a.x + leg.line.b.x) / 2, z: (leg.line.a.z + leg.line.b.z) / 2 };
  return leg.mark;
}

export function distanceTo(p: Point, x: number, z: number) {
  return Math.hypot(p.x - x, p.z - z);
}

export { bearingTo };
