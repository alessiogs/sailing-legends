/** A point or direction in the boat's frame (x starboard, y up, z forward). */
export type V3 = { x: number; y: number; z: number };

export type Reach = {
  /** Where the elbow (or knee) ends up. */
  elbow: V3;
  /** Where the hand ends up: the target, or the nearest point the limb can reach towards it. */
  hand: V3;
  /** Angle at the shoulder between the upper bone and the line to the target (rad). */
  shoulder: number;
  /** How far the elbow is bent (rad): 0 is a straight arm. */
  bend: number;
  reachable: boolean;
};

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const scale = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);

/**
 * Two-bone reach: a limb of bones `upper` and `fore` from `from` towards `target`. The elbow bends towards `hint`
 * (a direction, e.g. down and outboard). Out of range, the limb stretches straight at the target.
 */
export function twoBoneReach(from: V3, target: V3, upper: number, fore: number, hint: V3): Reach {
  const to = sub(target, from);
  const dist = len(to);
  const max = upper + fore, min = Math.abs(upper - fore) + 1e-6;
  const d = Math.min(max, Math.max(min, dist));
  const u = dist > 1e-9 ? scale(to, 1 / dist) : { x: 0, y: -1, z: 0 };
  const along = (upper * upper + d * d - fore * fore) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - along * along));
  let perp = sub(hint, scale(u, dot(hint, u)));
  const pl = len(perp);
  perp = pl > 1e-9 ? scale(perp, 1 / pl) : { x: 0, y: -1, z: 0 };
  const elbow = add(add(from, scale(u, along)), scale(perp, h));
  const hand = add(from, scale(u, d));
  const shoulder = Math.acos(Math.min(1, Math.max(-1, along / upper)));
  const cosInterior = (upper * upper + fore * fore - d * d) / (2 * upper * fore);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosInterior)));
  return { elbow, hand, shoulder, bend, reachable: dist <= max && dist >= min };
}
