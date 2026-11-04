/**
 * The hull and rig dimensions the sailor pose model and the boat views share: the hull sections (so a sailor sits on
 * the real deck), the rudder and tiller (so the tiller extension moves with the tiller) and the trapeze. Pure
 * (no Babylon, no browser). Frame: x starboard, y up, z forward, metres.
 */
import { clamp, DEG } from "../../core/math";
import type { ClassId } from "../../sailing/BoatClass";
import type { V3 } from "./reach";

/** One hull cross-section: place `z` along the boat, half-beam `wg` and height `yg` at the gunwale, keel height `yk`. */
export type Section = { z: number; wg: number; yg: number; yk: number };

/** The Optimist's section at `t` (0 stern to 1 bow). */
export function optimistSection(t: number): Section {
  return {
    z: -1.155 + t * 2.31,
    wg: 0.565 * (1 - 0.36 * Math.pow(t, 2.5)) - 0.065 * Math.pow(1 - t, 4),
    yg: 0.27 + 0.05 * t,
    yk: -0.13 + 0.24 * Math.pow(t, 2.4) + 0.07 * Math.pow(1 - t, 3),
  };
}

/** The 420's section at `t` (0 stern to 1 bow). */
export function section420(t: number): Section {
  const base = 0.6 + 0.2 * Math.sin((Math.PI / 2) * Math.min(t / 0.7, 1));
  const taper =
    t > 0.5 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2))) : 1;
  return {
    z: -2.1 + t * 4.2,
    wg: Math.max(0.012, base * taper),
    yg: 0.38 + 0.14 * t * t,
    yk: -0.15 + 0.3 * Math.pow(t, 3) + 0.03 * Math.pow(1 - t, 2),
  };
}

/** The ILCA's section at `t` (0 stern to 1 bow): a long open dinghy with a wide flat deck and a pointed bow. */
export function sectionIlca(t: number): Section {
  const taper =
    t > 0.55 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 2))) : 1;
  const base = 0.66 - 0.06 * Math.pow(1 - t, 3);
  return {
    z: -2.115 + t * 4.23,
    wg: Math.max(0.012, base * taper),
    yg: 0.3 + 0.1 * t * t,
    yk: -0.1 + 0.22 * Math.pow(t, 3) + 0.03 * Math.pow(1 - t, 2),
  };
}

/**
 * A skiff's section at `t` (0 stern to 1 bow) for a hull `length` long and `beam` wide: a flat, wide-sterned planing hull
 * with a long fine bow and a low flat deck.
 */
function skiffSection(length: number, beam: number, t: number): Section {
  const taper =
    t > 0.45 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.45) / 0.55, 2))) : 1;
  return {
    z: -length / 2 + t * length,
    wg: Math.max(0.012, (beam / 2) * (0.92 + 0.08 * t) * taper),
    yg: 0.34 + 0.1 * t * t,
    yk: -0.1 + 0.26 * Math.pow(t, 3) + 0.02 * Math.pow(1 - t, 2),
  };
}

/** The 29er's section at `t` (0 stern to 1 bow). */
export function section29er(t: number): Section {
  return skiffSection(4.45, 1.77, t);
}

/** The 49er's section at `t` (0 stern to 1 bow). */
export function section49er(t: number): Section {
  return skiffSection(4.9, 1.93, t);
}

const HULL = {
  optimist: { section: optimistSection, z0: -1.155, length: 2.31 },
  "420": { section: section420, z0: -2.1, length: 4.2 },
  ilca: { section: sectionIlca, z0: -2.115, length: 4.23 },
  "29er": { section: section29er, z0: -2.225, length: 4.45 },
  "49er": { section: section49er, z0: -2.45, length: 4.9 },
} as const;

/** The hull section at place `z` along the boat (clamped to the hull). */
export function sectionAt(classId: ClassId, z: number): Section {
  const h = HULL[classId];
  return h.section(clamp((z - h.z0) / h.length, 0, 1));
}

/** Rudder, tiller and tiller extension of a class. */
export type RigDims = {
  /** Where the rudder pivots on the body. */
  rudderPivot: V3;
  /** The tiller's tip in the rudder's own frame. */
  tillerTip: V3;
  /** Rudder angle drawn at full helm (degrees). */
  rudderDeg: number;
  /** The tiller extension's length. */
  extension: number;
  /** The trapeze wire top (the hounds) of the 420 and the skiffs; the Optimist and the ILCA have none. */
  hounds: V3 | null;
  /** The skiff's masthead (the burgee) and the bowsprit's length from the bow; the other classes have none. */
  skiff?: { mastHeight: number; sprit: number };
  /** Half the width of the 49er's racks (wings), where the sailors on the trapeze put their feet; absent without racks. */
  wing?: number;
  /** The mast's place along the boat. */
  mastZ: number;
};

export const RIG: Record<ClassId, RigDims> = {
  // Tiller box at (0, 0.2, 0.4) in the rudder frame, 0.85 long.
  optimist: {
    rudderPivot: { x: 0, y: 0.1, z: -1.18 },
    tillerTip: { x: 0, y: 0.2, z: 0.825 },
    rudderDeg: 30,
    extension: 0.7,
    hounds: null,
    mastZ: 0.78,
  },
  // Tiller box at (0, 0.25, 0.55) in the rudder frame, 1.1 long.
  "420": {
    rudderPivot: { x: 0, y: 0.3, z: -2.12 },
    tillerTip: { x: 0, y: 0.25, z: 1.1 },
    rudderDeg: 28,
    extension: 0.9,
    hounds: { x: 0, y: 5.0, z: 0.45 },
    mastZ: 0.45,
  },
  // Tiller box at (0, 0.2, 0.5) in the rudder frame, 1.0 long; the sleeve mast stands well forward.
  ilca: {
    rudderPivot: { x: 0, y: 0.25, z: -2.12 },
    tillerTip: { x: 0, y: 0.2, z: 1.0 },
    rudderDeg: 28,
    extension: 0.9,
    hounds: null,
    mastZ: 0.95,
  },
  // The 29er: a 6.2 m mast well forward, the Crew's feet on the gunwale.
  "29er": {
    rudderPivot: { x: 0, y: 0.3, z: -2.25 },
    tillerTip: { x: 0, y: 0.25, z: 1.2 },
    rudderDeg: 28,
    extension: 1.1,
    hounds: { x: 0, y: 5.2, z: 0.6 },
    mastZ: 0.6,
    skiff: { mastHeight: 6.2, sprit: 0.9 },
  },
  // The 49er: a 8.6 m mast, racks 1.4 m out each side and a long tiller extension for the Helm out on the trapeze.
  "49er": {
    rudderPivot: { x: 0, y: 0.3, z: -2.5 },
    tillerTip: { x: 0, y: 0.35, z: 1.4 },
    rudderDeg: 28,
    extension: 1.7,
    hounds: { x: 0, y: 7.2, z: 0.75 },
    mastZ: 0.75,
    skiff: { mastHeight: 8.6, sprit: 1.3 },
    wing: 1.4,
  },
};

/** The tiller tip on the body for a tiller pushed `tiller` (+1 to starboard; the rudder turns the other way). */
export function tillerTip(classId: ClassId, tiller: number): V3 {
  const r = RIG[classId];
  const a = clamp(tiller, -1, 1) * r.rudderDeg * DEG; // the rudder's rotation.y is -rudder * rudderDeg, and rudder = -tiller
  const c = Math.cos(a),
    s = Math.sin(a);
  const t = r.tillerTip;
  return {
    x: r.rudderPivot.x + t.x * c + t.z * s,
    y: r.rudderPivot.y + t.y,
    z: r.rudderPivot.z - t.x * s + t.z * c,
  };
}

/**
 * The tiller extension: hinged at the tiller's tip and `extension` long, pointing at `toward` (where the Helm's hand
 * wants it). `end` is its free end, `grip` the place along it the hand holds (`toward` itself when it is in reach).
 */
export function tillerExtension(
  classId: ClassId,
  tiller: number,
  toward: V3,
): { base: V3; end: V3; grip: V3 } {
  const base = tillerTip(classId, tiller);
  const dx = toward.x - base.x,
    dy = toward.y - base.y,
    dz = toward.z - base.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const L = RIG[classId].extension;
  const at = (len: number): V3 => ({
    x: base.x + (dx / d) * len,
    y: base.y + (dy / d) * len,
    z: base.z + (dz / d) * len,
  });
  return { base, end: at(L), grip: at(Math.min(L, d)) };
}
