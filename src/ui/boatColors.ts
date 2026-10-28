/**
 * Each boat's colours, defined once and keyed by racer id: the 3D boats (hull, sail, Helm's jacket, sheer stripe,
 * which the 420 also uses for its Crew's jacket) and the HUD (the dot in the standings and on the minimap, the boat
 * tag's border). Plain data, free of Babylon and the DOM; the boat views turn the channels into materials.
 */

/** A colour as red, green and blue channels from 0 to 1. */
export type Rgb = readonly [r: number, g: number, b: number];

export type BoatColors = {
  hull: Rgb;
  sail: Rgb;
  jacket: Rgb;
  stripe: Rgb;
  /** CSS colour of the boat's dot in the standings and on the minimap, and of its tag's border. */
  dot: string;
};

const BOAT_COLORS: Readonly<Record<string, BoatColors>> = {
  player: { hull: [0.95, 0.96, 0.95], sail: [0.98, 0.98, 0.96], jacket: [0.95, 0.35, 0.12], stripe: [0.85, 0.12, 0.12], dot: "#ffffff" },
  ai0: { hull: [0.2, 0.45, 0.85], sail: [0.93, 0.95, 0.98], jacket: [0.2, 0.3, 0.8], stripe: [0.95, 0.95, 0.95], dot: "#4aa3ff" },
  ai1: { hull: [0.98, 0.83, 0.25], sail: [0.98, 0.96, 0.86], jacket: [0.95, 0.75, 0.1], stripe: [0.15, 0.15, 0.2], dot: "#ffd23f" },
  ai2: { hull: [0.86, 0.22, 0.18], sail: [0.98, 0.93, 0.92], jacket: [0.8, 0.12, 0.12], stripe: [0.95, 0.95, 0.95], dot: "#ff5a4e" },
};

/** Dot colour for a boat missing from the table. */
const UNKNOWN_DOT = "#ccc";

/** The colours of the boat with this racer id; a boat missing from the table is drawn like `ai0`. */
export function boatColors(id: string): BoatColors {
  return BOAT_COLORS[id] ?? BOAT_COLORS.ai0;
}

/** The HUD dot colour of the boat with this racer id; a boat missing from the table gets a neutral grey. */
export function boatDot(id: string): string {
  return BOAT_COLORS[id]?.dot ?? UNKNOWN_DOT;
}
