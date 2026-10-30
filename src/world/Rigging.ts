import { Color3, Mesh, MeshBuilder, Vector3, type InstancedMesh, type LinesMesh, type Material, type Scene, type TransformNode } from "@babylonjs/core";
import type { V3 } from "./pose/reach";
import { SceneCache } from "./sceneCache";

/**
 * The cheap rigging details of both boats: the sheets and the trapeze handle's pendants as one line mesh per boat, and
 * instances of two shared shapes (a toe strap and a block). Visuals only.
 */

/** A point from the frame of a node turned `yaw` about the vertical (Babylon's `rotation.y`) at `origin`, into its parent's frame. */
export function fromTurned(p: V3, yaw: number, origin: V3, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = origin.x + p.x * c + p.z * s;
  out.y = origin.y + p.y;
  out.z = origin.z - p.x * s + p.z * c;
  return out;
}

/**
 * A few polylines on one mesh, redrawn every frame. A line that is not wanted is `hide`d (all its points on one spot),
 * so the mesh keeps its shape and is updated in place.
 */
export class LineSet {
  readonly mesh: LinesMesh;
  private readonly lines: Vector3[][];

  constructor(scene: Scene, name: string, parent: TransformNode, sizes: number[], color: Color3) {
    this.lines = sizes.map(n => Array.from({ length: n }, () => new Vector3(0.001 * Math.random(), 0, 0)));
    this.mesh = MeshBuilder.CreateLineSystem(name, { lines: this.lines, updatable: true }, scene);
    this.mesh.color = color;
    this.mesh.parent = parent;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true; // its bounds are those of the first frame
  }

  /** Line `i` runs through `points` (as many as it was made with). */
  set(i: number, ...points: V3[]) {
    const line = this.lines[i];
    for (let k = 0; k < line.length; k++) {
      const p = points[Math.min(k, points.length - 1)];
      line[k].set(p.x, p.y, p.z);
    }
  }

  /** Line `i` is not drawn. */
  hide(i: number) {
    const line = this.lines[i];
    for (const v of line) v.copyFrom(line[0]);
  }

  /** Send the lines to the GPU. */
  commit() {
    MeshBuilder.CreateLineSystem("", { lines: this.lines, instance: this.mesh });
  }
}

const sources = new SceneCache<Scene, Mesh>();

/** Instance of a hidden shared mesh `key` (made by `make` once per scene and material). */
function shared(scene: Scene, key: string, material: Material, name: string, make: () => Mesh, parent: TransformNode): InstancedMesh {
  const src = sources.get(scene, `${key} ${material.uniqueId}`, () => {
    const m = make();
    m.material = material;
    m.isVisible = false;
    m.isPickable = false;
    return m;
  });
  const inst = src.createInstance(name);
  inst.parent = parent;
  inst.isPickable = false;
  return inst;
}

/**
 * A toe strap: a low arch along the boat of length `length` starting at the origin and running forward, to place at
 * the floor with `position`.
 */
export function toeStrap(scene: Scene, name: string, material: Material, parent: TransformNode, length: number, x: number, y: number, z: number): InstancedMesh {
  const inst = shared(scene, `strap${length}`, material, name, () => {
    const path: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      path.push(new Vector3(0, Math.min(1, Math.sin(Math.PI * s) * 2.5) * 0.085, s * length));
    }
    return MeshBuilder.CreateTube(`strap-${length}`, { path, radius: 0.012, tessellation: 4 }, scene);
  }, parent);
  inst.position.set(x, y, z);
  return inst;
}

/** A block: a small box (sheet block, fairlead), at a place on `parent`. */
export function block(scene: Scene, name: string, material: Material, parent: TransformNode, x: number, y: number, z: number): InstancedMesh {
  const inst = shared(scene, "block", material, name, () => MeshBuilder.CreateBox("block", { width: 0.06, height: 0.05, depth: 0.08 }, scene), parent);
  inst.position.set(x, y, z);
  return inst;
}
