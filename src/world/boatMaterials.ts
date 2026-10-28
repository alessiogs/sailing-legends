import { Color3, StandardMaterial, type Scene } from "@babylonjs/core";
import type { BoatColors } from "../ui/boatColors";
import { SceneCache } from "./sceneCache";

/** A boat's colours as Babylon colours, for its materials. */
export type BoatLook = { hull: Color3; sail: Color3; jacket: Color3; stripe: Color3 };

/** The 3D colours of a boat from its entry in the boat colour table. */
export function boatLook(c: BoatColors): BoatLook {
  return { hull: new Color3(...c.hull), sail: new Color3(...c.sail), jacket: new Color3(...c.jacket), stripe: new Color3(...c.stripe) };
}

/** The one material cache of both boat views: boats with the same look in the same scene share materials. */
const materials = new SceneCache<Scene, StandardMaterial>();

/**
 * The boat material named `<name>-<colour hex>`: `color` diffuse, a grey specular of strength `spec`, and lit on
 * both sides when `twoSided` (hull shells, sails). Made once per scene for each name, colour and finish.
 */
export function boatMaterial(scene: Scene, name: string, color: Color3, spec = 0.15, twoSided = false): StandardMaterial {
  const materialName = `${name}-${color.toHexString()}`;
  return materials.get(scene, `${materialName} ${spec} ${twoSided}`, () => {
    const m = new StandardMaterial(materialName, scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(spec, spec, spec);
    if (twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    return m;
  });
}
