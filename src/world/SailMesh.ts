import { Mesh, Vector3, VertexData, type Material, type Scene, type TransformNode } from "@babylonjs/core";

/**
 * A sail as a grid between four corners (luff bottom/top, leech bottom/top; for a triangle the two
 * top corners coincide). Re-shaped every frame: camber to leeward, twist toward the head, and a
 * ripple running aft from the luff when the sail flaps.
 */
export class SailMesh {
  mesh: Mesh;
  private pos: Float32Array;
  private nrm: Float32Array;
  private idx: number[] = [];

  constructor(
    scene: Scene, name: string, material: Material, parent: TransformNode,
    private tack: Vector3, private clew: Vector3, private headLuff: Vector3, private headLeech: Vector3,
    private nu = 10, private nv = 9,
  ) {
    this.mesh = new Mesh(name, scene);
    this.pos = new Float32Array((nu + 1) * (nv + 1) * 3);
    this.nrm = new Float32Array(this.pos.length);
    for (let v = 0; v < nv; v++) {
      for (let u = 0; u < nu; u++) {
        const a = v * (nu + 1) + u, b = a + 1, c = a + nu + 1, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    this.shape(0.5, 0, 1, 0, 1);
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.indices = this.idx;
    vd.normals = this.nrm;
    vd.applyToMesh(this.mesh, true);
    this.mesh.material = material;
    this.mesh.parent = parent;
    this.mesh.isPickable = false;
  }

  /**
   * camber 0..1, luff 0..1 (flapping), side +1/-1 (bulge direction, local X), t = time,
   * hoist 0..1 (a spinnaker being hoisted is shorter), depth = max camber in metres per metre of chord.
   */
  shape(camber: number, luff: number, side: number, t: number, hoist = 1, depth = 0.11) {
    const nu = this.nu, nv = this.nv;
    let i = 0;
    for (let v = 0; v <= nv; v++) {
      const fv = (v / nv) * hoist + (1 - hoist);
      for (let u = 0; u <= nu; u++) {
        const fu = u / nu;
        const bx = this.tack.x + (this.clew.x - this.tack.x) * fu;
        const by = this.tack.y + (this.clew.y - this.tack.y) * fu;
        const bz = this.tack.z + (this.clew.z - this.tack.z) * fu;
        const tx = this.headLuff.x + (this.headLeech.x - this.headLuff.x) * fu;
        const ty = this.headLuff.y + (this.headLeech.y - this.headLuff.y) * fu;
        const tz = this.headLuff.z + (this.headLeech.z - this.headLuff.z) * fu;
        const px = bx + (tx - bx) * fv, py = by + (ty - by) * fv, pz = bz + (tz - bz) * fv;
        // Chord length at this height, for scaling the camber.
        const chord = Math.hypot(this.clew.x - this.tack.x, this.clew.z - this.tack.z) * (1 - fv) +
          Math.hypot(this.headLeech.x - this.headLuff.x, this.headLeech.z - this.headLuff.z) * fv;
        const belly = 4 * fu * (1 - fu);
        const edge = Math.min(1, fv * 6) * Math.min(1, (1 - fv) * 6) * 0.6 + 0.4;
        let x = side * (depth * chord * camber * belly * edge + 0.12 * fu * fv * camber * chord);
        x += luff * Math.sin(t * 22 - fu * 9 + fv * 4) * 0.035 * Math.max(chord, 0.6) * (0.35 + belly) * edge;
        this.pos[i++] = px + x;
        this.pos[i++] = py;
        this.pos[i++] = pz;
      }
    }
    VertexData.ComputeNormals(this.pos, this.idx, this.nrm);
  }

  commit() {
    this.mesh.updateVerticesData("position", this.pos);
    this.mesh.updateVerticesData("normal", this.nrm);
  }
}
