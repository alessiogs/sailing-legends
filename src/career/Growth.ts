/**
 * How a pool sailor grows between Seasons: a seeded age curve shaped by personality. Pure, no text (ADR 0001).
 * Younger sailors improve faster; each attribute moves by a personality's usual gain plus a seeded random swing
 * (small for a steady sailor like Giulia, large for Marco's speed), all scaled by the curve and kept within 0..1.
 * A sailor is matched by `id`; one without a personality of their own grows like a typical young sailor.
 */
import { clamp, rng } from "../core/math";
import type { SailorProfile } from "../sailors/Sailors";
import { mixSeed } from "./Seeds";

type Attribute = "technique" | "tactics" | "speed" | "discipline";
/** In the order the random swings are drawn (fixed, so a seed always gives the same growth). */
const ATTRIBUTES: readonly Attribute[] = ["technique", "tactics", "speed", "discipline"];

/** Per attribute: the usual gain in a Season at full growth, and how far a Season's gain may swing around it. */
type Personality = Record<Attribute, { gain: number; swing: number }>;

const TYPICAL: Personality = {
  technique: { gain: 0.012, swing: 0.01 }, tactics: { gain: 0.012, swing: 0.01 },
  speed: { gain: 0.012, swing: 0.01 }, discipline: { gain: 0.012, swing: 0.01 },
};

/** The Rivals' personalities: Luca improves in tactics, Giulia steadily in everything, Marco fast but erratic in speed. */
const PERSONALITIES: Readonly<Record<string, Personality>> = {
  luca: {
    technique: { gain: 0.009, swing: 0.006 }, tactics: { gain: 0.03, swing: 0.006 },
    speed: { gain: 0.009, swing: 0.006 }, discipline: { gain: 0.009, swing: 0.006 },
  },
  giulia: {
    technique: { gain: 0.015, swing: 0.003 }, tactics: { gain: 0.015, swing: 0.003 },
    speed: { gain: 0.015, swing: 0.003 }, discipline: { gain: 0.015, swing: 0.003 },
  },
  marco: {
    technique: { gain: 0.007, swing: 0.01 }, tactics: { gain: 0.012, swing: 0.01 },
    speed: { gain: 0.03, swing: 0.03 }, discipline: { gain: 0.007, swing: 0.01 },
  },
};

/** Growth is full at 11 and under, and fades to a quarter from 16 on. `age` is the sailor's age in the Season closing. */
export function growthFactor(age: number): number {
  return clamp((17 - age) / 6, 0.25, 1);
}

const MIN_VALUE = 0.05;
const MAX_VALUE = 0.99;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The sailor after one more Season, at `age` (the age they have in the Season that closes). `seed` should be mixed from
 * the Career seed, the Season and the sailor's place in the pool, so each sailor and Season swing differently.
 */
export function growSailor<T extends SailorProfile>(sailor: T, age: number, seed: number): T {
  const personality = PERSONALITIES[sailor.id] ?? TYPICAL;
  const factor = growthFactor(age);
  const rand = rng(seed);
  const grown: T = { ...sailor };
  for (const a of ATTRIBUTES) {
    const { gain, swing } = personality[a];
    const delta = (gain + (rand() * 2 - 1) * swing) * factor;
    grown[a] = round3(clamp(sailor[a] + delta, MIN_VALUE, MAX_VALUE));
  }
  return grown;
}

/** The seed of one sailor's growth in one Season. */
export const growthSeed = (careerSeed: number, season: number, poolIndex: number) => mixSeed(careerSeed, 0x6120, season, poolIndex);
