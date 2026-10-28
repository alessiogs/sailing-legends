/**
 * The one sail grid draws the Optimist's sprit sail and the 420's sails exactly as their own code did before they
 * shared it. The two reference functions below are copies of that earlier code, kept as the record of how the
 * sails looked.
 */
import { describe, expect, it } from "vitest";
import {
  CHORD_CUT, OPTIMIST_CUT, sailGridIndices, sailGridUvs, shapeSail, type Point3, type SailCorners,
} from "../src/world/sailShape";

const p = (x: number, y: number, z: number): Point3 => ({ x, y, z });

// The Optimist's sail corners and grid (BoatView.ts).
const OPTIMIST: SailCorners = { tack: p(0, 0.5, 0), clew: p(0, 0.5, -1.98), headLuff: p(0, 2.32, 0), headLeech: p(0, 2.78, -1.72) };
const ONU = 10, ONV = 9;

/** BoatView.shapeSail before the Optimist moved onto the shared sail mesh. */
function oldOptimistSail(camber: number, luff: number, side: number, t: number): number[] {
  const { tack: TACK, clew: CLEW, headLuff: THROAT, headLeech: PEAK } = OPTIMIST;
  const pos = new Float32Array((ONU + 1) * (ONV + 1) * 3);
  let i = 0;
  for (let v = 0; v <= ONV; v++) {
    const fv = v / ONV;
    for (let u = 0; u <= ONU; u++) {
      const fu = u / ONU;
      const bx = TACK.x + (CLEW.x - TACK.x) * fu, by = TACK.y + (CLEW.y - TACK.y) * fu, bz = TACK.z + (CLEW.z - TACK.z) * fu;
      const tx = THROAT.x + (PEAK.x - THROAT.x) * fu, ty = THROAT.y + (PEAK.y - THROAT.y) * fu, tz = THROAT.z + (PEAK.z - THROAT.z) * fu;
      const belly = 4 * fu * (1 - fu);
      const edge = Math.min(1, fv * 6) * Math.min(1, (1 - fv) * 6) * 0.6 + 0.4;
      let x = side * (0.2 * camber * belly * edge + 0.28 * fu * fv * camber);
      x += luff * Math.sin(t * 22 - fu * 9 + fv * 4) * 0.07 * (0.35 + belly) * edge;
      pos[i++] = bx + (tx - bx) * fv + x;
      pos[i++] = by + (ty - by) * fv;
      pos[i++] = bz + (tz - bz) * fv;
    }
  }
  return Array.from(pos);
}

/** SailMesh.shape before the grid maths moved to sailShape.ts (the 420's main, jib and spinnakers). */
function oldChordSail(c: SailCorners, nu: number, nv: number, camber: number, luff: number, side: number, t: number, hoist = 1, depth = 0.11): number[] {
  const { tack, clew, headLuff, headLeech } = c;
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
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
      const chord = Math.hypot(clew.x - tack.x, clew.z - tack.z) * (1 - fv) +
        Math.hypot(headLeech.x - headLuff.x, headLeech.z - headLuff.z) * fv;
      const belly = 4 * fu * (1 - fu);
      const edge = Math.min(1, fv * 6) * Math.min(1, (1 - fv) * 6) * 0.6 + 0.4;
      let x = side * (depth * chord * camber * belly * edge + 0.12 * fu * fv * camber * chord);
      x += luff * Math.sin(t * 22 - fu * 9 + fv * 4) * 0.035 * Math.max(chord, 0.6) * (0.35 + belly) * edge;
      pos[i++] = px + x;
      pos[i++] = py;
      pos[i++] = pz;
    }
  }
  return Array.from(pos);
}

function shaped(c: SailCorners, nu: number, nv: number, cut = CHORD_CUT, camber: number, luff: number, side: number, t: number, hoist = 1, depth = cut.depth): number[] {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  shapeSail(pos, c, nu, nv, cut, { camber, luff, side, t, hoist, depth });
  return Array.from(pos);
}

// Poses: the initial shape, upwind (full, drawing), reaching, luffing (camber cut, flapping), on both sides.
const POSES: [camber: number, luff: number, side: number, t: number][] = [
  [0.5, 0, 1, 0], [1, 0, 1, 3.7], [0.62, 0, -1, 12.25], [0.3, 0.25, -1, 5.5], [0.15 * 0.3, 1, 1, 8.125], [0.4, 0.6, -1, 0.9],
];

describe("sail shape", () => {
  it("draws the Optimist's sprit sail exactly as before", () => {
    for (const [camber, luff, side, t] of POSES) {
      expect(shaped(OPTIMIST, ONU, ONV, OPTIMIST_CUT, camber, luff, side, t)).toEqual(oldOptimistSail(camber, luff, side, t));
    }
  });

  it("draws the 420's main, jib and spinnaker exactly as before", () => {
    // Corners as Boat420View.ts sets them (the starboard spinnaker in its own frame).
    const head = p(0, 4.4, -1.45), spiHead = p(0.35, 5.7, 0);
    const main: SailCorners = { tack: p(0, 1.0, -0.04), clew: p(0, 1.0, -2.55), headLuff: p(0, 6.25, 0), headLeech: p(0, 6.15, -0.35) };
    const jib: SailCorners = { tack: p(0, 0.08, -0.02), clew: p(0, 0.4, -1.8), headLuff: head, headLeech: head };
    const spi: SailCorners = { tack: p(2.5, 1.05, 0.9), clew: p(0.4, 0.95, -1.7), headLuff: spiHead, headLeech: spiHead };
    for (const [camber, luff, side, t] of POSES) {
      expect(shaped(main, 10, 12, CHORD_CUT, camber, luff, side, t)).toEqual(oldChordSail(main, 10, 12, camber, luff, side, t));
      expect(shaped(jib, 8, 10, CHORD_CUT, camber, luff, side, t + 1)).toEqual(oldChordSail(jib, 8, 10, camber, luff, side, t + 1));
      for (const hoist of [0.3, 1]) {
        expect(shaped(spi, 10, 12, CHORD_CUT, camber, luff, 1, t + 2, hoist, 0.32))
          .toEqual(oldChordSail(spi, 10, 12, camber, luff, 1, t + 2, hoist, 0.32));
      }
    }
  });

  it("joins the grid into the same triangles and texture coordinates", () => {
    const idx = sailGridIndices(2, 1);
    expect(idx).toEqual([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
    expect(sailGridIndices(ONU, ONV).length).toBe(ONU * ONV * 6);
    expect(sailGridUvs(2, 1)).toEqual([0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1]);
  });
});
