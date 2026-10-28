import {
  Color3, Mesh, MeshBuilder, TransformNode, Vector3, VertexData, type Scene,
} from "@babylonjs/core";
import { clamp } from "../core/math";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { boatMaterial, type BoatLook } from "./boatMaterials";
import { BoatViewBase, sailLook, type BoatMotion } from "./BoatViewBase";
import { placeSailor, sailorFigure, type FigureSize } from "./SailorFigure";

// Sail corners in the rig frame (mast at origin, boom along -Z, sail plane = YZ).
const TACK = new Vector3(0, 0.5, 0);
const THROAT = new Vector3(0, 2.32, 0);
const PEAK = new Vector3(0, 2.78, -1.72);
const CLEW = new Vector3(0, 0.5, -1.98);
const NU = 10, NV = 9;

const MOTION: BoatMotion = { waveHeight: 0.85, pitch: 0.8, roll: 0.6, heelRate: 3, heel: 0.5, boomRate: 2.6, rudderDeg: 30 };
const SAILOR: FigureSize = {
  legs: { radius: 0.08, height: 0.6, y: 0 },
  torso: { radius: 0.15, height: 0.62, y: 0.3 },
  head: { diameter: 0.21, y: 0.72 },
  seated: true,
};

/** Visual of an Optimist: pram hull, sprit rig with a cambered sail that luffs, sailor, foils. */
export class BoatView extends BoatViewBase {
  protected readonly rig: TransformNode;
  protected readonly rudder: TransformNode;
  protected readonly burgee: TransformNode;
  private sail: Mesh;
  private sailPos: Float32Array;
  private sailIdx: number[];
  private sailNormals: Float32Array;
  private sailor: TransformNode;

  constructor(scene: Scene, name: string, look: BoatLook) {
    super(scene, name, MOTION);

    const hullMat = boatMaterial(scene, "hull", look.hull, 0.35, true);
    const woodMat = boatMaterial(scene, "wood", new Color3(0.62, 0.45, 0.26), 0.1);
    const darkMat = boatMaterial(scene, "spar", new Color3(0.12, 0.13, 0.15), 0.4);
    const sailMat = boatMaterial(scene, "sail", look.sail, 0.05, true);
    const jacketMat = boatMaterial(scene, "jacket", look.jacket, 0.1);
    const skinMat = boatMaterial(scene, "skin", new Color3(0.86, 0.66, 0.52), 0.05);
    const stripeMat = boatMaterial(scene, "stripe", look.stripe, 0.2);
    const shortsMat = boatMaterial(scene, "shorts", new Color3(0.1, 0.12, 0.2));

    // --- Hull: lofted pram sections, open on top so the cockpit is visible.
    const stations = 11;
    const paths: Vector3[][] = [];
    const sections: { z: number; wg: number; yg: number; wc: number; yc: number; yk: number }[] = [];
    for (let i = 0; i < stations; i++) {
      const t = i / (stations - 1); // 0 = stern, 1 = bow
      const z = -1.155 + t * 2.31;
      const wg = 0.565 * (1 - 0.36 * Math.pow(t, 2.5)) - 0.065 * Math.pow(1 - t, 4);
      const yk = -0.13 + 0.24 * Math.pow(t, 2.4) + 0.07 * Math.pow(1 - t, 3);
      const yg = 0.27 + 0.05 * t;
      const wc = wg * 0.8, yc = yk + 0.07;
      sections.push({ z, wg, yg, wc, yc, yk });
      paths.push([
        new Vector3(-wg, yg, z), new Vector3(-wc, yc, z), new Vector3(0, yk, z),
        new Vector3(wc, yc, z), new Vector3(wg, yg, z),
      ]);
    }
    const hull = MeshBuilder.CreateRibbon(`${name}-hull`, { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE }, scene);
    hull.material = hullMat;
    hull.parent = this.body;
    // Transom caps (stern and bow are both flat on a pram).
    for (const idx of [0, stations - 1]) {
      const p = paths[idx];
      const c = new Vector3(0, (p[0].y + p[2].y) / 2, p[0].z);
      const cap = MeshBuilder.CreateRibbon(`${name}-cap${idx}`, {
        pathArray: [p, p.map(() => c)], sideOrientation: Mesh.DOUBLESIDE,
      }, scene);
      cap.material = hullMat;
      cap.parent = this.body;
    }
    // Gunwale rails and coloured sheer stripe.
    for (const side of [-1, 1]) {
      const rail = MeshBuilder.CreateTube(`${name}-rail${side}`, {
        path: sections.map(s => new Vector3(side * s.wg, s.yg + 0.01, s.z)), radius: 0.022, tessellation: 6,
      }, scene);
      rail.material = woodMat;
      rail.parent = this.body;
      const stripe = MeshBuilder.CreateTube(`${name}-stripe${side}`, {
        path: sections.map(s => new Vector3(side * (s.wg - 0.004), s.yg - 0.05, s.z)), radius: 0.018, tessellation: 5,
      }, scene);
      stripe.material = stripeMat;
      stripe.parent = this.body;
    }
    // Floor boards, thwart and mast step.
    const floor = MeshBuilder.CreateBox(`${name}-floor`, { width: 0.6, height: 0.02, depth: 1.7 }, scene);
    floor.position.set(0, -0.04, -0.05);
    floor.material = woodMat;
    floor.parent = this.body;
    const thwart = MeshBuilder.CreateBox(`${name}-thwart`, { width: 1.0, height: 0.03, depth: 0.2 }, scene);
    thwart.position.set(0, 0.2, 0.42);
    thwart.material = woodMat;
    thwart.parent = this.body;

    // Daggerboard and rudder.
    const board = MeshBuilder.CreateBox(`${name}-board`, { width: 0.02, height: 0.95, depth: 0.32 }, scene);
    board.position.set(0, -0.32, 0.2);
    board.material = woodMat;
    board.parent = this.body;
    this.rudder = new TransformNode(`${name}-rudderPivot`, scene);
    this.rudder.position.set(0, 0.1, -1.18);
    this.rudder.parent = this.body;
    const blade = MeshBuilder.CreateBox(`${name}-rudder`, { width: 0.02, height: 0.75, depth: 0.22 }, scene);
    blade.position.set(0, -0.3, -0.1);
    blade.material = woodMat;
    blade.parent = this.rudder;
    const tiller = MeshBuilder.CreateBox(`${name}-tiller`, { width: 0.03, height: 0.03, depth: 0.85 }, scene);
    tiller.position.set(0, 0.2, 0.4);
    tiller.material = woodMat;
    tiller.parent = this.rudder;

    // --- Rig: mast fixed, boom/sprit/sail on a pivot that turns with the sheet.
    const mastStep = new Vector3(0, 0, 0.78);
    const mast = MeshBuilder.CreateCylinder(`${name}-mast`, { height: 2.45, diameterTop: 0.035, diameterBottom: 0.05, tessellation: 8 }, scene);
    mast.position.set(mastStep.x, 1.2, mastStep.z);
    mast.material = darkMat;
    mast.parent = this.body;
    this.rig = new TransformNode(`${name}-rig`, scene);
    this.rig.position.copyFrom(mastStep);
    this.rig.parent = this.body;
    const boom = MeshBuilder.CreateCylinder(`${name}-boom`, { height: 2.0, diameter: 0.035, tessellation: 6 }, scene);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.47, -1.0);
    boom.material = darkMat;
    boom.parent = this.rig;
    const spritFrom = new Vector3(0, 0.75, 0), spritTo = PEAK.add(new Vector3(0, -0.02, 0.02));
    const sprit = MeshBuilder.CreateTube(`${name}-sprit`, { path: [spritFrom, spritTo], radius: 0.014, tessellation: 5 }, scene);
    sprit.material = darkMat;
    sprit.parent = this.rig;

    // Sail: a grid we re-shape every frame (camber, twist, luffing flutter).
    this.sail = new Mesh(`${name}-sail`, scene);
    this.sailPos = new Float32Array((NU + 1) * (NV + 1) * 3);
    this.sailNormals = new Float32Array(this.sailPos.length);
    this.sailIdx = [];
    for (let v = 0; v < NV; v++) {
      for (let u = 0; u < NU; u++) {
        const a = v * (NU + 1) + u, b = a + 1, c = a + NU + 1, d = c + 1;
        this.sailIdx.push(a, c, b, b, c, d);
      }
    }
    const uvs: number[] = [];
    for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) uvs.push(u / NU, v / NV);
    this.shapeSail(0.5, 0, 1);
    const vd = new VertexData();
    vd.positions = this.sailPos;
    vd.indices = this.sailIdx;
    vd.normals = this.sailNormals;
    vd.uvs = uvs;
    vd.applyToMesh(this.sail, true);
    this.sail.material = sailMat;
    this.sail.parent = this.rig;

    this.burgee = this.addBurgee(scene, name, 2.46, 0.78, 0.28, stripeMat);

    // Sailor: sits on the windward side and hikes out as the breeze builds.
    this.sailor = sailorFigure(scene, `${name}-sailor`, this.body, SAILOR, { legs: shortsMat, jacket: jacketMat, skin: skinMat });

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  /**
   * Re-shape the sail grid. camber 0..1 = how full the sail is drawing, side = +1/-1 bulge direction,
   * luff 0..1 = how much it is flapping.
   */
  private shapeSail(camber: number, luff: number, side: number) {
    let i = 0;
    const t = this.flutter;
    for (let v = 0; v <= NV; v++) {
      const fv = v / NV;
      for (let u = 0; u <= NU; u++) {
        const fu = u / NU;
        const bx = TACK.x + (CLEW.x - TACK.x) * fu, by = TACK.y + (CLEW.y - TACK.y) * fu, bz = TACK.z + (CLEW.z - TACK.z) * fu;
        const tx = THROAT.x + (PEAK.x - THROAT.x) * fu, ty = THROAT.y + (PEAK.y - THROAT.y) * fu, tz = THROAT.z + (PEAK.z - THROAT.z) * fu;
        const belly = 4 * fu * (1 - fu);
        const edge = Math.min(1, fv * 6) * Math.min(1, (1 - fv) * 6) * 0.6 + 0.4;
        let x = side * (0.2 * camber * belly * edge + 0.28 * fu * fv * camber); // camber + twist to leeward
        // Luffing: ripples travel aft from the mast.
        x += luff * Math.sin(t * 22 - fu * 9 + fv * 4) * 0.07 * (0.35 + belly) * edge;
        this.sailPos[i++] = bx + (tx - bx) * fv + x;
        this.sailPos[i++] = by + (ty - by) * fv;
        this.sailPos[i++] = bz + (tz - bz) * fv;
      }
    }
    VertexData.ComputeNormals(this.sailPos, this.sailIdx, this.sailNormals);
  }

  protected drawSails(_dt: number, s: BoatState, tel: Telemetry) {
    const { camber, luff } = sailLook(tel);
    this.shapeSail(camber, luff, Math.sign(this.boomVisual) || s.boomSide);
    this.sail.updateVerticesData("position", this.sailPos);
    this.sail.updateVerticesData("normal", this.sailNormals);
  }

  protected placeSailors(s: BoatState, tel: Telemetry) {
    const windward = -s.boomSide;
    const hike = clamp(Math.abs(tel.sideForce) / 110, 0, 1);
    placeSailor(this.sailor, windward, 0.32 + 0.26 * hike, 0.22, -0.55, 0.15 + hike * 0.95, 0.25);
  }
}
