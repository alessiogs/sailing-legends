import { ArcRotateCamera, Vector3, type Scene } from "@babylonjs/core";
import { lerpAngle } from "../core/math";
import type { BoatState } from "../sailing/BoatPhysics";
import { CHASE_BETA, chasePullBack, chaseView } from "./chaseView";

/** The three views the camera key cycles through: chase (behind the boat), free (mouse orbit), top (north-up tactical). */
export type CameraMode = "chase" | "free" | "top";

/**
 * The orbit camera around the player's boat and its three views. It always follows the boat; the chase view
 * also swings round behind the bow, the top view turns north-up, the free view leaves the angle to the mouse.
 * `twoPerson` (the boat class chosen in the menu is sailed by a Pair) sets the distances and the aim height.
 */
export class CameraRig {
  readonly camera: ArcRotateCamera;
  private _mode: CameraMode = "chase";
  /** The screen's aspect ratio (width / height) the distances were last set for. */
  private aspect = 1;

  constructor(private readonly scene: Scene, canvas: HTMLCanvasElement) {
    const camera = this.camera = new ArcRotateCamera("cam", -Math.PI / 2, chaseView(false, 1).beta, 12, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 120;
    camera.lowerBetaLimit = 0.08;
    camera.upperBetaLimit = CHASE_BETA;
    camera.wheelPrecision = 30;
    camera.panningSensibility = 0;
    camera.minZ = 0.1;
    camera.maxZ = 3000;
    camera.attachControl(canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  }

  get mode(): CameraMode { return this._mode; }

  /** The screen's shape now: width / height of the rendered canvas. */
  private screenAspect(): number {
    const engine = this.scene.getEngine();
    return engine.getRenderHeight() > 0 ? engine.getRenderWidth() / engine.getRenderHeight() : 1;
  }

  private chase(twoPerson: boolean) {
    this.aspect = this.screenAspect();
    const { radius, beta } = chaseView(twoPerson, this.aspect);
    this.camera.beta = beta;
    this.camera.radius = radius;
  }

  /** A new race: the camera jumps behind the boat at the chase distance (the view itself is kept). */
  placeBehind(s: BoatState, twoPerson: boolean) {
    const { camera } = this;
    camera.target.set(s.x, 0.8, s.z);
    camera.alpha = behind(s);
    this.chase(twoPerson);
  }

  /** Switches to the next view (chase → free → top → chase) and returns it. */
  nextMode(twoPerson: boolean): CameraMode {
    const { camera } = this;
    this._mode = this._mode === "chase" ? "free" : this._mode === "free" ? "top" : "chase";
    if (this._mode === "chase") this.chase(twoPerson);
    if (this._mode === "top") { camera.beta = 0.12; camera.radius = (twoPerson ? 70 : 48) * chasePullBack(this.screenAspect()); }
    return this._mode;
  }

  /** Follows the boat for one frame: eases toward it, or jumps if it is far (e.g. after a reset). */
  follow(dt: number, s: BoatState, twoPerson: boolean) {
    const { camera } = this;
    // The screen turned (a phone rotated, a window resized): the distance follows its shape, a zoom kept.
    const aspect = this.screenAspect();
    if (Math.abs(aspect - this.aspect) > 0.05) {
      camera.radius *= chasePullBack(aspect) / chasePullBack(this.aspect);
      if (this._mode === "chase") camera.beta = chaseView(twoPerson, aspect).beta;
      this.aspect = aspect;
    }
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

/** The camera angle that looks along the boat's heading from behind. */
const behind = (s: BoatState) => Math.atan2(-Math.cos(s.heading), -Math.sin(s.heading));
