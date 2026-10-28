/**
 * The player's choice in a two-person boat: their Role (which sailor they are) and their Control mode (how much
 * of the boat they decide). Full Boat Control exists only for the Helm, so a Crew in Full Boat Control cannot be
 * written down.
 */

/** Which sailor the player is: the Helm steers and trims the mainsail; the Crew trims jib and spinnaker and hikes. */
export type Role = "helm" | "crew";

/**
 * How much of the boat the player decides.
 * - `playerCareer`: only their own Role; the Partner handles the rest.
 * - `fullBoat`: as Helm, the player also calls every manoeuvre (spinnaker up/down) and the Crew carries it out.
 */
export type ControlMode = "playerCareer" | "fullBoat";

export type PlayerChoice =
  | { role: "helm"; control: ControlMode }
  | { role: "crew"; control: "playerCareer" };

export const HELM: PlayerChoice = { role: "helm", control: "playerCareer" };
export const CREW: PlayerChoice = { role: "crew", control: "playerCareer" };
export const FULL_BOAT: PlayerChoice = { role: "helm", control: "fullBoat" };
