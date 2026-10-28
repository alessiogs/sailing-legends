/**
 * The geometry of a sail drawn as a grid, free of Babylon so it can be tested: the grid's triangles and texture
 * coordinates, and its vertex positions for one frame (camber to leeward, twist toward the head, and a ripple
 * running aft from the luff when the sail flaps). `SailMesh` puts it on a Babylon mesh.
 */

/** A point in the sail's parent frame. */
export type Point3 = { readonly x: number; readonly y: number; readonly z: number };

/** The four corners of a sail; for a triangle the two head corners coincide. */
export type SailCorners = { tack: Point3; clew: Point3; headLuff: Point3; headLeech: Point3 };

/** How deep a sail is cut and how much it twists and flaps. */
export type SailCut = {
  /**
   * true: depth, twist and flutter are metres per metre of chord, so a sail keeps its shape at any size.
   * false: they are metres, the same at every height (the Optimist's sprit sail).
   */
  perChord: boolean;
  /** Default greatest camber (a spinnaker passes its own, deeper one). */
  depth: number;
  /** Extra camber toward the leech and the head. */
  twist: number;
  /** Size of the luffing ripple. */
  flutter: number;
};

/** The 420's sails: shape in proportion to the chord. */
export const CHORD_CUT: SailCut = { perChord: true, depth: 0.11, twist: 0.12, flutter: 0.035 };
/** The Optimist's sprit sail: fixed offsets, as the boat has always drawn it. */
export const OPTIMIST_CUT: SailCut = { perChord: false, depth: 0.2, twist: 0.28, flutter: 0.07 };

/** How a sail looks this frame. */
export type SailPose = {
  /** 0..1, how full the sail is drawing. */
  camber: number;
  /** 0..1, how much it flaps. */
  luff: number;
  /** +1/-1: bulge direction (local X). */
  side: number;
  /** Flutter clock (s). */
  t: number;
  /** 0..1: a spinnaker being hoisted is shorter. */
  hoist: number;
  /** Greatest camber, in the cut's units. */
  depth: number;
};

/** Triangle indices of a grid `nu` cells along the foot and `nv` up the luff. */
export function sailGridIndices(nu: number, nv: number): number[] {
  const idx: number[] = [];
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const a = v * (nu + 1) + u, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return idx;
}

/** Texture coordinates of the grid: u along the foot, v up the luff. */
export function sailGridUvs(nu: number, nv: number): number[] {
  const uvs: number[] = [];
  for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) uvs.push(u / nu, v / nv);
  return uvs;
}

/** Writes the grid's vertex positions for `pose` into `pos` ((nu + 1) * (nv + 1) * 3 numbers). */
export function shapeSail(pos: Float32Array, c: SailCorners, nu: number, nv: number, cut: SailCut, pose: SailPose): void {
  const { tack, clew, headLuff, headLeech } = c;
  const { camber, luff, side, t, hoist, depth } = pose;
  let i = 0;
  for (let v = 0; v <= nv; v++) {
    const fv = (v / nv) * hoist + (1 - hoist);
    for (let u = 0; u <= nu; u++) {
      const fu = u / nu;
      const bx = tack.x + (clew.x - tack.x) * fu;
      const by = tack.y + (clew.y - tack.y) * fu;
      const bz = tack.z + (clew.z - tack.z) * fu;
      const tx = headLuff.x + (headLeech.x - headLuff.x) * fu;
      const ty = headLuff.y + (headLeech.y - headLuff.y) * fu;
      const tz = headLuff.z + (headLeech.z - headLuff.z) * fu;
      const px = bx + (tx - bx) * fv, py = by + (ty - by) * fv, pz = bz + (tz - bz) * fv;
      // Chord length at this height, for scaling the camber.
      const chord = Math.hypot(clew.x - tack.x, clew.z - tack.z) * (1 - fv) +
        Math.hypot(headLeech.x - headLuff.x, headLeech.z - headLuff.z) * fv;
      const scale = cut.perChord ? chord : 1;
      const belly = 4 * fu * (1 - fu);
      const edge = Math.min(1, fv * 6) * Math.min(1, (1 - fv) * 6) * 0.6 + 0.4;
      let x = side * (depth * scale * camber * belly * edge + cut.twist * fu * fv * camber * scale);
      x += luff * Math.sin(t * 22 - fu * 9 + fv * 4) * cut.flutter * (cut.perChord ? Math.max(chord, 0.6) : 1) *
        (0.35 + belly) * edge;
      pos[i++] = px + x;
      pos[i++] = py;
      pos[i++] = pz;
    }
  }
}
