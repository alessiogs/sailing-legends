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

export type BoatClass = {
  id: string;
  name: string;
  /** Boat + sailors mass incl. added mass of water, kg. */
  mass: number;
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
  /** Lateral resistance from the centreboard, per m/s of forward speed (1/m). */
  boardGrip: number;
  /** Max rudder deflection (deg) and effective turning length (m). */
  rudderMaxDeg: number;
  turnLength: number;
  /** Max sideways sail force the Helm can hold by hiking (N). Above this the boat heels and spills power. */
  hikeForce: number;
  /** Two-person classes: righting force from the Crew sitting in, hiking, and on the trapeze (N). */
  crewRighting?: { inForce: number; hikeForce: number; trapezeForce: number };
  /** Visual heel angle per Newton of unbalanced side force (deg/N). */
  heelPerN: number;
};

export const OPTIMIST: BoatClass = {
  id: "optimist",
  name: "Optimist",
  mass: 88,
  length: 2.31,
  beam: 1.13,
  main: { area: 3.3, minSheetDeg: 12, maxSheetDeg: 88, clMax: 1.45, stallDeg: 21, cd0: 0.09 },
  windage: 0.35,
  hullDrag: 9,
  hullSpeed: 1.75,
  waveDrag: 260,
  boardGrip: 7,
  rudderMaxDeg: 34,
  turnLength: 1.25,
  hikeForce: 120,
  heelPerN: 0.11,
};

/** International 420: two-person trapeze dinghy with jib and spinnaker. */
export const I420: BoatClass = {
  id: "420",
  name: "420",
  mass: 245,
  length: 4.2,
  beam: 1.63,
  main: { area: 7.45, minSheetDeg: 5, maxSheetDeg: 85, clMax: 1.55, stallDeg: 20, cd0: 0.07 },
  jib: { area: 2.8, minSheetDeg: 8, maxSheetDeg: 55, clMax: 1.6, stallDeg: 19, cd0: 0.06 },
  spinnaker: { area: 9, minSheetDeg: 30, maxSheetDeg: 100, clMax: 1.5, stallDeg: 28, cd0: 0.18, hoistTime: 3.5, dropTime: 2.5 },
  windage: 0.55,
  hullDrag: 10,
  hullSpeed: 2.7,
  waveDrag: 95,
  boardGrip: 6,
  rudderMaxDeg: 32,
  turnLength: 2.2,
  hikeForce: 190,
  crewRighting: { inForce: 40, hikeForce: 220, trapezeForce: 420 },
  heelPerN: 0.06,
};

/** True for classes sailed by a Pair (a Helm and a Crew), false for single-handers. */
export function isTwoPerson(cls: BoatClass): boolean {
  return cls.crewRighting !== undefined;
}

export const CLASSES: Record<string, BoatClass> = { optimist: OPTIMIST, "420": I420 };
