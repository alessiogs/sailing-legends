import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  type Scene,
} from "@babylonjs/core";
import { SceneCache } from "./sceneCache";

/** Spray drops per boat, how long one lives (s), and how many are thrown a second at full planing. */
const DROPS = 12,
  LIFE = 0.55,
  RATE = 22;

const materials = new SceneCache<Scene, StandardMaterial>();

/**
 * A small bow spray: a few white drops thrown up and out of the bow of a planing boat. Built the first time it is
 * needed and used only for a boat the camera is near (the sailor LOD distance), so far boats cost nothing: a boat that
 * has never been near and planing owns no drop at all, and a boat that is far stops updating its drops.
 */
export class BowSpray {
  private drops: Mesh[] | null = null;
  private age: number[] = [];
  private vx: number[] = [];
  private vy: number[] = [];
  private vz: number[] = [];
  private spawn = 0;
  private alive = 0;

  constructor(private readonly scene: Scene) {}

  /**
   * One frame. `active` is true for a planing boat near the camera; the bow is at (x, y, z) in the world, `heading` is the
   * boat's and `speed` its speed (m/s). Without `active` the live drops finish their short life and nothing new is made.
   */
  update(
    dt: number,
    active: boolean,
    x: number,
    y: number,
    z: number,
    heading: number,
    speed: number,
    level: number,
  ) {
    if (!active && this.alive === 0) return;
    if (!this.drops) {
      if (!active) return;
      const mat = materials.get(this.scene, "bowSpray", () => {
        const m = new StandardMaterial("bowSpray", this.scene);
        m.emissiveColor = new Color3(1, 1, 1);
        m.disableLighting = true;
        m.alpha = 0.7;
        return m;
      });
      this.drops = Array.from({ length: DROPS }, (_, i) => {
        const d = MeshBuilder.CreateDisc(
          `bowSpray${i}`,
          { radius: 0.06, tessellation: 6 },
          this.scene,
        );
        d.material = mat;
        d.billboardMode = Mesh.BILLBOARDMODE_ALL;
        d.isPickable = false;
        d.setEnabled(false);
        return d;
      });
      this.age = this.drops.map(() => LIFE);
      this.vx = this.drops.map(() => 0);
      this.vy = this.vx.slice();
      this.vz = this.vx.slice();
    }
    const fx = Math.sin(heading),
      fz = Math.cos(heading);
    // Throw new drops in proportion to the planing level.
    if (active) this.spawn += dt * RATE * level;
    this.alive = 0;
    this.drops.forEach((d, i) => {
      if (this.age[i] >= LIFE && this.spawn >= 1 && active) {
        this.spawn -= 1;
        const side =
          (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.8);
        this.age[i] = 0;
        // Out to the side, up, and carried back relative to the boat (the world moves with the boat's speed).
        this.vx[i] = fz * side + fx * speed * 0.6;
        this.vz[i] = -fx * side + fz * speed * 0.6;
        this.vy[i] = 1.2 + Math.random() * 0.8;
        d.position.set(x, y + 0.05, z);
        d.setEnabled(true);
      }
      if (this.age[i] >= LIFE) {
        d.setEnabled(false);
        return;
      }
      this.age[i] += dt;
      this.vy[i] -= 9.8 * dt;
      d.position.x += this.vx[i] * dt;
      d.position.y += this.vy[i] * dt;
      d.position.z += this.vz[i] * dt;
      if (this.age[i] >= LIFE || d.position.y < y - 0.1) {
        this.age[i] = LIFE;
        d.setEnabled(false);
        return;
      }
      this.alive++;
    });
    if (this.spawn > 2) this.spawn = 2;
  }

  dispose() {
    this.drops?.forEach((d) => d.dispose());
    this.drops = null;
    this.alive = 0;
  }
}
