import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { type Scene } from "@babylonjs/core/scene";
import { lerpAngle } from "../core/math";
import type { BoatState } from "../sailing/BoatPhysics";

/** The three views the camera key cycles through: chase (behind the boat), free (mouse orbit), top (north-up tactical). */
export type CameraMode = "chase" | "free" | "top";

/** The camera's angle above the water in the chase view (radians from straight down). */
const CHASE_BETA = 1.18;

/**
 * The orbit camera around the player's boat and its three views. It always follows the boat; the chase view
 * also swings round behind the bow, the top view turns north-up, the free view leaves the angle to the mouse.
 * `twoPerson` (the boat class chosen in the menu is sailed by a Pair) sets the distances and the aim height.
 */
export class CameraRig {
  readonly camera: ArcRotateCamera;
  private _mode: CameraMode = "chase";

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    const camera = this.camera = new ArcRotateCamera("cam", -Math.PI / 2, CHASE_BETA, 12, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 120;
    camera.lowerBetaLimit = 0.08;
    camera.upperBetaLimit = 1.45;
    camera.wheelPrecision = 30;
    camera.panningSensibility = 0;
    camera.minZ = 0.1;
    camera.maxZ = 3000;
    camera.attachControl(canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  }

  get mode(): CameraMode { return this._mode; }

  /** A new race: the camera jumps behind the boat at the chase distance (the view itself is kept). */
  placeBehind(s: BoatState, twoPerson: boolean) {
    const { camera } = this;
    camera.target.set(s.x, 0.8, s.z);
    camera.alpha = behind(s);
    camera.beta = CHASE_BETA;
    camera.radius = chaseRadius(twoPerson);
  }

  /** Switches to the next view (chase → free → top → chase) and returns it. */
  nextMode(twoPerson: boolean): CameraMode {
    const { camera } = this;
    this._mode = this._mode === "chase" ? "free" : this._mode === "free" ? "top" : "chase";
    if (this._mode === "chase") { camera.beta = CHASE_BETA; camera.radius = chaseRadius(twoPerson); }
    if (this._mode === "top") { camera.beta = 0.12; camera.radius = twoPerson ? 70 : 48; }
    return this._mode;
  }

  /** Follows the boat for one frame: eases toward it, or jumps if it is far (e.g. after a reset). */
  follow(dt: number, s: BoatState, twoPerson: boolean) {
    const { camera } = this;
    const far = Math.hypot(s.x - camera.target.x, s.z - camera.target.z) > 25;
    const k = far ? 1 : Math.min(1, dt * 3);
    camera.target.x += (s.x - camera.target.x) * k;
    camera.target.z += (s.z - camera.target.z) * k;
    camera.target.y = twoPerson ? 1.6 : 0.9;
    if (this._mode === "chase") {
      camera.alpha = far ? behind(s) : lerpAngle(camera.alpha, behind(s), Math.min(1, dt * 1.6));
    } else if (this._mode === "top") {
      // North-up tactical view (wind from the top of the screen).
      camera.alpha = lerpAngle(camera.alpha, -Math.PI / 2, Math.min(1, dt * 2));
    }
  }
}

const chaseRadius = (twoPerson: boolean) => twoPerson ? 17 : 12;

/** The camera angle that looks along the boat's heading from behind. */
const behind = (s: BoatState) => Math.atan2(-Math.cos(s.heading), -Math.sin(s.heading));
