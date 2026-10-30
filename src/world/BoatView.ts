import {
  Color3, Mesh, MeshBuilder, TransformNode, Vector3, type InstancedMesh, type Scene,
} from "@babylonjs/core";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { boatMaterial, type BoatLook } from "./boatMaterials";
import { BoatViewBase, sailLook, type BoatMotion } from "./BoatViewBase";
import { SailMesh } from "./SailMesh";
import { OPTIMIST_CUT } from "./sailShape";
import { limbMesh, setLimb, SailorFigure } from "./SailorFigure";
import { optimistSection, RIG } from "./pose/boatRig";
import type { BoatCrew } from "./pose/looks";
import { sailorPose, type Pose } from "./pose/sailorPose";

// Sail corners in the rig frame (mast at origin, boom along -Z, sail plane = YZ).
const TACK = new Vector3(0, 0.5, 0);
const THROAT = new Vector3(0, 2.32, 0);
const PEAK = new Vector3(0, 2.78, -1.72);
const CLEW = new Vector3(0, 0.5, -1.98);
const NU = 10, NV = 9;

const MOTION: BoatMotion = { waveHeight: 0.85, pitch: 0.8, roll: 0.6, heelRate: 3, heel: 0.5, boomRate: 2.6, rudderDeg: RIG.optimist.rudderDeg };

/** Visual of an Optimist: pram hull, sprit rig with a cambered sail that luffs, an articulated sailor, foils. */
export class BoatView extends BoatViewBase {
  protected readonly rig: TransformNode;
  protected readonly rudder: TransformNode;
  protected readonly burgee: TransformNode;
  private sail: SailMesh;
  private sailor: SailorFigure;
  private pose: Pose | null = null;
  private extension: InstancedMesh;
  private readonly height: number;

  constructor(scene: Scene, name: string, look: BoatLook, crew: BoatCrew) {
    super(scene, name, MOTION);

    const hullMat = boatMaterial(scene, "hull", look.hull, 0.35, true);
    const woodMat = boatMaterial(scene, "wood", new Color3(0.62, 0.45, 0.26), 0.1);
    const darkMat = boatMaterial(scene, "spar", new Color3(0.12, 0.13, 0.15), 0.4);
    const sailMat = boatMaterial(scene, "sail", look.sail, 0.05, true);
    const stripeMat = boatMaterial(scene, "stripe", look.stripe, 0.2);

    // --- Hull: lofted pram sections, open on top so the cockpit is visible.
    const stations = 11;
    const paths: Vector3[][] = [];
    const sections: { z: number; wg: number; yg: number; wc: number; yc: number; yk: number }[] = [];
    for (let i = 0; i < stations; i++) {
      const { z, wg, yg, yk } = optimistSection(i / (stations - 1)); // t: 0 = stern, 1 = bow
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

    // Sail: a grid re-shaped every frame (camber, twist, luffing flutter), with the sprit sail's fixed offsets.
    this.sail = new SailMesh(scene, `${name}-sail`, sailMat, this.rig, TACK, CLEW, THROAT, PEAK, NU, NV, OPTIMIST_CUT);

    this.burgee = this.addBurgee(scene, name, 2.46, 0.78, 0.28, stripeMat);

    // Sailor: sits in the middle or to leeward in light air, on the windward side and hiking as the breeze builds.
    this.sailor = new SailorFigure(scene, `${name}-sailor`, this.body, crew.helm, look.jacket);
    this.height = this.sailor.height;
    // The tiller extension, hinged at the tiller's tip.
    this.extension = limbMesh(scene, `${name}-extension`, woodMat, this.body);

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  protected drawSails(_dt: number, s: BoatState, tel: Telemetry) {
    const { camber, luff } = sailLook(tel);
    this.sail.shape(camber, luff, Math.sign(this.boomVisual) || s.boomSide, this.flutter);
    this.sail.commit();
  }

  protected placeSailors(dt: number, s: BoatState, tel: Telemetry) {
    this.pose = sailorPose({
      classId: "optimist", role: "helm", crewSide: -s.boomSide, crewOut: s.crewOut, boomSide: s.boomSide, spiHoist: 0,
      heelDeg: tel.heelDeg, sideForce: tel.sideForce, tiller: -s.rudder, height: this.height,
    }, this.pose, dt);
    this.sailor.update(this.pose, this.sailorsNear);
    const ext = this.pose.extension!;
    setLimb(this.extension, ext.base, ext.end, 0.022);
    this.rollHull(this.pose.hullRoll);
  }
}
