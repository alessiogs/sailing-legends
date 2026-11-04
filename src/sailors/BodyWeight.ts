/**
 * Body weight: a sailor's mass in kg from their age and Build. Pure, no browser or Babylon. The player picks a Build
 * (light, average, heavy); an AI sailor's comes from their id (as their looks do), so the sailor pool's draws do not move.
 */

/** The player's choice of Build. */
export type Build = "light" | "average" | "heavy";
export const BUILDS: readonly Build[] = ["light", "average", "heavy"];

/** The body weight factor of each Build: up to 15% either side of the average for the age. */
export const BUILD_FACTOR: Readonly<Record<Build, number>> = {
  light: 0.85,
  average: 1,
  heavy: 1.15,
};

export function isBuild(value: unknown): value is Build {
  return typeof value === "string" && Object.hasOwn(BUILD_FACTOR, value);
}

/** Average body weight (kg) at these ages; in between it is interpolated, outside it is flat. */
const AGE_KG: readonly (readonly [number, number])[] = [
  [8, 30],
  [11, 42],
  [14, 52],
  [16, 60],
  [18, 66],
  [20, 72],
];

/** Body weight in kg of a sailor of `age` with Build factor `factor` (0.85..1.15; 1 is average). */
export function bodyWeightKg(age: number, factor = 1): number {
  const first = AGE_KG[0],
    last = AGE_KG[AGE_KG.length - 1];
  let base = last[1];
  if (age <= first[0]) base = first[1];
  else if (age < last[0]) {
    const i = AGE_KG.findIndex(([a]) => a > age);
    const [a0, k0] = AGE_KG[i - 1],
      [a1, k1] = AGE_KG[i];
    base = k0 + ((k1 - k0) * (age - a0)) / (a1 - a0);
  }
  return base * factor;
}

/** An AI sailor's Build factor, 0.85..1.15, from a hash of their id (FNV-1a with an avalanche). */
export function buildFactorOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return 0.85 + 0.3 * ((h >>> 0) / 0x100000000);
}
