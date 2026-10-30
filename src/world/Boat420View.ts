import {
  Color3, Mesh, MeshBuilder, Quaternion, TransformNode, Vector3, type InstancedMesh, type LinesMesh, type Scene,
} from "@babylonjs/core";
import { clamp, DEG } from "../core/math";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import { boatMaterial, type BoatLook } from "./boatMaterials";
import { BoatViewBase, sailLook, type BoatMotion } from "./BoatViewBase";
import { SailMesh } from "./SailMesh";
import { block, fromTurned, LineSet, toeStrap } from "./Rigging";
import { DECAL, sailNumberMaterial } from "./SailNumber";
import { limbMesh, setLimb, SailorFigure } from "./SailorFigure";
import { RIG, section420 } from "./pose/boatRig";
import { sailNumber, type BoatCrew } from "./pose/looks";
import type { V3 } from "./pose/reach";
import { sailorPose, type Pose, type PoseInput } from "./pose/sailorPose";

const MAST_Z = RIG["420"].mastZ;
const SPI_COLORS = [new Color3(0.95, 0.25, 0.2), new Color3(0.15, 0.4, 0.9), new Color3(1, 0.8, 0.15), new Color3(0.2, 0.75, 0.45)];
let spiColorIdx = 0;

// Sheet lines: 0 main, 1 jib, 2 spinnaker, 3 and 4 the trapeze handle's two pendants.
const MAIN_BLOCK: V3 = { x: 0, y: -0.1, z: -1.0 };
const FAIRLEAD_X = 0.62, FAIRLEAD_Y = 0.46, FAIRLEAD_Z = 0.1;
const SHEET_COLOR = new Color3(0.93, 0.93, 0.88);
const MAST_STEP: V3 = { x: 0, y: 0, z: MAST_Z };

const MOTION: BoatMotion = { waveHeight: 0.7, pitch: 0.6, roll: 0.4, heelRate: 2.5, heel: 0.8, boomRate: 2.4, rudderDeg: RIG["420"].rudderDeg };

/** Visual of a 420: sloop rig (main + jib), spinnaker on a pole, an articulated Helm hiking and Crew on the trapeze. */
export class Boat420View extends BoatViewBase {
  protected readonly rig: TransformNode;
  protected readonly rudder: TransformNode;
  protected readonly burgee: TransformNode;
  private jibPivot: TransformNode;
  private main: SailMesh;
  private jib: SailMesh;
  private spis: { port: SailMesh; stbd: SailMesh; node: TransformNode };
  private pole: Mesh;
  private helm: SailorFigure;
  private crew: SailorFigure;
  private helmPose: Pose | null = null;
  private crewPose: Pose | null = null;
  private extension: InstancedMesh;
  private handle: InstancedMesh;
  private wire: LinesMesh;
  private jibVisual = 0;
  private sheets: LineSet;
  private spiShown: SailMesh | null = null;
  private readonly clew: V3 = { x: 0, y: 0, z: 0 };
  private readonly clewBody: V3 = { x: 0, y: 0, z: 0 };
  private readonly fairlead: V3 = { x: 0, y: FAIRLEAD_Y, z: FAIRLEAD_Z };
  private readonly cleat: V3 = { x: 0, y: FAIRLEAD_Y - 0.25, z: FAIRLEAD_Z };
  private readonly pendantTop: V3 = { x: 0, y: 0, z: 0 };
  private readonly pendantA: V3 = { x: 0, y: 0, z: 0 };
  private readonly pendantB: V3 = { x: 0, y: 0, z: 0 };

  constructor(scene: Scene, name: string, look: BoatLook, crew: BoatCrew) {
    super(scene, name, MOTION);
    const hullMat = boatMaterial(scene, "420-hull", look.hull, 0.4, true);
    const deckMat = boatMaterial(scene, "420-deck", new Color3(0.93, 0.94, 0.95), 0.3, true);
    const darkMat = boatMaterial(scene, "420-spar", new Color3(0.72, 0.74, 0.77), 0.6);
    const sailMat = boatMaterial(scene, "420-sail", look.sail, 0.05, true);
    const stripeMat = boatMaterial(scene, "420-stripe", look.stripe, 0.2);
    const spiMat = boatMaterial(scene, "420-spi", SPI_COLORS[spiColorIdx++ % SPI_COLORS.length], 0.05, true);

    // --- Hull: lofted sections with a fine bow, open cockpit, foredeck.
    const N = 15;
    const paths: Vector3[][] = [];
    const gunwale: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < N; i++) {
      const { z, wg, yg, yk } = section420(i / (N - 1));
      const wc = wg * 0.72, yc = yk + 0.11;
      gunwale.push({ x: wg, y: yg, z });
      paths.push([
        new Vector3(-wg, yg, z), new Vector3(-wc, yc, z), new Vector3(0, yk, z),
        new Vector3(wc, yc, z), new Vector3(wg, yg, z),
      ]);
    }
    const hull = MeshBuilder.CreateRibbon(`${name}-hull`, { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE }, scene);
    hull.material = hullMat;
    hull.parent = this.body;
    const p0 = paths[0];
    const c0 = new Vector3(0, (p0[0].y + p0[2].y) / 2, p0[0].z);
    const transom = MeshBuilder.CreateRibbon(`${name}-transom`, { pathArray: [p0, p0.map(() => c0)], sideOrientation: Mesh.DOUBLESIDE }, scene);
    transom.material = hullMat;
    transom.parent = this.body;
    // Foredeck between the gunwales from just ahead of the mast to the bow.
    const front = gunwale.filter(g => g.z > MAST_Z - 0.3);
    const deck = MeshBuilder.CreateRibbon(`${name}-deck`, {
      pathArray: [front.map(g => new Vector3(-g.x, g.y + 0.01, g.z)), front.map(g => new Vector3(g.x, g.y + 0.01, g.z))],
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    deck.material = deckMat;
    deck.parent = this.body;
    for (const side of [-1, 1]) {
      const stripe = MeshBuilder.CreateTube(`${name}-stripe${side}`, {
        path: gunwale.map(g => new Vector3(side * (g.x + 0.004), g.y - 0.07, g.z)), radius: 0.025, tessellation: 5,
      }, scene);
      stripe.material = stripeMat;
      stripe.parent = this.body;
      // Side decks.
      const sd = MeshBuilder.CreateRibbon(`${name}-sidedeck${side}`, {
        pathArray: [gunwale.map(g => new Vector3(side * g.x, g.y + 0.01, g.z)), gunwale.map(g => new Vector3(side * Math.max(0, g.x - 0.2), g.y + 0.01, g.z))],
        sideOrientation: Mesh.DOUBLESIDE,
      }, scene);
      sd.material = deckMat;
      sd.parent = this.body;
    }

    // Centreboard and rudder with tiller.
    const board = MeshBuilder.CreateBox(`${name}-board`, { width: 0.025, height: 1.1, depth: 0.42 }, scene);
    board.position.set(0, -0.55, 0.05);
    board.material = darkMat;
    board.parent = this.body;
    this.rudder = new TransformNode(`${name}-rudderPivot`, scene);
    this.rudder.position.set(0, 0.3, -2.12);
    this.rudder.parent = this.body;
    const blade = MeshBuilder.CreateBox(`${name}-rudder`, { width: 0.025, height: 1.0, depth: 0.28 }, scene);
    blade.position.set(0, -0.45, -0.12);
    blade.material = darkMat;
    blade.parent = this.rudder;
    const tiller = MeshBuilder.CreateBox(`${name}-tiller`, { width: 0.035, height: 0.035, depth: 1.1 }, scene);
    tiller.position.set(0, 0.25, 0.55);
    const woodMat = boatMaterial(scene, "420-wood", new Color3(0.62, 0.45, 0.26), 0.1);
    tiller.material = woodMat;
    tiller.parent = this.rudder;

    // --- Rig.
    const mast = MeshBuilder.CreateCylinder(`${name}-mast`, { height: 6.3, diameterTop: 0.045, diameterBottom: 0.07, tessellation: 8 }, scene);
    mast.position.set(0, 3.2, MAST_Z);
    mast.material = darkMat;
    mast.parent = this.body;
    const forestay = MeshBuilder.CreateTube(`${name}-forestay`, { path: [new Vector3(0, 0.45, 1.95), new Vector3(0, 5.0, MAST_Z)], radius: 0.006, tessellation: 4 }, scene);
    forestay.material = darkMat;
    forestay.parent = this.body;
    this.rig = new TransformNode(`${name}-rig`, scene);
    this.rig.position.set(0, 0, MAST_Z);
    this.rig.parent = this.body;
    const boom = MeshBuilder.CreateCylinder(`${name}-boom`, { height: 2.6, diameter: 0.05, tessellation: 6 }, scene);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.95, -1.3);
    boom.material = darkMat;
    boom.parent = this.rig;
    this.main = new SailMesh(scene, `${name}-main`, sailMat, this.rig,
      new Vector3(0, 1.0, -0.04), new Vector3(0, 1.0, -2.55), new Vector3(0, 6.25, 0), new Vector3(0, 6.15, -0.35), 10, 12, undefined,
      { material: sailNumberMaterial(scene, "420", sailNumber(crew.helm.id, "420"), look.sail), vSpan: DECAL["420"].vSpan });

    this.jibPivot = new TransformNode(`${name}-jibPivot`, scene);
    this.jibPivot.position.set(0, 0.45, 1.95);
    this.jibPivot.parent = this.body;
    const head = new Vector3(0, 4.4, -1.45);
    this.jib = new SailMesh(scene, `${name}-jib`, sailMat, this.jibPivot, new Vector3(0, 0.08, -0.02), new Vector3(0, 0.4, -1.8), head, head, 8, 10);

    // Spinnaker: one shape per side, in a frame whose local +X points forward (so the belly goes forward).
    const spiNode = new TransformNode(`${name}-spiNode`, scene);
    spiNode.position.set(0, 0, MAST_Z);
    spiNode.rotation.y = -Math.PI / 2;
    spiNode.parent = this.body;
    const L = (X: number, y: number, Z: number) => new Vector3(Z, y, -X); // boat-frame point -> spi frame
    const spiFor = (side: number) => {
      const headP = L(0, 5.7, 0.35), tackP = L(-side * 0.9, 1.05, 2.5), clewP = L(side * 1.7, 0.95, 0.4);
      return new SailMesh(scene, `${name}-spi${side}`, spiMat, spiNode, tackP, clewP, headP, headP, 10, 12);
    };
    this.spis = { port: spiFor(-1), stbd: spiFor(1), node: spiNode };
    this.pole = MeshBuilder.CreateCylinder(`${name}-pole`, { height: 1, diameter: 0.035, tessellation: 5 }, scene);
    this.pole.material = darkMat;
    this.pole.parent = this.body;

    // --- People: the Helm in the Helm's jacket, the Crew in the stripe colour.
    this.helm = new SailorFigure(scene, `${name}-helm`, this.body, crew.helm, look.jacket);
    this.crew = new SailorFigure(scene, `${name}-crew`, this.body, crew.crew ?? crew.helm, look.stripe);
    this.extension = limbMesh(scene, `${name}-extension`, woodMat, this.body);
    this.handle = limbMesh(scene, `${name}-handle`, boatMaterial(scene, "420-grip", new Color3(0.85, 0.2, 0.15), 0.3), this.body);

    // Toe straps on the floor, the main sheet block, the jib fairleads, and the sheets and handle pendants.
    const strapMat = boatMaterial(scene, "420-strap", new Color3(0.82, 0.82, 0.78), 0.1);
    for (const side of [-1, 1]) {
      toeStrap(scene, `${name}-strap${side}`, strapMat, this.body, 1.1, side * 0.17, -0.06, -0.3);
      block(scene, `${name}-fairlead${side}`, darkMat, this.body, side * FAIRLEAD_X, FAIRLEAD_Y - 0.02, FAIRLEAD_Z);
    }
    block(scene, `${name}-mainblock`, darkMat, this.body, MAIN_BLOCK.x, MAIN_BLOCK.y, MAIN_BLOCK.z);
    this.sheets = new LineSet(scene, `${name}-sheets`, this.body, [3, 3, 2, 3, 3], SHEET_COLOR);
    this.wire = MeshBuilder.CreateLines(`${name}-wire`, { points: [Vector3.Zero(), Vector3.Zero()], updatable: true }, scene);
    this.wire.color = new Color3(0.2, 0.2, 0.22);
    this.wire.parent = this.body;

    this.burgee = this.addBurgee(scene, name, 6.35, MAST_Z, 0.32, stripeMat);

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  protected drawSails(dt: number, s: BoatState, tel: Telemetry) {
    // Main.
    const main = sailLook(tel);
    this.main.shape(main.camber, main.luff, Math.sign(this.boomVisual) || s.boomSide, this.flutter);
    this.main.commit();

    // Jib (stays on its side until the crew moves it: backed jibs show up on the windward side).
    if (tel.jib) {
      const jt = s.jibSide * tel.jib.angle;
      this.jibVisual += clamp(jt - this.jibVisual, -3 * dt, 3 * dt);
      this.jibPivot.rotation.y = -this.jibVisual;
      const jib = sailLook(tel.jib);
      this.jib.shape(jib.camber, jib.luff, Math.sign(this.jibVisual) || s.jibSide, this.flutter + 1);
      this.jib.commit();
    }

    // Spinnaker and pole.
    const h = s.spiHoist;
    const showPort = h > 0.03 && s.spiSide < 0, showStbd = h > 0.03 && s.spiSide > 0;
    this.spis.port.mesh.isVisible = showPort;
    this.spis.stbd.mesh.isVisible = showStbd;
    const spi = showPort ? this.spis.port : showStbd ? this.spis.stbd : null;
    this.spiShown = spi && tel.spi ? spi : null;
    if (spi && tel.spi) {
      const collapse = tel.spi.collapsed || tel.spi.wrongSide ? 0.8 : tel.spi.trimState === "luffing" ? 0.5 : 0;
      spi.shape(clamp(1.2 - collapse, 0.2, 1.2), collapse, 1, this.flutter + 2, h, 0.32);
      spi.commit();
      // Sheet trim swings the whole sail around the mast a little.
      this.spis.node.rotation.y = -Math.PI / 2 - s.spiSide * (tel.spi.angle - 60 * DEG) * 0.35;
    }
    this.pole.isVisible = h > 0.1;
    if (this.pole.isVisible) {
      const a = new Vector3(0, 1.1, MAST_Z), b = new Vector3(-s.spiSide * 0.9, 1.05, MAST_Z + 2.3 * Math.min(1, h * 1.5));
      const mid = a.add(b).scale(0.5), d = b.subtract(a);
      this.pole.position.copyFrom(mid);
      this.pole.scaling.y = d.length();
      if (!this.pole.rotationQuaternion) this.pole.rotationQuaternion = new Quaternion();
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), d.normalize(), this.pole.rotationQuaternion);
    }
  }

  protected placeSailors(dt: number, s: BoatState, tel: Telemetry) {
    // Both sailors are on the crew's side (the windward side once the crew has moved across).
    const common: Omit<PoseInput, "role" | "height"> = {
      classId: "420", crewSide: s.crewSide, crewOut: s.crewOut, boomSide: s.boomSide, spiHoist: s.spiHoist,
      heelDeg: tel.heelDeg, sideForce: tel.sideForce, tiller: -s.rudder,
    };
    const helm = this.helmPose = sailorPose({ ...common, role: "helm", height: this.helm.height }, this.helmPose, dt);
    const crew = this.crewPose = sailorPose({ ...common, role: "crew", height: this.crew.height }, this.crewPose, dt);
    this.helm.update(helm, this.sailorsNear);
    this.crew.update(crew, this.sailorsNear);
    setLimb(this.extension, helm.extension!.base, helm.extension!.end, 0.026);
    // Trapeze wire from the hounds to the harness when the crew is out, with the handle on it and its two pendants.
    this.wire.isVisible = crew.onWire;
    this.handle.setEnabled(crew.onWire);
    if (crew.onWire) {
      const top = RIG["420"].hounds!;
      MeshBuilder.CreateLines("", { points: [new Vector3(top.x, top.y, top.z), new Vector3(crew.harness.x, crew.harness.y, crew.harness.z)], instance: this.wire });
      const g = crew.targets.handle!;
      this.pendantA.x = g.x - 0.1; this.pendantA.y = g.y; this.pendantA.z = g.z;
      this.pendantB.x = g.x + 0.1; this.pendantB.y = g.y; this.pendantB.z = g.z;
      setLimb(this.handle, this.pendantA, this.pendantB, 0.032);
      // The pendants meet on the wire 0.25 m above the bar.
      const dx = top.x - g.x, dy = top.y - g.y, dz = top.z - g.z, k = 0.25 / (Math.hypot(dx, dy, dz) || 1);
      this.pendantTop.x = g.x + dx * k; this.pendantTop.y = g.y + dy * k; this.pendantTop.z = g.z + dz * k;
      this.sheets.set(3, this.pendantA, this.pendantTop, this.pendantTop);
      this.sheets.set(4, this.pendantB, this.pendantTop, this.pendantTop);
    } else {
      this.sheets.hide(3);
      this.sheets.hide(4);
    }
    this.drawSheets(s, helm, crew);
    // The hull rocks while either sailor crosses it.
    this.rollHull(Math.abs(helm.hullRoll) > Math.abs(crew.hullRoll) ? helm.hullRoll : crew.hullRoll);
  }

  /** The main sheet to the Helm's hand, the jib sheet through the leeward fairlead and the spinnaker sheet to the Crew's. */
  private drawSheets(s: BoatState, helm: Pose, crew: Pose) {
    const main = helm.targets.sheet ?? MAIN_BLOCK, hand = crew.targets.sheet ?? MAIN_BLOCK;
    this.main.clewPoint(this.clew);
    fromTurned(this.clew, this.rig.rotation.y, MAST_STEP, this.clewBody);
    this.sheets.set(0, this.clewBody, MAIN_BLOCK, main);

    const jibSide = Math.sign(this.jibVisual) || s.jibSide;
    this.fairlead.x = jibSide * FAIRLEAD_X;
    this.cleat.x = this.fairlead.x * 0.6;
    this.jib.clewPoint(this.clew);
    fromTurned(this.clew, this.jibPivot.rotation.y, this.jibPivot.position, this.clewBody);
    // With the spinnaker up the Crew's hands are on its sheet: the jib sheet ends in a cleat beside the fairlead.
    this.sheets.set(1, this.clewBody, this.fairlead, this.spiShown ? this.cleat : hand);

    if (this.spiShown) {
      this.spiShown.clewPoint(this.clew);
      fromTurned(this.clew, this.spis.node.rotation.y, MAST_STEP, this.clewBody);
      this.sheets.set(2, this.clewBody, hand);
    } else {
      this.sheets.hide(2);
    }
    this.sheets.commit();
  }
}
