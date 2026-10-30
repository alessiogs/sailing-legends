import { Mesh, VertexData, type Material, type Scene, type TransformNode } from "@babylonjs/core";
import { CHORD_CUT, decalSailUvs, reversedIndices, sailGridIndices, sailGridUvs, shapeSail, type Point3, type SailCorners, type SailCut } from "./sailShape";

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
  /** The other face of a sail with a decal (see `decal`): same positions, wound and lit the other way. */
  private back: Mesh | null = null;
  private nrmBack: Float32Array | null = null;

  constructor(
    scene: Scene, name: string, material: Material, parent: TransformNode,
    tack: Point3, clew: Point3, headLuff: Point3, headLeech: Point3,
    private nu = 10, private nv = 9, private cut: SailCut = CHORD_CUT,
    /**
     * A decal (the sail number) shown on both faces and readable from each: the material (one culled face, with
     * the decal texture) and the share `vSpan` of the luff, from the foot, the texture covers.
     */
    decal?: { material: Material; vSpan: number },
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
    // With a decal, each face is its own mesh, culled from behind, so each reads its own way round.
    vd.uvs = decal ? decalSailUvs(nu, nv, decal.vSpan, true) : sailGridUvs(nu, nv);
    vd.applyToMesh(this.mesh, true);
    this.mesh.material = decal ? decal.material : material;
    this.mesh.parent = parent;
    this.mesh.isPickable = false;
    if (decal) {
      this.nrmBack = new Float32Array(this.nrm.length);
      this.back = new Mesh(`${name}-back`, scene);
      const bd = new VertexData();
      bd.positions = this.pos;
      bd.indices = reversedIndices(this.idx);
      bd.normals = this.nrmBack;
      bd.uvs = decalSailUvs(nu, nv, decal.vSpan, false);
      bd.applyToMesh(this.back, true);
      this.back.material = decal.material;
      this.back.parent = parent;
      this.back.isPickable = false;
      this.setNormals();
    }
  }

  private setNormals() {
    if (!this.nrmBack) return;
    for (let i = 0; i < this.nrm.length; i++) this.nrmBack[i] = -this.nrm[i];
  }

  /**
   * camber 0..1, luff 0..1 (flapping), side +1/-1 (bulge direction, local X), t = time,
   * hoist 0..1 (a spinnaker being hoisted is shorter), depth = max camber in the cut's units
   * (metres per metre of chord for the 420's sails).
   */
  shape(camber: number, luff: number, side: number, t: number, hoist = 1, depth = this.cut.depth) {
    shapeSail(this.pos, this.corners, this.nu, this.nv, this.cut, { camber, luff, side, t, hoist, depth });
    VertexData.ComputeNormals(this.pos, this.idx, this.nrm);
    this.setNormals();
  }

  commit() {
    this.mesh.updateVerticesData("position", this.pos);
    this.mesh.updateVerticesData("normal", this.nrm);
    if (this.back && this.nrmBack) {
      this.back.updateVerticesData("position", this.pos);
      this.back.updateVerticesData("normal", this.nrmBack);
    }
  }

  /** Where the sail's clew is now, in the parent's frame (the flutter and camber move it). */
  clewPoint(out: { x: number; y: number; z: number }) {
    const i = this.nu * 3; // the first row's last vertex: the foot's clew end
    out.x = this.pos[i]; out.y = this.pos[i + 1]; out.z = this.pos[i + 2];
  }
}
