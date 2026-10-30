import { Color3, DynamicTexture, StandardMaterial, type Scene } from "@babylonjs/core";
import type { ClassId } from "../sailing/BoatClass";
import { SceneCache } from "./sceneCache";

/**
 * The mainsail's decal: the class symbol above the sail number ("ITA 4821"), drawn once on a small dynamic texture
 * and shared by both faces of the sail (see `SailMesh`). The number is data, not words, so it has no catalog key.
 */

const SIZE = 256;

/** The part of the mainsail's luff (from the foot) the texture covers, and the sail's size there in metres. */
export const DECAL: Record<ClassId, { vSpan: number; width: number; height: number }> = {
  optimist: { vSpan: 0.8, width: 1.9, height: 1.65 },
  "420": { vSpan: 0.5, width: 1.9, height: 2.6 },
};

const textures = new SceneCache<Scene, StandardMaterial>();

/** Dark ink on a light sail, white on a dark one. */
function inkFor(sail: Color3): string {
  const lum = 0.299 * sail.r + 0.587 * sail.g + 0.114 * sail.b;
  return lum > 0.5 ? "#16213f" : "#f4f4f0";
}

const css = (c: Color3) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

/** The Optimist's mark: a ring with a little sail inside, in plain strokes. */
function optimistSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string) {
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = r * 0.22;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.1, cy - r * 0.62); ctx.lineTo(cx - r * 0.1, cy + r * 0.38); ctx.lineTo(cx + r * 0.55, cy + r * 0.38);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(cx - r * 0.42, cy + r * 0.38, r * 1.0, r * 0.1);
}

/** The 420's mark: a bold, slanted "420" between two bars. */
function symbol420(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string) {
  ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `italic 900 ${Math.round(r * 1.5)}px sans-serif`;
  ctx.fillText("420", cx, cy);
  ctx.fillRect(cx - r * 1.1, cy - r * 0.95, r * 2.2, r * 0.12);
  ctx.fillRect(cx - r * 1.1, cy + r * 0.83, r * 2.2, r * 0.12);
}

/**
 * The sail material of one boat: the sail's colour with the symbol and `number` ("ITA 4821") on it, culled from
 * behind (a sail's two faces are two meshes). Made once per scene for each class, number and colour.
 */
export function sailNumberMaterial(scene: Scene, classId: ClassId, number: string, sail: Color3): StandardMaterial {
  return textures.get(scene, `${classId} ${number} ${sail.toHexString()}`, () => {
    const tex = new DynamicTexture(`sailNumber-${number}`, { width: SIZE, height: SIZE }, scene, true);
    tex.wrapU = tex.wrapV = DynamicTexture.CLAMP_ADDRESSMODE;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const d = DECAL[classId];
    const ink = inkFor(sail);
    ctx.fillStyle = css(sail);
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Metres to pixels differ across and up, so glyphs are drawn through a scale that undoes the stretch.
    const px = SIZE / d.width, py = SIZE / d.height;
    ctx.save();
    ctx.scale(1, py / px);
    const y = (m: number) => (SIZE - m * py) * (px / py); // metres above the foot -> canvas y
    const digit = classId === "optimist" ? 0.27 : 0.36; // digit height (m)
    const symbolR = (classId === "optimist" ? 0.2 : 0.22) * px;
    const symbolAt = classId === "optimist" ? 1.2 : 1.65;
    (classId === "optimist" ? optimistSymbol : symbol420)(ctx, SIZE / 2, y(symbolAt), symbolR, ink);
    // "ITA" small above the figures.
    const [nation, figures] = number.split(" ");
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(digit * 0.8 * px / 0.72)}px sans-serif`;
    ctx.fillText(nation, SIZE / 2, y(symbolAt - 0.55));
    ctx.font = `bold ${Math.round(digit * px / 0.72)}px sans-serif`;
    ctx.fillText(figures ?? "", SIZE / 2, y(symbolAt - 0.55 - digit * 1.5), SIZE * 0.92);
    ctx.restore();
    tex.update(true);

    const m = new StandardMaterial(`sailNumber-${classId}-${number}`, scene);
    m.diffuseTexture = tex;
    m.diffuseColor = Color3.White();
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    m.backFaceCulling = true;
    return m;
  });
}
