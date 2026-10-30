/**
 * The sailor pose model: from the boat's state to joint angles and the body's place on the boat. Pure (no Babylon,
 * no browser), so it runs in Node. The view feeds the last result back as `previous`, calls once per frame, and
 * reaches for the hand targets. Frame: x starboard, y up, z forward; sides +1 starboard, -1 port; angles in rad.
 */
import { clamp, lerp } from "../../core/math";
import type { ClassId } from "../../sailing/BoatClass";
import { twoBoneReach, type Reach, type V3 } from "./reach";

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

export type Joint2 = { x: number; y: number };

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
  /** Whole body: lean outboard (rad, toward `side`) and turn toward the boat's side. */
  lean: number;
  twist: number;
  pelvis: Joint2; // roll, yaw
  torso: Joint2 & { bend: number }; // roll, twist, bend forward
  head: Joint2; // yaw, pitch
  armL: Reach;
  armR: Reach;
  legL: Joint2; // hip flexion, knee bend
  legR: Joint2;
  /** Hand targets the arms reach for (absent when the sailor holds nothing). */
  targets: { tiller?: V3; sheet?: V3; handle?: V3 };
  /** Whether the sailor is out on the trapeze. */
  onWire: boolean;
  phase: number;
};

/** How long a side change takes. */
export const CROSSING_TIME = 1;

const smooth = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
const ZERO: V3 = { x: 0, y: 0, z: 0 };
const REF_HEIGHT = 1.55; // the figure height the arm lengths and shoulder height below are laid out for

type Spot = { x: number; y: number; z: number; lean: number; seated: boolean };

/** Where the sailor sits, before sway, on `side` (windward), as a distance outboard. */
function restSpot(i: PoseInput, h: number, forward: number): Spot {
  if (i.classId === "optimist") {
    // Light air: middle or a little to leeward. As the side force builds: to windward, then hiking.
    const x = lerp(-0.08, 0.32, smooth(h * 2)) + 0.26 * smooth(h * 2 - 1);
    return { x, y: 0.22, z: -0.55, lean: 0.05 + h * 1.05, seated: h < 0.15 };
  }
  if (i.role === "helm") return { x: 0.62, y: 0.42, z: -1.25, lean: 0.15 + h * 0.9, seated: false };
  const out = clamp(i.crewOut, 0, 1);
  const lean = out < 0.5 ? 0.1 + out * 1.6 : 0.9 + (out - 0.5) * 1.3;
  const toMast = Math.sin(Math.PI * clamp(forward, 0, 1)); // the trip forward lifts the crew in
  return { x: out > 0.7 ? 0.84 : 0.6, y: 0.42, z: 0.05 + 0.85 * toMast, lean: lean * (1 - 0.7 * toMast), seated: false };
}

/**
 * The pose for one sailor this frame. `previous` is the last result (null the first time); `dt` in seconds.
 * A change of `crewSide` starts a crossing: duck under the boom, cross, settle.
 */
export function sailorPose(input: PoseInput, previous: Pose | null, dt: number): Pose {
  const h = clamp(Math.abs(input.sideForce) / 380, 0, 1);
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
  const spot = restSpot(input, h, input.spiHoist > 0 && input.spiHoist < 1 ? input.spiHoist : 0);
  const sway = Math.sin(phase * 1.7) * 0.015 * (1 + Math.abs(input.heelDeg) / 15);
  const heelShift = -Math.sin((input.heelDeg * Math.PI) / 180) * 0.1;

  // Across the boat: the move happens in the middle of the timeline, after the duck and before the settle.
  const m = smooth((p - 0.25) / 0.5);
  const sx = crossing > 0 ? lerp(from, to, m) : side;
  const duck = crossing > 0 ? Math.sin(Math.PI * p) : 0; // 0..1..0
  const x = crossing > 0 ? sx * spot.x * (1 - 0.5 * duck) : side * spot.x;
  const y = spot.y - 0.2 * duck;
  const lean = spot.lean * (1 - duck) + 0.1 * duck;
  const bend = 0.15 + 0.9 * duck + (spot.seated ? 0.2 : 0);
  const facing = crossing > 0 ? sx : side;

  // Head: toward the sail (the boom side), or a given bearing; smoothed.
  const headTarget = clamp(input.lookAt ?? input.boomSide * 0.55, -1.2, 1.2) * (input.role === "helm" ? 1 : 0.4);
  const headYaw = previous ? lerp(previous.head.x, headTarget, clamp(dt * 6, 0, 1)) : headTarget;

  const position: V3 = { x: x + sway + heelShift * (spot.seated ? 1 : 0.3), y, z: spot.z };
  const twist = 0.35 * facing;
  const shoulderY = y + 0.5 * (input.height / REF_HEIGHT) * Math.cos(lean);
  const shoulderX = position.x + Math.sign(facing || 1) * Math.sin(lean) * 0.5;
  const shoulder = (dx: number): V3 => ({ x: shoulderX + dx, y: shoulderY, z: position.z + 0.1 });
  const k = input.height / REF_HEIGHT;
  const upper = 0.27 * k, fore = 0.27 * k;

  const targets: Pose["targets"] = {};
  const onWire = input.classId === "420" && input.role === "crew" && input.crewOut > 0.6;
  if (input.role === "helm") {
    targets.tiller = { x: -clamp(input.tiller, -1, 1) * 0.35 , y: 0.55, z: position.z + 0.75 };
    targets.sheet = { x: input.boomSide * 0.12, y: 0.85, z: position.z + 0.55 };
  } else if (onWire) {
    targets.handle = { x: facing * 0.12, y: 1.5, z: position.z + 0.2 };
    targets.sheet = { x: facing * 0.3, y: 1.0, z: position.z + 0.15 };
  } else {
    targets.sheet = { x: -facing * 0.15, y: 0.75, z: position.z + 0.3 };
  }
  const down: V3 = { x: facing * 0.5, y: -1, z: 0 };
  const handA = targets.tiller ?? targets.handle ?? targets.sheet ?? ZERO;
  const handB = targets.sheet ?? handA;
  const armL = twoBoneReach(shoulder(-0.18), handA, upper, fore, down);
  const armR = twoBoneReach(shoulder(0.18), handB, upper, fore, down);

  const hip = spot.seated ? 1.4 - 0.6 * duck : 0.25 + 0.9 * duck;
  const knee = spot.seated ? 0.35 : onWire ? 0.2 : 0.15 + 1.1 * duck;

  return {
    side, crossing, crossingTime,
    hullRoll: crossing > 0 ? Math.sin(Math.PI * p) * 0.04 * Math.sign(to - from) * (input.classId === "optimist" ? 1.5 : 1) : 0,
    position, seated: spot.seated, lean, twist,
    pelvis: { x: lean * 0.4, y: twist * 0.5 },
    torso: { x: lean * 0.6, y: twist * 0.5, bend },
    head: { x: headYaw, y: -0.1 + 0.2 * duck },
    armL, armR,
    legL: { x: hip, y: knee }, legR: { x: hip, y: knee },
    targets, onWire, phase,
  };
}
