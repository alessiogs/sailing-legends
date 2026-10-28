import {
  Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3, type LinesMesh, type Scene,
} from "@babylonjs/core";
import { clamp, DEG, lerpAngle } from "../core/math";
import type { BoatState, Telemetry } from "../sailing/BoatPhysics";
import type { BoatLook } from "./BoatView";
import { SailMesh } from "./SailMesh";
import { surfaceAt, type Wave } from "./Waves";

const mats = new Map<string, StandardMaterial>();
function mat(scene: Scene, name: string, color: Color3, spec = 0.15, twoSided = false): StandardMaterial {
  const key = `420-${name}-${color.toHexString()}`;
  let m = mats.get(key);
  if (!m || m.getScene() !== scene) {
    m = new StandardMaterial(key, scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(spec, spec, spec);
    if (twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    mats.set(key, m);
  }
  return m;
}

const MAST_Z = 0.45;
const SPI_COLORS = [new Color3(0.95, 0.25, 0.2), new Color3(0.15, 0.4, 0.9), new Color3(1, 0.8, 0.15), new Color3(0.2, 0.75, 0.45)];
let spiColorIdx = 0;

/** Visual of a 420: sloop rig (main + jib), spinnaker on a pole, helm hiking and crew on the trapeze. */
export class Boat420View {
  root: TransformNode;
  private body: TransformNode;
  private rig: TransformNode;
  private jibPivot: TransformNode;
  private main: SailMesh;
  private jib: SailMesh;
  private spis: { port: SailMesh; stbd: SailMesh; node: TransformNode };
  private pole: Mesh;
  private rudder: TransformNode;
  private helm: TransformNode;
  private crew: TransformNode;
  private wire: LinesMesh;
  private burgee: TransformNode;
  private boomVisual = 0;
  private jibVisual = 0;
  private heelVisual = 0;
  private flutter = Math.random() * 10;

  constructor(scene: Scene, name: string, look: BoatLook) {
    this.root = new TransformNode(name, scene);
    this.body = new TransformNode(`${name}-body`, scene);
    this.body.parent = this.root;
    const hullMat = mat(scene, "hull", look.hull, 0.4, true);
    const deckMat = mat(scene, "deck", new Color3(0.93, 0.94, 0.95), 0.3, true);
    const darkMat = mat(scene, "spar", new Color3(0.72, 0.74, 0.77), 0.6);
    const sailMat = mat(scene, "sail", look.sail, 0.05, true);
    const jacketMat = mat(scene, "jacket", look.jacket, 0.1);
    const skinMat = mat(scene, "skin", new Color3(0.86, 0.66, 0.52), 0.05);
    const stripeMat = mat(scene, "stripe", look.stripe, 0.2);
    const legMat = mat(scene, "legs", new Color3(0.1, 0.12, 0.2));
    const spiMat = mat(scene, "spi", SPI_COLORS[spiColorIdx++ % SPI_COLORS.length], 0.05, true);

    // --- Hull: lofted sections with a fine bow, open cockpit, foredeck.
    const N = 15;
    const paths: Vector3[][] = [];
    const gunwale: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const z = -2.1 + t * 4.2;
      const base = 0.6 + 0.2 * Math.sin((Math.PI / 2) * Math.min(t / 0.7, 1));
      const taper = t > 0.5 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2))) : 1;
      const wg = Math.max(0.012, base * taper);
      const yg = 0.38 + 0.14 * t * t;
      const yk = -0.15 + 0.3 * Math.pow(t, 3) + 0.03 * Math.pow(1 - t, 2);
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
    tiller.material = mat(scene, "wood", new Color3(0.62, 0.45, 0.26), 0.1);
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
      new Vector3(0, 1.0, -0.04), new Vector3(0, 1.0, -2.55), new Vector3(0, 6.25, 0), new Vector3(0, 6.15, -0.35), 10, 12);

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

    // --- People.
    const person = (id: string, jacket: StandardMaterial) => {
      const node = new TransformNode(`${name}-${id}`, scene);
      node.parent = this.body;
      const legs = MeshBuilder.CreateCapsule(`${name}-${id}-legs`, { radius: 0.09, height: 0.8, tessellation: 6 }, scene);
      legs.position.set(0, 0.32, 0);
      legs.material = legMat;
      legs.parent = node;
      const torso = MeshBuilder.CreateCapsule(`${name}-${id}-torso`, { radius: 0.17, height: 0.68, tessellation: 8 }, scene);
      torso.position.set(0, 0.95, 0);
      torso.material = jacket;
      torso.parent = node;
      const headM = MeshBuilder.CreateSphere(`${name}-${id}-head`, { diameter: 0.23, segments: 8 }, scene);
      headM.position.set(0, 1.42, 0.02);
      headM.material = skinMat;
      headM.parent = node;
      return node;
    };
    this.helm = person("helm", jacketMat);
    this.crew = person("crew", mat(scene, "jacket2", look.stripe, 0.1));
    this.wire = MeshBuilder.CreateLines(`${name}-wire`, { points: [Vector3.Zero(), Vector3.Zero()], updatable: true }, scene);
    this.wire.color = new Color3(0.2, 0.2, 0.22);
    this.wire.parent = this.body;

    this.burgee = new TransformNode(`${name}-burgeePivot`, scene);
    this.burgee.position.set(0, 6.35, MAST_Z);
    this.burgee.parent = this.body;
    const flag = MeshBuilder.CreatePlane(`${name}-burgee`, { width: 0.32, height: 0.1, sideOrientation: Mesh.DOUBLESIDE }, scene);
    flag.rotation.y = Math.PI / 2;
    flag.position.z = -0.16;
    flag.material = stripeMat;
    flag.parent = this.burgee;

    for (const m of this.root.getChildMeshes()) m.isPickable = false;
  }

  update(dt: number, time: number, s: BoatState, tel: Telemetry, waves: Wave[]) {
    this.flutter += dt;
    const surf = surfaceAt(waves, s.x, s.z, time);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const slopeFwd = surf.dx * fx + surf.dz * fz;
    const slopeSide = surf.dx * fz - surf.dz * fx;
    this.root.position.set(s.x, surf.h * 0.7 + 0.02, s.z);
    this.root.rotation.y = s.heading;
    this.heelVisual += (tel.heelDeg - this.heelVisual) * Math.min(1, dt * 2.5);
    this.body.rotation.x = -Math.atan(slopeFwd) * 0.6;
    this.body.rotation.z = -(this.heelVisual * DEG) * 0.8 + Math.atan(slopeSide) * 0.4;

    // Main.
    const target = s.boomSide * tel.boomAngle;
    this.boomVisual += clamp(target - this.boomVisual, -2.4 * dt, 2.4 * dt);
    this.rig.rotation.y = -this.boomVisual;
    const luff = tel.trimState === "luffing" || tel.trimState === "irons" ? clamp(1 - tel.aoa / (6 * DEG), 0.25, 1) : 0;
    this.main.shape(clamp(tel.aoa / (14 * DEG), 0.15, 1) * (1 - luff * 0.7), luff, Math.sign(this.boomVisual) || s.boomSide, this.flutter);
    this.main.commit();

    // Jib (stays on its side until the crew moves it: backed jibs show up on the windward side).
    if (tel.jib) {
      const jt = s.jibSide * tel.jib.angle;
      this.jibVisual += clamp(jt - this.jibVisual, -3 * dt, 3 * dt);
      this.jibPivot.rotation.y = -this.jibVisual;
      const jl = tel.jib.trimState === "luffing" || tel.jib.trimState === "irons" ? clamp(1 - tel.jib.aoa / (6 * DEG), 0.25, 1) : 0;
      this.jib.shape(clamp(tel.jib.aoa / (14 * DEG), 0.15, 1) * (1 - jl * 0.7), jl, Math.sign(this.jibVisual) || s.jibSide, this.flutter + 1);
      this.jib.commit();
    }

    // Spinnaker and pole.
    const h = s.spiHoist;
    const showPort = h > 0.03 && s.spiSide < 0, showStbd = h > 0.03 && s.spiSide > 0;
    this.spis.port.mesh.isVisible = showPort;
    this.spis.stbd.mesh.isVisible = showStbd;
    const spi = showPort ? this.spis.port : showStbd ? this.spis.stbd : null;
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

    this.rudder.rotation.y = -s.rudder * 28 * DEG;

    // People: both on the crew's side (the windward side once the crew has moved across).
    const windward = s.crewSide;
    const need = Math.abs(tel.sideForce);
    const helmHike = clamp(need / 380, 0, 1);
    this.placePerson(this.helm, windward, -1.25, 0.15 + helmHike * 0.9, 0.62);
    const out = s.crewOut;
    const lean = out < 0.5 ? 0.1 + out * 1.6 : 0.9 + (out - 0.5) * 1.3; // radians outward
    this.placePerson(this.crew, windward, 0.05, lean, out > 0.7 ? 0.84 : 0.6);
    // Trapeze wire from the hounds to the harness when the crew is out.
    const onWire = out > 0.6;
    this.wire.isVisible = onWire;
    if (onWire) {
      const ax = windward * (out > 0.7 ? 0.84 : 0.6), ay = 0.42;
      const hx = ax + windward * Math.sin(lean) * 0.95, hy = ay + Math.cos(lean) * 0.95;
      MeshBuilder.CreateLines("", { points: [new Vector3(0, 5.0, MAST_Z), new Vector3(hx, hy, 0.05)], instance: this.wire });
    }

    this.burgee.rotation.y = lerpAngle(this.burgee.rotation.y, tel.awa, Math.min(1, dt * 8));
  }

  /** Feet on the gunwale at (side * footX, z); body leaning outboard by `lean` radians. */
  private placePerson(node: TransformNode, side: number, z: number, lean: number, footX: number) {
    node.position.set(side * footX, 0.42, z);
    node.rotation.z = -side * lean;
    node.rotation.y = side * 0.35;
  }

  dispose() {
    this.root.dispose(false, false);
  }
}
