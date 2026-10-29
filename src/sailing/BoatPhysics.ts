import { clamp, DEG, wrapPi } from "../core/math";
import type { BoatClass, SailSpec } from "./BoatClass";
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
  jib?: { angle: number; aoa: number; optimal: number; trimState: TrimState; backed: boolean };
  spi?: { hoist: number; angle: number; optimal: number; trimState: TrimState; collapsed: boolean; wrongSide: boolean };
  crew?: {
    /** Where the Crew's weight should be (0..1) to keep the boat flat. */
    ideal: number;
    onWindward: boolean;
    /** Unbalanced side force (N): + = heeling to leeward (overpowered), - = to windward (too much weight out). */
    balance: number;
  };
};

const AIR = 1.225;

export function createBoat(x: number, z: number, heading: number): BoatState {
  return {
    x, z, vx: 0, vz: 0, heading, yawRate: 0, rudder: 0, sheet: 0.5, boomSide: 1,
    jibSheet: 0.5, spiSheet: 0.5, jibSide: 1, spiSide: 1, crewSide: -1, crewOut: 0.3, spiHoist: 0,
  };
}

/** Lift coefficient vs angle of attack (deg): rises to clMax, then stalls toward a flat plate. */
export function liftCoeff(spec: SailSpec, aDeg: number): number {
  const a = Math.abs(aDeg);
  const plate = 1.05 * Math.sin(2 * a * DEG);
  if (a <= spec.stallDeg) return spec.clMax * Math.sin((Math.PI / 2) * (a / spec.stallDeg));
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
export function sailForce(spec: SailSpec, awa: number, aws: number, sheet: number, side: number, areaScale = 1): SailForce {
  const sheetAngle = (spec.minSheetDeg + clamp(sheet, 0, 1) * (spec.maxSheetDeg - spec.minSheetDeg)) * DEG;
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
  const chordF = -Math.cos(angle), chordS = side * Math.sin(angle);
  let leeF = -chordS, leeS = chordF;
  if (leeF * flowF + leeS * flowS < 0) { leeF = -leeF; leeS = -leeS; }
  // Lift is perpendicular to the flow and pulls toward the leeward side of the sail.
  let liftF = -flowS, liftS = flowF;
  if (liftF * leeF + liftS * leeS < 0) { liftF = -liftF; liftS = -liftS; }
  return { drive: q * (cl * liftF + cd * flowF), side: q * (cl * liftS + cd * flowS), aoa, angle };
}

/** The spinnaker only flies with the wind well aft; closer to the wind it collapses and just drags. */
function spiEffect(awa: number) {
  const a = Math.abs(awa) / DEG;
  return clamp((a - 55) / 30, 0, 1);
}

/** Best sheet (0..1) for one sail, maximising drive; `cap` limits side force as the sailors would. */
export function optimalSheetFor(spec: SailSpec, awa: number, aws: number, cap: number, isSpi = false): number {
  const side = awa >= 0 ? -1 : 1;
  let best = 0, bestDrive = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const s = i / 40;
    const f = sailForce(spec, awa, Math.max(aws, 0.5), s, side);
    let d = f.drive;
    if (Math.abs(f.side) > cap) d *= Math.sqrt(cap / Math.abs(f.side));
    if (isSpi) d *= spiEffect(awa);
    if (d > bestDrive + 1e-6) { bestDrive = d; best = s; }
  }
  return best;
}

/** Kept for code that only cares about the mainsail (Optimist, AI, HUD). */
export function optimalSheet(cls: BoatClass, awa: number, aws: number): number {
  return optimalSheetFor(cls.main, awa, aws, mainCap(cls));
}

function mainCap(cls: BoatClass) {
  if (!cls.crewRighting) return cls.hikeForce;
  const total = cls.main.area + (cls.jib?.area ?? 0);
  return (cls.hikeForce + cls.crewRighting.trapezeForce) * (cls.main.area / total);
}

/** Crew righting force for a weight position 0 (in) .. 0.5 (hiking) .. 1 (trapeze). */
export function crewForce(cls: BoatClass, out: number): number {
  const c = cls.crewRighting;
  if (!c) return 0;
  const o = clamp(out, 0, 1);
  return o <= 0.5 ? c.inForce + (c.hikeForce - c.inForce) * (o / 0.5) : c.hikeForce + (c.trapezeForce - c.hikeForce) * ((o - 0.5) / 0.5);
}

/** Inverse of crewForce: the weight position that gives `force` (clamped). */
export function crewOutFor(cls: BoatClass, force: number): number {
  const c = cls.crewRighting;
  if (!c) return 0;
  if (force <= c.inForce) return 0;
  if (force <= c.hikeForce) return 0.5 * (force - c.inForce) / (c.hikeForce - c.inForce);
  return Math.min(1, 0.5 + 0.5 * (force - c.hikeForce) / (c.trapezeForce - c.hikeForce));
}

function trimStateFor(sheet: number, optimal: number, awa: number): TrimState {
  const err = sheet - optimal;
  if (Math.abs(err) <= 0.08) return Math.abs(awa) > 150 * DEG ? "running" : "good";
  return err > 0 ? "luffing" : "stalled";
}

export class BoatSim {
  state: BoatState;
  telemetry: Telemetry;
  private started = false;
  constructor(public cls: BoatClass, state: BoatState) {
    this.state = state;
    this.telemetry = {
      speed: 0, sog: 0, leewayDeg: 0, tws: 0, twa: 0, aws: 0, awa: 0, boomAngle: 0, aoa: 0,
      trimState: "luffing", optimalSheet: 0.5, drive: 0, sideForce: 0, heelDeg: 0, overpowered: false, puff: 0,
    };
  }

  step(dt: number, controls: Controls, wind: WindField) {
    const s = this.state, cls = this.cls;

    // Actuators: the rudder, sheets, Crew weight and spinnaker can't move instantly.
    s.rudder += clamp(controls.rudder - s.rudder, -dt * 4.5, dt * 4.5);
    s.sheet += clamp(controls.sheet - s.sheet, -dt * 0.9, dt * 1.6);
    if (cls.jib && controls.jibSheet !== undefined) s.jibSheet += clamp(controls.jibSheet - s.jibSheet, -dt * 1.2, dt * 2);
    if (cls.spinnaker) {
      if (controls.spiSheet !== undefined) s.spiSheet += clamp(controls.spiSheet - s.spiSheet, -dt * 1.2, dt * 2);
      const want = controls.spi ? 1 : 0;
      const rate = want > s.spiHoist ? 1 / cls.spinnaker.hoistTime : 1 / cls.spinnaker.dropTime;
      s.spiHoist += clamp(want - s.spiHoist, -dt * rate, dt * rate);
    }
    if (cls.crewRighting && controls.crewOut !== undefined) s.crewOut += clamp(controls.crewOut - s.crewOut, -dt * 0.9, dt * 0.7);

    const fx = Math.sin(s.heading), fz = Math.cos(s.heading); // forward
    const sx = Math.cos(s.heading), sz = -Math.sin(s.heading); // starboard
    let u = s.vx * fx + s.vz * fz;
    let v = s.vx * sx + s.vz * sz;

    // True wind (velocity of the air) and apparent wind (air relative to the boat).
    const w = wind.sample(s.x, s.z);
    const twx = -Math.sin(w.fromDir) * w.speed, twz = -Math.cos(w.fromDir) * w.speed;
    const ax = twx - s.vx, az = twz - s.vz;
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
    if (leeward !== s.boomSide && (Math.abs(awa) < 170 * DEG || Math.abs(awa) < 2 * DEG)) s.boomSide = leeward;
    if (controls.switchSide) {
      s.jibSide = s.spiSide = leeward;
      s.crewSide = -leeward;
      controls.switchSide = false;
    }

    // Sail forces.
    const main = sailForce(cls.main, awa, aws, s.sheet, s.boomSide);
    let drive = main.drive, side = main.side;
    let jib: SailForce | null = null, spi: SailForce | null = null;
    if (cls.jib) {
      jib = sailForce(cls.jib, awa, aws, s.jibSheet, s.jibSide);
      drive += jib.drive; side += jib.side;
    }
    if (cls.spinnaker && s.spiHoist > 0.02) {
      spi = sailForce(cls.spinnaker, awa, aws, s.spiSheet, s.spiSide, s.spiHoist);
      const e = spiEffect(awa) * (s.spiSide === leeward ? 1 : 0.2);
      const q = 0.5 * AIR * aws * aws * cls.spinnaker.area * s.spiHoist;
      drive += spi.drive * e - (1 - e) * 0.25 * q;
      side += spi.side * (0.5 + 0.5 * e);
    }
    // Hull, rig and sailor windage always push downwind.
    const windage = 0.5 * AIR * aws * aws * cls.windage;
    drive += windage * -Math.cos(awa);
    side += windage * -Math.sin(awa);

    // Righting: Crew weight (if any) plus the Helm hiking as much as needed.
    const rawSide = side;
    const need = Math.abs(side);
    const crewOnWindward = s.crewSide === -leeward;
    const crewF = cls.crewRighting ? crewForce(cls, s.crewOut) * (crewOnWindward ? 1 : -1) : 0;
    const helmF = clamp(need - crewF, 0, cls.hikeForce);
    const balance = need - crewF - helmF; // > 0 overpowered, < 0 too much weight to windward
    let overpowered = false;
    if (balance > 0 && need > 0) {
      // The sailors can't hold the boat flat: it heels and spills power.
      const k = Math.max(need - balance, 1) / need;
      drive *= Math.sqrt(k); // drive drops less than side force (sails twist off)
      side *= k;
      overpowered = true;
    } else if (balance < 0) {
      // Heeled to windward: the boat sails badly and the Helm fights it.
      drive *= 1 - Math.min(0.4, -balance / 600);
    }

    // Hull resistance (forward) and rudder drag.
    const au = Math.abs(u);
    const wave = Math.max(0, au - cls.hullSpeed);
    const resist = Math.sign(u) * (cls.hullDrag * u * u + cls.waveDrag * wave * wave + 6 * au) + 8 * u * u * s.rudder * s.rudder * Math.sign(u);
    u += ((drive - resist) / cls.mass) * dt;
    // Side force pushes the boat sideways; the hull itself damps lateral motion a little.
    v += ((side - 30 * v * Math.abs(v) - 8 * v) / cls.mass) * dt;

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
    let rTarget = (u * Math.tan(delta)) / cls.turnLength + s.rudder * 0.1 * (u < -0.05 ? -1 : 1);
    // Stuck head-to-wind at low speed: the bow slowly falls off (otherwise the boat sits in irons forever).
    if (Math.abs(awa) < 30 * DEG && Math.abs(u) < 0.2) rTarget += (twa >= 0 ? -1 : 1) * 0.07;
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
    t.tws = w.speed; t.twa = twa; t.aws = aws; t.awa = awa; t.puff = w.puff;
    t.boomAngle = main.angle; t.aoa = main.aoa;
    t.drive = drive; t.sideForce = side; t.overpowered = overpowered;
    if (cls.crewRighting) {
      const heel = clamp(balance * cls.heelPerN * 1.4 + (need > 20 ? 4 : need * 0.2), -25, 40);
      t.heelDeg = heel * -Math.sign(awa || 1);
    } else {
      t.heelDeg = clamp(Math.abs(rawSide) * cls.heelPerN * 0.55, 0, 32) * -Math.sign(awa || 1);
    }
    t.optimalSheet = optimalSheet(cls, awa, aws);
    const irons = Math.abs(twa) < 36 * DEG && u < 1.2;
    t.trimState = irons ? "irons" : trimStateFor(s.sheet, t.optimalSheet, awa);

    if (cls.jib && jib) {
      const total = cls.main.area + cls.jib.area;
      const cap = (cls.hikeForce + (cls.crewRighting?.trapezeForce ?? 0)) * (cls.jib.area / total);
      const opt = optimalSheetFor(cls.jib, awa, aws, cap);
      const backed = s.jibSide !== leeward && Math.abs(awa) < 150 * DEG;
      t.jib = { angle: jib.angle, aoa: jib.aoa, optimal: opt, backed, trimState: irons ? "irons" : trimStateFor(s.jibSheet, opt, awa) };
    }
    if (cls.spinnaker) {
      const opt = optimalSheetFor(cls.spinnaker, awa, aws, 1e9, true);
      const collapsed = s.spiHoist > 0.5 && spiEffect(awa) < 0.5;
      t.spi = {
        hoist: s.spiHoist, angle: spi ? spi.angle : 0, optimal: opt, collapsed,
        wrongSide: s.spiSide !== leeward && Math.abs(awa) < 175 * DEG,
        trimState: trimStateFor(s.spiSheet, opt, awa),
      };
    }
    if (cls.crewRighting) {
      // Ideal: the Helm hikes at ~80%, the Crew provides the rest.
      t.crew = { ideal: crewOutFor(cls, need - cls.hikeForce * 0.8), onWindward: crewOnWindward, balance };
    }
  }
}
