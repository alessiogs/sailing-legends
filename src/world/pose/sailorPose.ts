/**
 * The sailor pose model: from the boat's state to the body's place on the boat and the joints of its skeleton. Pure
 * (no Babylon, no browser), so it runs in Node. The view feeds the last result back as `previous`, calls once per
 * frame, and draws a limb between each pair of joints. Frame: x starboard, y up, z forward; sides +1 starboard, -1
 * port; angles in rad.
 */
import { clamp, lerp } from "../../core/math";
import type { ClassId } from "../../sailing/BoatClass";
import { sectionAt, tillerExtension, RIG } from "./boatRig";
import { twoBoneReach, type V3 } from "./reach";

export type SailorRole = "helm" | "crew";

export type PoseInput = {
  classId: ClassId;
  role: SailorRole;
  /** The side the sailor is on (the windward side): `BoatState.crewSide`. */
  crewSide: number;
  crewOut: number;
  boomSide: number;
  spiHoist: number;
  heelDeg: number;
  sideForce: number;
  /** Tiller angle, +1 pushed to starboard. */
  tiller: number;
  /** The figure's height in metres (`figureHeight`). */
  height: number;
  /** Look this way (rad off the bow) instead of at the sail; the Helm only. */
  lookAt?: number;
};

/** The skeleton's joints on the boat. Left and right are the figure's own (L is at -x when it faces forward). */
export type Joints = {
  pelvis: V3; chest: V3; head: V3;
  hipL: V3; hipR: V3; kneeL: V3; kneeR: V3; footL: V3; footR: V3;
  shoulderL: V3; shoulderR: V3; elbowL: V3; elbowR: V3; handL: V3; handR: V3;
};

export type Pose = {
  /** The side the sailor is on; changes when a crossing finishes, so it is the new side as soon as `crossing` is 0. */
  side: number;
  /** 0 when still, else progress 0..1 of a crossing in the 1 s timeline. */
  crossing: number;
  /** Seconds into the crossing. */
  crossingTime: number;
  /** Small hull roll (rad, + to starboard) the view may add while the sailor crosses. */
  hullRoll: number;
  /** Where the sailor's pelvis is on the boat, and whether the legs lie across the boat. */
  position: V3;
  seated: boolean;
  /** Whole body: lean outboard (rad, toward `side`) and turn toward the boat's centre. */
  lean: number;
  twist: number;
  /** Torso bend forward (rad). */
  bend: number;
  /** Head turn off the body (rad, + to starboard) and nod (rad, + down). */
  head: { yaw: number; pitch: number };
  /** Which way the body faces (rad off the bow, + to starboard). */
  yaw: number;
  joints: Joints;
  /** Hand targets the arms reach for (absent when the sailor holds nothing). */
  targets: { tiller?: V3; sheet?: V3; handle?: V3; halyard?: V3 };
  /** The Helm's tiller extension, hinged at the tiller's tip, drawn by the view. */
  extension?: { base: V3; end: V3 };
  /** Whether the sailor is out on the trapeze. */
  onWire: boolean;
  /** Where the trapeze wire meets the harness (only meaningful when `onWire`). */
  harness: V3;
  phase: number;
};

/** How long a side change takes. */
export const CROSSING_TIME = 1;

const smooth = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
const REF_HEIGHT = 1.55; // the figure height the hand targets below are laid out for
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mix = (a: V3, b: V3, t: number): V3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

// Body proportions, as shares of the figure's height.
const TORSO = 0.32, SHOULDER = 0.116, HIP = 0.05, ARM = 0.174, THIGH = 0.245, NECK = 0.115, PELVIS_HALF = 0.05;

/** Where the sailor sits (before sway), for side +1: pelvis, lean, and where the feet go. */
type Spot = { pelvis: V3; lean: number; seated: boolean; foot: V3; forward: number };

function spotOf(i: PoseInput, h: number, hoist: number): Spot {
  const H = i.height;
  const half = PELVIS_HALF * H;
  if (i.classId === "optimist") {
    // Light air: in the middle, on the floor. As the side force builds: to the side, then on the gunwale, feet under the strap.
    const z = -0.55;
    const g = sectionAt("optimist", z);
    const s1 = smooth(h * 2), s2 = smooth(h * 2 - 1);
    const xMid = 0.3, xHike = g.wg - 0.04;
    const x = lerp(-0.08, xMid, s1) + (xHike - xMid) * s2;
    const y = lerp(-0.03 + half + 0.01, g.yg + 0.6 * half, s2);
    const foot = mix({ x: 0.1, y: 0.02, z: z + 0.55 }, { x: 0.1, y: 0.02, z: z + 0.3 }, s2);
    return { pelvis: { x, y, z }, lean: 0.05 + h * 0.75, seated: h < 0.15, foot, forward: 0 };
  }
  if (i.role === "helm") {
    const z = -1.25;
    const g = sectionAt("420", z);
    // On the side deck, over the edge when hiking.
    return {
      pelvis: { x: g.wg - 0.12 + 0.1 * h, y: g.yg + 0.01 + 0.8 * half, z }, lean: 0.15 + h * 0.7, seated: false,
      foot: { x: 0.3, y: 0.0, z: z + 0.5 }, forward: 0,
    };
  }
  const out = clamp(i.crewOut, 0, 1);
  const lean = out < 0.5 ? 0.1 + out * 1.3 : 0.75 + (out - 0.5) * 1.0;
  const hikeB = smooth(out / 0.5);
  const wire = smooth((out - 0.55) / 0.25);
  const fwd = Math.sin(Math.PI * clamp(hoist, 0, 1)); // the trip to the mast lifts the crew in
  const z = 0.05 + 0.6 * fwd;
  const g = sectionAt("420", 0.05);
  // Sitting out: on the side deck.
  const sit: V3 = { x: g.wg - 0.13 + 0.12 * hikeB, y: g.yg + 0.01 + 0.8 * half, z };
  const cockpitFoot: V3 = { x: 0.3, y: 0.0, z: z + 0.45 };
  // On the wire: feet on the gunwale, the body a straight line out from them.
  const legLen = 2 * THIGH * H * 0.97;
  const footOut: V3 = { x: g.wg - 0.04, y: g.yg + 0.08, z };
  const hang: V3 = { x: footOut.x + Math.sin(lean) * legLen, y: footOut.y + Math.cos(lean) * legLen, z };
  let pelvis = mix(sit, hang, wire);
  let foot = mix(cockpitFoot, footOut, wire);
  if (fwd > 0) {
    // Forward to the mast: crouched on the foredeck beside it.
    const deck = sectionAt("420", z);
    pelvis = mix(pelvis, { x: 0.3, y: deck.yg + 0.01 + 0.2 * H, z }, fwd);
    foot = mix(foot, { x: 0.2, y: deck.yg + 0.06, z: z + 0.1 }, fwd);
  }
  return { pelvis, lean: lean * (1 - 0.7 * fwd), seated: false, foot, forward: fwd };
}

/**
 * The pose for one sailor this frame. `previous` is the last result (null the first time); `dt` in seconds.
 * A change of `crewSide` starts a crossing: duck under the boom, cross, settle.
 */
export function sailorPose(input: PoseInput, previous: Pose | null, dt: number): Pose {
  const H = input.height;
  const u = H / REF_HEIGHT;
  const optimist = input.classId === "optimist";
  const h = clamp(Math.abs(input.sideForce) / (optimist ? 110 : 380), 0, 1);
  const phase = (previous?.phase ?? 0) + dt;
  let side = previous?.side ?? input.crewSide;
  let crossingTime = previous?.crossingTime ?? 0;
  let crossing = previous?.crossing ?? 0;
  // Start a crossing only when none runs; one that runs finishes, then the next side is looked at again.
  if (crossing === 0 && input.crewSide !== side) { crossing = 1e-6; crossingTime = 0; }
  const from = side;
  const to = crossing > 0 ? -side : side; // the sides are +1 and -1: a crossing always goes to the other one
  if (crossing > 0) {
    crossingTime += dt;
    crossing = crossingTime / CROSSING_TIME;
    if (crossing >= 1) { crossing = 0; crossingTime = 0; side = to; }
  }
  const p = crossing; // 0 when still
  const hoist = input.spiHoist > 0 && input.spiHoist < 1 ? input.spiHoist : 0;
  const spot = spotOf(input, h, hoist);
  const sway = Math.sin(phase * 1.7) * 0.015 * (1 + Math.abs(input.heelDeg) / 15);
  const heelShift = -Math.sin((input.heelDeg * Math.PI) / 180) * 0.1;

  // Across the boat: the move happens in the middle of the timeline, after the duck and before the settle.
  const m = smooth((p - 0.25) / 0.5);
  const sx = crossing > 0 ? lerp(from, to, m) : side; // -1..1 while crossing
  const duck = crossing > 0 ? Math.sin(Math.PI * p) : 0; // 0..1..0
  const squeeze = 1 - 0.5 * duck;
  const lean = spot.lean * (1 - duck) + 0.1 * duck;
  const bend = 0.15 + (optimist ? 1.15 : 0.9) * duck + (spot.seated ? 0.2 : 0) + 0.5 * spot.forward;
  const facing = crossing > 0 ? sx : side;
  const sgn = Math.sign(facing || 1);

  const pelvis: V3 = {
    x: sx * spot.pelvis.x * squeeze + sway + heelShift * (spot.seated ? 1 : 0.3),
    y: spot.pelvis.y - (optimist ? 0.12 : 0.2) * duck,
    z: spot.pelvis.z,
  };
  // Legs reach no further than their length: a pelvis too far from the feet is drawn in toward them.
  const foot0: V3 = { x: sx * spot.foot.x, y: spot.foot.y, z: spot.foot.z };
  const maxLeg = 2 * THIGH * H * 0.99;
  const gap = Math.hypot(pelvis.x - foot0.x, pelvis.y - foot0.y, pelvis.z - foot0.z);
  if (gap > maxLeg) {
    const k = maxLeg / gap;
    pelvis.x = foot0.x + (pelvis.x - foot0.x) * k; pelvis.y = foot0.y + (pelvis.y - foot0.y) * k; pelvis.z = foot0.z + (pelvis.z - foot0.z) * k;
  }
  const twist = 0.35 * facing;
  const yaw = -twist; // turned toward the boat's centre

  // Head: toward the sail (the boom side), or a given bearing; smoothed.
  const headTarget = clamp(input.lookAt ?? input.boomSide * 0.55, -1.2, 1.2) * (input.role === "helm" ? 1 : 0.4);
  const headYaw = previous ? lerp(previous.head.yaw, headTarget, clamp(dt * 6, 0, 1)) : headTarget;
  const headPitch = 0.1 - 0.2 * duck; // a nod; ducking looks up at the boom

  // Torso: from the pelvis along the lean (outboard) and the bend (forward); the shoulders across it.
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const dn = Math.hypot(sgn * sl, cl * Math.cos(bend), cl * Math.sin(bend)) || 1;
  const d: V3 = { x: (sgn * sl) / dn, y: (cl * Math.cos(bend)) / dn, z: (cl * Math.sin(bend)) / dn };
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const across = (k: number): V3 => { // the body's x axis (yaw), made square to the torso
    const r: V3 = { x: cy, y: 0, z: -sy };
    const dot = r.x * d.x + r.y * d.y + r.z * d.z;
    const v: V3 = { x: r.x - d.x * dot, y: r.y - d.y * dot, z: r.z - d.z * dot };
    const n = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: (v.x / n) * k, y: (v.y / n) * k, z: (v.z / n) * k };
  };
  const chest = add(pelvis, { x: d.x * TORSO * H, y: d.y * TORSO * H, z: d.z * TORSO * H });
  const sh = across(SHOULDER * H);
  const shoulderL = { x: chest.x - sh.x, y: chest.y - sh.y, z: chest.z - sh.z };
  const shoulderR = add(chest, sh);
  const hipOff = { x: cy * HIP * H, y: 0, z: -sy * HIP * H };
  const hipL = { x: pelvis.x - hipOff.x, y: pelvis.y, z: pelvis.z - hipOff.z };
  const hipR = add(pelvis, hipOff);
  const dh = { x: d.x * 0.5, y: d.y * 0.5 + 0.5, z: d.z * 0.5 };
  const dhn = Math.hypot(dh.x, dh.y, dh.z) || 1;
  const head = add(chest, { x: (dh.x / dhn) * NECK * H, y: (dh.y / dhn) * NECK * H, z: (dh.z / dhn) * NECK * H });

  // The inboard hand takes the tiller or the handle, the outboard one the sheet. A crossing swaps the hands: each hand
  // goes to the target it has on the side the sailor leaves, then to the one on the side they reach.
  const sgA = crossing > 0 ? from : side, sgB = crossing > 0 ? to : side;
  const rel = (sg: number, s: V3, dx: number, dy: number, dz: number): V3 => ({ x: s.x + sg * dx * u, y: s.y + dy * u, z: s.z + dz * u });
  const inner = (sg: number) => (sg > 0 ? shoulderL : shoulderR);
  const outer = (sg: number) => (sg > 0 ? shoulderR : shoulderL);
  const targets: Pose["targets"] = {};
  let extension: ReturnType<typeof tillerExtension> | undefined;
  const onWire = input.classId === "420" && input.role === "crew" && input.crewOut > 0.6;
  let harness: V3 = pelvis;
  let holdIn: (sg: number) => V3; // what the inboard hand holds
  let holdOut: (sg: number) => V3; // and the outboard one
  if (input.role === "helm") {
    extension = tillerExtension(input.classId, input.tiller, mix(rel(sgA, inner(sgA), -0.05, -0.38, 0.32), rel(sgB, inner(sgB), -0.05, -0.38, 0.32), m));
    targets.tiller = extension.grip;
    targets.sheet = rel(sgB, outer(sgB), -0.1, -0.34, 0.3);
    holdIn = () => extension!.grip;
    holdOut = sg => rel(sg, outer(sg), -0.1, -0.34, 0.3);
  } else if (onWire) {
    harness = { x: pelvis.x, y: pelvis.y + 0.05 * H, z: pelvis.z };
    // The handle hangs on the wire a little above the harness.
    const top = RIG["420"].hounds!;
    const wl = Math.hypot(top.x - harness.x, top.y - harness.y, top.z - harness.z) || 1;
    const t = 0.55 / wl;
    targets.handle = { x: harness.x + (top.x - harness.x) * t, y: harness.y + (top.y - harness.y) * t, z: harness.z + (top.z - harness.z) * t };
    targets.sheet = rel(sgB, outer(sgB), -0.1, -0.3, 0.35);
    holdIn = () => targets.handle!;
    holdOut = sg => rel(sg, outer(sg), -0.1, -0.3, 0.35);
  } else {
    targets.sheet = rel(sgB, outer(sgB), -0.1, -0.3, 0.35);
    holdIn = sg => rel(sg, inner(sg), 0, -0.4, 0.2); // resting on the knee
    holdOut = sg => rel(sg, outer(sg), -0.1, -0.3, 0.35);
  }
  if (spot.forward > 0.3) {
    // Hoisting or dropping: both hands on the halyard at the mast.
    targets.halyard = { x: 0, y: shoulderL.y - 0.1 * u, z: RIG["420"].mastZ + 0.1 };
    holdIn = holdOut = () => targets.halyard!;
  }
  // Left and right hand: the inboard hand is the left one on the starboard side (sg > 0).
  const handL = sgA > 0 ? mix(holdIn(sgA), holdOut(sgB), m) : mix(holdOut(sgA), holdIn(sgB), m);
  const handR = sgA > 0 ? mix(holdOut(sgA), holdIn(sgB), m) : mix(holdIn(sgA), holdOut(sgB), m);
  const upper = ARM * H;
  const armL = twoBoneReach(shoulderL, handL, upper, upper, { x: -0.5, y: -1, z: -0.2 });
  const armR = twoBoneReach(shoulderR, handR, upper, upper, { x: 0.5, y: -1, z: -0.2 });

  // Legs: feet on the floor or the gunwale, knees up and forward.
  const thigh = THIGH * H;
  const fx = foot0.x;
  const knees: V3 = { x: 0, y: 1, z: 0.5 };
  const legL = twoBoneReach(hipL, { x: fx - 0.09 * u, y: spot.foot.y, z: spot.foot.z }, thigh, thigh, knees);
  const legR = twoBoneReach(hipR, { x: fx + 0.09 * u, y: spot.foot.y, z: spot.foot.z }, thigh, thigh, knees);

  return {
    side, crossing, crossingTime,
    hullRoll: crossing > 0 ? Math.sin(Math.PI * p) * 0.04 * Math.sign(to - from) * (optimist ? 1.5 : 1) : 0,
    position: pelvis, seated: spot.seated, lean, twist, bend, yaw,
    head: { yaw: headYaw, pitch: headPitch },
    joints: {
      pelvis, chest, head, hipL, hipR, shoulderL, shoulderR,
      kneeL: legL.elbow, kneeR: legR.elbow, footL: legL.hand, footR: legR.hand,
      elbowL: armL.elbow, elbowR: armR.elbow, handL: armL.hand, handR: armR.hand,
    },
    targets, extension, onWire, harness, phase,
  };
}
