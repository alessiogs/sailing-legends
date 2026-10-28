/** Small math helpers shared by simulation, AI and UI. Angles are radians unless noted. */

export const DEG = Math.PI / 180;
export const KNOTS = 1.943844; // m/s -> knots

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Wrap an angle to (-PI, PI]. */
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Shortest signed difference b - a. */
export const angleDiff = (a: number, b: number) => wrapPi(b - a);
export const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(a, b) * t;

/**
 * World convention (matches Babylon's left-handed frame seen from above):
 * +Z is "north", +X is "east". A compass bearing of 0 points to +Z and grows clockwise toward +X.
 */
export const bearingTo = (fromX: number, fromZ: number, toX: number, toZ: number) => Math.atan2(toX - fromX, toZ - fromZ);
export const dirX = (bearing: number) => Math.sin(bearing);
export const dirZ = (bearing: number) => Math.cos(bearing);

/** Deterministic pseudo random generator (mulberry32) so races are reproducible from a seed. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Segment intersection test, used for start and finish lines. */
export function segmentsCross(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): boolean {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
