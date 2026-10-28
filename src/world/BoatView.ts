import {
  Color3, Mesh, MeshBuilder, TransformNode, Vector3, VertexData, type Scene,
} from "@babylonjs/core";
import { clamp, DEG, lerpAngle } from "../core/math";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { boatMaterial, type BoatLook } from "./boatMaterials";
import { surfaceAt, type Wave } from "./Waves";

// Sail corners in the rig frame (mast at origin, boom along -Z, sail plane = YZ).
const TACK = new Vector3(0, 0.5, 0);
const THROAT = new Vector3(0, 2.32, 0);
const PEAK = new Vector3(0, 2.78, -1.72);
const CLEW = new Vector3(0, 0.5, -1.98);
const NU = 10, NV = 9;

/** Visual of an Optimist: pram hull, sprit rig with a cambered sail that luffs, sailor, foils. */
export class BoatView {
  root: TransformNode;
  private body: TransformNode; // takes heel and pitch
  private rig: TransformNode; // rotates with the boom
  private sail: Mesh;
  private sailPos: Float32Array;
  private sailIdx: number[];
  private sailNormals: Float32Array;
  private rudder: TransformNode;
  private sailor: TransformNode;
  private burgee: TransformNode;
  private boomVisual = 0; // signed boom angle actually drawn (rad), + = starboard
  private flutter = Math.random() * 10;
  private heelVisual = 0;

  constructor(scene: Scene, name: string, look: BoatLook) {
    this.root = new TransformNode(name, scene);
    this.body = new TransformNode(`${name}-body`, scene);
    this.body.parent = this.root;

    const hullMat = boatMaterial(scene, "hull", look.hull, 0.35, true);
    const woodMat = boatMaterial(scene, "wood", new Color3(0.62, 0.45, 0.26), 0.1);
    const darkMat = boatMaterial(scene, "spar", new Color3(0.12, 0.13, 0.15), 0.4);
    const sailMat = boatMaterial(scene, "sail", look.sail, 0.05, true);
    const jacketMat = boatMaterial(scene, "jacket", look.jacket, 0.1);
    const skinMat = boatMaterial(scene, "skin", new Color3(0.86, 0.66, 0.52), 0.05);
    const stripeMat = boatMaterial(scene, "stripe", look.stripe, 0.2);

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

    // Masthead burgee shows the apparent wind.
    this.burgee = new TransformNode(`${name}-burgeePivot`, scene);
    this.burgee.position.set(0, 2.46, 0.78);
    this.burgee.parent = this.body;
    const flag = MeshBuilder.CreatePlane(`${name}-burgee`, { width: 0.28, height: 0.1, sideOrientation: Mesh.DOUBLESIDE }, scene);
    flag.rotation.y = Math.PI / 2;
    flag.position.z = -0.14;
    flag.material = stripeMat;
    flag.parent = this.burgee;

    // Sailor: sits on the windward side and hikes out as the breeze builds.
    this.sailor = new TransformNode(`${name}-sailor`, scene);
    this.sailor.parent = this.body;
    const torso = MeshBuilder.CreateCapsule(`${name}-torso`, { radius: 0.15, height: 0.62, tessellation: 8 }, scene);
    torso.position.set(0, 0.3, 0);
    torso.material = jacketMat;
    torso.parent = this.sailor;
    const head = MeshBuilder.CreateSphere(`${name}-head`, { diameter: 0.21, segments: 8 }, scene);
    head.position.set(0, 0.72, 0.02);
    head.material = skinMat;
    head.parent = this.sailor;
    const legs = MeshBuilder.CreateCapsule(`${name}-legs`, { radius: 0.08, height: 0.6, tessellation: 6 }, scene);
    legs.rotation.z = Math.PI / 2;
    legs.position.set(0, 0.0, 0.0);
    legs.material = boatMaterial(scene, "shorts", new Color3(0.1, 0.12, 0.2));
    legs.parent = this.sailor;

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  /**
   * Re-shape the sail grid. camber 0..1 = how full the sail is drawing, side = +1/-1 bulge direction,
   * luff 0..1 = how much it is flapping.
   */
  private shapeSail(camber: number, luff: number, side: number) {
    this.flutter += 0;
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

  update(dt: number, time: number, s: BoatState, tel: Telemetry, waves: Wave[]) {
    this.flutter += dt;
    // Ride the waves: height, pitch and roll from the local surface slope.
    const surf = surfaceAt(waves, s.x, s.z, time);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const slopeFwd = surf.dx * fx + surf.dz * fz;
    const slopeSide = surf.dx * fz - surf.dz * fx;
    this.root.position.set(s.x, surf.h * 0.85 + 0.02, s.z);
    this.root.rotation.y = s.heading;

    // Heel (+ = to starboard) eases toward the physics value; the sailor hikes to windward.
    this.heelVisual += (tel.heelDeg - this.heelVisual) * Math.min(1, dt * 3);
    this.body.rotation.x = -Math.atan(slopeFwd) * 0.8;
    this.body.rotation.z = -(this.heelVisual * DEG) * 0.5 + Math.atan(slopeSide) * 0.6;

    // Boom swings to the leeward side; a gybe swings it across quickly.
    const target = s.boomSide * tel.boomAngle;
    const maxRate = 2.6 * dt;
    const diff = target - this.boomVisual;
    this.boomVisual += clamp(diff, -maxRate, maxRate);
    this.rig.rotation.y = -this.boomVisual;

    const luff = tel.trimState === "luffing" || tel.trimState === "irons" ? clamp(1 - tel.aoa / (6 * DEG), 0.25, 1) : 0;
    const camber = clamp(tel.aoa / (14 * DEG), 0.15, 1) * (1 - luff * 0.7);
    this.shapeSail(camber, luff, Math.sign(this.boomVisual) || s.boomSide);
    this.sail.updateVerticesData("position", this.sailPos);
    this.sail.updateVerticesData("normal", this.sailNormals);

    this.rudder.rotation.y = -s.rudder * 30 * DEG;

    const windward = -s.boomSide;
    const hike = clamp(Math.abs(tel.sideForce) / 110, 0, 1);
    this.sailor.position.set(windward * (0.32 + 0.26 * hike), 0.22, -0.55);
    this.sailor.rotation.z = -windward * (0.15 + hike * 0.95);
    this.sailor.rotation.y = windward * 0.25;

    // Burgee points where the apparent wind goes.
    this.burgee.rotation.y = lerpAngle(this.burgee.rotation.y, tel.awa, Math.min(1, dt * 8));
  }

  dispose() {
    this.root.dispose(false, false);
  }
}
