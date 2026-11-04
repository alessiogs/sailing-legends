import {
  Color3,
  Mesh,
  MeshBuilder,
  TransformNode,
  Vector3,
  type InstancedMesh,
  type Scene,
} from "@babylonjs/core";
import type { BoatClass } from "../sailing/BoatClass";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { boatMaterial, type BoatLook } from "./boatMaterials";
import { BoatViewBase, sailLook, type BoatMotion } from "./BoatViewBase";
import { SailMesh } from "./SailMesh";
import { block, fromTurned, LineSet, toeStrap } from "./Rigging";
import { DECAL, sailNumberMaterial } from "./SailNumber";
import { ILCA_CUT } from "./sailShape";
import { limbMesh, setLimb, SailorFigure } from "./SailorFigure";
import { RIG, sectionIlca } from "./pose/boatRig";
import { sailNumber, type BoatCrew } from "./pose/looks";
import type { V3 } from "./pose/reach";
import { sailorPose, type Pose } from "./pose/sailorPose";

const NU = 10,
  NV = 9;
/** The ILCA 7's sail area, which the sail corners below are drawn for; the other rigs scale down from it. */
const AREA_7 = 7.06;

const MAST_STEP: V3 = { x: 0, y: 0, z: RIG.ilca.mastZ };
// The mainsheet runs from the boom's end down to a block on the floor, then to the Helm's hand.
const SHEET_BLOCK: V3 = { x: 0, y: 0.02, z: -0.9 };
const SHEET_COLOR = new Color3(0.93, 0.93, 0.88);

const MOTION: BoatMotion = {
  waveHeight: 0.85,
  pitch: 0.8,
  roll: 0.6,
  heelRate: 3,
  heel: 0.5,
  boomRate: 2.6,
  rudderDeg: RIG.ilca.rudderDeg,
  bowLift: 0.04,
  bowZ: 2.0,
};

/**
 * Visual of an ILCA: a long open hull with a flat deck, one sail on a sleeve mast (the sail's luff is the mast), a boom and
 * a hiking sailor. The rig sets the size of the sail. The sailor is drawn simply, and the tiller extension left out, when the camera is far (see `NEAR` in `BoatViewBase`).
 */
export class BoatIlcaView extends BoatViewBase {
  protected readonly rig: TransformNode;
  protected readonly rudder: TransformNode;
  protected readonly burgee: TransformNode;
  private sail: SailMesh;
  private sailor: SailorFigure;
  private pose: Pose | null = null;
  private extension: InstancedMesh;
  private sheets: LineSet;
  private readonly clew: V3 = { x: 0, y: 0, z: 0 };
  private readonly clewBody: V3 = { x: 0, y: 0, z: 0 };
  private readonly height: number;

  constructor(
    scene: Scene,
    name: string,
    look: BoatLook,
    crew: BoatCrew,
    cls: BoatClass,
  ) {
    super(scene, name, MOTION);
    const k = Math.sqrt(cls.main.area / AREA_7); // rig scale: linear size of the sail

    const hullMat = boatMaterial(scene, "hull", look.hull, 0.35, true);
    const deckMat = boatMaterial(scene, "ilcadeck", look.hull, 0.25, true);
    const floorMat = boatMaterial(
      scene,
      "ilcafloor",
      new Color3(0.82, 0.82, 0.78),
      0.1,
    );
    const darkMat = boatMaterial(
      scene,
      "spar",
      new Color3(0.12, 0.13, 0.15),
      0.4,
    );
    const mastMat = boatMaterial(
      scene,
      "ilcamast",
      new Color3(0.78, 0.78, 0.8),
      0.35,
    );
    const sailMat = boatMaterial(scene, "sail", look.sail, 0.05, true);
    const stripeMat = boatMaterial(scene, "stripe", look.stripe, 0.2);

    // --- Hull: lofted sections, open on top; a flat deck covers the bow half.
    const stations = 13;
    const paths: Vector3[][] = [];
    const deckPaths: Vector3[][] = [];
    const sections: { z: number; wg: number; yg: number }[] = [];
    for (let i = 0; i < stations; i++) {
      const t = i / (stations - 1);
      const { z, wg, yg, yk } = sectionIlca(t);
      const wc = wg * 0.75,
        yc = yk + 0.08;
      sections.push({ z, wg, yg });
      paths.push([
        new Vector3(-wg, yg, z),
        new Vector3(-wc, yc, z),
        new Vector3(0, yk, z),
        new Vector3(wc, yc, z),
        new Vector3(wg, yg, z),
      ]);
      if (t > 0.45)
        deckPaths.push([new Vector3(-wg, yg, z), new Vector3(wg, yg, z)]);
    }
    const hull = MeshBuilder.CreateRibbon(
      `${name}-hull`,
      { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    hull.material = hullMat;
    hull.parent = this.body;
    const deck = MeshBuilder.CreateRibbon(
      `${name}-deck`,
      { pathArray: deckPaths, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    deck.material = deckMat;
    deck.parent = this.body;
    // Stern cap, and the coloured sheer stripe along both sides.
    const p0 = paths[0];
    const c0 = new Vector3(0, (p0[0].y + p0[2].y) / 2, p0[0].z);
    const cap = MeshBuilder.CreateRibbon(
      `${name}-cap`,
      { pathArray: [p0, p0.map(() => c0)], sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    cap.material = hullMat;
    cap.parent = this.body;
    for (const side of [-1, 1]) {
      const stripe = MeshBuilder.CreateTube(
        `${name}-stripe${side}`,
        {
          path: sections
            .slice(0, stations - 1)
            .map((s) => new Vector3(side * (s.wg - 0.004), s.yg - 0.05, s.z)),
          radius: 0.02,
          tessellation: 5,
        },
        scene,
      );
      stripe.material = stripeMat;
      stripe.parent = this.body;
    }
    // Cockpit floor, centreboard and rudder.
    const floor = MeshBuilder.CreateBox(
      `${name}-floor`,
      { width: 0.75, height: 0.02, depth: 2.0 },
      scene,
    );
    floor.position.set(0, -0.03, -0.55);
    floor.material = floorMat;
    floor.parent = this.body;
    const board = MeshBuilder.CreateBox(
      `${name}-board`,
      { width: 0.02, height: 0.9, depth: 0.45 },
      scene,
    );
    board.position.set(0, -0.35, 0.4);
    board.material = floorMat;
    board.parent = this.body;
    this.rudder = new TransformNode(`${name}-rudderPivot`, scene);
    this.rudder.position.set(0, 0.25, -2.12);
    this.rudder.parent = this.body;
    const blade = MeshBuilder.CreateBox(
      `${name}-rudder`,
      { width: 0.02, height: 0.9, depth: 0.28 },
      scene,
    );
    blade.position.set(0, -0.4, -0.1);
    blade.material = floorMat;
    blade.parent = this.rudder;
    const tiller = MeshBuilder.CreateBox(
      `${name}-tiller`,
      { width: 0.03, height: 0.03, depth: 1.0 },
      scene,
    );
    tiller.position.set(0, 0.2, 0.5);
    tiller.material = darkMat;
    tiller.parent = this.rudder;

    // --- Rig: a sleeve mast (the sail's luff is the mast), a boom and one sail on a pivot that turns with the sheet.
    const luff = 4.9 * k,
      foot = 2.7 * k;
    const mast = MeshBuilder.CreateCylinder(
      `${name}-mast`,
      {
        height: luff + 0.1,
        diameterTop: 0.04,
        diameterBottom: 0.07,
        tessellation: 8,
      },
      scene,
    );
    mast.position.set(MAST_STEP.x, (luff + 0.1) / 2 + 0.3, MAST_STEP.z);
    mast.material = mastMat;
    mast.parent = this.body;
    this.rig = new TransformNode(`${name}-rig`, scene);
    this.rig.position.set(MAST_STEP.x, MAST_STEP.y, MAST_STEP.z);
    this.rig.parent = this.body;
    const boom = MeshBuilder.CreateCylinder(
      `${name}-boom`,
      { height: foot, diameter: 0.045, tessellation: 6 },
      scene,
    );
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.6, -foot / 2);
    boom.material = darkMat;
    boom.parent = this.rig;

    // Sail: a triangle (both head corners coincide) re-shaped every frame; the head leans aft with the mast bend.
    const tack = new Vector3(0, 0.62, 0),
      clew = new Vector3(0, 0.66, -foot),
      head = new Vector3(0, 0.4 + luff, -0.25 * k);
    const numberMat = sailNumberMaterial(
      scene,
      "ilca",
      sailNumber(crew.helm.id, "ilca"),
      look.sail,
      String(cls.rig ?? ""),
    );
    this.sail = new SailMesh(
      scene,
      `${name}-sail`,
      sailMat,
      this.rig,
      tack,
      clew,
      head,
      head,
      NU,
      NV,
      ILCA_CUT,
      { material: numberMat, vSpan: DECAL.ilca.vSpan },
    );

    this.burgee = this.addBurgee(
      scene,
      name,
      luff + 0.45,
      MAST_STEP.z,
      0.3,
      stripeMat,
    );

    // Toe strap along the floor, the sheet block and the mainsheet.
    toeStrap(
      scene,
      `${name}-strap`,
      boatMaterial(scene, "strap", new Color3(0.82, 0.82, 0.78), 0.1),
      this.body,
      1.0,
      0,
      -0.02,
      -0.5,
    );
    block(
      scene,
      `${name}-block`,
      darkMat,
      this.body,
      SHEET_BLOCK.x,
      SHEET_BLOCK.y,
      SHEET_BLOCK.z,
    );
    this.sheets = new LineSet(
      scene,
      `${name}-sheets`,
      this.body,
      [3],
      SHEET_COLOR,
    );

    // Sailor: hiking on the windward deck.
    this.sailor = new SailorFigure(
      scene,
      `${name}-sailor`,
      this.body,
      crew.helm,
      look.jacket,
    );
    this.height = this.sailor.height;
    this.extension = limbMesh(scene, `${name}-extension`, darkMat, this.body);

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  protected drawSails(_dt: number, s: BoatState, tel: Telemetry) {
    const { camber, luff } = sailLook(tel);
    this.sail.shape(
      camber,
      luff,
      Math.sign(this.boomVisual) || s.boomSide,
      this.flutter,
    );
    this.sail.commit();
  }

  protected placeSailors(dt: number, s: BoatState, tel: Telemetry) {
    this.pose = sailorPose(
      {
        classId: "ilca",
        role: "helm",
        crewSide: -s.boomSide,
        crewOut: s.crewOut,
        helmOut: s.helmOut,
        boomSide: s.boomSide,
        spiHoist: 0,
        heelDeg: tel.heelDeg,
        sideForce: tel.sideForce,
        tiller: -s.rudder,
        height: this.height,
      },
      this.pose,
      dt,
    );
    this.sailor.update(this.pose, this.sailorsNear);
    // The tiller extension is a small detail: drawn only for a boat the camera is near.
    this.extension.setEnabled(this.sailorsNear);
    if (this.sailorsNear) {
      const ext = this.pose.extension!;
      setLimb(this.extension, ext.base, ext.end, 0.022);
    }
    this.sail.clewPoint(this.clew);
    fromTurned(this.clew, this.rig.rotation.y, MAST_STEP, this.clewBody);
    this.sheets.set(
      0,
      this.clewBody,
      SHEET_BLOCK,
      this.pose.targets.sheet ?? SHEET_BLOCK,
    );
    this.sheets.commit();
    this.rollHull(this.pose.hullRoll);
  }
}
