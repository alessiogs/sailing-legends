import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, Vector3, type InstancedMesh, type Material, type Scene, type TransformNode } from "@babylonjs/core";
import { boatMaterial } from "./boatMaterials";
import { figureHeight, sailorLooks, type FigureWho } from "./pose/looks";
import type { V3 } from "./pose/reach";
import type { Pose } from "./pose/sailorPose";
import { SceneCache } from "./sceneCache";

/**
 * An articulated sailor drawn from instances of two unit shapes (a cylinder and a ball), posed from a `Pose`'s joints.
 * Near the camera it is a pelvis, torso, lifejacket, head, hair or cap, two arms and two legs of two bones each (13
 * meshes, 14 with a cap's brim); far away it is a torso, legs and head (3 meshes). Instances of one shape and material
 * are drawn together, and materials are shared by colour, so sailors cost few draw calls.
 */

// Body proportions, as shares of the figure's height (the joints themselves come from the pose).
const TORSO_W = 0.24, TORSO_D = 0.14, PELVIS_W = 0.2, PELVIS_H = 0.12, VEST_W = 0.275, VEST_D = 0.175;
const HEAD = 0.13, THIGH_W = 0.085, SHIN_W = 0.06, UPPER_W = 0.055, FORE_W = 0.045;

const SHORTS = new Color3(0.1, 0.12, 0.2);
const VEST = new Color3(0.9, 0.9, 0.86);

type Kind = "limb" | "ball";

/** The unit shape for a kind and material, made once per scene and hidden: its instances are what is drawn. */
const sources = new SceneCache<Scene, Mesh>();
function source(scene: Scene, kind: Kind, mat: Material): Mesh {
  return sources.get(scene, `${kind} ${mat.uniqueId}`, () => {
    // A limb is a cylinder from its base (the origin) up to y = 1.
    const m = kind === "limb"
      ? MeshBuilder.CreateCylinder(`figure-limb-${mat.name}`, { height: 1, diameter: 1, tessellation: 6 }, scene)
      : MeshBuilder.CreateSphere(`figure-ball-${mat.name}`, { diameter: 1, segments: 6 }, scene);
    if (kind === "limb") m.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
    m.material = mat;
    m.isVisible = false;
    m.isPickable = false;
    return m;
  });
}

function ballMesh(scene: Scene, name: string, material: Material, parent: TransformNode): InstancedMesh {
  const m = source(scene, "ball", material).createInstance(name);
  m.rotationQuaternion = new Quaternion();
  m.parent = parent;
  m.isPickable = false;
  return m;
}

/** An instance of the unit limb shape in `material` (cylinder of width 1 from the origin up to y = 1), for rigging such as the tiller extension; place it with `setLimb`. */
export function limbMesh(scene: Scene, name: string, material: Material, parent: TransformNode): InstancedMesh {
  const m = source(scene, "limb", material).createInstance(name);
  m.rotationQuaternion = new Quaternion();
  m.parent = parent;
  m.isPickable = false;
  return m;
}

const UP = Vector3.Up();
const dir = new Vector3();
const off = new Vector3();
const mat = new Matrix();
const ax = new Vector3(), ay = new Vector3(), az = new Vector3();

/** A cylinder of width `w` from `a` to `b`. */
export function setLimb(m: InstancedMesh, a: V3, b: V3, w: number) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  m.position.set(a.x, a.y, a.z);
  if (len < 1e-5) { m.scaling.set(w, 1e-5, w); return; }
  m.scaling.set(w, len, w);
  dir.set(dx / len, dy / len, dz / len);
  Quaternion.FromUnitVectorsToRef(UP, dir, m.rotationQuaternion!);
}

/** An ellipsoid of size `sx`, `sy`, `sz` at `c`, keeping the rotation already set. */
function setBall(m: InstancedMesh, c: V3, sx: number, sy: number, sz: number) {
  m.position.set(c.x, c.y, c.z);
  m.scaling.set(sx, sy, sz);
}

const at = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** `p` plus a vector (x, y, z) given in the frame turned by `q`. */
function offset(p: V3, q: Quaternion, x: number, y: number, z: number): V3 {
  off.set(x, y, z).rotateByQuaternionToRef(q, off);
  return { x: p.x + off.x, y: p.y + off.y, z: p.z + off.z };
}

/** A Babylon colour from a look's channels. */
const colorOf = (rgb: readonly [number, number, number]) => new Color3(rgb[0], rgb[1], rgb[2]);

export class SailorFigure {
  /** The figure's height in metres. */
  readonly height: number;
  private readonly all: InstancedMesh[] = [];
  private readonly nearOnly: InstancedMesh[] = [];
  private readonly torso: InstancedMesh; private readonly legs: InstancedMesh; private readonly head: InstancedMesh;
  private readonly pelvis: InstancedMesh; private readonly vest: InstancedMesh; private readonly hat: InstancedMesh;
  private readonly brim: InstancedMesh | null;
  private readonly upperL: InstancedMesh; private readonly upperR: InstancedMesh; private readonly foreL: InstancedMesh; private readonly foreR: InstancedMesh;
  private readonly thighL: InstancedMesh; private readonly thighR: InstancedMesh; private readonly shinL: InstancedMesh; private readonly shinR: InstancedMesh;
  private readonly torsoQ = new Quaternion();
  private readonly pelvisQ = new Quaternion();
  private readonly headQ = new Quaternion();
  private near: boolean | null = null;

  /** A sailor in a `jacket` colour on `parent`, looking and sized by who they are (`sailorLooks`, `figureHeight`). */
  constructor(scene: Scene, name: string, parent: TransformNode, who: FigureWho, jacket: Color3) {
    this.height = figureHeight(who.age);
    const looks = sailorLooks(who.id);
    const skin = boatMaterial(scene, "skin", colorOf(looks.skinColor), 0.05);
    const hair = boatMaterial(scene, "hair", colorOf(looks.hairColor), 0.05);
    const jacketMat = boatMaterial(scene, "jacket", jacket, 0.1);
    const shorts = boatMaterial(scene, "shorts", SHORTS);
    const vest = boatMaterial(scene, "vest", VEST, 0.1);
    const make = (kind: Kind, material: Material, part: string, nearOnly = true): InstancedMesh => {
      const m = kind === "limb" ? limbMesh(scene, `${name}-${part}`, material, parent) : ballMesh(scene, `${name}-${part}`, material, parent);
      this.all.push(m);
      if (nearOnly) this.nearOnly.push(m);
      return m;
    };
    // The far figure.
    this.torso = make("ball", jacketMat, "torso", false);
    this.legs = make("limb", shorts, "legs", false);
    this.head = make("ball", skin, "head", false);
    // The rest.
    this.pelvis = make("ball", shorts, "pelvis");
    this.vest = make("ball", vest, "vest");
    this.hat = make("ball", looks.capColor ? boatMaterial(scene, "cap", colorOf(looks.capColor), 0.1) : hair, "hat");
    this.brim = looks.capColor ? make("ball", boatMaterial(scene, "cap", colorOf(looks.capColor), 0.1), "brim") : null;
    this.upperL = make("limb", jacketMat, "upperL"); this.upperR = make("limb", jacketMat, "upperR");
    this.foreL = make("limb", skin, "foreL"); this.foreR = make("limb", skin, "foreR");
    this.thighL = make("limb", shorts, "thighL"); this.thighR = make("limb", shorts, "thighR");
    this.shinL = make("limb", skin, "shinL"); this.shinR = make("limb", skin, "shinR");
  }

  /** How many meshes the figure draws, near and far. */
  get meshCount(): { near: number; far: number } {
    return { near: this.all.length - 1, far: this.all.length - this.nearOnly.length };
  }

  /** Pose the figure; `near` draws every joint, else a torso, legs and head. */
  update(pose: Pose, near: boolean) {
    if (near !== this.near) {
      this.near = near;
      for (const m of this.nearOnly) m.setEnabled(near);
      this.legs.setEnabled(!near);
    }
    const H = this.height, j = pose.joints;
    // Torso frame: y along the spine, x across the shoulders.
    ay.set(j.chest.x - j.pelvis.x, j.chest.y - j.pelvis.y, j.chest.z - j.pelvis.z).normalize();
    ax.set(j.shoulderR.x - j.shoulderL.x, j.shoulderR.y - j.shoulderL.y, j.shoulderR.z - j.shoulderL.z).normalize();
    Vector3.CrossToRef(ax, ay, az).normalize();
    Vector3.CrossToRef(ay, az, ax);
    Matrix.FromXYZAxesToRef(ax, ay, az, mat);
    Quaternion.FromRotationMatrixToRef(mat, this.torsoQ);
    const torsoLen = Math.hypot(j.chest.x - j.pelvis.x, j.chest.y - j.pelvis.y, j.chest.z - j.pelvis.z);
    // Torso ball: from the pelvis a little past the shoulders.
    this.torso.rotationQuaternion!.copyFrom(this.torsoQ);
    setBall(this.torso, at(j.pelvis, j.chest, 0.5), TORSO_W * H, torsoLen * 1.12, TORSO_D * H);
    // Head, with hair or a cap on it.
    Quaternion.RotationYawPitchRollToRef(pose.yaw + pose.head.yaw, pose.head.pitch, 0, this.headQ);
    this.head.rotationQuaternion!.copyFrom(this.headQ);
    setBall(this.head, j.head, HEAD * H, HEAD * H * 1.08, HEAD * H);

    if (!near) {
      // Legs as one block from the pelvis to the feet.
      setLimb(this.legs, j.pelvis, at(j.footL, j.footR, 0.5), 0.15 * H);
      return;
    }
    Quaternion.RotationYawPitchRollToRef(pose.yaw, 0, 0, this.pelvisQ);
    this.pelvis.rotationQuaternion!.copyFrom(this.pelvisQ);
    setBall(this.pelvis, j.pelvis, PELVIS_W * H, PELVIS_H * H, TORSO_D * H);
    this.vest.rotationQuaternion!.copyFrom(this.torsoQ);
    setBall(this.vest, at(j.pelvis, j.chest, 0.6), VEST_W * H, torsoLen * 0.72, VEST_D * H);
    this.hat.rotationQuaternion!.copyFrom(this.headQ);
    if (this.brim) {
      setBall(this.hat, offset(j.head, this.headQ, 0, 0.032 * H, -0.004 * H), 0.138 * H, 0.09 * H, 0.14 * H);
      this.brim.rotationQuaternion!.copyFrom(this.headQ);
      setBall(this.brim, offset(j.head, this.headQ, 0, 0.026 * H, 0.078 * H), 0.1 * H, 0.012 * H, 0.085 * H);
    } else {
      setBall(this.hat, offset(j.head, this.headQ, 0, 0.026 * H, -0.01 * H), 0.138 * H, 0.1 * H, 0.14 * H);
    }
    setLimb(this.upperL, j.shoulderL, j.elbowL, UPPER_W * H); setLimb(this.foreL, j.elbowL, j.handL, FORE_W * H);
    setLimb(this.upperR, j.shoulderR, j.elbowR, UPPER_W * H); setLimb(this.foreR, j.elbowR, j.handR, FORE_W * H);
    setLimb(this.thighL, j.hipL, j.kneeL, THIGH_W * H); setLimb(this.shinL, j.kneeL, j.footL, SHIN_W * H);
    setLimb(this.thighR, j.hipR, j.kneeR, THIGH_W * H); setLimb(this.shinR, j.kneeR, j.footR, SHIN_W * H);
  }
}
