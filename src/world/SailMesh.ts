import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { type Material } from "@babylonjs/core/Materials/material";
import { type Scene } from "@babylonjs/core/scene";
import { type TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CHORD_CUT, sailGridIndices, sailGridUvs, shapeSail, type Point3, type SailCorners, type SailCut } from "./sailShape";

/**
 * A sail as a grid between four corners (luff bottom/top, leech bottom/top; for a triangle the two
 * top corners coincide), drawn by both boat classes. Re-shaped every frame: camber to leeward, twist toward
 * the head, and a ripple running aft from the luff when the sail flaps. The grid maths lives in sailShape.ts.
 */
export class SailMesh {
  mesh: Mesh;
  private pos: Float32Array;
  private nrm: Float32Array;
  private idx: number[];
  private corners: SailCorners;

  constructor(
    scene: Scene, name: string, material: Material, parent: TransformNode,
    tack: Point3, clew: Point3, headLuff: Point3, headLeech: Point3,
    private nu = 10, private nv = 9, private cut: SailCut = CHORD_CUT,
  ) {
    this.mesh = new Mesh(name, scene);
    this.pos = new Float32Array((nu + 1) * (nv + 1) * 3);
    this.nrm = new Float32Array(this.pos.length);
    this.idx = sailGridIndices(nu, nv);
    this.corners = { tack, clew, headLuff, headLeech };
    this.shape(0.5, 0, 1, 0, 1);
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.indices = this.idx;
    vd.normals = this.nrm;
    vd.uvs = sailGridUvs(nu, nv);
    vd.applyToMesh(this.mesh, true);
    this.mesh.material = material;
    this.mesh.parent = parent;
    this.mesh.isPickable = false;
  }

  /**
   * camber 0..1, luff 0..1 (flapping), side +1/-1 (bulge direction, local X), t = time,
   * hoist 0..1 (a spinnaker being hoisted is shorter), depth = max camber in the cut's units
   * (metres per metre of chord for the 420's sails).
   */
  shape(camber: number, luff: number, side: number, t: number, hoist = 1, depth = this.cut.depth) {
    shapeSail(this.pos, this.corners, this.nu, this.nv, this.cut, { camber, luff, side, t, hoist, depth });
    VertexData.ComputeNormals(this.pos, this.idx, this.nrm);
  }

  commit() {
    this.mesh.updateVerticesData("position", this.pos);
    this.mesh.updateVerticesData("normal", this.nrm);
  }
}
