/**
 * Data that describes a class of boat. New classes (ILCA, 29er...) become new entries here;
 * the physics code stays the same. Values are tuned for game feel and are approximate, not
 * measured naval-architecture data.
 */

/** One sail. Angles are the sheet limits for the sail's chord measured from the centreline. */
export type SailSpec = {
  area: number; // m²
  minSheetDeg: number;
  maxSheetDeg: number;
  /** Peak lift coefficient and the angle of attack where it occurs (deg). */
  clMax: number;
  stallDeg: number;
  /** Parasitic drag coefficient. */
  cd0: number;
};

/** The closed set of class ids: a misspelt id is a compile error. A new class adds its id here. */
export type ClassId = "optimist" | "420";

export type BoatClass = {
  id: ClassId;
  name: string;
  /** The oldest age at which a sailor may race this class (the Age limit); absent when there is none. */
  ageLimit?: number;
  /** Boat + sailors mass incl. added mass of water, kg, with the sailors at their reference weight (`sailorKg`). */
  mass: number;
  /**
   * The reference body weights (kg) of the Helm and the Crew that `mass`, `hikeForce` and `crewRighting` are tuned for:
   * a sailor of this weight makes the class's polar. Heavier sailors add mass and righting force, lighter ones less.
   */
  sailorKg: { helm: number; crew: number };
  length: number; // m (LOA)
  beam: number; // m
  /** Mainsail (every class has one). */
  main: SailSpec;
  /** Optional headsail and downwind sail (two-person classes). */
  jib?: SailSpec;
  spinnaker?: SailSpec & { hoistTime: number; dropTime: number };
  /** Drag area (m² x Cd) of hull, spars and sailors. */
  windage: number;
  /** Hull resistance: quadratic coefficient (N per (m/s)²) and wave-making wall. */
  hullDrag: number;
  hullSpeed: number; // m/s where wave drag rises steeply
  waveDrag: number;
  /**
   * Weight aft in a breeze (12-13 kn and up) with the boat flat cuts wave drag by `waveCut` (0..1) on a reach to a run: a `planes`
   * class (the 420) gets up on the plane, one that doesn't (the Optimist) only lifts its bow.
   */
  planing: { waveCut: number; planes: boolean };
  /** Lateral resistance from the centreboard, per m/s of forward speed (1/m). */
  boardGrip: number;
  /** Max rudder deflection (deg) and effective turning length (m). */
  rudderMaxDeg: number;
  turnLength: number;
  /** Max sideways sail force the Helm can hold by hiking (N). Above this the boat heels and spills power. */
  hikeForce: number;
  /**
   * Where the Helm's weight goes by `helmOut` (0 sitting in .. 1 fully out): sitting in still puts `inFrac` of `hikeForce` to
   * windward, the least a Helm of this class ever does when `windwardOnly` (the Optimist Helm sits on the side deck, leaning in);
   * otherwise `leewardMin` < 0 is how far below "in" the Helm may go, sitting to leeward.
   */
  helmRighting: { inFrac: number; windwardOnly: boolean; leewardMin: number };
  /** Two-person classes: righting force from the Crew sitting in, hiking, and on the trapeze (N). */
  crewRighting?: { inForce: number; hikeForce: number; trapezeForce: number };
  /** Visual heel angle per Newton of unbalanced side force (deg/N). */
  heelPerN: number;
};

export const OPTIMIST: BoatClass = {
  id: "optimist",
  name: "Optimist",
  ageLimit: 15,
  mass: 88,
  sailorKg: { helm: 42, crew: 0 },
  length: 2.31,
  beam: 1.13,
  main: {
    area: 3.3,
    minSheetDeg: 12,
    maxSheetDeg: 88,
    clMax: 1.45,
    stallDeg: 21,
    cd0: 0.09,
  },
  windage: 0.35,
  hullDrag: 9,
  hullSpeed: 1.75,
  waveDrag: 260,
  planing: { waveCut: 0.34, planes: false },
  boardGrip: 7,
  rudderMaxDeg: 34,
  turnLength: 1.25,
  hikeForce: 120,
  helmRighting: { inFrac: 0.15, windwardOnly: true, leewardMin: 0 },
  heelPerN: 0.11,
};

/** International 420: two-person trapeze dinghy with jib and spinnaker. */
export const I420: BoatClass = {
  id: "420",
  name: "420",
  mass: 245,
  sailorKg: { helm: 60, crew: 60 },
  length: 4.2,
  beam: 1.63,
  main: {
    area: 7.45,
    minSheetDeg: 5,
    maxSheetDeg: 85,
    clMax: 1.55,
    stallDeg: 20,
    cd0: 0.07,
  },
  jib: {
    area: 2.8,
    minSheetDeg: 8,
    maxSheetDeg: 55,
    clMax: 1.6,
    stallDeg: 19,
    cd0: 0.06,
  },
  spinnaker: {
    area: 9,
    minSheetDeg: 30,
    maxSheetDeg: 100,
    clMax: 1.5,
    stallDeg: 28,
    cd0: 0.18,
    hoistTime: 3.5,
    dropTime: 2.5,
  },
  windage: 0.55,
  hullDrag: 10,
  hullSpeed: 2.7,
  waveDrag: 95,
  planing: { waveCut: 0.3, planes: true },
  boardGrip: 6,
  rudderMaxDeg: 32,
  turnLength: 2.2,
  hikeForce: 190,
  helmRighting: { inFrac: 0.15, windwardOnly: false, leewardMin: -0.4 },
  crewRighting: { inForce: 40, hikeForce: 220, trapezeForce: 420 },
  heelPerN: 0.06,
};

/** The body weights (kg) of the sailors aboard one boat; `crewKg` is 0 in a single-handed class. */
export type SailorWeights = { helmKg: number; crewKg: number };

/** The weights a class is tuned for: an average Helm (and Crew). */
export function referenceWeights(cls: BoatClass): SailorWeights {
  return { helmKg: cls.sailorKg.helm, crewKg: cls.sailorKg.crew };
}

/** True for classes sailed by a Pair (a Helm and a Crew), false for single-handers. */
export function isTwoPerson(cls: BoatClass): boolean {
  return cls.crewRighting !== undefined;
}

/** Every class, keyed by its id. */
export const CLASSES: Record<ClassId, BoatClass> = {
  optimist: OPTIMIST,
  "420": I420,
};

/** True when `id` names a class, e.g. a value read back from the page. */
export function isClassId(id: string | undefined): id is ClassId {
  return id !== undefined && Object.hasOwn(CLASSES, id);
}
