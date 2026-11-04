import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  TransformNode,
  Vector3,
  type InstancedMesh,
  type Scene,
} from "@babylonjs/core";
import { clamp, DEG } from "../core/math";
import type { BoatClass } from "../sailing/BoatClass";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { boatMaterial, type BoatLook } from "./boatMaterials";
import { BoatViewBase, sailLook, type BoatMotion } from "./BoatViewBase";
import { SailMesh } from "./SailMesh";
import { block, fromTurned, LineSet, toeStrap } from "./Rigging";
import { DECAL, sailNumberMaterial } from "./SailNumber";
import { limbMesh, setLimb, SailorFigure } from "./SailorFigure";
import { RIG, sectionAt } from "./pose/boatRig";
import { sailNumber, type BoatCrew } from "./pose/looks";
import type { V3 } from "./pose/reach";
import { sailorPose, type Pose, type PoseInput } from "./pose/sailorPose";

/** The gennakers' colours, handed out in turn so boats in one fleet differ. */
const GENNAKER_COLORS = [
  new Color3(0.95, 0.25, 0.2),
  new Color3(0.15, 0.4, 0.9),
  new Color3(1, 0.8, 0.15),
  new Color3(0.2, 0.75, 0.45),
];
let gennakerColorIdx = 0;

const SHEET_COLOR = new Color3(0.93, 0.93, 0.88);
/** The 29er's mast height (m): the rig of the 49er is drawn at this scale times `mastHeight / BASE_MAST`. */
const BASE_MAST = 6.2;

// Lines of the boat's one line mesh: 0 main sheet, 1 jib sheet, 2 gennaker sheet, 3 and 4 the Crew's trapeze handle pendants,
// 5 and 6 the Helm's (49er), 7 and 8 the two trapeze wires.
const LINES = [3, 3, 2, 3, 3, 3, 3, 2, 2];
const WIRE_CREW = 7,
  WIRE_HELM = 8;

/** Heights and lengths of a skiff's rig, from the 29er's, so the 49er's is the same boat drawn bigger. */
function rigScale(classId: "29er" | "49er") {
  const r = RIG[classId];
  const kh = r.skiff!.mastHeight / BASE_MAST;
  const kl = classId === "49er" ? 1.1 : 1;
  return { kh, kl };
}

/**
 * Visual of a skiff (29er or 49er): a flat planing hull, main and a self-tacking jib, a retractable bowsprit with an asymmetric
 * gennaker, the Crew on the trapeze and, in the 49er, the Helm too, standing on the racks. Both classes share this view; the
 * 49er is the same boat bigger, with racks. A far boat costs no more meshes than a far 420: the figures are three meshes each,
 * and the tiller extension and handles are not drawn.
 */
export class BoatSkiffView extends BoatViewBase {
  protected readonly rig: TransformNode;
  protected readonly rudder: TransformNode;
  protected readonly burgee: TransformNode;
  private readonly classId: "29er" | "49er";
  private readonly mastZ: number;
  private readonly mastHeight: number;
  private readonly hounds: V3;
  private readonly bowTip: number;
  private readonly sprit: Mesh;
  private readonly spritLength: number;
  private jibPivot: TransformNode;
  private main: SailMesh;
  private jib: SailMesh;
  private gennaker: SailMesh;
  /** The gennaker's tack (on the bowsprit's tip) and clew, moved every frame (the sail reads them when it is shaped). */
  private readonly genTack: Vector3;
  private readonly genClew: Vector3;
  private readonly genFoot: number;
  /** The side the gennaker is drawn on, -1..1: it crosses in front of the mast in a gybe. */
  private genVisual = 0;
  private genUp = false;
  private helm: SailorFigure;
  private crew: SailorFigure;
  private helmPose: Pose | null = null;
  private crewPose: Pose | null = null;
  private extension: InstancedMesh;
  private handles: [InstancedMesh, InstancedMesh];
  private jibVisual = 0;
  private sheets: LineSet;
  private readonly mainBlock: V3;
  private readonly jibTrack: V3;
  private readonly clew: V3 = { x: 0, y: 0, z: 0 };
  private readonly clewBody: V3 = { x: 0, y: 0, z: 0 };
  private readonly mastStep: V3;
  private readonly pendants = Array.from({ length: 6 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));

  constructor(
    scene: Scene,
    name: string,
    look: BoatLook,
    crew: BoatCrew,
    cls: BoatClass,
  ) {
    const classId = cls.id === "49er" ? "49er" : "29er";
    const rig = RIG[classId];
    const { kh, kl } = rigScale(classId);
    const motion: BoatMotion = {
      waveHeight: 0.65,
      pitch: 0.55,
      roll: 0.35,
      heelRate: 2.5,
      heel: 0.7,
      boomRate: 2.8,
      rudderDeg: rig.rudderDeg,
      bowLift: 0.1,
      bowZ: cls.length / 2,
    };
    super(scene, name, motion);
    this.classId = classId;
    const mastZ = (this.mastZ = rig.mastZ);
    const mastH = (this.mastHeight = rig.skiff!.mastHeight);
    this.hounds = rig.hounds!;
    const z0 = -cls.length / 2,
      bow = cls.length / 2;
    this.mastStep = { x: 0, y: 0, z: mastZ };
    this.mainBlock = { x: 0, y: 0.12, z: mastZ - 1.7 * kl };
    this.jibTrack = { x: 0, y: 0.34, z: mastZ + 0.3 };

    const hullMat = boatMaterial(
      scene,
      `${classId}-hull`,
      look.hull,
      0.4,
      true,
    );
    const deckMat = boatMaterial(
      scene,
      `${classId}-deck`,
      look.stripe,
      0.3,
      true,
    );
    const darkMat = boatMaterial(
      scene,
      `${classId}-spar`,
      new Color3(0.2, 0.21, 0.24),
      0.6,
    );
    const rackMat = boatMaterial(
      scene,
      `${classId}-rack`,
      new Color3(0.14, 0.14, 0.16),
      0.5,
    );
    const woodMat = boatMaterial(
      scene,
      `${classId}-tiller`,
      new Color3(0.2, 0.2, 0.22),
      0.3,
    );
    const sailMat = boatMaterial(
      scene,
      `${classId}-sail`,
      look.sail,
      0.05,
      true,
    );
    const genMat = boatMaterial(
      scene,
      `${classId}-gennaker`,
      GENNAKER_COLORS[gennakerColorIdx++ % GENNAKER_COLORS.length],
      0.05,
      true,
    );
    const stripeMat = boatMaterial(
      scene,
      `${classId}-stripe`,
      look.stripe,
      0.2,
    );

    // --- Hull: lofted sections, flat and wide aft, with a long fine bow; open cockpit, foredeck.
    const N = 15;
    const paths: Vector3[][] = [];
    const gunwale: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const { z, wg, yg, yk } = sectionAt(classId, z0 + t * cls.length);
      const wc = wg * 0.8,
        yc = yk + 0.1;
      gunwale.push({ x: wg, y: yg, z });
      paths.push([
        new Vector3(-wg, yg, z),
        new Vector3(-wc, yc, z),
        new Vector3(0, yk, z),
        new Vector3(wc, yc, z),
        new Vector3(wg, yg, z),
      ]);
    }
    const hull = MeshBuilder.CreateRibbon(
      `${name}-hull`,
      { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    hull.material = hullMat;
    hull.parent = this.body;
    const p0 = paths[0];
    const c0 = new Vector3(0, (p0[0].y + p0[2].y) / 2, p0[0].z);
    const transom = MeshBuilder.CreateRibbon(
      `${name}-transom`,
      { pathArray: [p0, p0.map(() => c0)], sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    transom.material = hullMat;
    transom.parent = this.body;
    const front = gunwale.filter((g) => g.z > mastZ - 0.4);
    const deck = MeshBuilder.CreateRibbon(
      `${name}-deck`,
      {
        pathArray: [
          front.map((g) => new Vector3(-g.x, g.y + 0.01, g.z)),
          front.map((g) => new Vector3(g.x, g.y + 0.01, g.z)),
        ],
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
    );
    deck.material = deckMat;
    deck.parent = this.body;

    // Racks (49er): a flat frame out over each side, one merged mesh. The sailors' feet stand near its outer edge.
    if (rig.wing !== undefined) {
      const mid = sectionAt(classId, -0.2);
      const reach = rig.wing - mid.wg;
      const parts: Mesh[] = [];
      for (const side of [-1, 1]) {
        const plank = MeshBuilder.CreateBox(
          `${name}-rack${side}`,
          { width: reach, height: 0.03, depth: 2.0 },
          scene,
        );
        plank.position.set(side * (mid.wg + reach / 2), mid.yg + 0.02, -0.2);
        const edge = MeshBuilder.CreateBox(
          `${name}-rackEdge${side}`,
          { width: 0.05, height: 0.05, depth: 2.2 },
          scene,
        );
        edge.position.set(side * rig.wing, mid.yg + 0.04, -0.2);
        parts.push(plank, edge);
      }
      const racks = Mesh.MergeMeshes(parts, true)!;
      racks.name = `${name}-racks`;
      racks.material = rackMat;
      racks.parent = this.body;
    }

    // Daggerboard, rudder and tiller.
    const board = MeshBuilder.CreateBox(
      `${name}-board`,
      { width: 0.025, height: 1.0, depth: 0.4 },
      scene,
    );
    board.position.set(0, -0.5, mastZ - 0.3);
    board.material = darkMat;
    board.parent = this.body;
    this.rudder = new TransformNode(`${name}-rudderPivot`, scene);
    this.rudder.position.set(
      rig.rudderPivot.x,
      rig.rudderPivot.y,
      rig.rudderPivot.z,
    );
    this.rudder.parent = this.body;
    const blade = MeshBuilder.CreateBox(
      `${name}-rudder`,
      { width: 0.025, height: 1.0, depth: 0.28 },
      scene,
    );
    blade.position.set(0, -0.45, -0.12);
    blade.material = darkMat;
    blade.parent = this.rudder;
    const tiller = MeshBuilder.CreateBox(
      `${name}-tiller`,
      { width: 0.035, height: 0.035, depth: rig.tillerTip.z },
      scene,
    );
    tiller.position.set(0, rig.tillerTip.y, rig.tillerTip.z / 2);
    tiller.material = woodMat;
    tiller.parent = this.rudder;

    // --- Rig: mast, forestay, boom and main with the class mark and sail number.
    const mast = MeshBuilder.CreateCylinder(
      `${name}-mast`,
      {
        height: mastH,
        diameterTop: 0.04,
        diameterBottom: 0.075,
        tessellation: 8,
      },
      scene,
    );
    mast.position.set(0, mastH / 2, mastZ);
    mast.material = darkMat;
    mast.parent = this.body;
    const forestay = MeshBuilder.CreateTube(
      `${name}-forestay`,
      {
        path: [
          new Vector3(0, 0.45, bow - 0.1),
          new Vector3(0, mastH * 0.8, mastZ),
        ],
        radius: 0.006,
        tessellation: 4,
      },
      scene,
    );
    forestay.material = darkMat;
    forestay.parent = this.body;
    this.rig = new TransformNode(`${name}-rig`, scene);
    this.rig.position.set(0, 0, mastZ);
    this.rig.parent = this.body;
    const boomY = 0.9 * Math.pow(kh, 0.4),
      boomLen = 2.7 * kl;
    const boom = MeshBuilder.CreateCylinder(
      `${name}-boom`,
      { height: boomLen, diameter: 0.05, tessellation: 6 },
      scene,
    );
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, boomY, -boomLen / 2);
    boom.material = darkMat;
    boom.parent = this.rig;
    this.main = new SailMesh(
      scene,
      `${name}-main`,
      sailMat,
      this.rig,
      new Vector3(0, boomY + 0.05, -0.04),
      new Vector3(0, boomY + 0.05, -boomLen + 0.05),
      new Vector3(0, mastH - 0.05, 0),
      new Vector3(0, mastH - 0.1, -0.35 * kl),
      10,
      12,
      undefined,
      {
        material: sailNumberMaterial(
          scene,
          classId,
          sailNumber(crew.helm.id, classId),
          look.sail,
        ),
        vSpan: DECAL[classId].vSpan,
      },
    );

    // Self-tacking jib, pivoting at the stem.
    this.jibPivot = new TransformNode(`${name}-jibPivot`, scene);
    this.jibPivot.position.set(0, 0.4, bow - 0.25);
    this.jibPivot.parent = this.body;
    const jibHead = new Vector3(
      0,
      0.77 * mastH - 0.4,
      mastZ + 0.05 - (bow - 0.25),
    );
    this.jib = new SailMesh(
      scene,
      `${name}-jib`,
      sailMat,
      this.jibPivot,
      new Vector3(0, 0.08, -0.02),
      new Vector3(0, 0.45, -1.6 * kl),
      jibHead,
      jibHead,
      8,
      10,
    );

    // Bowsprit, out of a tube in the bow, and the asymmetric gennaker flown from its tip: tack on the sprit, head at the masthead,
    // clew swinging out to the side it is sheeted on. One mesh for both sides; it crosses in front of the mast in a gybe.
    this.spritLength = rig.skiff!.sprit;
    this.bowTip = bow + this.spritLength;
    this.sprit = MeshBuilder.CreateCylinder(
      `${name}-sprit`,
      { height: 1, diameter: 0.045, tessellation: 5 },
      scene,
    );
    this.sprit.material = darkMat;
    this.sprit.parent = this.body;
    this.sprit.rotationQuaternion = new Quaternion();
    Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      Vector3.Forward(),
      this.sprit.rotationQuaternion,
    );
    this.genTack = new Vector3(0, 0.5, this.bowTip);
    this.genFoot = 2.9 * kl;
    this.genClew = new Vector3(0, 0.9, this.bowTip - this.genFoot);
    const genHead = new Vector3(0, 0.93 * mastH, mastZ + 0.1);
    this.gennaker = new SailMesh(
      scene,
      `${name}-gennaker`,
      genMat,
      this.body,
      this.genTack,
      this.genClew,
      genHead,
      genHead,
      10,
      12,
    );
    this.gennaker.mesh.isVisible = false;

    // --- People: the Helm in the Helm's jacket, the Crew in the stripe colour.
    this.helm = new SailorFigure(
      scene,
      `${name}-helm`,
      this.body,
      crew.helm,
      look.jacket,
    );
    this.crew = new SailorFigure(
      scene,
      `${name}-crew`,
      this.body,
      crew.crew ?? crew.helm,
      look.stripe,
    );
    this.extension = limbMesh(scene, `${name}-extension`, woodMat, this.body);
    const gripMat = boatMaterial(
      scene,
      `${classId}-grip`,
      new Color3(0.85, 0.2, 0.15),
      0.3,
    );
    this.handles = [
      limbMesh(scene, `${name}-handle0`, gripMat, this.body),
      limbMesh(scene, `${name}-handle1`, gripMat, this.body),
    ];

    // Toe straps under which a hiking Helm and Crew hook their feet, the mainsheet block, the jib's track, and every line.
    const strapMat = boatMaterial(
      scene,
      `${classId}-strap`,
      new Color3(0.82, 0.82, 0.78),
      0.1,
    );
    for (const side of [-1, 1])
      toeStrap(
        scene,
        `${name}-strap${side}`,
        strapMat,
        this.body,
        1.0,
        side * 0.2,
        -0.06,
        -0.6,
      );
    block(
      scene,
      `${name}-mainblock`,
      darkMat,
      this.body,
      this.mainBlock.x,
      this.mainBlock.y,
      this.mainBlock.z,
    );
    block(
      scene,
      `${name}-jibtrack`,
      darkMat,
      this.body,
      this.jibTrack.x,
      this.jibTrack.y,
      this.jibTrack.z,
    );
    this.sheets = new LineSet(
      scene,
      `${name}-lines`,
      this.body,
      LINES,
      SHEET_COLOR,
    );

    this.burgee = this.addBurgee(
      scene,
      name,
      mastH + 0.05,
      mastZ,
      0.32,
      stripeMat,
    );

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  protected drawSails(dt: number, s: BoatState, tel: Telemetry) {
    const main = sailLook(tel);
    this.main.shape(
      main.camber,
      main.luff,
      Math.sign(this.boomVisual) || s.boomSide,
      this.flutter,
    );
    this.main.commit();

    // Jib: stays on its side until the Crew moves it (a backed jib shows on the windward side).
    if (tel.jib) {
      const jt = s.jibSide * tel.jib.angle;
      this.jibVisual += clamp(jt - this.jibVisual, -3 * dt, 3 * dt);
      this.jibPivot.rotation.y = -this.jibVisual;
      const jib = sailLook(tel.jib);
      this.jib.shape(
        jib.camber,
        jib.luff,
        Math.sign(this.jibVisual) || s.jibSide,
        this.flutter + 1,
      );
      this.jib.commit();
    }

    // Bowsprit: out of the bow when the gennaker is up, drawn back in when it is down.
    const h = s.spiHoist;
    const out = 0.3 + (this.spritLength - 0.3) * Math.min(1, h * 1.5);
    const bow = this.bowTip - this.spritLength;
    this.sprit.scaling.y = out + 0.5;
    this.sprit.position.set(0, 0.5, bow - 0.5 + (out + 0.5) / 2);
    this.genTack.z = bow + out;

    // Gennaker: the clew swings out to the side it is sheeted on and across in a gybe, at an angle that follows the sheet.
    this.genUp = h > 0.03 && !!tel.spi;
    this.gennaker.mesh.isVisible = this.genUp;
    if (this.genUp && tel.spi) {
      this.genVisual += clamp(s.spiSide - this.genVisual, -3 * dt, 3 * dt);
      const crossing = 1 - Math.abs(this.genVisual);
      const chord = 18 * DEG + 0.3 * tel.spi.angle;
      this.genClew.x = this.genVisual * this.genFoot * Math.sin(chord);
      this.genClew.y = 0.9 + 0.25 * crossing;
      this.genClew.z = this.genTack.z - this.genFoot * Math.cos(chord);
      const collapse = clamp(
        (tel.spi.collapsed || tel.spi.wrongSide
          ? 0.8
          : tel.spi.trimState === "luffing"
            ? 0.5
            : 0) +
          0.8 * crossing,
        0,
        1,
      );
      this.gennaker.shape(
        clamp(1.2 - collapse, 0.2, 1.2),
        collapse,
        this.genVisual >= 0 ? 1 : -1,
        this.flutter + 2,
        h,
        0.3,
      );
      this.gennaker.commit();
    }
  }

  protected placeSailors(dt: number, s: BoatState, tel: Telemetry) {
    // Both sailors are on the Crew's side (the windward side once the Crew has moved across).
    const common: Omit<PoseInput, "role" | "height"> = {
      classId: this.classId,
      crewSide: s.crewSide,
      crewOut: s.crewOut,
      helmOut: s.helmOut,
      boomSide: s.boomSide,
      spiHoist: s.spiHoist,
      heelDeg: tel.heelDeg,
      sideForce: tel.sideForce,
      tiller: -s.rudder,
    };
    const helm = (this.helmPose = sailorPose(
      { ...common, role: "helm", height: this.helm.height },
      this.helmPose,
      dt,
    ));
    const crew = (this.crewPose = sailorPose(
      { ...common, role: "crew", height: this.crew.height },
      this.crewPose,
      dt,
    ));
    this.helm.update(helm, this.sailorsNear);
    this.crew.update(crew, this.sailorsNear);
    // The tiller extension and the handles are small details: drawn only for a boat the camera is near.
    this.extension.setEnabled(this.sailorsNear);
    setLimb(this.extension, helm.extension!.base, helm.extension!.end, 0.026);
    this.trapeze(crew, 3, WIRE_CREW, 0);
    this.trapeze(helm, 5, WIRE_HELM, 1);
    this.drawSheets(s, helm, crew);
    // The hull rocks while either sailor crosses it.
    this.rollHull(
      Math.abs(helm.hullRoll) > Math.abs(crew.hullRoll)
        ? helm.hullRoll
        : crew.hullRoll,
    );
  }

  /** One sailor's trapeze: the wire from the hounds to the harness, with the handle and its two pendants on it. */
  private trapeze(
    pose: Pose,
    pendantLine: number,
    wireLine: number,
    handle: 0 | 1,
  ) {
    const top = this.hounds;
    const hand = this.handles[handle];
    hand.setEnabled(pose.onWire && this.sailorsNear);
    if (!pose.onWire) {
      this.sheets.hide(pendantLine);
      this.sheets.hide(pendantLine + 1);
      this.sheets.hide(wireLine);
      return;
    }
    this.sheets.set(wireLine, top, pose.harness);
    const g = pose.targets.handle!;
    const a = this.pendants[handle * 3],
      b = this.pendants[handle * 3 + 1],
      c = this.pendants[handle * 3 + 2];
    a.x = g.x - 0.1;
    a.y = g.y;
    a.z = g.z;
    b.x = g.x + 0.1;
    b.y = g.y;
    b.z = g.z;
    if (this.sailorsNear) setLimb(hand, a, b, 0.032);
    // The pendants meet on the wire 0.25 m above the bar.
    const dx = top.x - g.x,
      dy = top.y - g.y,
      dz = top.z - g.z,
      k = 0.25 / (Math.hypot(dx, dy, dz) || 1);
    c.x = g.x + dx * k;
    c.y = g.y + dy * k;
    c.z = g.z + dz * k;
    this.sheets.set(pendantLine, a, c, c);
    this.sheets.set(pendantLine + 1, b, c, c);
  }

  /** The main sheet to the Helm's hand, the jib sheet through its track and the gennaker sheet to the Crew's. */
  private drawSheets(s: BoatState, helm: Pose, crew: Pose) {
    const hand = crew.targets.sheet ?? this.mainBlock;
    const main = helm.targets.sheet ?? this.mainBlock;
    this.main.clewPoint(this.clew);
    fromTurned(this.clew, this.rig.rotation.y, this.mastStep, this.clewBody);
    this.sheets.set(0, this.clewBody, this.mainBlock, main);

    const jibSide = Math.sign(this.jibVisual) || s.jibSide;
    this.jib.clewPoint(this.clew);
    fromTurned(
      this.clew,
      this.jibPivot.rotation.y,
      this.jibPivot.position,
      this.clewBody,
    );
    this.jibTrack.x = jibSide * 0.15;
    this.sheets.set(
      1,
      this.clewBody,
      this.jibTrack,
      this.genUp ? this.jibTrack : hand,
    );

    if (this.genUp) this.sheets.set(2, this.genClew, hand);
    else this.sheets.hide(2);
    this.sheets.commit();
  }
}
