import { clamp, DEG, KNOTS, wrapPi } from "../core/math";
import {
  referenceWeights,
  type BoatClass,
  type SailSpec,
  type SailorWeights,
} from "./BoatClass";
import type { WindField } from "./Wind";

/**
 * 2D (top-down) sailing model with a fixed timestep.
 *
 * What it simulates:
 *  - true wind + boat velocity -> apparent wind (speed and angle)
 *  - each sail is a wing: sheet length limits its angle, the angle of attack gives lift/drag
 *    (luffs when eased too far, stalls when over-trimmed, no drive inside the no-go zone)
 *  - two-person boats: a jib and a spinnaker that must be on the leeward side (the Crew moves them
 *    across after a tack or gybe), a spinnaker that only works off the wind, and Crew weight
 *    (sitting in, hiking, trapeze) that must be on the windward side
 *  - drive vs. hull resistance (with a "hull speed" wall) -> acceleration and inertia
 *  - side force vs. centreboard grip -> leeway (sideways drift), worse at low speed
 *  - rudder authority proportional to boat speed; turning costs speed (tacks/gybes lose momentum)
 *  - righting limit: when the sailors can't hold the boat flat it heels and spills power;
 *    too much weight out in light air heels it to windward and slows it down
 *
 * Frame: bearing 0 = +Z, clockwise toward +X. "Starboard" is +X when heading 0.
 */
export type Controls = {
  /** -1 = full port helm (bow turns left) .. +1 = bow turns right. */
  rudder: number;
  /** Target mainsheet: 0 = sheeted in hard, 1 = fully eased. */
  sheet: number;
  /** Two-person boats only. */
  jibSheet?: number;
  spiSheet?: number;
  /** Spinnaker wanted up (true) or down (false). */
  spi?: boolean;
  /** Crew weight target: 0 = sitting in, 0.5 = hiking, 1 = on the trapeze. */
  crewOut?: number;
  /**
   * Helm weight target: 0 = sitting in, 1 = fully out; a 420 Helm may go below 0, sitting to leeward. Unset, the Helm
   * hikes exactly as needed (Auto-hike).
   */
  helmOut?: number;
  /**
   * How well the Helm rolls a tack or gybe, 0 (late or none) .. 1 (hard on the new side just after the boom crosses);
   * 0.5 is average. Unset, a manual Helm is judged by their own `helmOut` and Auto-hike rolls an average one. The AI sets it.
   */
  roll?: number;
  /** One-shot: the Crew moves jib, spinnaker and their weight to the new side (after a tack/gybe). */
  switchSide?: boolean;
};

export type BoatState = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  yawRate: number;
  /** Actual rudder and sheet positions (lag behind the commands). */
  rudder: number;
  sheet: number;
  /** Which side the boom is on: +1 starboard, -1 port. */
  boomSide: number;
  jibSheet: number;
  spiSheet: number;
  /** Side the jib / spinnaker is set on and the side the Crew sits on (+1 starboard, -1 port). */
  jibSide: number;
  spiSide: number;
  crewSide: number;
  crewOut: number;
  /** The Helm's weight now, like `crewOut` but for the Helm (see `Controls.helmOut`). */
  helmOut: number;
  /** 0 = spinnaker in its bag, 1 = fully hoisted. */
  spiHoist: number;
};

export type TrimState = "luffing" | "good" | "stalled" | "irons" | "running";

export type Telemetry = {
  /** Forward speed through the water (m/s), and speed over ground. */
  speed: number;
  sog: number;
  leewayDeg: number;
  tws: number;
  /** True wind angle relative to bow, signed (+ = wind from starboard). */
  twa: number;
  aws: number;
  awa: number;
  /** Mainsail: boom angle from centreline (rad, >= 0), angle of attack (rad), trim. */
  boomAngle: number;
  aoa: number;
  trimState: TrimState;
  optimalSheet: number;
  drive: number;
  sideForce: number;
  /** Heel angle, + = to starboard. */
  heelDeg: number;
  overpowered: boolean;
  puff: number;
  /** True while the boat is on the plane (a planing class, weight aft, flat, in a breeze on a reach); `planeLevel` is how far (0..1). */
  planing: boolean;
  planeLevel: number;
  jib?: {
    angle: number;
    aoa: number;
    optimal: number;
    trimState: TrimState;
    backed: boolean;
  };
  spi?: {
    hoist: number;
    angle: number;
    optimal: number;
    trimState: TrimState;
    collapsed: boolean;
    wrongSide: boolean;
  };
  /** The Helm's weight: the ideal `helmOut` for the wind now, and the righting force (N) it gives. */
  helm?: { ideal: number; force: number };
  crew?: {
    /** Where the Crew's weight should be (0..1) to keep the boat flat. */
    ideal: number;
    onWindward: boolean;
    /** Unbalanced side force (N): + = heeling to leeward (overpowered), - = to windward (too much weight out). */
    balance: number;
  };
};

const AIR = 1.225;
/** Roll tack: seconds after the boom crosses in which the roll counts, how long its effect lasts, and its peak push (m/s^2). */
const ROLL_WINDOW = 1.2,
  ROLL_SPAN = 2.2,
  ROLL_ACCEL = 0.1;
/** A hike this far up inside the window is a perfect roll (a hard hike rises about 0.84 in it); no rise at all is the worst. */
const ROLL_FULL_RISE = 0.6;
/** Drive an ILCA loses in a breeze per unit of weight below its rig's ideal (a sailor 30% light loses 36%). */
const RIG_DEPOWER = 1.2;
/** Unbalanced side force (N) below which the boat still counts as held flat, so a Helm hiking exactly at the ideal doesn't flicker. */
const OVERPOWER_DEADBAND = 5;

export function createBoat(x: number, z: number, heading: number): BoatState {
  return {
    x,
    z,
    vx: 0,
    vz: 0,
    heading,
    yawRate: 0,
    rudder: 0,
    sheet: 0.5,
    boomSide: 1,
    jibSheet: 0.5,
    spiSheet: 0.5,
    jibSide: 1,
    spiSide: 1,
    crewSide: -1,
    crewOut: 0.3,
    helmOut: 0,
    spiHoist: 0,
  };
}

/** Lift coefficient vs angle of attack (deg): rises to clMax, then stalls toward a flat plate. */
export function liftCoeff(spec: SailSpec, aDeg: number): number {
  const a = Math.abs(aDeg);
  const plate = 1.05 * Math.sin(2 * a * DEG);
  if (a <= spec.stallDeg)
    return spec.clMax * Math.sin((Math.PI / 2) * (a / spec.stallDeg));
  const t = clamp((a - spec.stallDeg) / 14, 0, 1);
  return spec.clMax * (1 - t) + plate * t;
}

export function dragCoeff(spec: SailSpec, aDeg: number, cl: number): number {
  const s = Math.sin(Math.abs(aDeg) * DEG);
  return spec.cd0 + 0.07 * cl * cl + 1.25 * s * s;
}

type SailForce = { drive: number; side: number; aoa: number; angle: number };

/**
 * Forces from one sail in the boat frame for a given apparent wind and sheet setting.
 * awa: signed apparent wind angle (+ from starboard), aws in m/s, side: which side the sail is set on.
 */
export function sailForce(
  spec: SailSpec,
  awa: number,
  aws: number,
  sheet: number,
  side: number,
  areaScale = 1,
): SailForce {
  const sheetAngle =
    (spec.minSheetDeg +
      clamp(sheet, 0, 1) * (spec.maxSheetDeg - spec.minSheetDeg)) *
    DEG;
  const absAwa = Math.abs(awa);
  const leeward = awa >= 0 ? -1 : 1;
  // A sail on the leeward side weathervanes (luffs) once it is eased past the wind.
  // On the windward side ("by the lee", or a backed jib) it is pinned against its sheet.
  const angle = side === leeward ? Math.min(sheetAngle, absAwa) : sheetAngle;
  let aoa = Math.abs(wrapPi(awa + side * angle));
  if (aoa > Math.PI / 2) aoa = Math.PI - aoa;
  const aDeg = aoa / DEG;
  const cl = liftCoeff(spec, aDeg);
  const cd = dragCoeff(spec, aDeg, cl);
  const q = 0.5 * AIR * aws * aws * spec.area * areaScale;

  // Flow direction (where the air goes) in the boat frame: f = forward, s = starboard.
  const flowF = -Math.cos(awa);
  const flowS = -Math.sin(awa);
  // Chord (luff -> clew) and its normal on the leeward side (away from the wind).
  const chordF = -Math.cos(angle),
    chordS = side * Math.sin(angle);
  let leeF = -chordS,
    leeS = chordF;
  if (leeF * flowF + leeS * flowS < 0) {
    leeF = -leeF;
    leeS = -leeS;
  }
  // Lift is perpendicular to the flow and pulls toward the leeward side of the sail.
  let liftF = -flowS,
    liftS = flowF;
  if (liftF * leeF + liftS * leeS < 0) {
    liftF = -liftF;
    liftS = -liftS;
  }
  return {
    drive: q * (cl * liftF + cd * flowF),
    side: q * (cl * liftS + cd * flowS),
    aoa,
    angle,
  };
}

/** The spinnaker only flies with the wind well aft; closer to the wind it collapses and just drags. */
function spiEffect(awa: number) {
  const a = Math.abs(awa) / DEG;
  return clamp((a - 55) / 30, 0, 1);
}

/** Sheet steps sampled by `optimalSheetFor`: 0, 1/40, ..., 1. */
const SHEET_STEPS = 40;

/** Per sail: the sheet angle at each sampled sheet, with its cosine and sine (pure functions of the spec). */
type SheetTable = { angle: Float64Array; cos: Float64Array; sin: Float64Array };
const sheetTables = new WeakMap<SailSpec, SheetTable>();

function sheetTable(spec: SailSpec): SheetTable {
  let t = sheetTables.get(spec);
  if (t) return t;
  const n = SHEET_STEPS + 1;
  t = {
    angle: new Float64Array(n),
    cos: new Float64Array(n),
    sin: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    // Same expression as sailForce, so the angles are bit-identical.
    const a =
      (spec.minSheetDeg +
        clamp(i / SHEET_STEPS, 0, 1) * (spec.maxSheetDeg - spec.minSheetDeg)) *
      DEG;
    t.angle[i] = a;
    t.cos[i] = Math.cos(a);
    t.sin[i] = Math.sin(a);
  }
  sheetTables.set(spec, t);
  return t;
}

/**
 * Best sheet (0..1) for one sail, maximising drive; `cap` limits side force as the sailors would.
 *
 * Samples the sheet in 41 steps and keeps the first best one. It gives exactly the result of calling
 * `sailForce` at every step on the leeward side, only cheaper:
 * - the sail is on the leeward side, so once the sheet angle reaches the apparent wind the sail luffs at the
 *   wind and every further step gives the same drive, which can't beat the best: the search stops there;
 * - a spinnaker with no effect (wind forward of the beam) gives zero drive at every step, so the answer is 0;
 * - the sheet angles and their sines and cosines come from a per-sail table, and nothing is allocated.
 */
export function optimalSheetFor(
  spec: SailSpec,
  awa: number,
  aws: number,
  cap: number,
  isSpi = false,
): number {
  const effect = isSpi ? spiEffect(awa) : 1;
  if (effect === 0) return 0;
  const side = awa >= 0 ? -1 : 1;
  const absAwa = Math.abs(awa);
  const w = Math.max(aws, 0.5);
  const q = 0.5 * AIR * w * w * spec.area;
  const flowF = -Math.cos(awa);
  const flowS = -Math.sin(awa);
  const absCos = Math.cos(absAwa),
    absSin = Math.sin(absAwa);
  const tab = sheetTable(spec);
  let best = 0,
    bestDrive = -Infinity;
  for (let i = 0; i <= SHEET_STEPS; i++) {
    // Leeward side: the sail weathervanes once eased past the wind (as in sailForce).
    const luffing = tab.angle[i] >= absAwa;
    const angle = luffing ? absAwa : tab.angle[i];
    let aoa = Math.abs(wrapPi(awa + side * angle));
    if (aoa > Math.PI / 2) aoa = Math.PI - aoa;
    const aDeg = aoa / DEG;
    const cl = liftCoeff(spec, aDeg);
    const cd = dragCoeff(spec, aDeg, cl);
    const chordF = -(luffing ? absCos : tab.cos[i]),
      chordS = side * (luffing ? absSin : tab.sin[i]);
    let leeF = -chordS,
      leeS = chordF;
    if (leeF * flowF + leeS * flowS < 0) {
      leeF = -leeF;
      leeS = -leeS;
    }
    let liftF = -flowS,
      liftS = flowF;
    if (liftF * leeF + liftS * leeS < 0) {
      liftF = -liftF;
      liftS = -liftS;
    }
    const fSide = q * (cl * liftS + cd * flowS);
    let d = q * (cl * liftF + cd * flowF);
    if (Math.abs(fSide) > cap) d *= Math.sqrt(cap / Math.abs(fSide));
    if (isSpi) d *= effect;
    if (d > bestDrive + 1e-6) {
      bestDrive = d;
      best = i / SHEET_STEPS;
    }
    // Every further step luffs at the wind too and gives this same drive, which can't beat the best.
    if (luffing) break;
  }
  return best;
}

/** Kept for code that only cares about the mainsail (Optimist, AI, HUD). */
export function optimalSheet(
  cls: BoatClass,
  awa: number,
  aws: number,
  rightingScale = 1,
): number {
  return optimalSheetFor(cls.main, awa, aws, mainCap(cls) * rightingScale);
}

function mainCap(cls: BoatClass) {
  if (!cls.crewRighting) return cls.hikeForce;
  const total = cls.main.area + (cls.jib?.area ?? 0);
  return (
    (cls.hikeForce + cls.crewRighting.trapezeForce) * (cls.main.area / total)
  );
}

/** Crew righting force for a weight position 0 (in) .. 0.5 (hiking) .. 1 (trapeze). */
export function crewForce(cls: BoatClass, out: number, scale = 1): number {
  const c = cls.crewRighting;
  if (!c) return 0;
  const o = clamp(out, 0, 1);
  const f =
    o <= 0.5
      ? c.inForce + (c.hikeForce - c.inForce) * (o / 0.5)
      : c.hikeForce + (c.trapezeForce - c.hikeForce) * ((o - 0.5) / 0.5);
  return f * scale;
}

/** Righting force (N) of the Helm at weight position `out`, given the force `hike` of hiking fully out (scaled to their weight). */
export function helmForce(cls: BoatClass, out: number, hike: number): number {
  const h = cls.helmRighting;
  const o = clamp(out, h.leewardMin, 1);
  if (o >= 0) return hike * (h.inFrac + (1 - h.inFrac) * o);
  return hike * h.inFrac * (1 + (2 * o) / -h.leewardMin);
}

/** Inverse of helmForce over the whole range, including the negative force of sitting to leeward (clamped to what the Helm can do). */
export function helmOutFor(
  cls: BoatClass,
  force: number,
  hike: number,
): number {
  const h = cls.helmRighting;
  const f = force / hike;
  if (f >= h.inFrac) return clamp((f - h.inFrac) / (1 - h.inFrac), 0, 1);
  if (h.leewardMin >= 0 || h.inFrac <= 0) return 0;
  return clamp(((f / h.inFrac - 1) * -h.leewardMin) / 2, h.leewardMin, 0);
}

/** Inverse of crewForce: the weight position that gives `force` (clamped). */
export function crewOutFor(cls: BoatClass, forceIn: number, scale = 1): number {
  const c = cls.crewRighting;
  if (!c) return 0;
  const force = forceIn / scale;
  if (force <= c.inForce) return 0;
  if (force <= c.hikeForce)
    return (0.5 * (force - c.inForce)) / (c.hikeForce - c.inForce);
  return Math.min(
    1,
    0.5 + (0.5 * (force - c.hikeForce)) / (c.trapezeForce - c.hikeForce),
  );
}

function trimStateFor(sheet: number, optimal: number, awa: number): TrimState {
  const err = sheet - optimal;
  if (Math.abs(err) <= 0.08)
    return Math.abs(awa) > 150 * DEG ? "running" : "good";
  return err > 0 ? "luffing" : "stalled";
}

export class BoatSim {
  state: BoatState;
  telemetry: Telemetry;
  private started = false;
  /** Righting force (N) of the Helm hiking fully, and the Crew's force factor: both scale with body weight. */
  private readonly helmHike: number;
  private readonly crewScale: number;
  /** How much more (or less) total righting the sailors give than the reference, for the sheet limit. */
  private readonly rightingScale: number;
  /** Boat plus sailors, kg. */
  private readonly mass: number;
  /** Hull resistance factor: wetted area grows with displacement, so a heavier boat is slower in light air. */
  private readonly dragScale: number;
  /** Roll tack: seconds since the boom last crossed (infinite before the first), the quality sampled over its first second, and the result. */
  private rollT = Infinity;
  private rollSum = 0;
  private rollQ = 0.5;
  /** Manual roll: the Helm's weight (>= 0) when the boom crossed, and the furthest it has risen above that since. */
  private rollBase = 0;
  private rollRise = 0;
  /** Where the sailors' weight sits fore-aft, 0 aft .. 1 forward. Automatic: the ideal for the wind (not a player control). */
  private weightFore = 1;
  /** How far the boat is planing (or has its bow up), 0..1; builds slowly and is lost quickly. */
  private plane = 0;
  /**
   * `foreAftSkill` 0..1 is the Helm's technique at moving the weight aft (the player's boat is always 1): a lower skill gets the
   * weight aft later and not so far, so the boat planes later or not at all. No randomness.
   */
  constructor(
    public cls: BoatClass,
    state: BoatState,
    public weights: SailorWeights = referenceWeights(cls),
    public foreAftSkill = 1,
  ) {
    const ref = referenceWeights(cls);
    this.helmHike = (cls.hikeForce * weights.helmKg) / ref.helmKg;
    this.rightingScale =
      (weights.helmKg + weights.crewKg) / (ref.helmKg + ref.crewKg);
    this.crewScale = ref.crewKg > 0 ? weights.crewKg / ref.crewKg : 1;
    this.mass =
      cls.mass + weights.helmKg + weights.crewKg - ref.helmKg - ref.crewKg;
    this.dragScale = Math.pow(this.mass / cls.mass, 0.5);
    this.state = state;
    this.telemetry = {
      speed: 0,
      sog: 0,
      leewayDeg: 0,
      tws: 0,
      twa: 0,
      aws: 0,
      awa: 0,
      boomAngle: 0,
      aoa: 0,
      trimState: "luffing",
      optimalSheet: 0.5,
      drive: 0,
      sideForce: 0,
      heelDeg: 0,
      overpowered: false,
      puff: 0,
      planing: false,
      planeLevel: 0,
    };
  }

  /**
   * Roll tack or gybe: the quality is judged over the first ROLL_WINDOW s after the boom crosses; then, for ROLL_SPAN s, an
   * average roll changes nothing, a good one gives a push and a late or missing one a drag. It fades out from 6 to 10 kn.
   * A manual Helm is judged by how far their hike rises inside the window from where it was at the crossing (a Helm already
   * sitting to leeward before a gybe counts as starting from 0); the AI gives a quality and Auto-hike an average one.
   */
  private rollAccel(dt: number, controls: Controls, kn: number): number {
    if (this.rollT === Infinity) return 0;
    this.rollT += dt;
    if (this.rollT <= ROLL_WINDOW) {
      const manual =
        controls.roll === undefined && controls.helmOut !== undefined;
      if (manual)
        this.rollRise = Math.max(
          this.rollRise,
          clamp(this.state.helmOut, 0, 1) - this.rollBase,
        );
      else this.rollSum += (controls.roll ?? 0.5) * dt;
      if (this.rollT + dt > ROLL_WINDOW)
        this.rollQ = manual
          ? clamp(this.rollRise / ROLL_FULL_RISE, 0, 1)
          : this.rollSum / ROLL_WINDOW;
      return 0;
    }
    const x = (this.rollT - ROLL_WINDOW) / ROLL_SPAN;
    if (x >= 1) {
      this.rollT = Infinity;
      return 0;
    }
    return (
      ROLL_ACCEL *
      2 *
      (this.rollQ - 0.5) *
      clamp((10 - kn) / 4, 0, 1) *
      Math.sin(Math.PI * x) *
      dt
    );
  }

  step(dt: number, controls: Controls, wind: WindField) {
    const s = this.state,
      cls = this.cls;

    // Actuators: the rudder, sheets, Crew weight and spinnaker can't move instantly.
    s.rudder += clamp(controls.rudder - s.rudder, -dt * 4.5, dt * 4.5);
    s.sheet += clamp(controls.sheet - s.sheet, -dt * 0.9, dt * 1.6);
    if (cls.jib && controls.jibSheet !== undefined)
      s.jibSheet += clamp(controls.jibSheet - s.jibSheet, -dt * 1.2, dt * 2);
    if (cls.spinnaker) {
      if (controls.spiSheet !== undefined)
        s.spiSheet += clamp(controls.spiSheet - s.spiSheet, -dt * 1.2, dt * 2);
      const want = controls.spi ? 1 : 0;
      const rate =
        want > s.spiHoist
          ? 1 / cls.spinnaker.hoistTime
          : 1 / cls.spinnaker.dropTime;
      s.spiHoist += clamp(want - s.spiHoist, -dt * rate, dt * rate);
    }
    if (cls.crewRighting && controls.crewOut !== undefined)
      s.crewOut += clamp(controls.crewOut - s.crewOut, -dt * 0.9, dt * 0.7);

    const fx = Math.sin(s.heading),
      fz = Math.cos(s.heading); // forward
    const sx = Math.cos(s.heading),
      sz = -Math.sin(s.heading); // starboard
    let u = s.vx * fx + s.vz * fz;
    let v = s.vx * sx + s.vz * sz;

    // True wind (velocity of the air) and apparent wind (air relative to the boat).
    const w = wind.sample(s.x, s.z);
    const twx = -Math.sin(w.fromDir) * w.speed,
      twz = -Math.cos(w.fromDir) * w.speed;
    const ax = twx - s.vx,
      az = twz - s.vz;
    const aws = Math.hypot(ax, az);
    // "From" vector of apparent wind in boat frame.
    const awa = Math.atan2(-(ax * sx + az * sz), -(ax * fx + az * fz));
    const twa = wrapPi(w.fromDir - s.heading);

    // Boom side follows the leeward side, with hysteresis around dead downwind so it doesn't flicker.
    const leeward = awa >= 0 ? -1 : 1;
    if (!this.started) {
      s.boomSide = s.jibSide = s.spiSide = leeward;
      s.crewSide = -leeward;
      this.started = true;
    }
    if (
      leeward !== s.boomSide &&
      (Math.abs(awa) < 170 * DEG || Math.abs(awa) < 2 * DEG)
    ) {
      s.boomSide = leeward;
      this.rollT = 0;
      this.rollSum = 0;
      this.rollRise = 0;
      this.rollBase = clamp(s.helmOut, 0, 1);
    }
    if (controls.switchSide) {
      s.jibSide = s.spiSide = leeward;
      s.crewSide = -leeward;
      controls.switchSide = false;
    }

    // Sail forces.
    const main = sailForce(cls.main, awa, aws, s.sheet, s.boomSide);
    let drive = main.drive,
      side = main.side;
    let jib: SailForce | null = null,
      spi: SailForce | null = null;
    if (cls.jib) {
      jib = sailForce(cls.jib, awa, aws, s.jibSheet, s.jibSide);
      drive += jib.drive;
      side += jib.side;
    }
    if (cls.spinnaker && s.spiHoist > 0.02) {
      spi = sailForce(
        cls.spinnaker,
        awa,
        aws,
        s.spiSheet,
        s.spiSide,
        s.spiHoist,
      );
      const e = spiEffect(awa) * (s.spiSide === leeward ? 1 : 0.2);
      const q = 0.5 * AIR * aws * aws * cls.spinnaker.area * s.spiHoist;
      drive += spi.drive * e - (1 - e) * 0.25 * q;
      side += spi.side * (0.5 + 0.5 * e);
    }
    // Hull, rig and sailor windage always push downwind.
    const windage = 0.5 * AIR * aws * aws * cls.windage;
    drive += windage * -Math.cos(awa);
    side += windage * -Math.sin(awa);

    // Weight is power in a breeze: heavier sailors hold the boat flatter and carry more sail, lighter ones less (fades out below
    // ~9 kn). It only helps as far as righting is needed, so it vanishes downwind.
    const tKn = w.speed * KNOTS,
      absTwa = Math.abs(twa);
    const breeze = clamp((tKn - 9) / 4, 0, 1);
    const rawSide = side;
    const need = Math.abs(side);
    const maxRighting =
      this.helmHike +
      (cls.crewRighting ? cls.crewRighting.trapezeForce * this.crewScale : 0);
    drive *=
      1 +
      0.5 * (this.rightingScale - 1) * breeze * clamp(need / maxRighting, 0, 1);

    // An ILCA sailed under its rig's ideal weight can't hold the sail in a breeze: it is eased and flogs, so drive falls (from ~8 kn
    // to full at 14 kn). Heavier sailors lose nothing here: they only add mass.
    if (cls.rig !== undefined)
      drive *=
        1 -
        RIG_DEPOWER *
          Math.max(0, 1 - this.rightingScale) *
          clamp((tKn - 8) / 6, 0, 1);

    // Righting: Crew weight (if any) plus the Helm hiking as much as needed.
    const crewOnWindward = s.crewSide === -leeward;
    const crewF = cls.crewRighting
      ? crewForce(cls, s.crewOut, this.crewScale) * (crewOnWindward ? 1 : -1)
      : 0;
    const hr = cls.helmRighting;
    const inF = hr.inFrac * this.helmHike;
    const rawWanted = need - crewF;
    const wanted = clamp(rawWanted, 0, this.helmHike); // the Helm hiking exactly as needed
    // Where the Helm would sit for that: to leeward on a broad reach or run in light air when almost nothing is needed (420), only
    // as far across as the heel that adds allows; else as far out as needed. Never to leeward while planing or in a breeze.
    const toLeeward =
      hr.leewardMin < 0 &&
      absTwa > 110 * DEG &&
      wanted < inF * 0.5 &&
      this.plane < 0.3 &&
      tKn < 12;
    const leewardF = clamp(rawWanted, -inF, inF);
    const ideal =
      wanted > inF
        ? helmOutFor(cls, wanted, this.helmHike)
        : toLeeward
          ? helmOutFor(cls, leewardF, this.helmHike)
          : 0;
    let helmF: number;
    if (controls.helmOut === undefined) {
      // Auto-hike: as needed (the Optimist Helm never less than sitting on the side deck); the body follows with lag.
      helmF = hr.windwardOnly ? Math.max(wanted, inF) : wanted;
      s.helmOut += clamp(ideal - s.helmOut, -dt * 0.9, dt * 0.9);
    } else {
      s.helmOut += clamp(
        clamp(controls.helmOut, hr.leewardMin, 1) - s.helmOut,
        -dt * 0.9,
        dt * 0.7,
      );
      helmF = helmForce(cls, s.helmOut, this.helmHike);
    }
    const balance = need - crewF - helmF; // > 0 overpowered, < 0 too much weight to windward
    const baseline = hr.windwardOnly ? inF : 0; // the Optimist Helm's weight on the side deck is free
    let overpowered = false;
    if (balance > OVERPOWER_DEADBAND && need > 0) {
      // The sailors can't hold the boat flat: it heels and spills power.
      const k = Math.max(need - balance, 1) / need;
      drive *= Math.sqrt(k); // drive drops less than side force (sails twist off)
      side *= k;
      overpowered = true;
    } else if (balance < 0) {
      // Heeled to windward: the boat sails badly and the Helm fights it.
      drive *= 1 - Math.min(0.4, Math.max(0, -balance - baseline) / 600);
    }

    // Hull resistance (forward) and rudder drag.
    const au = Math.abs(u);
    // Fore-aft weight: forward upwind and in light air, aft on a reach or run in a breeze (planing). Once the weight is aft and the
    // boat is flat, the bow lifts (and a planing class gets onto the plane) and wave drag falls.
    const breezy = clamp(tKn - 12, 0, 1); // 0 at 12 kn, 1 at 13 kn: nothing at 11 kn
    const downwind =
      clamp((absTwa - 75 * DEG) / (15 * DEG), 0, 1) *
      (cls.planing.planes ? clamp((172 * DEG - absTwa) / (10 * DEG), 0, 1) : 1);
    const aftRate = dt * 0.6 * (0.3 + 0.7 * this.foreAftSkill);
    this.weightFore += clamp(
      (breezy * downwind > 0.5 ? 0.6 * (1 - this.foreAftSkill) : 1) -
        this.weightFore,
      -aftRate,
      aftRate,
    );
    const flat =
      Math.abs(this.telemetry.heelDeg) < 6 && !this.telemetry.overpowered;
    const planeTarget =
      breezy * downwind * (this.weightFore < 0.35 && flat ? 1 : 0);
    this.plane += clamp(planeTarget - this.plane, -dt * 1.0, dt * 0.4);
    const wave = Math.max(0, au - cls.hullSpeed);
    const resist =
      Math.sign(u) *
        (this.dragScale * (cls.hullDrag * u * u + 6 * au) +
          cls.waveDrag * (1 - cls.planing.waveCut * this.plane) * wave * wave) +
      8 * u * u * s.rudder * s.rudder * Math.sign(u);
    u +=
      ((drive - resist) / this.mass) * dt +
      this.rollAccel(dt, controls, w.speed * KNOTS);
    // Side force pushes the boat sideways; the hull itself damps lateral motion a little.
    v += ((side - 30 * v * Math.abs(v) - 8 * v) / this.mass) * dt;

    // Centreboard: while moving forward it acts as a foil and rotates the velocity back toward
    // the heading (grip grows with speed). Turning the velocity vector costs a bit of speed, so hard
    // turns and tacks bleed momentum. Moving backward (in irons) it only damps sideways drift.
    if (u >= 0) {
      const spd = Math.hypot(u, v);
      if (spd > 1e-4) {
        const drift = Math.atan2(v, u);
        const grip = cls.boardGrip * Math.max(u, 0.12);
        const newDrift = drift * Math.exp(-grip * dt);
        const turned = Math.abs(drift - newDrift);
        const mag = spd * (1 - 0.32 * turned);
        u = Math.cos(newDrift) * mag;
        v = Math.sin(newDrift) * mag;
      }
    } else {
      v *= Math.exp(-1.6 * dt);
    }

    // Steering: authority comes from water flowing past the rudder.
    const delta = s.rudder * cls.rudderMaxDeg * DEG;
    // Small base authority (body weight, sculling) that follows the flow direction like the rudder does.
    let rTarget =
      (u * Math.tan(delta)) / cls.turnLength +
      s.rudder * 0.1 * (u < -0.05 ? -1 : 1);
    // Stuck head-to-wind at low speed: the bow slowly falls off (otherwise the boat sits in irons forever).
    if (Math.abs(awa) < 30 * DEG && Math.abs(u) < 0.2)
      rTarget += (twa >= 0 ? -1 : 1) * 0.07;
    s.yawRate += (rTarget - s.yawRate) * Math.min(1, dt / 0.22);
    s.heading = wrapPi(s.heading + s.yawRate * dt);

    s.vx = u * fx + v * sx;
    s.vz = u * fz + v * sz;
    s.x += s.vx * dt;
    s.z += s.vz * dt;

    // Telemetry for HUD / AI.
    const t = this.telemetry;
    t.speed = u;
    t.sog = Math.hypot(s.vx, s.vz);
    t.leewayDeg = Math.abs(u) > 0.2 ? Math.atan2(v, Math.abs(u)) / DEG : 0;
    t.tws = w.speed;
    t.twa = twa;
    t.aws = aws;
    t.awa = awa;
    t.puff = w.puff;
    t.boomAngle = main.angle;
    t.aoa = main.aoa;
    t.drive = drive;
    t.sideForce = side;
    t.overpowered = overpowered;
    t.planeLevel = this.plane;
    t.planing = cls.planing.planes && this.plane > 0.6;
    if (cls.crewRighting) {
      const heel = clamp(
        balance * cls.heelPerN * 1.4 + (need > 20 ? 4 : need * 0.2),
        -25,
        40,
      );
      t.heelDeg = heel * -Math.sign(awa || 1);
    } else {
      t.heelDeg =
        clamp(
          Math.abs(rawSide) * cls.heelPerN * 0.55 +
            balance * cls.heelPerN * 0.8,
          -25,
          32,
        ) * -Math.sign(awa || 1);
    }
    t.optimalSheet = optimalSheet(cls, awa, aws, this.rightingScale);
    const irons = Math.abs(twa) < 36 * DEG && u < 1.2;
    t.trimState = irons ? "irons" : trimStateFor(s.sheet, t.optimalSheet, awa);

    if (cls.jib && jib) {
      const total = cls.main.area + cls.jib.area;
      const cap =
        (cls.hikeForce + (cls.crewRighting?.trapezeForce ?? 0)) *
        this.rightingScale *
        (cls.jib.area / total);
      const opt = optimalSheetFor(cls.jib, awa, aws, cap);
      const backed = s.jibSide !== leeward && Math.abs(awa) < 150 * DEG;
      t.jib = {
        angle: jib.angle,
        aoa: jib.aoa,
        optimal: opt,
        backed,
        trimState: irons ? "irons" : trimStateFor(s.jibSheet, opt, awa),
      };
    }
    if (cls.spinnaker) {
      const opt = optimalSheetFor(cls.spinnaker, awa, aws, 1e9, true);
      const collapsed = s.spiHoist > 0.5 && spiEffect(awa) < 0.5;
      t.spi = {
        hoist: s.spiHoist,
        angle: spi ? spi.angle : 0,
        optimal: opt,
        collapsed,
        wrongSide: s.spiSide !== leeward && Math.abs(awa) < 175 * DEG,
        trimState: trimStateFor(s.spiSheet, opt, awa),
      };
    }
    t.helm = { ideal, force: helmF };
    if (cls.crewRighting) {
      // Ideal: the Helm hikes at ~80%, the Crew provides the rest.
      t.crew = {
        ideal: crewOutFor(cls, need - this.helmHike * 0.8, this.crewScale),
        onWindward: crewOnWindward,
        balance,
      };
    }
  }
}
