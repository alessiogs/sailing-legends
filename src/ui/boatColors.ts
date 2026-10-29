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
  // The bigger fleets of a Career (up to 12 boats): ai3 to ai10.
  ai3: { hull: [0.2, 0.65, 0.35], sail: [0.92, 0.97, 0.93], jacket: [0.12, 0.55, 0.25], stripe: [0.95, 0.95, 0.95], dot: "#3ecf6e" },
  ai4: { hull: [0.6, 0.3, 0.8], sail: [0.95, 0.92, 0.98], jacket: [0.5, 0.2, 0.7], stripe: [0.95, 0.95, 0.95], dot: "#b46cf0" },
  ai5: { hull: [0.95, 0.55, 0.15], sail: [0.98, 0.95, 0.9], jacket: [0.9, 0.45, 0.05], stripe: [0.15, 0.15, 0.2], dot: "#ff9a3c" },
  ai6: { hull: [0.15, 0.7, 0.75], sail: [0.92, 0.97, 0.98], jacket: [0.1, 0.6, 0.65], stripe: [0.95, 0.95, 0.95], dot: "#35d0da" },
  ai7: { hull: [0.9, 0.4, 0.65], sail: [0.98, 0.93, 0.96], jacket: [0.85, 0.3, 0.55], stripe: [0.95, 0.95, 0.95], dot: "#f46fb0" },
  ai8: { hull: [0.15, 0.2, 0.45], sail: [0.93, 0.94, 0.98], jacket: [0.1, 0.15, 0.4], stripe: [0.98, 0.83, 0.25], dot: "#5b6fd6" },
  ai9: { hull: [0.55, 0.75, 0.2], sail: [0.96, 0.98, 0.9], jacket: [0.45, 0.65, 0.1], stripe: [0.15, 0.15, 0.2], dot: "#a8d63a" },
  ai10: { hull: [0.45, 0.3, 0.2], sail: [0.97, 0.94, 0.9], jacket: [0.4, 0.25, 0.15], stripe: [0.95, 0.95, 0.95], dot: "#b07a52" },
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

const hex = (channel: number) => Math.round(channel * 255).toString(16).padStart(2, "0");

/** The HUD's accent colour for the boat with this racer id: its Helm's jacket as a CSS hex colour (the player's orange). */
export function boatAccent(id: string): string {
  const [r, g, b] = boatColors(id).jacket;
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
