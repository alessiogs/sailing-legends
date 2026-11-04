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
export type ClassId = "optimist" | "420" | "ilca" | "29er" | "49er";

/** The ILCA's rigs: 4, 6 and 7, by the sailor's body weight (lightest to heaviest). */
export type IlcaRig = 4 | 6 | 7;

export type BoatClass = {
  id: ClassId;
  name: string;
  /** The ILCA's rig (the sail and lower mast section); absent in every other class. */
  rig?: IlcaRig;
  /**
   * The windward-leeward course for this class, in metres, so a race lasts about as long as an Optimist race (absent: the
   * default course of the single-handed Optimist).
   */
  course?: { beat: number; run: number; lineHalf: number };
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
  /**
   * Downwind sail. A `gennaker` is the asymmetric kind of a skiff, flown from a bowsprit with no pole: it works from a broad
   * reach to about 150 degrees off the wind and loses most of its power with the wind dead astern.
   */
  spinnaker?: SailSpec & {
    hoistTime: number;
    dropTime: number;
    gennaker?: boolean;
  };
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
  planing: { waveCut: number; planes: boolean; onsetKn?: number };
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
  helmRighting: {
    inFrac: number;
    windwardOnly: boolean;
    leewardMin: number;
    /**
     * A class whose Helm also goes on the trapeze (the 49er): the righting force there, as a multiple of `hikeForce`. `helmOut`
     * then spans 0 in .. 0.5 hiking .. 1 trapeze, like the Crew's `crewOut`.
     */
    trapeze?: number;
  };
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

/** 29er: two-person skiff, main and self-tacking jib with an asymmetric gennaker; the Crew on the trapeze, the Helm hiking. */
export const I29ER: BoatClass = {
  id: "29er",
  name: "29er",
  mass: 230,
  sailorKg: { helm: 58, crew: 67 },
  length: 4.45,
  beam: 1.77,
  main: {
    area: 11.2,
    minSheetDeg: 5,
    maxSheetDeg: 85,
    clMax: 1.7,
    stallDeg: 20,
    cd0: 0.04,
  },
  jib: {
    area: 4.4,
    minSheetDeg: 8,
    maxSheetDeg: 55,
    clMax: 1.8,
    stallDeg: 19,
    cd0: 0.04,
  },
  spinnaker: {
    area: 18,
    minSheetDeg: 25,
    maxSheetDeg: 95,
    clMax: 1.5,
    stallDeg: 28,
    cd0: 0.16,
    hoistTime: 3,
    dropTime: 2,
    gennaker: true,
  },
  windage: 0.3,
  hullDrag: 6,
  hullSpeed: 3.0,
  waveDrag: 1200,
  planing: { waveCut: 0.992, planes: true, onsetKn: 6.2 },
  boardGrip: 2,
  rudderMaxDeg: 32,
  turnLength: 2.2,
  hikeForce: 280,
  helmRighting: { inFrac: 0.15, windwardOnly: false, leewardMin: -0.2 },
  crewRighting: { inForce: 40, hikeForce: 260, trapezeForce: 1000 },
  heelPerN: 0.05,
  course: { beat: 160, run: 70, lineHalf: 34 },
};

/**
 * 49er: the big two-person skiff. Both sailors work on the trapeze from racks (wings), with a main, a self-tacking jib and a
 * very large gennaker; it is fully powered up from about 8 kn.
 */
export const I49ER: BoatClass = {
  id: "49er",
  name: "49er",
  mass: 293,
  sailorKg: { helm: 80, crew: 80 },
  length: 4.9,
  beam: 1.93,
  main: {
    area: 17,
    minSheetDeg: 5,
    maxSheetDeg: 85,
    clMax: 1.7,
    stallDeg: 20,
    cd0: 0.04,
  },
  jib: {
    area: 6.8,
    minSheetDeg: 8,
    maxSheetDeg: 55,
    clMax: 1.8,
    stallDeg: 19,
    cd0: 0.04,
  },
  spinnaker: {
    area: 41,
    minSheetDeg: 25,
    maxSheetDeg: 95,
    clMax: 1.5,
    stallDeg: 28,
    cd0: 0.16,
    hoistTime: 3,
    dropTime: 2,
    gennaker: true,
  },
  windage: 0.35,
  hullDrag: 5,
  hullSpeed: 3.4,
  waveDrag: 1200,
  planing: { waveCut: 0.992, planes: true, onsetKn: 6.2 },
  boardGrip: 2,
  rudderMaxDeg: 32,
  turnLength: 2.4,
  hikeForce: 340,
  helmRighting: {
    inFrac: 0.12,
    windwardOnly: false,
    leewardMin: 0,
    trapeze: 3.7,
  },
  crewRighting: { inForce: 40, hikeForce: 300, trapezeForce: 1250 },
  heelPerN: 0.04,
  course: { beat: 190, run: 85, lineHalf: 40 },
};

/**
 * ILCA dinghy (Laser): one 4.23 m hull, one sail on a sleeve mast, three rigs by the sailor's weight. The Helm hikes
 * hard, with no inner seat to limit them, and the boat planes on a breezy reach. `kg` is the rig's ideal sailor weight.
 */
function ilca(rig: IlcaRig, area: number, kg: number): BoatClass {
  return {
    id: "ilca",
    rig,
    name: `ILCA ${rig}`,
    mass: Math.round((58 + kg) * 1.15),
    sailorKg: { helm: kg, crew: 0 },
    length: 4.23,
    beam: 1.37,
    main: {
      area,
      minSheetDeg: 6,
      maxSheetDeg: 88,
      clMax: 1.65,
      stallDeg: 20,
      cd0: 0.06,
    },
    windage: 0.3,
    hullDrag: 2.5,
    // A steep wave-drag wall just above 2 m/s pins the speed upwind (the boat can't go faster close-hauled however hard it is
    // hiked); on a reach it only lets go by planing, which starts early (10 kn) in this light hull.
    hullSpeed: 2.05,
    waveDrag: 600,
    planing: { waveCut: 0.9, planes: true, onsetKn: 9.5 },
    boardGrip: 1.5,
    rudderMaxDeg: 32,
    turnLength: 2,
    hikeForce: Math.round(kg * 3.5),
    helmRighting: { inFrac: 0.1, windwardOnly: false, leewardMin: 0 },
    heelPerN: 0.07,
    course: { beat: 130, run: 55, lineHalf: 30 },
  };
}

export const ILCA_4: BoatClass = ilca(4, 4.7, 53);
export const ILCA_6: BoatClass = ilca(6, 5.76, 68);
export const ILCA_7: BoatClass = ilca(7, 7.06, 82);

/** The ILCA classes by rig. */
export const ILCA_RIGS: Record<IlcaRig, BoatClass> = {
  4: ILCA_4,
  6: ILCA_6,
  7: ILCA_7,
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

/** Every class, keyed by its id (the ILCA as its middle rig; `ILCA_RIGS` has all three). */
export const CLASSES: Record<ClassId, BoatClass> = {
  optimist: OPTIMIST,
  "420": I420,
  ilca: ILCA_6,
  "29er": I29ER,
  "49er": I49ER,
};

/** True when `id` names a class, e.g. a value read back from the page. */
export function isClassId(id: string | undefined): id is ClassId {
  return id !== undefined && Object.hasOwn(CLASSES, id);
}
