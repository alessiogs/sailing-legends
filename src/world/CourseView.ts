import {
  Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type LinesMesh, type Scene,
} from "@babylonjs/core";
import type { Course, Point } from "../race/Course";
import { surfaceAt, type Wave } from "./Waves";

const matCache = new Map<string, StandardMaterial>();
function smat(scene: Scene, name: string, c: Color3, emissive = 0) {
  const cached = matCache.get(name);
  if (cached && cached.getScene() === scene) return cached;
  const m = new StandardMaterial(name, scene);
  matCache.set(name, m);
  m.diffuseColor = c;
  m.specularColor = new Color3(0.25, 0.25, 0.25);
  if (emissive) m.emissiveColor = c.scale(emissive);
  return m;
}

type Floating = { node: TransformNode; p: Point; bob: number };

/** Marks, committee boat, start/finish lines and the "next mark" beacon. */
export class CourseView {
  private floats: Floating[] = [];
  private startLine: LinesMesh;
  private finishLine: LinesMesh;
  private beacon: Mesh;
  private beaconTarget: Point | null = null;

  constructor(private scene: Scene, private course: Course) {
    const orange = smat(scene, "markOrange", new Color3(1, 0.42, 0.05), 0.25);
    const yellow = smat(scene, "markYellow", new Color3(1, 0.82, 0.1), 0.2);
    const blue = smat(scene, "markBlue", new Color3(0.1, 0.35, 0.9), 0.2);
    const white = smat(scene, "white", new Color3(0.95, 0.95, 0.95));
    const dark = smat(scene, "darkHull", new Color3(0.15, 0.17, 0.2));

    const legs = course.legs;
    for (const leg of legs) {
      if (leg.kind === "mark") this.addInflatable(leg.mark, leg.name.includes("1") ? orange : yellow, 1.6, 1.5);
      else {
        this.addFlagBuoy(leg.line.a, blue);
        this.addFlagBuoy(leg.line.b, blue);
      }
    }
    this.addInflatable(course.pin, orange, 0.9, 0.9);
    this.addCommittee(course.committee, white, dark, orange);

    const y = 0.28;
    this.startLine = MeshBuilder.CreateDashedLines("startLine", {
      points: [new Vector3(course.start.a.x, y, course.start.a.z), new Vector3(course.start.b.x, y, course.start.b.z)],
      dashNb: 40, dashSize: 2, gapSize: 1,
    }, scene);
    this.startLine.color = new Color3(1, 1, 1);
    const fin = legs.find(l => l.kind === "finish");
    const fl = fin && fin.kind === "finish" ? fin.line : course.start;
    this.finishLine = MeshBuilder.CreateDashedLines("finishLine", {
      points: [new Vector3(fl.a.x, y, fl.a.z), new Vector3(fl.b.x, y, fl.b.z)], dashNb: 24, dashSize: 2, gapSize: 1,
    }, scene);
    this.finishLine.color = new Color3(0.4, 0.7, 1);
    this.finishLine.isVisible = false;

    this.beacon = MeshBuilder.CreateCylinder("beacon", { height: 1.1, diameterTop: 0.9, diameterBottom: 0, tessellation: 4 }, scene);
    this.beacon.material = smat(scene, "beaconMat", new Color3(0.2, 1, 0.55), 0.9);
    this.beacon.isPickable = false;
  }

  private addInflatable(p: Point, m: StandardMaterial, h: number, d: number) {
    const node = new TransformNode("mark", this.scene);
    const body = MeshBuilder.CreateCylinder("markBody", { height: h, diameterTop: d * 0.82, diameterBottom: d, tessellation: 20 }, this.scene);
    body.position.y = h / 2 - 0.15;
    body.material = m;
    body.parent = node;
    const band = MeshBuilder.CreateTorus("markBand", { diameter: d * 0.93, thickness: 0.06, tessellation: 24 }, this.scene);
    band.position.y = h * 0.62;
    band.material = smat(this.scene, "band", new Color3(0.95, 0.95, 0.95));
    band.parent = node;
    this.floats.push({ node, p, bob: 0.9 });
  }

  private addFlagBuoy(p: Point, m: StandardMaterial) {
    const node = new TransformNode("finishBuoy", this.scene);
    const ball = MeshBuilder.CreateSphere("fb", { diameter: 0.8, segments: 12 }, this.scene);
    ball.position.y = 0.25;
    ball.material = m;
    ball.parent = node;
    const pole = MeshBuilder.CreateCylinder("fbPole", { height: 2.2, diameter: 0.05 }, this.scene);
    pole.position.y = 1.4;
    pole.parent = node;
    const flag = MeshBuilder.CreatePlane("fbFlag", { width: 0.6, height: 0.4, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    flag.position.set(0, 2.25, 0.3);
    flag.rotation.y = Math.PI / 2;
    flag.material = m;
    flag.parent = node;
    this.floats.push({ node, p, bob: 0.9 });
  }

  private addCommittee(p: Point, white: StandardMaterial, dark: StandardMaterial, orange: StandardMaterial) {
    const node = new TransformNode("committee", this.scene);
    const hull = MeshBuilder.CreateBox("cbHull", { width: 2.6, height: 1.0, depth: 7.5 }, this.scene);
    hull.position.y = 0.3;
    hull.material = white;
    hull.parent = node;
    const stripe = MeshBuilder.CreateBox("cbStripe", { width: 2.65, height: 0.18, depth: 7.55 }, this.scene);
    stripe.position.y = 0.05;
    stripe.material = dark;
    stripe.parent = node;
    const cabin = MeshBuilder.CreateBox("cbCabin", { width: 2.0, height: 1.2, depth: 2.6 }, this.scene);
    cabin.position.set(0, 1.4, 0.6);
    cabin.material = white;
    cabin.parent = node;
    const mast = MeshBuilder.CreateCylinder("cbMast", { height: 3.2, diameter: 0.08 }, this.scene);
    mast.position.set(0, 3.2, -0.8);
    mast.parent = node;
    const flag = MeshBuilder.CreatePlane("cbFlag", { width: 0.9, height: 0.6, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    flag.position.set(0, 4.4, -1.25);
    flag.rotation.y = Math.PI / 2;
    flag.material = orange;
    flag.parent = node;
    node.rotation.y = this.course.windDir; // anchored, bow into the wind
    this.floats.push({ node, p, bob: 0.4 });
  }

  dispose() {
    for (const f of this.floats) f.node.dispose(false, false);
    this.startLine.dispose();
    this.finishLine.dispose();
    this.beacon.dispose(false, false);
  }

  setTarget(p: Point | null) {
    this.beaconTarget = p;
  }

  update(time: number, waves: Wave[], showStart: boolean, showFinish: boolean) {
    for (const f of this.floats) {
      const s = surfaceAt(waves, f.p.x, f.p.z, time);
      f.node.position.set(f.p.x, s.h * f.bob, f.p.z);
      f.node.rotation.x = Math.atan(s.dz) * 0.5 * f.bob;
      f.node.rotation.z = -Math.atan(s.dx) * 0.5 * f.bob;
    }
    this.startLine.isVisible = showStart;
    this.finishLine.isVisible = showFinish;
    if (this.beaconTarget) {
      this.beacon.isVisible = true;
      this.beacon.position.set(this.beaconTarget.x, 4.2 + Math.sin(time * 2.5) * 0.35, this.beaconTarget.z);
      this.beacon.rotation.y = time * 1.2;
    } else this.beacon.isVisible = false;
  }
}
