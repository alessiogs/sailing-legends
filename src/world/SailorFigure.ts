import { MeshBuilder, TransformNode, type Material, type Scene } from "@babylonjs/core";

/** A sailor figure's proportions: capsule legs and torso, sphere head, each at a height above the node. */
export type FigureSize = {
  legs: { radius: number; height: number; y: number };
  torso: { radius: number; height: number; y: number };
  head: { diameter: number; y: number };
  /** Legs lie across the boat (sitting in an Optimist) instead of standing up. */
  seated: boolean;
};

export type FigureMaterials = { legs: Material; jacket: Material; skin: Material };

/** A sailor on the boat's `body`: a node named `name` holding `<name>-legs`, `<name>-torso` and `<name>-head`. */
export function sailorFigure(scene: Scene, name: string, body: TransformNode, size: FigureSize, mats: FigureMaterials): TransformNode {
  const node = new TransformNode(name, scene);
  node.parent = body;
  const legs = MeshBuilder.CreateCapsule(`${name}-legs`, { radius: size.legs.radius, height: size.legs.height, tessellation: 6 }, scene);
  if (size.seated) legs.rotation.z = Math.PI / 2;
  legs.position.set(0, size.legs.y, 0);
  legs.material = mats.legs;
  legs.parent = node;
  const torso = MeshBuilder.CreateCapsule(`${name}-torso`, { radius: size.torso.radius, height: size.torso.height, tessellation: 8 }, scene);
  torso.position.set(0, size.torso.y, 0);
  torso.material = mats.jacket;
  torso.parent = node;
  const head = MeshBuilder.CreateSphere(`${name}-head`, { diameter: size.head.diameter, segments: 8 }, scene);
  head.position.set(0, size.head.y, 0.02);
  head.material = mats.skin;
  head.parent = node;
  return node;
}

/**
 * Put a sailor `out` metres from the centreline on `side` (+1 starboard, -1 port), at height `y` and `z` along
 * the boat, leaning outboard by `lean` radians and turned `twist` radians toward that side.
 */
export function placeSailor(node: TransformNode, side: number, out: number, y: number, z: number, lean: number, twist: number) {
  node.position.set(side * out, y, z);
  node.rotation.z = -side * lean;
  node.rotation.y = side * twist;
}
