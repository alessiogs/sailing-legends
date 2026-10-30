import { Mesh, MeshBuilder, TransformNode, type Material, type Scene, type Vector3 } from "@babylonjs/core";
import { clamp, DEG, lerpAngle } from "../core/math";
import type { BoatState, Telemetry, TrimState } from "../sailing/BoatPhysics";
import { surfaceAt, type Wave } from "./Waves";

/** How a boat class moves on the water: the numbers that differ between the Optimist and the 420. */
export type BoatMotion = {
  /** Share of the wave height the boat rides up and down. */
  waveHeight: number;
  /** Share of the wave slope ahead the bow pitches with. */
  pitch: number;
  /** Share of the wave slope abeam the boat rolls with. */
  roll: number;
  /** How fast the drawn heel follows the physics heel (per second). */
  heelRate: number;
  /** Share of the physics heel that is drawn. */
  heel: number;
  /** Fastest boom swing (rad/s), e.g. across in a gybe. */
  boomRate: number;
  /** Rudder angle drawn at full helm (degrees). */
  rudderDeg: number;
};

/** Distance (m) from the camera within which sailors are drawn in full; a boat that was near stays so a little further out. */
const NEAR = 30, NEAR_LEAVE = 36;

/** How full and how flapping a sail is drawn: camber 0..1, luff 0..1. */
export function sailLook(sail: { trimState: TrimState; aoa: number }): { camber: number; luff: number } {
  const luff = sail.trimState === "luffing" || sail.trimState === "irons" ? clamp(1 - sail.aoa / (6 * DEG), 0.25, 1) : 0;
  const camber = clamp(sail.aoa / (14 * DEG), 0.15, 1) * (1 - luff * 0.7);
  return { camber, luff };
}

/**
 * What every boat visual shares: the root that follows the boat, the body that heels and pitches on the waves,
 * the main boom swinging to leeward, the rudder and the masthead burgee. A class's visual builds its hull, rig,
 * sails and sailors, then draws its own sails and sailors each frame.
 */
export abstract class BoatViewBase {
  readonly root: TransformNode;
  /** Takes heel and pitch. */
  protected readonly body: TransformNode;
  /** Turns with the main boom. */
  protected abstract readonly rig: TransformNode;
  protected abstract readonly rudder: TransformNode;
  protected abstract readonly burgee: TransformNode;
  /** Signed main boom angle actually drawn (rad), + = starboard. */
  protected boomVisual = 0;
  /** Sail flutter clock (s), offset per boat so boats don't flap in step. */
  protected flutter = Math.random() * 10;
  /** Whether the camera is close enough for the sailors to be drawn in full (see `NEAR`). */
  protected sailorsNear = true;
  private heelVisual = 0;

  constructor(scene: Scene, name: string, private readonly motion: BoatMotion) {
    this.root = new TransformNode(name, scene);
    this.body = new TransformNode(`${name}-body`, scene);
    this.body.parent = this.root;
  }

  /** The masthead burgee at (0, y, z) on the body: a flag `width` long, hoisted by its luff, showing the apparent wind. */
  protected addBurgee(scene: Scene, name: string, y: number, z: number, width: number, material: Material): TransformNode {
    const burgee = new TransformNode(`${name}-burgeePivot`, scene);
    burgee.position.set(0, y, z);
    burgee.parent = this.body;
    const flag = MeshBuilder.CreatePlane(`${name}-burgee`, { width, height: 0.1, sideOrientation: Mesh.DOUBLESIDE }, scene);
    flag.rotation.y = Math.PI / 2;
    flag.position.z = -width / 2;
    flag.material = material;
    flag.parent = burgee;
    return burgee;
  }

  /** One frame. `camera` is where the camera is (sailors far from it are drawn simply); without it they are drawn in full. */
  update(dt: number, time: number, s: BoatState, tel: Telemetry, waves: Wave[], camera?: Vector3) {
    const m = this.motion;
    this.flutter += dt;
    // Ride the waves: height, pitch and roll from the local surface slope.
    const surf = surfaceAt(waves, s.x, s.z, time);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const slopeFwd = surf.dx * fx + surf.dz * fz;
    const slopeSide = surf.dx * fz - surf.dz * fx;
    this.root.position.set(s.x, surf.h * m.waveHeight + 0.02, s.z);
    this.root.rotation.y = s.heading;

    // Heel (+ = to starboard) eases toward the physics value.
    this.heelVisual += (tel.heelDeg - this.heelVisual) * Math.min(1, dt * m.heelRate);
    this.body.rotation.x = -Math.atan(slopeFwd) * m.pitch;
    this.body.rotation.z = -(this.heelVisual * DEG) * m.heel + Math.atan(slopeSide) * m.roll;

    // Boom swings to the leeward side; a gybe swings it across quickly.
    const target = s.boomSide * tel.boomAngle;
    const maxRate = m.boomRate * dt;
    this.boomVisual += clamp(target - this.boomVisual, -maxRate, maxRate);
    this.rig.rotation.y = -this.boomVisual;

    this.drawSails(dt, s, tel);
    this.rudder.rotation.y = -s.rudder * m.rudderDeg * DEG;
    if (camera) {
      const d = Math.hypot(camera.x - s.x, camera.z - s.z) + Math.abs(camera.y - this.root.position.y) * 0.5;
      this.sailorsNear = d < (this.sailorsNear ? NEAR_LEAVE : NEAR);
    }
    this.placeSailors(dt, s, tel);

    // Burgee points where the apparent wind goes.
    this.burgee.rotation.y = lerpAngle(this.burgee.rotation.y, tel.awa, Math.min(1, dt * 8));
  }

  /** Shape the sails for this frame (the boom has already swung). */
  protected abstract drawSails(dt: number, s: BoatState, tel: Telemetry): void;
  /** Pose the sailors for this frame (`dt` is 0 when the race is paused). */
  protected abstract placeSailors(dt: number, s: BoatState, tel: Telemetry): void;

  /** Rock the hull while a sailor crosses it (`roll` rad, + to starboard): the drawn heel only, never the physics. */
  protected rollHull(roll: number) {
    this.body.rotation.z -= roll;
  }

  dispose() {
    this.root.dispose(false, false);
  }
}
