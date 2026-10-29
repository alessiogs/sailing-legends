/**
 * Words for the boat states of `sailing/BoatStates.ts`, as the HUD shows them: the player's weight gauge and the
 * Partner lines.
 */
import { t } from "../i18n";
import type { CrewWeight, SpinnakerState } from "../sailing/BoatStates";

/** Whose weight is described: the player's own (the Crew's weight gauge) or the Partner's (the Helm's Partner line). */
export type WeightView = "own" | "partner";

const WEIGHT = {
  own: { in: "hud.weight.seated", hiking: "hud.weight.hiking", trapeze: "hud.weight.trapeze" },
  partner: { in: "hud.weight.in", hiking: "hud.weight.hiking", trapeze: "hud.weight.trapeze" },
} as const satisfies Record<WeightView, Record<CrewWeight, string>>;

const SPINNAKER = {
  down: "hud.spi.down",
  moving: "hud.spi.moving",
  up: "hud.spi.up",
} as const satisfies Record<SpinnakerState, string>;

/** The Crew's weight position ("seduto dentro" for the player's own, "dentro" for the Partner's, "in cinghia", "al trapezio"). */
export function crewWeightText(weight: CrewWeight, view: WeightView): string {
  return t(WEIGHT[view][weight]);
}

/** The spinnaker state ("giù", "in manovra", "su"). */
export function spinnakerText(state: SpinnakerState): string {
  return t(SPINNAKER[state]);
}
