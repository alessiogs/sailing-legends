/**
 * The player's control settings (the Commands menu), saved with the preferences. No browser APIs here, so the
 * preferences can be tested in Node.
 */

/**
 * Steering modes:
 *  - "tiller" (realistic, default): the keys move the tiller. Tiller to the right turns the boat left.
 *  - "boat": the keys say which way the bow should turn.
 */
export type SteeringMode = "tiller" | "boat";

/** Player-adjustable control settings (the Commands menu). */
export type ControlSettings = {
  steering: SteeringMode;
  /** Tiller springs back to the centre when the keys are released. */
  autoCenter: boolean;
  /** Multipliers for how fast the tiller and the sheet move. */
  tillerSpeed: number;
  sheetSpeed: number;
};

/** The settings of a new player (and of the Commands menu's reset). */
export const DEFAULT_CONTROLS: ControlSettings = { steering: "tiller", autoCenter: true, tillerSpeed: 1, sheetSpeed: 1 };
