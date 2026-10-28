/**
 * Descriptive states derived from the continuous boat state, with their thresholds in one place, so every reader
 * (the HUD's weight gauge and Partner lines) describes the boat the same way. Data only: `ui/boatStateText.ts`
 * words them (ADR 0001).
 */

/** Where the Crew's weight is: sitting in, hiking, or out on the trapeze. */
export type CrewWeight = "in" | "hiking" | "trapeze";

/** The Crew's weight position from `crewOut` (0 = in, 0.5 = hiking, 1 = trapeze). */
export function crewWeight(crewOut: number): CrewWeight {
  return crewOut > 0.75 ? "trapeze" : crewOut > 0.3 ? "hiking" : "in";
}

/** The spinnaker: down, moving (being hoisted or dropped), or up. */
export type SpinnakerState = "down" | "moving" | "up";

/** The spinnaker state from `spiHoist` (0 = down, 1 = fully hoisted). */
export function spinnakerState(spiHoist: number): SpinnakerState {
  return spiHoist > 0.9 ? "up" : spiHoist > 0.05 ? "moving" : "down";
}
