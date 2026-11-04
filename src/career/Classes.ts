/**
 * The classes of a Career: which a player of a given age may sail next Season, which one each Rival sails, and how well a
 * sailor fits a class by age and body weight. Pure data and rules, no text (ADR 0001): the UI words the choice.
 */
import { rng } from "../core/math";
import {
  CLASSES,
  ILCA_RIGS,
  isTwoPerson,
  type BoatClass,
  type ClassId,
  type IlcaRig,
} from "../sailing/BoatClass";
import { bodyWeightKg, buildFactorOf } from "../sailors/BodyWeight";
import { ageInSeason } from "./Ages";
import type { CareerState } from "./CareerSave";
import { mixSeed } from "./Seeds";
import {
  OPTIMIST_MAX_KG,
  PAIR_IDEAL_KG,
  playerKgNow,
  RIG_IDEAL_KG,
  rigWeightHint,
  suggestedRig,
  type PairHint,
} from "./Weight";

/** The two-person classes: the player picks a Partner, a Role and a Control mode. */
export type PairClassId = "420" | "29er" | "49er";

/** A class as the Career sails it: the class and, in the ILCA, the rig (`null` in every other class). */
export type ClassPath = { classId: ClassId; rig: IlcaRig | null };

const OPTIMIST: ClassPath = { classId: "optimist", rig: null };
const I420: ClassPath = { classId: "420", rig: null };
const I29ER: ClassPath = { classId: "29er", rig: null };
const I49ER: ClassPath = { classId: "49er", rig: null };
const ilcaPath = (rig: IlcaRig): ClassPath => ({ classId: "ilca", rig });

/** Every class path in the order the Season-end screen lists them: the ILCA once per rig. */
export const CLASS_PATHS: readonly ClassPath[] = [
  OPTIMIST,
  I420,
  ilcaPath(4),
  ilcaPath(6),
  ilcaPath(7),
  I29ER,
  I49ER,
];

export const samePath = (a: ClassPath, b: ClassPath): boolean =>
  a.classId === b.classId && a.rig === b.rig;

/** The path of the class the Career is sailing now. */
export const pathOf = (
  state: Pick<CareerState, "classId" | "rig">,
): ClassPath => ({ classId: state.classId, rig: state.rig });

/** The boat class of a path: the ILCA by its rig. */
export function boatClassOf(path: ClassPath): BoatClass {
  return path.rig === null ? CLASSES[path.classId] : ILCA_RIGS[path.rig];
}

/** Whether the class is sailed by a Pair. */
export const isPairClass = (classId: ClassId): classId is PairClassId =>
  isTwoPerson(CLASSES[classId]);

/**
 * The ages (inclusive) that sail each class: the Optimist until its Age limit, the 420 and the 29er into the Under 19
 * band, the ILCA from about 11 and the 49er from about 18. A player may always stay in the class they are in.
 */
export const CLASS_AGES: Readonly<
  Record<ClassId, { from: number; to?: number }>
> = {
  optimist: { from: 0, to: CLASSES.optimist.ageLimit },
  "420": { from: 0, to: 19 },
  ilca: { from: 11 },
  "29er": { from: 12, to: 19 },
  "49er": { from: 18 },
};

/** Whether a sailor of this age fits the class's age window. */
export function ageFits(classId: ClassId, age: number): boolean {
  const { from, to } = CLASS_AGES[classId];
  return age >= from && (to === undefined || age <= to);
}

/** The body weights (kg) a sailor suits for a path: the rig's range, half a Pair's range, or up to the Optimist's. */
function sailorRange(path: ClassPath): { min: number; max: number } {
  if (path.rig !== null) return RIG_IDEAL_KG[path.rig];
  if (path.classId === "optimist") return { min: 0, max: OPTIMIST_MAX_KG };
  const pair = PAIR_IDEAL_KG[path.classId as PairClassId];
  return { min: pair.min / 2, max: pair.max / 2 };
}

/** How far a sailor of this age and weight sits from a class: 0 when both fit, more the further they stray. */
export function misfit(path: ClassPath, age: number, kg: number): number {
  const { from, to } = CLASS_AGES[path.classId];
  const ageOut = Math.max(from - age, age - (to ?? Infinity), 0);
  const { min, max } = sailorRange(path);
  const kgOut = Math.max(min - kg, kg - max, 0);
  return 0.02 * ageOut + 0.01 * kgOut;
}

/** One class the player may sail next Season; the ILCA's `hint` is the rig's against their weight (Pair classes get theirs per Partner). */
export type ClassOffer = {
  path: ClassPath;
  hint: PairHint | null;
  /** The player's body weight next Season. */
  kg: number;
};

/**
 * The classes the player may choose for next Season, whichever class they sailed: those whose age window fits the age
 * they will be, and the class they are in now. Call it on the state of the Season just sailed.
 */
export function classOffers(state: CareerState): ClassOffer[] {
  const next = state.season + 1;
  const age = ageInSeason(state.startingAge, next);
  const kg = playerKgNow(state, next);
  return CLASS_PATHS.filter(
    (p) => p.classId === state.classId || ageFits(p.classId, age),
  ).map((path) => ({
    path,
    hint: path.rig === null ? null : rigWeightHint(kg, path.rig),
    kg,
  }));
}

/** The chance, each Season, that a Rival who still fits their class moves anyway. */
const RIVAL_MOVE_CHANCE = 0.1;

/**
 * The class path a pool sailor (a Rival) sails in a Season, by their age and body weight. Children, and every Rival in
 * the first Season, sail the Optimist;
 * from then on a Rival keeps the class of the Season before while age and weight still fit it, moving only when they
 * no longer do or on a small seeded chance, and never back into a class they have left behind. A new class is drawn
 * from those their age (the player's own age windows, `ageFits`) and weight allow: the heavy go to the ILCA 7 or the
 * 49er, the light to the ILCA 4 or the 420, the rest across the 420, their ILCA rig, the 29er and the 49er. The draws
 * are seeded, so it is the same every time.
 */
export function sailorPath(
  seed: number,
  season: number,
  id: string,
  startingAge: number,
): ClassPath {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  let path: ClassPath = OPTIMIST;
  for (let s = 1; s <= season; s++) {
    const age = ageInSeason(startingAge, s);
    const kg = bodyWeightKg(age, buildFactorOf(id));
    // Every Rival starts the Career in the Optimist alongside the player; moves begin in the second Season.
    if (age <= 10 || (s === 1 && ageFits("optimist", age))) {
      path = OPTIMIST;
      continue;
    }
    const draw = rng(mixSeed(seed, s, 0xc1a55, h));
    const roll = draw();
    const move = draw();
    const fits =
      path.classId === "ilca"
        ? ageFits("ilca", age)
        : misfit(path, age, kg) === 0;
    if (fits && move >= RIVAL_MOVE_CHANCE) {
      if (path.classId === "ilca") path = ilcaPath(suggestedRig(kg));
      continue;
    }
    const ilca = ilcaPath(suggestedRig(kg));
    const is420 = ageFits("420", age) && age <= 17;
    const options: ClassPath[] =
      kg >= 75
        ? [ilca, ...(ageFits("49er", age) ? [I49ER] : [])]
        : kg < 56
          ? [ilca, ...(is420 ? [I420] : [])]
          : [
              ...(is420 ? [I420] : []),
              ilca,
              ...(ageFits("29er", age) ? [I29ER] : []),
              ...(ageFits("49er", age) && kg >= 65 ? [I49ER] : []),
            ];
    path = options[Math.floor(roll * options.length)];
  }
  return path;
}
