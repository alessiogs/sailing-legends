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
  const taper = t > 0.5 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2))) : 1;
  return {
    z: -2.1 + t * 4.2,
    wg: Math.max(0.012, base * taper),
    yg: 0.38 + 0.14 * t * t,
    yk: -0.15 + 0.3 * Math.pow(t, 3) + 0.03 * Math.pow(1 - t, 2),
  };
}

const HULL = {
  optimist: { section: optimistSection, z0: -1.155, length: 2.31 },
  "420": { section: section420, z0: -2.1, length: 4.2 },
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
  /** The 420's trapeze wire top (the hounds); the Optimist has none. */
  hounds: V3 | null;
  /** The mast's place along the boat. */
  mastZ: number;
};

export const RIG: Record<ClassId, RigDims> = {
  // Tiller box at (0, 0.2, 0.4) in the rudder frame, 0.85 long.
  optimist: { rudderPivot: { x: 0, y: 0.1, z: -1.18 }, tillerTip: { x: 0, y: 0.2, z: 0.825 }, rudderDeg: 30, extension: 0.7, hounds: null, mastZ: 0.78 },
  // Tiller box at (0, 0.25, 0.55) in the rudder frame, 1.1 long.
  "420": { rudderPivot: { x: 0, y: 0.3, z: -2.12 }, tillerTip: { x: 0, y: 0.25, z: 1.1 }, rudderDeg: 28, extension: 0.9, hounds: { x: 0, y: 5.0, z: 0.45 }, mastZ: 0.45 },
};

/** The tiller tip on the body for a tiller pushed `tiller` (+1 to starboard; the rudder turns the other way). */
export function tillerTip(classId: ClassId, tiller: number): V3 {
  const r = RIG[classId];
  const a = clamp(tiller, -1, 1) * r.rudderDeg * DEG; // the rudder's rotation.y is -rudder * rudderDeg, and rudder = -tiller
  const c = Math.cos(a), s = Math.sin(a);
  const t = r.tillerTip;
  return { x: r.rudderPivot.x + t.x * c + t.z * s, y: r.rudderPivot.y + t.y, z: r.rudderPivot.z - t.x * s + t.z * c };
}

/**
 * The tiller extension: hinged at the tiller's tip and `extension` long, pointing at `toward` (where the Helm's hand
 * wants it). `end` is its free end, `grip` the place along it the hand holds (`toward` itself when it is in reach).
 */
export function tillerExtension(classId: ClassId, tiller: number, toward: V3): { base: V3; end: V3; grip: V3 } {
  const base = tillerTip(classId, tiller);
  const dx = toward.x - base.x, dy = toward.y - base.y, dz = toward.z - base.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const L = RIG[classId].extension;
  const at = (len: number): V3 => ({ x: base.x + (dx / d) * len, y: base.y + (dy / d) * len, z: base.z + (dz / d) * len });
  return { base, end: at(L), grip: at(Math.min(L, d)) };
}
