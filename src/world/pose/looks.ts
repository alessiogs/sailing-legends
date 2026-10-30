/**
 * What a sailor looks like and carries, from the sailor `id` alone (the same every time, the same on every
 * device) and from age. Pure data (colours as [r, g, b] in 0..1, indices), no Babylon.
 */
import type { ClassId } from "../../sailing/BoatClass";

export type Rgb = readonly [number, number, number];

export const SKIN_TONES: readonly Rgb[] = [
  [0.96, 0.8, 0.69], [0.9, 0.7, 0.55], [0.8, 0.6, 0.44], [0.66, 0.46, 0.32], [0.5, 0.34, 0.24], [0.36, 0.24, 0.17],
];
export const HAIR_COLORS: readonly Rgb[] = [
  [0.1, 0.07, 0.05], [0.25, 0.16, 0.1], [0.45, 0.3, 0.16], [0.72, 0.55, 0.28], [0.85, 0.7, 0.4], [0.55, 0.2, 0.1],
];
export const CAP_COLORS: readonly Rgb[] = [
  [0.95, 0.95, 0.95], [0.15, 0.3, 0.7], [0.85, 0.2, 0.2], [0.95, 0.75, 0.15], [0.15, 0.15, 0.18],
];

export type SailorLooks = {
  skin: number; skinColor: Rgb;
  hair: number; hairColor: Rgb;
  /** Index into CAP_COLORS, or null for no cap. */
  cap: number | null; capColor: Rgb | null;
};

/** FNV-1a, finished with an avalanche, so near ids (s1, s2...) give unrelated values. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

export function sailorLooks(id: string): SailorLooks {
  const h = hash(id);
  const skin = h % SKIN_TONES.length;
  const hair = (h >>> 8) % HAIR_COLORS.length;
  const capRoll = (h >>> 16) % (CAP_COLORS.length + 2); // about 2 in 7 sailors wear no cap
  const cap = capRoll < CAP_COLORS.length ? capRoll : null;
  return { skin, skinColor: SKIN_TONES[skin], hair, hairColor: HAIR_COLORS[hair], cap, capColor: cap === null ? null : CAP_COLORS[cap] };
}

/** Age with no age given (an AI sailor without one): a teen. */
export const DEFAULT_FIGURE_AGE = 14;
const HEIGHT_AT_8 = 1.3, ADULT_HEIGHT = 1.75, ADULT_AGE = 16;

/** Height in metres: about 1.30 at 8, growing evenly to an adult 1.75 at 16. */
export function figureHeight(age: number = DEFAULT_FIGURE_AGE): number {
  const t = Math.min(1, Math.max(0, (age - 8) / (ADULT_AGE - 8)));
  return HEIGHT_AT_8 + (ADULT_HEIGHT - HEIGHT_AT_8) * t;
}

/** A placeholder sail number ("ITA 4821") from the Helm's id and the class; Optimist and 420 numbers never meet. */
export function sailNumber(helmId: string, classId: ClassId): string {
  const h = hash(`${classId}:${helmId}`);
  const n = classId === "optimist" ? 100 + (h % 9900) : 10000 + (h % 50000);
  return `ITA ${n}`;
}
